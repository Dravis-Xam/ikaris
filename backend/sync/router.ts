import { Router, type Request, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import { requireAccount } from '../auth/authorization.js'
import type { AccountType, AuthRepository } from '../auth/types.js'
import { HttpError } from '../http/errors.js'
import type { SyncOperation, SyncRepository } from './repository.js'

const operationSchema = z.object({
  operationId: z.string().uuid(),
  deviceId: z.string().trim().min(1).max(255),
  type: z.enum(['wishlist.add', 'wishlist.remove', 'profile.update', 'order.create', 'inventory.adjust']),
  payload: z.record(z.string(), z.unknown()),
  clientVersion: z.string().datetime().optional().default('1970-01-01T00:00:00.000Z'),
}).superRefine((operation, context) => {
  const payload = operation.payload
  if (operation.type.startsWith('wishlist.') && !z.string().uuid().safeParse(payload.shoeId).success) {
    context.addIssue({ code: 'custom', path: ['payload', 'shoeId'], message: 'A valid shoeId is required' })
  }
  if (operation.type === 'profile.update') {
    if (!Number.isInteger(payload.expectedVersion) || Number(payload.expectedVersion) < 1) {
      context.addIssue({ code: 'custom', path: ['payload', 'expectedVersion'], message: 'A positive expectedVersion is required' })
    }
    for (const field of ['firstName', 'lastName'] as const) {
      const value = payload[field]
      if (value !== undefined && (typeof value !== 'string' || value.trim().length < 1 || value.length > 100)) {
        context.addIssue({ code: 'custom', path: ['payload', field], message: 'Profile names must be 1 to 100 characters' })
      }
    }
  }
  if (operation.type === 'inventory.adjust') {
    if (!z.string().uuid().safeParse(payload.variantId).success) {
      context.addIssue({ code: 'custom', path: ['payload', 'variantId'], message: 'A valid variantId is required' })
    }
    if (!Number.isInteger(payload.quantityDelta) || Number(payload.quantityDelta) === 0) {
      context.addIssue({ code: 'custom', path: ['payload', 'quantityDelta'], message: 'A non-zero integer quantityDelta is required' })
    }
  }
  if (operation.type === 'order.create' && !z.string().uuid().safeParse(payload.addressId).success) {
    context.addIssue({ code: 'custom', path: ['payload', 'addressId'], message: 'A valid addressId is required' })
  }
})

export function createSyncRouter(repository: SyncRepository, auth: AuthRepository, secret: string) {
  const router = Router()
  router.use('/customer', createAccountSyncRouter('customer', repository, auth, secret))
  router.use('/admin', createAccountSyncRouter('admin', repository, auth, secret))
  return router
}

function createAccountSyncRouter(accountType: AccountType, repository: SyncRepository, auth: AuthRepository, secret: string) {
  const router = Router()
  router.use(requireAccount(accountType, auth, secret))

  router.post('/push', route(async (request, response) => {
    const body = z.object({ operations: z.array(operationSchema).min(1).max(100) }).parse(request.body)
    const results = await repository.push(accountType, principalId(response), body.operations as SyncOperation[])
    response.json({ results })
  }))

  router.get('/pull', route(async (request, response) => {
    const query = z.object({ cursor: z.string().max(2_000).optional() }).parse(request.query)
    const result = await repository.pull(accountType, principalId(response), query.cursor)
    response.json(result)
  }))

  router.get('/status', route(async (_request, response) => {
    response.json(await repository.status(accountType, principalId(response)))
  }))
  return router
}

function principalId(response: Response) {
  const principal = response.locals.auth as { accountId?: string } | undefined
  if (!principal?.accountId) throw new HttpError(401, 'UNAUTHENTICATED', 'A valid access token is required')
  return principal.accountId
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch((error: unknown) => {
      if (error instanceof HttpError) return next(error)
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed'))
      next(error)
    })
  }
}