import { randomUUID } from 'node:crypto'
import { Router, type Request, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import { requireAccount } from '../auth/authorization.js'
import type { AuthRepository } from '../auth/types.js'
import { HttpError } from '../http/errors.js'
import type { PaymentProvider } from './provider.js'
import type { PaymentRepository } from './repository.js'

const paymentMethods = ['cash_on_delivery', 'card', 'mobile_money', 'bank_transfer'] as const

export function createPaymentRouter(
  repository: PaymentRepository,
  auth: AuthRepository,
  secret: string,
  providers: Map<string, PaymentProvider>,
) {
  const router = Router()
  router.post('/orders/:orderId', requireAccount('customer', auth, secret), route(async (request, response) => {
    const orderId = z.string().uuid().parse(request.params.orderId)
    const { provider: providerName, method } = z.object({ provider: z.string().min(1).max(80), method: z.enum(paymentMethods) }).parse(request.body)
    const provider = providers.get(providerName)
    if (!provider) throw new HttpError(400, 'UNSUPPORTED_PROVIDER', 'Payment provider is not supported')
    const userId = principalId(response)
    const reference = `PAY-${randomUUID()}`
    const payment = await repository.initiate({ userId, orderId, provider: provider.name, method, reference })
    const instructions = await provider.initiate({ paymentReference: reference, amount: payment.amount, currency: payment.currency, method })
    response.status(201).json({ paymentReference: reference, status: 'pending', ...instructions })
  }))

  router.post('/:provider/webhook', route(async (request, response) => {
    const providerName = z.string().min(1).max(80).parse(request.params.provider)
    const provider = providers.get(providerName)
    if (!provider) throw new HttpError(404, 'UNSUPPORTED_PROVIDER', 'Payment provider is not supported')
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody
    if (!rawBody) throw new HttpError(400, 'INVALID_WEBHOOK', 'Raw provider payload is required')
    const event = provider.verifyWebhook(rawBody, request.get('x-provider-signature'))
    const result = await repository.applyProviderEvent({
      provider: provider.name,
      eventId: event.eventId,
      reference: event.paymentReference,
      amount: event.amount,
      currency: event.currency,
      outcome: event.outcome,
    })
    if (result === 'not_found') throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment reference was not found')
    response.json({ received: true, duplicate: result === 'duplicate' })
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