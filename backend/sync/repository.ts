import type { Pool } from 'pg'
import { HttpError } from '../http/errors.js'
import type { AccountType } from '../auth/types.js'

export interface SyncOperation {
  operationId: string
  deviceId: string
  type: 'wishlist.add' | 'wishlist.remove' | 'profile.update' | 'order.create' | 'inventory.adjust'
  payload: Record<string, unknown>
  clientVersion: string
}

export interface SyncRepository {
  push(accountType: AccountType, accountId: string, operations: SyncOperation[]): Promise<Record<string, unknown>[]>
  pull(accountType: AccountType, accountId: string, cursor?: string): Promise<Record<string, unknown>>
  status(accountType: AccountType, accountId: string): Promise<Record<string, unknown>>
}

export function createPostgresSyncRepository(pool: Pool): SyncRepository {
  return {
    async push(accountType, accountId, operations) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const results: Record<string, unknown>[] = []
        for (const operation of operations) {
          const { rows: inserted } = await client.query<{ id: string }>(
            `INSERT INTO offline_operations (account_type, account_id, device_id, operation_id, operation_type, payload, status)
             VALUES ($1::account_type, $2, $3, $4, $5, $6, 'pending')
             ON CONFLICT (account_type, account_id, device_id, operation_id) DO NOTHING RETURNING id`,
            [accountType, accountId, operation.deviceId, operation.operationId, operation.type, operation.payload],
          )

          if (!inserted[0]) {
            const { rows: existing } = await client.query<{
              id: string; status: string; error_message: string | null; operation_type: string; payload: Record<string, unknown>
            }>(
              `SELECT id, status, error_message, operation_type, payload FROM offline_operations
               WHERE account_type = $1::account_type AND account_id = $2 AND device_id = $3 AND operation_id = $4 FOR UPDATE`,
              [accountType, accountId, operation.deviceId, operation.operationId],
            )
            if (existing[0] && (
              existing[0].operation_type !== operation.type
              || stableJson(existing[0].payload) !== stableJson(operation.payload)
            )) {
              results.push({ operationId: operation.operationId, status: 'failed', duplicate: true, error: 'Operation ID was already used with different content' })
              continue
            }
            if (!existing[0] || existing[0].status !== 'failed') {
              results.push({ operationId: operation.operationId, status: existing[0]?.status ?? 'pending', duplicate: true, error: existing[0]?.error_message })
              continue
            }
            await client.query(
              `UPDATE offline_operations SET status = 'pending', retry_count = retry_count + 1,
                 processed_at = null, error_message = null WHERE id = $1`, [existing[0].id],
            )
            inserted.push({ id: existing[0].id })
          }

          const result = await processOperation(client, accountType, accountId, operation)
          await client.query(
            `UPDATE offline_operations SET status = $2::offline_operation_status, processed_at = $3, error_message = $4
             WHERE id = $1`,
            [inserted[0].id, result.status, result.status === 'pending' ? null : new Date(), result.error ?? null],
          )
          results.push({ operationId: operation.operationId, ...result, duplicate: false })
        }
        await client.query('COMMIT')
        return results
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async pull(accountType, accountId, cursor) {
      const state = decodeCursor(cursor)
      const initial = { updatedAt: new Date(0).toISOString(), id: '00000000-0000-0000-0000-000000000000' }
      const productCursor = state.products ?? initial
      const orderCursor = state.orders ?? initial
      const wishlistCursor = state.wishlist ?? initial
      const [products, orders, wishlist] = await Promise.all([
        pool.query(
          `SELECT id, name, slug, brand, category_id AS "categoryId", base_price AS "basePrice",
             discount_price AS "discountPrice", images, status, updated_at AS "updatedAt"
           FROM shoes WHERE (updated_at, id) > ($1::timestamptz, $2::uuid)
             AND ($3::boolean OR status IN ('active', 'archived'))
           ORDER BY updated_at, id LIMIT 501`,
          [productCursor.updatedAt, productCursor.id, accountType === 'admin'],
        ),
        accountType === 'customer'
          ? pool.query(
            `SELECT id, order_number AS "orderNumber", status, payment_status AS "paymentStatus",
               total_amount AS "totalAmount", updated_at AS "updatedAt"
             FROM orders WHERE user_id = $1 AND (updated_at, id) > ($2::timestamptz, $3::uuid)
             ORDER BY updated_at, id LIMIT 501`,
            [accountId, orderCursor.updatedAt, orderCursor.id],
          )
          : pool.query(
            `SELECT id, user_id AS "userId", order_number AS "orderNumber", status,
               payment_status AS "paymentStatus", total_amount AS "totalAmount", updated_at AS "updatedAt"
             FROM orders WHERE (updated_at, id) > ($1::timestamptz, $2::uuid) ORDER BY updated_at, id LIMIT 501`,
            [orderCursor.updatedAt, orderCursor.id],
          ),
        accountType === 'customer'
          ? pool.query(
            `SELECT shoe_id AS "shoeId", action, created_at AS "createdAt", event_id AS "eventId" FROM (
               SELECT w.shoe_id, 'added'::text AS action, w.created_at, w.shoe_id AS event_id
               FROM wishlists w WHERE w.user_id = $1
               UNION ALL
               SELECT (op.payload->>'shoeId')::uuid AS shoe_id, 'removed'::text AS action, op.processed_at AS created_at,
                 op.operation_id AS event_id
               FROM offline_operations op
               WHERE op.account_type = 'customer' AND op.account_id = $1 AND op.operation_type = 'wishlist.remove'
                 AND op.status = 'succeeded' AND op.processed_at IS NOT NULL
             ) wishlist_events
             WHERE (created_at, event_id) > ($2::timestamptz, $3::uuid)
             ORDER BY created_at, event_id LIMIT 501`, [accountId, wishlistCursor.updatedAt, wishlistCursor.id],
          )
          : Promise.resolve({ rows: [] }),
      ])
      const productRows = products.rows.slice(0, 500)
      const orderRows = orders.rows.slice(0, 500)
      const wishlistRows = wishlist.rows.slice(0, 500)
      const nextState = {
        products: advanceCursor(productCursor, productRows, 'updatedAt', 'id'),
        orders: advanceCursor(orderCursor, orderRows, 'updatedAt', 'id'),
        wishlist: accountType === 'customer'
          ? advanceCursor(wishlistCursor, wishlistRows, 'createdAt', 'eventId')
          : wishlistCursor,
      }
      return {
        cursor: encodeCursor(nextState),
        changes: { products: productRows, orders: orderRows, wishlist: wishlistRows },
        hasMore: products.rows.length > 500 || orders.rows.length > 500 || wishlist.rows.length > 500,
      }
    },

    async status(accountType, accountId) {
      const { rows } = await pool.query(
        `SELECT status, count(*)::int AS count FROM offline_operations
         WHERE account_type = $1::account_type AND account_id = $2 GROUP BY status`, [accountType, accountId],
      )
      return { counts: Object.fromEntries(rows.map((row) => [row.status, row.count])) }
    },
  }
}

interface CursorPosition {
  updatedAt: string
  id: string
}

interface SyncCursor {
  products?: CursorPosition
  orders?: CursorPosition
  wishlist?: CursorPosition
}

function decodeCursor(cursor?: string): SyncCursor {
  if (!cursor) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid cursor')
    const state = parsed as SyncCursor
    for (const position of [state.products, state.orders, state.wishlist]) {
      if (position && (!Number.isFinite(Date.parse(position.updatedAt)) || !isUuid(position.id))) {
        throw new Error('Invalid cursor position')
      }
    }
    return state
  } catch {
    throw new HttpError(400, 'INVALID_SYNC_CURSOR', 'Sync cursor is invalid')
  }
}

function encodeCursor(cursor: SyncCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function advanceCursor(
  current: CursorPosition,
  rows: Record<string, unknown>[],
  timestampKey: string,
  idKey: string,
): CursorPosition {
  if (!rows.length) return current
  const last = rows[rows.length - 1]
  return { updatedAt: String(last[timestampKey]), id: String(last[idKey]) }
}

async function processOperation(
  client: import('pg').PoolClient,
  accountType: AccountType,
  accountId: string,
  operation: SyncOperation,
): Promise<{ status: 'succeeded' | 'failed' | 'pending'; error?: string; serverVersion?: number; orderStatus?: 'pending_sync' }> {
  if (operation.type === 'order.create') {
    return { status: 'pending', orderStatus: 'pending_sync', error: 'Order remains pending_sync until online order validation accepts it' }
  }

  if (operation.type.startsWith('wishlist.')) {
    if (accountType !== 'customer') return { status: 'failed', error: 'Wishlist operations require a customer session' }
    const shoeId = String(operation.payload.shoeId ?? '')
    if (!isUuid(shoeId)) return { status: 'failed', error: 'A valid shoeId is required' }
    if (operation.type === 'wishlist.add') {
      const { rowCount } = await client.query(
        `INSERT INTO wishlists (user_id, shoe_id) SELECT $1, id FROM shoes WHERE id = $2 AND status = 'active'
         ON CONFLICT (user_id, shoe_id) DO NOTHING`, [accountId, shoeId],
      )
      if (rowCount === 0) {
        const existing = await client.query('SELECT 1 FROM shoes WHERE id = $1 AND status = \'active\'', [shoeId])
        if (!existing.rowCount) return { status: 'failed', error: 'Product is unavailable' }
      }
    } else {
      await client.query('DELETE FROM wishlists WHERE user_id = $1 AND shoe_id = $2', [accountId, shoeId])
    }
    return { status: 'succeeded' }
  }

  if (operation.type === 'profile.update') {
    if (accountType !== 'customer') return { status: 'failed', error: 'Profile operations require a customer session' }
    const expectedVersion = Number(operation.payload.expectedVersion)
    const firstName = operation.payload.firstName
    const lastName = operation.payload.lastName
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return { status: 'failed', error: 'A valid expectedVersion is required' }
    if (firstName === undefined && lastName === undefined) return { status: 'failed', error: 'No profile fields were provided' }
    const values: unknown[] = [accountId, expectedVersion]
    const assignments: string[] = []
    if (firstName !== undefined) {
      values.push(firstName)
      assignments.push(`first_name = $${values.length}`)
    }
    if (lastName !== undefined) {
      values.push(lastName)
      assignments.push(`last_name = $${values.length}`)
    }
    const { rows } = await client.query<{ profile_version: number }>(
      `UPDATE users SET ${assignments.join(', ')}, profile_version = profile_version + 1, updated_at = now()
       WHERE id = $1 AND profile_version = $2 RETURNING profile_version`, values,
    )
    if (!rows[0]) return { status: 'failed', error: 'Profile changed on the server; refresh and resolve the conflict' }
    return { status: 'succeeded', serverVersion: rows[0].profile_version }
  }

  if (operation.type === 'inventory.adjust') {
    if (accountType !== 'admin') return { status: 'failed', error: 'Inventory operations require an admin session' }
    const variantId = String(operation.payload.variantId ?? '')
    const delta = Number(operation.payload.quantityDelta)
    if (!isUuid(variantId) || !Number.isInteger(delta) || delta === 0) {
      return { status: 'failed', error: 'A valid variantId and non-zero integer quantityDelta are required' }
    }
    const { rows } = await client.query<{ stock_quantity: number }>(
      'SELECT stock_quantity FROM shoe_variants WHERE id = $1 FOR UPDATE', [variantId],
    )
    if (!rows[0]) return { status: 'failed', error: 'Product variant was not found' }
    const previous = Number(rows[0].stock_quantity)
    const next = previous + delta
    if (next < 0) return { status: 'failed', error: 'Inventory adjustment would make stock negative' }
    await client.query('UPDATE shoe_variants SET stock_quantity = $2, updated_at = now() WHERE id = $1', [variantId, next])
    await client.query(
      `INSERT INTO inventory_transactions (variant_id, transaction_type, quantity_changed, previous_quantity, new_quantity)
       VALUES ($1, 'adjustment', $2, $3, $4)`, [variantId, delta, previous, next],
    )
    return { status: 'succeeded' }
  }
  return { status: 'failed', error: 'Unsupported operation type' }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}