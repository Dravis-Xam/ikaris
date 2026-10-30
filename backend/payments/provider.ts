import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError } from '../http/errors.js'

export type PaymentOutcome = 'succeeded' | 'failed' | 'pending'

export interface PaymentWebhookEvent {
  eventId: string
  paymentReference: string
  outcome: PaymentOutcome
  amount: string
  currency: string
}

export interface PaymentProvider {
  readonly name: string
  initiate(input: { paymentReference: string; amount: string; currency: string; method: string }): Promise<Record<string, unknown>>
  verifyWebhook(rawBody: Buffer, signature: string | undefined): PaymentWebhookEvent
}

export class HmacPaymentProvider implements PaymentProvider {
  readonly name: string

  constructor(private readonly secret: string, name = 'hmac-provider') {
    this.name = name
  }

  async initiate(input: { paymentReference: string; amount: string; currency: string; method: string }) {
    return { status: 'pending', ...input }
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): PaymentWebhookEvent {
    if (!signature) throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Provider signature is required')
    const expected = createHmac('sha256', this.secret).update(rawBody).digest()
    let received: Buffer
    try {
      received = Buffer.from(signature, 'hex')
    } catch {
      throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Provider signature is invalid')
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Provider signature is invalid')
    }

    let event: PaymentWebhookEvent
    try {
      event = JSON.parse(rawBody.toString('utf8')) as PaymentWebhookEvent
    } catch {
      throw new HttpError(400, 'INVALID_WEBHOOK', 'Provider event payload is invalid')
    }
    if (
      typeof event.eventId !== 'string'
      || typeof event.paymentReference !== 'string'
      || !['succeeded', 'failed', 'pending'].includes(event.outcome)
      || typeof event.amount !== 'string'
      || typeof event.currency !== 'string'
    ) {
      throw new HttpError(400, 'INVALID_WEBHOOK', 'Provider event payload is invalid')
    }
    return event
  }
}