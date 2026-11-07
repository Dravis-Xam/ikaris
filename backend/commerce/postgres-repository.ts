import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { HttpError } from '../http/errors.js'
import type {
  CommerceRepository,
  OrderResult,
  ProductFilters,
  ProductInput,
  VariantInput,
} from './types.js'

type Row = Record<string, unknown>

export function createPostgresCommerceRepository(pool: Pool, readPool: Pool = pool): CommerceRepository {
  return {
    async listCategories() {
      const { rows } = await readPool.query<Row>(
        'SELECT id, name, slug, description, parent_category_id AS "parentCategoryId" FROM categories ORDER BY name',
      )
      return rows
    },

    async createCategory(input) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO categories (name, slug, description, parent_category_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, description, parent_category_id AS "parentCategoryId"`,
        [input.name, slugify(input.name), input.description ?? null, input.parentCategoryId ?? null],
      )
      return rows[0]
    },

    async updateCategory(id, input) {
      const columns: Record<string, string> = { name: 'name', description: 'description', parentCategoryId: 'parent_category_id' }
      const entries = Object.entries(input).filter(([, value]) => value !== undefined)
      if (!entries.length) return null
      const values = entries.map(([, value], index) => value === null ? null : value)
      const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}`)
      const nameIndex = entries.findIndex(([key]) => key === 'name')
      if (nameIndex >= 0) {
        values.push(slugify(String(entries[nameIndex][1])))
        assignments.push(`slug = $${values.length + 1}`)
      }
      const { rows } = await pool.query<Row>(
        `UPDATE categories SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1
         RETURNING id, name, slug, description, parent_category_id AS "parentCategoryId"`,
        [id, ...values],
      )
      return rows[0] ?? null
    },

    async deleteCategory(id) {
      const result = await pool.query('DELETE FROM categories WHERE id = $1', [id])
      return result.rowCount === 1
    },

    async listProducts(filters) {
      const conditions: string[] = []
      const values: unknown[] = []
      const add = (value: unknown) => {
        values.push(value)
        return `$${values.length}`
      }

      if (!filters.includeInactive) conditions.push(`s.status = 'active'`)
      if (filters.query) {
        const parameter = add(`%${filters.query}%`)
        conditions.push(`(s.name ILIKE ${parameter} OR s.brand ILIKE ${parameter} OR s.description ILIKE ${parameter})`)
      }
      if (filters.categoryId) conditions.push(`s.category_id = ${add(filters.categoryId)}`)
      if (filters.brand) conditions.push(`s.brand ILIKE ${add(filters.brand)}`)
      if (filters.size || filters.color) {
        const variantConditions = [`v.shoe_id = s.id`]
        if (filters.size) variantConditions.push(`v.size = ${add(filters.size)}`)
        if (filters.color) variantConditions.push(`v.color ILIKE ${add(filters.color)}`)
        conditions.push(`EXISTS (SELECT 1 FROM shoe_variants v WHERE ${variantConditions.join(' AND ')})`)
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const sortColumns = {
        newest: 's.created_at DESC',
        price_asc: 'COALESCE(s.discount_price, s.base_price) ASC',
        price_desc: 'COALESCE(s.discount_price, s.base_price) DESC',
        name: 's.name ASC',
      } as const
      const offset = (filters.page - 1) * filters.pageSize
      const pagination = [filters.pageSize, offset]
      const [countResult, productResult] = await Promise.all([
        readPool.query<{ total: string }>(`SELECT count(*)::text AS total FROM shoes s ${whereClause}`, values),
        readPool.query<Row>(
          `SELECT s.id, s.name, s.slug, s.description, s.brand, s.category_id AS "categoryId",
             c.name AS "categoryName", s.base_price AS "basePrice", s.discount_price AS "discountPrice",
             s.images, s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
             COALESCE((SELECT json_agg(json_build_object(
               'id', v.id, 'size', v.size, 'color', v.color, 'sku', v.sku,
               'stockQuantity', v.stock_quantity, 'priceAdjustment', v.price_adjustment
             ) ORDER BY v.size, v.color) FROM shoe_variants v WHERE v.shoe_id = s.id), '[]'::json) AS variants
           FROM shoes s JOIN categories c ON c.id = s.category_id ${whereClause}
           ORDER BY ${sortColumns[filters.sort ?? 'newest']}
           LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, ...pagination],
        ),
      ])
      return { items: productResult.rows, page: filters.page, pageSize: filters.pageSize, total: Number(countResult.rows[0].total) }
    },

    async getProduct(id) {
      const { rows } = await readPool.query<Row>(
        `SELECT s.id, s.name, s.slug, s.description, s.brand, s.category_id AS "categoryId",
           c.name AS "categoryName", s.base_price AS "basePrice", s.discount_price AS "discountPrice",
           s.images, s.status, s.created_at AS "createdAt", s.updated_at AS "updatedAt",
           COALESCE((SELECT json_agg(json_build_object(
             'id', v.id, 'size', v.size, 'color', v.color, 'sku', v.sku,
             'stockQuantity', v.stock_quantity, 'priceAdjustment', v.price_adjustment
           ) ORDER BY v.size, v.color) FROM shoe_variants v WHERE v.shoe_id = s.id), '[]'::json) AS variants
         FROM shoes s JOIN categories c ON c.id = s.category_id WHERE s.id = $1`,
        [id],
      )
      return rows[0] ?? null
    },

    async createProduct(input) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO shoes (name, slug, description, brand, category_id, base_price, discount_price, images, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::product_status)
         RETURNING id, name, slug, description, brand, category_id AS "categoryId", base_price AS "basePrice",
           discount_price AS "discountPrice", images, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [input.name, `${slugify(input.name)}-${randomUUID().slice(0, 8)}`, input.description ?? null, input.brand,
          input.categoryId, input.basePrice, input.discountPrice ?? null, input.images, input.status ?? 'draft'],
      )
      return rows[0]
    },

    async updateProduct(id, input) {
      const columns: Record<string, string> = {
        name: 'name', description: 'description', brand: 'brand', categoryId: 'category_id',
        basePrice: 'base_price', discountPrice: 'discount_price', images: 'images', status: 'status',
      }
      const entries = Object.entries(input).filter(([key, value]) => columns[key] && value !== undefined)
      if (!entries.length) return this.getProduct(id)
      const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 2}${key === 'status' ? '::product_status' : ''}`)
      const values = entries.map(([, value]) => value)
      const nameEntry = entries.find(([key]) => key === 'name')
      if (nameEntry) {
        assignments.push(`slug = $${values.length + 2}`)
        values.push(`${slugify(String(nameEntry[1]))}-${randomUUID().slice(0, 8)}`)
      }
      const { rows } = await pool.query<Row>(
        `UPDATE shoes SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1
         RETURNING id, name, slug, description, brand, category_id AS "categoryId", base_price AS "basePrice",
           discount_price AS "discountPrice", images, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, ...values],
      )
      return rows[0] ?? null
    },

    async archiveProduct(id) {
      const result = await pool.query("UPDATE shoes SET status = 'archived', updated_at = now() WHERE id = $1 AND status <> 'archived'", [id])
      return result.rowCount === 1
    },

    async createVariant(shoeId, input) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const stockQuantity = input.stockQuantity ?? 0
        const { rows } = await client.query<Row>(
          `INSERT INTO shoe_variants (shoe_id, size, color, sku, stock_quantity, price_adjustment)
           SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM shoes WHERE id = $1)
           RETURNING id, shoe_id AS "shoeId", size, color, sku, stock_quantity AS "stockQuantity", price_adjustment AS "priceAdjustment"`,
          [shoeId, input.size, input.color, input.sku, stockQuantity, input.priceAdjustment ?? '0'],
        )
        if (!rows[0]) {
          await client.query('ROLLBACK')
          return null
        }
        if (stockQuantity > 0) {
          await client.query(
            `INSERT INTO inventory_transactions (variant_id, transaction_type, quantity_changed, previous_quantity, new_quantity)
             VALUES ($1, 'restock', $2, 0, $2)`, [rows[0].id, stockQuantity],
          )
        }
        await client.query('COMMIT')
        return rows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async updateVariant(shoeId, variantId, input) {
      const columns: Record<string, string> = { size: 'size', color: 'color', sku: 'sku', priceAdjustment: 'price_adjustment' }
      const entries = Object.entries(input).filter(([key, value]) => columns[key] && value !== undefined)
      if (!entries.length) {
        const { rows } = await pool.query<Row>(
          `SELECT id, shoe_id AS "shoeId", size, color, sku, stock_quantity AS "stockQuantity", price_adjustment AS "priceAdjustment"
           FROM shoe_variants WHERE shoe_id = $1 AND id = $2`, [shoeId, variantId],
        )
        return rows[0] ?? null
      }
      const assignments = entries.map(([key], index) => `${columns[key]} = $${index + 3}`)
      const { rows } = await pool.query<Row>(
        `UPDATE shoe_variants SET ${assignments.join(', ')}, updated_at = now() WHERE shoe_id = $1 AND id = $2
         RETURNING id, shoe_id AS "shoeId", size, color, sku, stock_quantity AS "stockQuantity", price_adjustment AS "priceAdjustment"`,
        [shoeId, variantId, ...entries.map(([, value]) => value)],
      )
      return rows[0] ?? null
    },

    async adjustInventory(variantId, quantityDelta, referenceId) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query<{ stock_quantity: number }>(
          'SELECT stock_quantity FROM shoe_variants WHERE id = $1 FOR UPDATE', [variantId],
        )
        if (!rows[0]) {
          await client.query('ROLLBACK')
          return null
        }
        const previous = rows[0].stock_quantity
        const next = previous + quantityDelta
        if (next < 0) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Inventory cannot be negative')
        await client.query('UPDATE shoe_variants SET stock_quantity = $2, updated_at = now() WHERE id = $1', [variantId, next])
        const { rows: auditRows } = await client.query<Row>(
          `INSERT INTO inventory_transactions (variant_id, transaction_type, quantity_changed, previous_quantity, new_quantity, reference_id)
           VALUES ($1, 'adjustment', $2, $3, $4, $5)
           RETURNING id, variant_id AS "variantId", transaction_type AS "transactionType", quantity_changed AS "quantityChanged",
             previous_quantity AS "previousQuantity", new_quantity AS "newQuantity", created_at AS "createdAt"`,
          [variantId, quantityDelta, previous, next, referenceId ?? null],
        )
        await client.query('COMMIT')
        return auditRows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async listInventory(variantId, page, pageSize) {
      const offset = (page - 1) * pageSize
      const [count, records] = await Promise.all([
        readPool.query<{ total: string }>('SELECT count(*)::text AS total FROM inventory_transactions WHERE variant_id = $1', [variantId]),
        readPool.query<Row>(
          `SELECT id, variant_id AS "variantId", transaction_type AS "transactionType", quantity_changed AS "quantityChanged",
             previous_quantity AS "previousQuantity", new_quantity AS "newQuantity", reference_id AS "referenceId", created_at AS "createdAt"
           FROM inventory_transactions WHERE variant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [variantId, pageSize, offset],
        ),
      ])
      return { items: records.rows, page, pageSize, total: Number(count.rows[0].total) }
    },

    async getCart(userId) {
      const { rows } = await pool.query<Row>(
        `SELECT ci.id, ci.variant_id AS "variantId", ci.quantity, s.id AS "shoeId", s.name, s.images,
           v.size, v.color, v.sku, v.stock_quantity AS "stockQuantity",
           (COALESCE(s.discount_price, s.base_price) + v.price_adjustment)::numeric(12,2)::text AS "unitPrice"
         FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
         JOIN shoe_variants v ON v.id = ci.variant_id AND v.shoe_id = ci.shoe_id
         JOIN shoes s ON s.id = ci.shoe_id WHERE c.user_id = $1 ORDER BY ci.created_at`, [userId],
      )
      return rows
    },

    async addCartItem(userId, variantId, quantity) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: products } = await client.query<{ id: string; shoe_id: string; stock_quantity: number }>(
          `SELECT v.id, v.shoe_id, v.stock_quantity FROM shoe_variants v
           JOIN shoes s ON s.id = v.shoe_id WHERE v.id = $1 AND s.status = 'active' FOR UPDATE OF v`, [variantId],
        )
        if (!products[0]) {
          await client.query('ROLLBACK')
          return null
        }
        const { rows: cartsForUser } = await client.query<{ id: string }>(
          `INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`, [userId],
        )
        const cartId = cartsForUser[0].id
        const { rows } = await client.query<{ id: string; variantId: string; quantity: number }>(
          `INSERT INTO cart_items (cart_id, shoe_id, variant_id, quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = now()
           RETURNING id, variant_id AS "variantId", quantity`,
          [cartId, products[0].shoe_id, variantId, quantity],
        )
        if (rows[0].quantity > products[0].stock_quantity) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock')
        await client.query('COMMIT')
        return rows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async updateCartItem(userId, itemId, quantity) {
      const { rows } = await pool.query<Row>(
        `UPDATE cart_items ci SET quantity = $3, updated_at = now()
         FROM carts c, shoe_variants v WHERE ci.id = $1 AND ci.cart_id = c.id AND c.user_id = $2
           AND v.id = ci.variant_id AND v.stock_quantity >= $3
         RETURNING ci.id, ci.variant_id AS "variantId", ci.quantity`,
        [itemId, userId, quantity],
      )
      if (!rows[0]) {
        const item = await pool.query('SELECT 1 FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE ci.id = $1 AND c.user_id = $2', [itemId, userId])
        if (item.rowCount) throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock')
      }
      return rows[0] ?? null
    },

    async removeCartItem(userId, itemId) {
      const result = await pool.query(
        'DELETE FROM cart_items ci USING carts c WHERE ci.id = $1 AND ci.cart_id = c.id AND c.user_id = $2',
        [itemId, userId],
      )
      return result.rowCount === 1
    },

    async listAddresses(userId) {
      const { rows } = await readPool.query<Row>(
        `SELECT id, user_id AS "userId", recipient_name AS "recipientName", phone_number AS "phoneNumber",
           county, town, street_address AS "streetAddress", is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`, [userId],
      )
      return rows
    },

    async createAddress(userId, input) {
      if (input.isDefault) {
        await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId])
      }
      const { rows } = await pool.query<Row>(
        `INSERT INTO addresses (user_id, recipient_name, phone_number, county, town, street_address, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id AS "userId", recipient_name AS "recipientName", phone_number AS "phoneNumber",
           county, town, street_address AS "streetAddress", is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [userId, input.recipientName, input.phoneNumber, input.county, input.town, input.streetAddress, input.isDefault ?? false],
      )
      return rows[0]
    },

    async createOrder(userId, addressId, idempotencyKey): Promise<OrderResult> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: previousOrders } = await client.query<Row>(
          `SELECT id, order_number AS "orderNumber", status, subtotal, delivery_fee AS "deliveryFee",
             discount_amount AS "discountAmount", total_amount AS "totalAmount", payment_status AS "paymentStatus"
           FROM orders WHERE user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey],
        )
        if (previousOrders[0]) {
          await client.query('COMMIT')
          return { order: previousOrders[0], duplicate: true }
        }

        const { rows: cartRows } = await client.query<Row>(
          `SELECT ci.variant_id AS "variantId", ci.shoe_id AS "shoeId", ci.quantity,
             s.name, v.size, v.color, v.stock_quantity AS "stockQuantity",
             COALESCE(s.discount_price, s.base_price) + v.price_adjustment AS "unitPrice"
           FROM carts c JOIN cart_items ci ON ci.cart_id = c.id
           JOIN shoe_variants v ON v.id = ci.variant_id AND v.shoe_id = ci.shoe_id
           JOIN shoes s ON s.id = ci.shoe_id
           WHERE c.user_id = $1 AND s.status = 'active'
            ORDER BY v.id FOR UPDATE OF v, s`, [userId],
        )
        if (!cartRows.length) throw new HttpError(400, 'EMPTY_CART', 'Add available products to your cart before ordering')

          const available = new Map(cartRows.map((item) => [item.variantId, Number(item.stockQuantity)]))
        for (const item of cartRows) {
            if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0) {
              throw new HttpError(409, 'INVALID_PRODUCT_PRICE', `Product ${item.name} does not have a payable price`)
            }
          if ((available.get(item.variantId) ?? 0) < Number(item.quantity)) {
            throw new HttpError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${item.name}`)
          }
        }

        const { rows: addresses } = await client.query<{ id: string }>(
          'SELECT id FROM addresses WHERE id = $1 AND user_id = $2', [addressId, userId],
        )
        if (!addresses[0]) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Delivery address was not found')

        const subtotalCents = cartRows.reduce((total, item) => total + Math.round(Number(item.unitPrice) * 100) * Number(item.quantity), 0)
        const deliveryFeeCents = 0
        const discountCents = 0
        const orderNumber = `DS-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`
        const { rows: orderRows } = await client.query<Row>(
          `INSERT INTO orders (user_id, order_number, status, subtotal, delivery_fee, discount_amount, total_amount,
             payment_status, delivery_address_id, idempotency_key)
           VALUES ($1, $2, 'pending_payment', $3, $4, $5, $6, 'pending', $7, $8)
           RETURNING id, order_number AS "orderNumber", status, subtotal, delivery_fee AS "deliveryFee",
             discount_amount AS "discountAmount", total_amount AS "totalAmount", payment_status AS "paymentStatus",
             delivery_address_id AS "deliveryAddressId", created_at AS "createdAt"`,
          [userId, orderNumber, cents(subtotalCents), cents(deliveryFeeCents), cents(discountCents), cents(subtotalCents), addressId, idempotencyKey],
        )
        const order = orderRows[0]

        for (const item of cartRows) {
          const previousQuantity = available.get(item.variantId)!
          const nextQuantity = previousQuantity - Number(item.quantity)
          await client.query('UPDATE shoe_variants SET stock_quantity = $2, updated_at = now() WHERE id = $1', [item.variantId, nextQuantity])
          await client.query(
            `INSERT INTO inventory_transactions (variant_id, transaction_type, quantity_changed, previous_quantity, new_quantity, reference_id)
             VALUES ($1, 'reservation', $2, $3, $4, $5)`,
            [item.variantId, -Number(item.quantity), previousQuantity, nextQuantity, order.id],
          )
          const unitPriceCents = Math.round(Number(item.unitPrice) * 100)
          await client.query(
            `INSERT INTO order_items (order_id, shoe_id, variant_id, product_name_snapshot, size_snapshot, color_snapshot,
               quantity, unit_price, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [order.id, item.shoeId, item.variantId, item.name, item.size, item.color, item.quantity,
              cents(unitPriceCents), cents(unitPriceCents * Number(item.quantity))],
          )
          available.set(item.variantId, nextQuantity)
        }

        await client.query('DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)', [userId])
        await client.query('COMMIT')
        return { order, duplicate: false }
      } catch (error) {
        await client.query('ROLLBACK')
        if (isUniqueViolation(error)) {
          const { rows } = await pool.query<Row>(
            `SELECT id, order_number AS "orderNumber", status, subtotal, delivery_fee AS "deliveryFee",
               discount_amount AS "discountAmount", total_amount AS "totalAmount", payment_status AS "paymentStatus"
             FROM orders WHERE user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey],
          )
          if (rows[0]) return { order: rows[0], duplicate: true }
        }
        throw error
      } finally {
        client.release()
      }
    },

    async listOrders(userId, page, pageSize, admin) {
      const where = admin ? '' : 'WHERE user_id = $1'
      const values: unknown[] = admin ? [pageSize, (page - 1) * pageSize] : [userId, pageSize, (page - 1) * pageSize]
      const limitIndex = admin ? 1 : 2
      const offsetIndex = admin ? 2 : 3
      const count = await pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM orders ${where}`, admin ? [] : [userId])
      const orders = await pool.query<Row>(
        `SELECT id, user_id AS "userId", order_number AS "orderNumber", status, subtotal,
           delivery_fee AS "deliveryFee", discount_amount AS "discountAmount", total_amount AS "totalAmount",
           payment_status AS "paymentStatus", created_at AS "createdAt"
         FROM orders ${where} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        values,
      )
      return { items: orders.rows, page, pageSize, total: Number(count.rows[0].total) }
    },

    async getOrder(userId, orderId, admin) {
      const { rows } = await pool.query<Row>(
        `SELECT o.id, o.user_id AS "userId", o.order_number AS "orderNumber", o.status, o.subtotal,
           o.delivery_fee AS "deliveryFee", o.discount_amount AS "discountAmount", o.total_amount AS "totalAmount",
           o.payment_status AS "paymentStatus", o.delivery_address_id AS "deliveryAddressId", o.created_at AS "createdAt",
           COALESCE((SELECT json_agg(json_build_object(
             'id', oi.id, 'shoeId', oi.shoe_id, 'variantId', oi.variant_id,
             'productName', oi.product_name_snapshot, 'size', oi.size_snapshot, 'color', oi.color_snapshot,
             'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'subtotal', oi.subtotal
           )) FROM order_items oi WHERE oi.order_id = o.id), '[]'::json) AS items
         FROM orders o WHERE o.id = $1 AND ($2::boolean OR o.user_id = $3)`,
        [orderId, admin, userId],
      )
      return rows[0] ?? null
    },

    async updateOrderStatus(orderId, status) {
      const allowedCurrent: Record<string, string[]> = {
        processing: ['confirmed'],
        shipped: ['processing'],
        delivered: ['shipped'],
        cancelled: ['pending_payment', 'confirmed', 'processing'],
      }
      const currentStatuses = allowedCurrent[status]
      if (!currentStatuses) throw new HttpError(400, 'INVALID_ORDER_TRANSITION', 'Order status transition is not allowed')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query<Row>(
          `UPDATE orders SET status = $2::order_status, updated_at = now()
           WHERE id = $1 AND status = ANY($3::order_status[])
             AND ($2 <> 'cancelled' OR payment_status <> 'succeeded')
           RETURNING id, order_number AS "orderNumber", status, payment_status AS "paymentStatus"`,
          [orderId, status, currentStatuses],
        )
        if (!rows[0]) {
          const existing = await client.query('SELECT 1 FROM orders WHERE id = $1', [orderId])
          await client.query('ROLLBACK')
          if (existing.rowCount) throw new HttpError(409, 'INVALID_ORDER_TRANSITION', 'Order status transition is not allowed')
          return null
        }
        if (status === 'cancelled') await releaseReservedStock(client, orderId)
        await client.query('COMMIT')
        return rows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
  }
}

async function releaseReservedStock(client: PoolClient, orderId: string) {
  const { rows: items } = await client.query<{ variant_id: string; quantity: number }>(
    'SELECT variant_id, quantity FROM order_items WHERE order_id = $1 AND variant_id IS NOT NULL ORDER BY variant_id', [orderId],
  )
  for (const item of items) {
    const { rows } = await client.query<{ stock_quantity: number }>(
      'SELECT stock_quantity FROM shoe_variants WHERE id = $1 FOR UPDATE', [item.variant_id],
    )
    if (!rows[0]) continue
    const previous = Number(rows[0].stock_quantity)
    const next = previous + Number(item.quantity)
    await client.query('UPDATE shoe_variants SET stock_quantity = $2, updated_at = now() WHERE id = $1', [item.variant_id, next])
    await client.query(
      `INSERT INTO inventory_transactions (variant_id, transaction_type, quantity_changed, previous_quantity, new_quantity, reference_id)
       VALUES ($1, 'release', $2, $3, $4, $5)`,
      [item.variant_id, item.quantity, previous, next, orderId],
    )
  }
}

function cents(value: number) {
  return (value / 100).toFixed(2)
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 240) || 'item'
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}