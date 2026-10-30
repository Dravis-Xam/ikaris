import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { createDatabase } from '../db/client.js'
import { admins, sessions, users } from '../db/schema/accounts.js'
import type { AccountType, AuthAccount, AuthPrincipal, AuthRepository, CreateSessionInput } from './types.js'

type ShopDatabase = NonNullable<ReturnType<typeof createDatabase>>['db']

export function createDatabaseAuthRepository(db: ShopDatabase): AuthRepository {
  return {
    async findAccount(accountType, email) {
      if (accountType === 'customer') {
        const [account] = await db.select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          status: users.status,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1)
        return account ?? null
      }

      const [account] = await db.select({
        id: admins.id,
        email: admins.email,
        passwordHash: admins.passwordHash,
        status: admins.status,
        fullName: admins.fullName,
      }).from(admins).where(sql`lower(${admins.email}) = ${email}`).limit(1)
      return account ?? null
    },

    async createCustomer(input) {
      try {
        const [account] = await db.insert(users).values({ ...input, email: input.email.toLowerCase() }).returning({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          status: users.status,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        return account
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
          throw Object.assign(new Error('An account with this email already exists'), { statusCode: 409, code: 'ACCOUNT_EXISTS' })
        }
        throw error
      }
    },

    async createSession(input: CreateSessionInput) {
      const [session] = await db.insert(sessions).values({
        userId: input.accountType === 'customer' ? input.accountId : null,
        adminId: input.accountType === 'admin' ? input.accountId : null,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        deviceId: input.deviceId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      }).returning({ id: sessions.id })
      return session.id
    },

    async rotateSession(accountType, currentHash, nextHash, expiresAt) {
      return db.transaction(async (transaction) => {
        const ownerCondition = accountType === 'customer'
          ? and(isNull(sessions.adminId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()), eq(sessions.refreshTokenHash, currentHash))
          : and(isNull(sessions.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()), eq(sessions.refreshTokenHash, currentHash))
        const [session] = await transaction.update(sessions)
          .set({ refreshTokenHash: nextHash, expiresAt })
          .where(ownerCondition)
          .returning({ id: sessions.id, userId: sessions.userId, adminId: sessions.adminId })

        const accountId = accountType === 'customer' ? session?.userId : session?.adminId
        if (!session || !accountId) return null

        const [account] = accountType === 'customer'
          ? await transaction.select({
            id: users.id,
            email: users.email,
            passwordHash: users.passwordHash,
            status: users.status,
            firstName: users.firstName,
            lastName: users.lastName,
          }).from(users).where(eq(users.id, accountId)).limit(1)
          : await transaction.select({
            id: admins.id,
            email: admins.email,
            passwordHash: admins.passwordHash,
            status: admins.status,
            fullName: admins.fullName,
          }).from(admins).where(eq(admins.id, accountId)).limit(1)

        if (!account || account.status !== 'active') {
          await transaction.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id))
          return null
        }

        return { accountType, accountId, sessionId: session.id, account }
      })
    },

    async revokeSession(accountType, accountId, sessionId) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(
        eq(sessions.id, sessionId),
        accountType === 'customer' ? eq(sessions.userId, accountId) : eq(sessions.adminId, accountId),
        isNull(sessions.revokedAt),
      ))
    },

    async isSessionActive(accountType, accountId, sessionId) {
      const ownerIsActive = accountType === 'customer'
        ? sql`exists (select 1 from ${users} where ${users.id} = ${sessions.userId} and ${users.status} = 'active')`
        : sql`exists (select 1 from ${admins} where ${admins.id} = ${sessions.adminId} and ${admins.status} = 'active')`
      const [session] = await db.select({ id: sessions.id }).from(sessions).where(and(
        eq(sessions.id, sessionId),
        accountType === 'customer' ? eq(sessions.userId, accountId) : eq(sessions.adminId, accountId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        ownerIsActive,
      )).limit(1)
      return Boolean(session)
    },
  }
}

export type { AuthAccount }