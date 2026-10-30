import { randomUUID } from 'node:crypto'
import { createHmac } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAccessToken } from '../auth/tokens.js'
import type { AuthRepository } from '../auth/types.js'
import { createApp } from '../http/app.js'
import { HmacPaymentProvider } from './provider.js'
import type { PaymentRepository } from './repository.js'

const tokenSecret = 'test-secret-with-more-than-thirty-two-characters'
const webhookSecret = 'provider-test-webhook-secret'
const customerId = randomUUID()
const sessionId = randomUUID()
const authRepository: AuthRepository = {
  async findAccount() { return null },
  async createCustomer() { throw new Error('not used') },
  async createSession() { return sessionId },
  async rotateSession() { return null },
  async revokeSession() {},
  async isSessionActive(type, id, sid) { return type === 'customer' && id === customerId && sid === sessionId },
}

describe('payment routes', () => {
  it('requires a valid provider signature and accepts a verified event', async () => {
    const events: unknown[] = []
    const paymentRepository: PaymentRepository = {
      async initiate() { return { amount: '25.00', currency: 'KES' } },
      async applyProviderEvent(event) { events.push(event); return 'applied' },
    }
    const provider = new HmacPaymentProvider(webhookSecret)
    const app = createApp({
      authRepository,
      accessTokenSecret: tokenSecret,
      paymentRepository,
      paymentProviders: new Map([[provider.name, provider]]),
    })
    const payload = JSON.stringify({
      eventId: 'evt-1', paymentReference: 'PAY-1', outcome: 'succeeded', amount: '25.00', currency: 'KES',
    })
    const signature = createHmac('sha256', webhookSecret).update(payload).digest('hex')
    const invalid = await request(app).post('/api/v1/payments/hmac-provider/webhook')
      .set('Content-Type', 'application/json')
      .send(payload)
    const valid = await request(app).post('/api/v1/payments/hmac-provider/webhook')
      .set('x-provider-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)

    expect(invalid.status).toBe(401)
    expect(valid.status).toBe(200)
    expect(events).toHaveLength(1)
  })

  it('requires customer auth to initiate a payment and never exposes a success endpoint', async () => {
    const paymentRepository: PaymentRepository = {
      async initiate() { return { amount: '25.00', currency: 'KES' } },
      async applyProviderEvent() { return 'duplicate' },
    }
    const provider = new HmacPaymentProvider(webhookSecret)
    const app = createApp({
      authRepository,
      accessTokenSecret: tokenSecret,
      paymentRepository,
      paymentProviders: new Map([[provider.name, provider]]),
    })
    const withoutAuth = await request(app).post(`/api/v1/payments/orders/${randomUUID()}`)
      .send({ provider: provider.name, method: 'card' })
    const authenticated = await request(app).post(`/api/v1/payments/orders/${randomUUID()}`)
      .set('Authorization', `Bearer ${createAccessToken('customer', customerId, sessionId, tokenSecret)}`)
      .send({ provider: provider.name, method: 'card' })
    const clientSuccess = await request(app).post('/api/v1/payments/success').send({})

    expect(withoutAuth.status).toBe(401)
    expect(authenticated.status).toBe(201)
    expect(clientSuccess.status).toBe(404)
  })
})