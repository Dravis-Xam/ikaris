import { sql } from 'drizzle-orm'
import { type AnyPgColumn, check, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { inventoryTransactionTypeEnum, productStatusEnum } from './enums.js'

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 140 }).notNull(),
  description: text('description'),
  parentCategoryId: uuid('parent_category_id').references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('categories_not_own_parent_check', sql`${table.parentCategoryId} is null or ${table.parentCategoryId} <> ${table.id}`),
  uniqueIndex('categories_name_lower_uq').on(sql`lower(${table.name})`),
  uniqueIndex('categories_slug_uq').on(table.slug),
  index('categories_parent_id_idx').on(table.parentCategoryId),
])

export const shoes = pgTable('shoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 240 }).notNull(),
  slug: varchar('slug', { length: 260 }).notNull(),
  description: text('description'),
  brand: varchar('brand', { length: 120 }).notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull(),
  discountPrice: numeric('discount_price', { precision: 12, scale: 2 }),
  images: text('images').array().notNull().default(sql`'{}'::text[]`),
  status: productStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('shoes_slug_uq').on(table.slug),
  index('shoes_category_status_idx').on(table.categoryId, table.status),
  index('shoes_brand_idx').on(table.brand),
  index('shoes_name_search_idx').using('gin', sql`to_tsvector('simple', ${table.name} || ' ' || ${table.brand})`),
  check('shoes_base_price_nonnegative_check', sql`${table.basePrice} >= 0`),
  check('shoes_discount_price_valid_check', sql`${table.discountPrice} is null or (${table.discountPrice} >= 0 and ${table.discountPrice} < ${table.basePrice})`),
])

export const shoeVariants = pgTable('shoe_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  shoeId: uuid('shoe_id').notNull().references(() => shoes.id, { onDelete: 'cascade' }),
  size: varchar('size', { length: 20 }).notNull(),
  color: varchar('color', { length: 60 }).notNull(),
  sku: varchar('sku', { length: 80 }).notNull(),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  priceAdjustment: numeric('price_adjustment', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('shoe_variants_sku_uq').on(table.sku),
  uniqueIndex('shoe_variants_shoe_size_color_uq').on(table.shoeId, table.size, sql`lower(${table.color})`),
  uniqueIndex('shoe_variants_id_shoe_uq').on(table.id, table.shoeId),
  index('shoe_variants_shoe_id_idx').on(table.shoeId),
  check('shoe_variants_stock_nonnegative_check', sql`${table.stockQuantity} >= 0`),
])

export const inventoryTransactions = pgTable('inventory_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  variantId: uuid('variant_id').notNull().references(() => shoeVariants.id, { onDelete: 'restrict' }),
  transactionType: inventoryTransactionTypeEnum('transaction_type').notNull(),
  quantityChanged: integer('quantity_changed').notNull(),
  previousQuantity: integer('previous_quantity').notNull(),
  newQuantity: integer('new_quantity').notNull(),
  referenceId: uuid('reference_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('inventory_transactions_variant_created_idx').on(table.variantId, table.createdAt),
  check('inventory_transactions_quantities_nonnegative_check', sql`${table.previousQuantity} >= 0 and ${table.newQuantity} >= 0`),
  check('inventory_transactions_quantity_delta_check', sql`${table.newQuantity} - ${table.previousQuantity} = ${table.quantityChanged}`),
])