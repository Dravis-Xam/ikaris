import cors from 'cors'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import type { Pool } from 'pg'
import type { Redis } from 'ioredis'
import { loadEnvironment } from '../config/env.js'
import { createAuthRouter } from '../auth/router.js'
import type { AuthRepository } from '../auth/types.js'
import type { CommerceRepository } from '../commerce/types.js'
import { createCommerceRouter } from '../commerce/router.js'
import type { PaymentRepository } from '../payments/repository.js'
import type { PaymentProvider } from '../payments/provider.js'
import { createPaymentRouter } from '../payments/router.js'
import type { Queue } from 'bullmq'
import type { SyncRepository } from '../sync/repository.js'
import { createSyncRouter } from '../sync/router.js'
import { openApiDocument } from './openapi.js'
import { HttpError } from './errors.js'
import { logger } from '../lib/logger.js'

export interface AppDependencies {
  databasePool?: Pool
  databaseReadPool?: Pool
  redis?: Redis
  authRepository?: AuthRepository
  commerceRepository?: CommerceRepository
  paymentRepository?: PaymentRepository
  paymentProviders?: Map<string, PaymentProvider>
  notificationQueue?: Queue
  syncRepository?: SyncRepository
  accessTokenSecret?: string
}

export function createApp(dependencies: AppDependencies = {}) {
  const environment = loadEnvironment()
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client', 'https://appleid.cdn-apple.com'],
        workerSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'https://accounts.google.com', 'https://www.googleapis.com', 'https://appleid.apple.com'],
        frameSrc: ["'self'", 'https://accounts.google.com', 'https://appleid.apple.com'],
      },
    },
  }))
  app.use(cors({ origin: environment.CLIENT_ORIGIN ?? false }))
  if (environment.NODE_ENV === 'production') {
    app.use((request, response, next) => {
      if (!request.secure) {
        response.status(426).json({ error: { code: 'HTTPS_REQUIRED', message: 'HTTPS is required' } })
        return
      }
      next()
    })
  }
  app.use(express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      ;(request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer)
    },
  }))
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'diana-phone-shop-api' })
  })

  app.get('/api/docs/openapi.json', (_request, response) => response.json(openApiDocument))

  app.get('/api/health/ready', async (_request, response) => {
    const checks: Record<string, 'ready' | 'not_configured' | 'unavailable'> = {
      database: 'not_configured',
      redis: 'not_configured',
    }
    if (dependencies.databaseReadPool) checks.readReplica = 'unavailable'

    if (dependencies.databasePool) {
      try {
        await dependencies.databasePool.query('SELECT 1')
        checks.database = 'ready'
      } catch {
        checks.database = 'unavailable'
      }
    }

    if (dependencies.databaseReadPool) {
      try {
        await dependencies.databaseReadPool.query('SELECT 1')
        checks.readReplica = 'ready'
      } catch {
        checks.readReplica = 'unavailable'
      }
    }

    if (dependencies.redis) {
      try {
        if (dependencies.redis.status === 'wait') await dependencies.redis.connect()
        await dependencies.redis.ping()
        checks.redis = 'ready'
      } catch {
        checks.redis = 'unavailable'
      }
    }

    const ready = checks.database === 'ready'
      && checks.redis !== 'unavailable'
      && checks.readReplica !== 'unavailable'
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks })
  })

  if (dependencies.authRepository && dependencies.accessTokenSecret) {
    const clientOrigin = environment.CLIENT_ORIGIN ?? 'http://localhost:3000'
    app.use('/api/v1/auth', createAuthRouter(dependencies.authRepository, dependencies.accessTokenSecret, {
      googleClientId: environment.GOOGLE_CLIENT_ID,
      appleClientId: environment.APPLE_CLIENT_ID,
      webAuthnRpId: environment.WEBAUTHN_RP_ID ?? new URL(clientOrigin).hostname,
      webAuthnOrigin: environment.WEBAUTHN_ORIGIN ?? clientOrigin,
    }))
    if (dependencies.commerceRepository) {
      if (dependencies.databasePool) app.use('/api/v1', adminAuditMiddleware(dependencies.databasePool))
      app.use('/api/v1', createCommerceRouter(
        dependencies.commerceRepository,
        dependencies.authRepository,
        dependencies.accessTokenSecret,
        dependencies.redis,
        dependencies.notificationQueue,
      ))
    }
    if (dependencies.paymentRepository && dependencies.paymentProviders) {
      app.use('/api/v1/payments', createPaymentRouter(
        dependencies.paymentRepository,
        dependencies.authRepository,
        dependencies.accessTokenSecret,
        dependencies.paymentProviders,
      ))
    }
    if (dependencies.syncRepository) {
      app.use('/api/v1/sync', createSyncRouter(dependencies.syncRepository, dependencies.authRepository, dependencies.accessTokenSecret))
    }
  }

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found' } })
  })

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({ error: { code: error.code, message: error.message } })
      return
    }

    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } })
      return
    }

    logger.error({ err: error }, 'Unhandled request error')
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }

  app.use(errorHandler)
  return app
}

function adminAuditMiddleware(pool: Pool): RequestHandler {
  return (request, response, next) => {
    response.once('finish', () => {
      const principal = response.locals.auth as { accountType?: string; accountId?: string } | undefined
      if (
        principal?.accountType !== 'admin'
        || !principal.accountId
        || !request.originalUrl.startsWith('/api/v1/admin/')
        || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
        || response.statusCode < 200
        || response.statusCode >= 300
      ) return

      const path = request.originalUrl.split('?')[0]
      const resourceType = path.split('/')[4]?.slice(0, 80) ?? 'unknown'
      const resourceId = path.match(/\/([0-9a-f]{8}-[0-9a-f-]{27,})/i)?.[1] ?? null
      void pool.query(
        `INSERT INTO audit_logs (account_type, account_id, action, resource_type, resource_id, metadata, ip_address)
         VALUES ('admin', $1, $2, $3, $4, $5, $6)`,
        [principal.accountId, `${request.method} ${path}`.slice(0, 120), resourceType, resourceId,
          { statusCode: response.statusCode }, request.ip],
      ).catch((error: unknown) => logger.error({ err: error }, 'Unable to persist admin audit event'))
    })
    next()
  }
}