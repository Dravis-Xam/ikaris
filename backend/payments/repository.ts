import type { Pool } from 'pg'
import { HttpError } from '../http/errors.js'
import type { PaymentOutcome } from './provider.js'

export interface PaymentRepository {
  initiate(input: { userId: string; orderId: string; provider: string; method: string; reference: string }): Promise<{ amount: string; currency: string }>
  applyProviderEvent(input: {
    provider: string
    eventId: string
    reference: string
    amount: string
    currency: string
    outcome: PaymentOutcome
  }): Promise<'applied' | 'duplicate' | 'not_found'>
}

export function createPostgresPaymentRepository(pool: Pool): PaymentRepository {
  return {
    async initiate({ userId, orderId, provider, method, reference }) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: orders } = await client.query<{ total_amount: string; payment_status: string; status: string }>(
          'SELECT total_amount, payment_status, status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [orderId, userId],
        )
        const order = orders[0]
        if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order was not found')
        if (order.status !== 'pending_payment') throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'Order is not awaiting payment')
        if (order.payment_status === 'succeeded') throw new HttpError(409, 'ALREADY_PAID', 'Order has already been paid')
        const { rows: inserted } = await client.query(
          `INSERT INTO payments (order_id, payment_reference, provider, payment_method, amount, currency, status)
           VALUES ($1, $2, $3, $4::payment_method, $5, 'KES', 'pending')
           RETURNING id`, [orderId, reference, provider, method, order.total_amount],
        )
        if (!inserted[0]) throw new Error('Payment could not be created')
        await client.query('COMMIT')
        return { amount: order.total_amount, currency: 'KES' }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async applyProviderEvent(event) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: payments } = await client.query<{
          id: string; order_id: string; amount: string; currency: string; status: string; order_status: string
        }>(
          `SELECT p.id, p.order_id, p.amount, p.currency, p.status, o.status AS order_status
           FROM payments p JOIN orders o ON o.id = p.order_id
           WHERE p.provider = $1 AND p.payment_reference = $2 FOR UPDATE OF p, o`,
          [event.provider, event.reference],
        )
        const payment = payments[0]
        if (!payment) {
          await client.query('ROLLBACK')
          return 'not_found'
        }
        if (Number(payment.amount) !== Number(event.amount) || payment.currency !== event.currency) {
          throw new HttpError(409, 'PAYMENT_AMOUNT_MISMATCH', 'Provider payment amount does not match the order')
        }
        if (payment.order_status !== 'pending_payment') {
          throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'Order is no longer awaiting payment')
        }
        const { rowCount } = await client.query(
          `UPDATE payments SET status = $3::payment_status, provider_event_id = $4, updated_at = now()
           WHERE id = $1 AND provider = $2 AND status = 'pending'`,
          [payment.id, event.provider, event.outcome, event.eventId],
        )
        if (rowCount !== 1) {
          await client.query('COMMIT')
          return 'duplicate'
        }
        if (event.outcome === 'succeeded') {
          await client.query(
            `UPDATE orders SET payment_status = 'succeeded', status = 'confirmed', updated_at = now()
             WHERE id = $1 AND status = 'pending_payment'`, [payment.order_id],
          )
        } else if (event.outcome === 'failed') {
          await client.query(
            `UPDATE orders SET payment_status = 'failed', updated_at = now() WHERE id = $1 AND status = 'pending_payment'`,
            [payment.order_id],
          )
        }
        await client.query('COMMIT')
        return 'applied'
      } catch (error) {
        await client.query('ROLLBACK')
        if (isUniqueViolation(error)) return 'duplicate'
        throw error
      } finally {
        client.release()
      }
    },
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}