import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import express from 'express'
import { Server as SocketServer } from 'socket.io'
import type { Redis } from 'ioredis'
import type { ViteDevServer } from 'vite'
import { createAdapter } from '@socket.io/redis-adapter'
import { loadEnvironment } from './backend/config/env.js'
import { createRedisConnection } from './backend/cache/redis.js'
import { createDatabase } from './backend/db/client.js'
import { createDatabaseAuthRepository } from './backend/auth/repository.js'
import { createNotificationQueue } from './backend/jobs/queue.js'
import { createNotificationWorker } from './backend/jobs/worker.js'
import { createPostgresCommerceRepository } from './backend/commerce/postgres-repository.js'
import { createPostgresPaymentRepository } from './backend/payments/repository.js'
import { HmacPaymentProvider } from './backend/payments/provider.js'
import { createPostgresSyncRepository } from './backend/sync/repository.js'
import { createApp } from './backend/http/app.js'
import { logger } from './backend/lib/logger.js'

const environment = loadEnvironment()
const database = createDatabase(environment.DATABASE_URL, environment.DATABASE_READ_URL)
const redis = createRedisConnection(environment.REDIS_URL)
const notificationQueue = redis ? createNotificationQueue(redis) : undefined
const notificationWorker = redis && database ? createNotificationWorker(redis, database.pool) : undefined
const authRepository = database ? createDatabaseAuthRepository(database.db) : undefined
const commerceRepository = database ? createPostgresCommerceRepository(database.pool, database.readPool ?? database.pool) : undefined
const paymentRepository = database ? createPostgresPaymentRepository(database.pool) : undefined
const syncRepository = database ? createPostgresSyncRepository(database.pool) : undefined
const paymentProviders = environment.PAYMENT_WEBHOOK_SECRET
  ? new Map([["hmac-provider", new HmacPaymentProvider(environment.PAYMENT_WEBHOOK_SECRET)]])
  : new Map()
const app = createApp({
  databasePool: database?.pool,
  databaseReadPool: database?.readPool,
  redis,
  authRepository,
  commerceRepository,
  paymentRepository,
  paymentProviders,
  syncRepository,
  notificationQueue,
  accessTokenSecret: environment.ACCESS_TOKEN_SECRET,
})
const httpServer = createServer(app)
const sockets = new SocketServer(httpServer, {
  cors: { origin: environment.CLIENT_ORIGIN ?? false },
})
const socketRedisClients: Redis[] = []
let viteServer: ViteDevServer | undefined

if (redis) {
  try {
    if (redis.status === 'wait') await redis.connect()
    const publisher = redis.duplicate()
    const subscriber = redis.duplicate()
    await Promise.all([publisher.connect(), subscriber.connect()])
    sockets.adapter(createAdapter(publisher, subscriber))
    socketRedisClients.push(publisher, subscriber)
  } catch (error) {
    logger.error({ err: error }, 'Socket.IO Redis adapter unavailable; using local adapter')
  }
}

sockets.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Realtime client connected')
})

if (process.argv.includes('--production') || environment.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(process.cwd(), 'dist')))
} else {
  const { createServer: createViteServer } = await import('vite')
  viteServer = await createViteServer({
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server: httpServer } },
  })
  app.use(viteServer.middlewares)
}

httpServer.listen(environment.PORT, environment.HOST, () => {
  logger.info({ host: environment.HOST, port: environment.PORT }, 'Diana Phone Shop server listening')
})

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down server')
  await viteServer?.close()
  await new Promise<void>((resolve) => sockets.close(() => resolve()))
  await notificationQueue?.close()
  await notificationWorker?.close()
  for (const client of socketRedisClients) await client.quit()
  await database?.pool.end()
  await database?.readPool?.end()
  if (redis) {
    if (redis.status === 'ready') await redis.quit()
    else redis.disconnect()
  }
  process.exit(0)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))