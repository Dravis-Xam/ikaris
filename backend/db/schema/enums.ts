import { pgEnum } from 'drizzle-orm/pg-core'

export const accountStatusEnum = pgEnum('account_status', ['active', 'suspended', 'deactivated'])
export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived'])
export const orderStatusEnum = pgEnum('order_status', [
  'pending_sync',
  'pending_payment',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
])
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'succeeded', 'failed', 'refunded'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash_on_delivery', 'card', 'mobile_money', 'bank_transfer'])
export const accountTypeEnum = pgEnum('account_type', ['customer', 'admin'])
export const inventoryTransactionTypeEnum = pgEnum('inventory_transaction_type', [
  'restock',
  'sale',
  'reservation',
  'release',
  'adjustment',
  'return',
])
export const offlineOperationStatusEnum = pgEnum('offline_operation_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
])