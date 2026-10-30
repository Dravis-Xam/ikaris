import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { accountTypeEnum, offlineOperationStatusEnum } from './enums.js'
import { users } from './accounts.js'
import { shoes } from './catalog.js'

export const offlineOperations = pgTable('offline_operations', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountType: accountTypeEnum('account_type').notNull(),
  accountId: uuid('account_id').notNull(),
  deviceId: varchar('device_id', { length: 255 }).notNull(),
  operationId: uuid('operation_id').notNull(),
  operationType: varchar('operation_type', { length: 80 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: offlineOperationStatusEnum('status').notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
}, (table) => [
  uniqueIndex('offline_operations_idempotency_uq').on(table.accountType, table.accountId, table.deviceId, table.operationId),
  index('offline_operations_account_created_idx').on(table.accountType, table.accountId, table.createdAt),
  index('offline_operations_pending_idx').on(table.status, table.createdAt),
  check('offline_operations_retry_nonnegative_check', sql`${table.retryCount} >= 0`),
])

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 80 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('notifications_user_created_idx').on(table.userId, table.createdAt)])

export const productReviews = pgTable('product_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  shoeId: uuid('shoe_id').notNull().references(() => shoes.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  title: varchar('title', { length: 160 }),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('product_reviews_user_shoe_uq').on(table.userId, table.shoeId),
  index('product_reviews_shoe_created_idx').on(table.shoeId, table.createdAt),
  check('product_reviews_rating_range_check', sql`${table.rating} between 1 and 5`),
])

export const wishlists = pgTable('wishlists', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  shoeId: uuid('shoe_id').notNull().references(() => shoes.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('wishlists_user_shoe_uq').on(table.userId, table.shoeId),
  index('wishlists_user_created_idx').on(table.userId, table.createdAt),
])

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountType: accountTypeEnum('account_type'),
  accountId: uuid('account_id'),
  action: varchar('action', { length: 120 }).notNull(),
  resourceType: varchar('resource_type', { length: 80 }).notNull(),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').notNull().default({}),
  ipAddress: varchar('ip_address', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_logs_account_created_idx').on(table.accountType, table.accountId, table.createdAt),
  index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
])

export const idempotencyRecords = pgTable('idempotency_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountType: accountTypeEnum('account_type').notNull(),
  accountId: uuid('account_id').notNull(),
  key: varchar('key', { length: 128 }).notNull(),
  requestHash: varchar('request_hash', { length: 128 }).notNull(),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idempotency_records_account_key_uq').on(table.accountType, table.accountId, table.key),
  index('idempotency_records_expires_idx').on(table.expiresAt),
])