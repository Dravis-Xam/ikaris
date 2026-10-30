import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HmacPaymentProvider } from './provider.js'

describe('HMAC payment provider', () => {
  it('accepts a valid signature and returns a normalized callback event', () => {
    const secret = 'provider-test-secret'
    const provider = new HmacPaymentProvider(secret)
    const payload = Buffer.from(JSON.stringify({
      eventId: 'evt-1',
      paymentReference: 'PAY-1',
      outcome: 'succeeded',
      amount: '25.00',
      currency: 'KES',
    }))
    const signature = createHmac('sha256', secret).update(payload).digest('hex')

    expect(provider.verifyWebhook(payload, signature)).toMatchObject({ eventId: 'evt-1', outcome: 'succeeded' })
  })

  it('rejects missing and invalid signatures', () => {
    const provider = new HmacPaymentProvider('provider-test-secret')
    const payload = Buffer.from('{}')

    expect(() => provider.verifyWebhook(payload, undefined)).toThrow('Provider signature is required')
    expect(() => provider.verifyWebhook(payload, '00'.repeat(32))).toThrow('Provider signature is invalid')
  })
})