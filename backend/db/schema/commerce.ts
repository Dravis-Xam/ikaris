import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { addresses, users } from './accounts.js'
import { shoeVariants, shoes } from './catalog.js'
import { orderStatusEnum, paymentMethodEnum, paymentStatusEnum } from './enums.js'

export const carts = pgTable('carts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cartItems = pgTable('cart_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  cartId: uuid('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  shoeId: uuid('shoe_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.variantId, table.shoeId], foreignColumns: [shoeVariants.id, shoeVariants.shoeId] })
    .onDelete('cascade'),
  uniqueIndex('cart_items_cart_variant_uq').on(table.cartId, table.variantId),
  index('cart_items_cart_id_idx').on(table.cartId),
  check('cart_items_quantity_positive_check', sql`${table.quantity} > 0`),
])

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  orderNumber: varchar('order_number', { length: 40 }).notNull().unique(),
  status: orderStatusEnum('status').notNull().default('pending_sync'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  deliveryFee: numeric('delivery_fee', { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  deliveryAddressId: uuid('delivery_address_id'),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.deliveryAddressId, table.userId], foreignColumns: [addresses.id, addresses.userId] })
    .onDelete('restrict'),
  uniqueIndex('orders_id_user_uq').on(table.id, table.userId),
  uniqueIndex('orders_user_idempotency_uq').on(table.userId, table.idempotencyKey),
  index('orders_user_created_idx').on(table.userId, table.createdAt),
  index('orders_status_created_idx').on(table.status, table.createdAt),
  check('orders_amounts_nonnegative_check', sql`${table.subtotal} >= 0 and ${table.deliveryFee} >= 0 and ${table.discountAmount} >= 0 and ${table.totalAmount} >= 0`),
  check('orders_total_matches_components_check', sql`${table.totalAmount} = ${table.subtotal} + ${table.deliveryFee} - ${table.discountAmount}`),
])

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  shoeId: uuid('shoe_id'),
  variantId: uuid('variant_id'),
  productNameSnapshot: varchar('product_name_snapshot', { length: 240 }).notNull(),
  sizeSnapshot: varchar('size_snapshot', { length: 20 }).notNull(),
  colorSnapshot: varchar('color_snapshot', { length: 60 }).notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
}, (table) => [
  foreignKey({ columns: [table.variantId, table.shoeId], foreignColumns: [shoeVariants.id, shoeVariants.shoeId] })
    .onDelete('set null'),
  foreignKey({ columns: [table.shoeId], foreignColumns: [shoes.id] }).onDelete('set null'),
  index('order_items_order_id_idx').on(table.orderId),
  check('order_items_quantity_positive_check', sql`${table.quantity} > 0`),
  check('order_items_amounts_valid_check', sql`${table.unitPrice} >= 0 and ${table.subtotal} = ${table.unitPrice} * ${table.quantity}`),
])

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  paymentReference: varchar('payment_reference', { length: 128 }).notNull().unique(),
  provider: varchar('provider', { length: 80 }).notNull(),
  providerEventId: varchar('provider_event_id', { length: 160 }),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('KES'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  providerResponse: jsonb('provider_response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('payments_order_created_idx').on(table.orderId, table.createdAt),
  uniqueIndex('payments_provider_event_uq').on(table.provider, table.providerEventId).where(sql`${table.providerEventId} is not null`),
  check('payments_amount_positive_check', sql`${table.amount} > 0`),
])

export const deliveryTracking = pgTable('delivery_tracking', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 40 }).notNull(),
  location: text('location'),
  details: text('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('delivery_tracking_order_created_idx').on(table.orderId, table.createdAt)])

export const returns = pgTable('returns', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull(),
  userId: uuid('user_id').notNull(),
  reason: text('reason').notNull(),
  status: varchar('status', { length: 40 }).notNull().default('requested'),
  refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.orderId, table.userId], foreignColumns: [orders.id, orders.userId] })
    .onDelete('restrict'),
  index('returns_order_id_idx').on(table.orderId),
  check('returns_refund_nonnegative_check', sql`${table.refundAmount} is null or ${table.refundAmount} >= 0`),
])