import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { accountStatusEnum } from './enums.js'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 32 }),
  passwordHash: text('password_hash').notNull(),
  profileImage: text('profile_image'),
  status: accountStatusEnum('status').notNull().default('active'),
  profileVersion: integer('profile_version').notNull().default(1),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_lower_uq').on(sql`lower(${table.email})`),
  uniqueIndex('users_phone_number_uq').on(table.phoneNumber).where(sql`${table.phoneNumber} is not null`),
  index('users_status_idx').on(table.status),
])

export const admins = pgTable('admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  singleton: boolean('singleton').notNull().default(true),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  status: accountStatusEnum('status').notNull().default('active'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('admins_singleton_only_check', sql`${table.singleton} = true`),
  uniqueIndex('admins_single_owner_uq').on(table.singleton),
  uniqueIndex('admins_email_lower_uq').on(sql`lower(${table.email})`),
])

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  deviceId: varchar('device_id', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('sessions_exactly_one_owner_check', sql`num_nonnulls(${table.userId}, ${table.adminId}) = 1`),
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_admin_id_idx').on(table.adminId),
  index('sessions_expires_at_idx').on(table.expiresAt),
])

export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientName: varchar('recipient_name', { length: 200 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 32 }).notNull(),
  county: varchar('county', { length: 120 }).notNull(),
  town: varchar('town', { length: 120 }).notNull(),
  streetAddress: text('street_address').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('addresses_user_id_idx').on(table.userId),
  uniqueIndex('addresses_id_user_uq').on(table.id, table.userId),
  uniqueIndex('addresses_one_default_per_user_uq').on(table.userId).where(sql`${table.isDefault} = true`),
])