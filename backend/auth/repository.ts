import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { createDatabase } from '../db/client.js'
import { adminPasskeyChallenges, adminPasskeys, admins, authIdentities, sessions, users } from '../db/schema/accounts.js'
import type { AccountType, AdminPasskey, AuthAccount, AuthPrincipal, AuthRepository, CreateSessionInput, PasskeyChallengeType } from './types.js'

type ShopDatabase = NonNullable<ReturnType<typeof createDatabase>>['db']

export function createDatabaseAuthRepository(db: ShopDatabase): AuthRepository {
  return {
    async findAdminById(id) {
      const [account] = await db.select({
        id: admins.id,
        email: admins.email,
        passwordHash: admins.passwordHash,
        status: admins.status,
        fullName: admins.fullName,
      }).from(admins).where(eq(admins.id, id)).limit(1)
      return account ?? null
    },

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

    async findOrCreateSocialCustomer(input) {
      try {
        return await db.transaction(async (transaction) => {
          const [identity] = await transaction.select({ userId: authIdentities.userId })
            .from(authIdentities)
            .where(and(eq(authIdentities.provider, input.provider), eq(authIdentities.subject, input.subject)))
            .limit(1)

          if (identity) {
            const [account] = await transaction.select({
              id: users.id,
              email: users.email,
              passwordHash: users.passwordHash,
              status: users.status,
              firstName: users.firstName,
              lastName: users.lastName,
            }).from(users).where(eq(users.id, identity.userId)).limit(1)
            if (account) return account
          }

          let [account] = await transaction.select({
            id: users.id,
            email: users.email,
            passwordHash: users.passwordHash,
            status: users.status,
            firstName: users.firstName,
            lastName: users.lastName,
          }).from(users).where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`).limit(1)

          if (!account) {
            ;[account] = await transaction.insert(users).values({
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email.toLowerCase(),
              passwordHash: null,
              emailVerifiedAt: new Date(),
            }).returning({
              id: users.id,
              email: users.email,
              passwordHash: users.passwordHash,
              status: users.status,
              firstName: users.firstName,
              lastName: users.lastName,
            })
          }

          await transaction.insert(authIdentities).values({ userId: account.id, provider: input.provider, subject: input.subject })
          return account
        })
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
          const [identity] = await db.select({ userId: authIdentities.userId })
            .from(authIdentities)
            .where(and(eq(authIdentities.provider, input.provider), eq(authIdentities.subject, input.subject)))
            .limit(1)
          if (identity) {
            const [account] = await db.select({
              id: users.id,
              email: users.email,
              passwordHash: users.passwordHash,
              status: users.status,
              firstName: users.firstName,
              lastName: users.lastName,
            }).from(users).where(eq(users.id, identity.userId)).limit(1)
            if (account) return account
          }
          throw Object.assign(new Error('This email is already linked to another account'), { statusCode: 409, code: 'ACCOUNT_EXISTS' })
        }
        throw error
      }
    },

    async countAdminPasskeys() {
      const credentials = await db.select({ id: adminPasskeys.id }).from(adminPasskeys)
      return credentials.length
    },

    async listAdminPasskeys(adminId: string): Promise<AdminPasskey[]> {
      return db.select({
        id: adminPasskeys.id,
        adminId: adminPasskeys.adminId,
        credentialId: adminPasskeys.credentialId,
        publicKey: adminPasskeys.publicKey,
        counter: adminPasskeys.counter,
        transports: adminPasskeys.transports,
        deviceType: adminPasskeys.deviceType,
        backedUp: adminPasskeys.backedUp,
      }).from(adminPasskeys).where(eq(adminPasskeys.adminId, adminId))
    },

    async findAdminPasskey(credentialId: string): Promise<AdminPasskey | null> {
      const [credential] = await db.select({
        id: adminPasskeys.id,
        adminId: adminPasskeys.adminId,
        credentialId: adminPasskeys.credentialId,
        publicKey: adminPasskeys.publicKey,
        counter: adminPasskeys.counter,
        transports: adminPasskeys.transports,
        deviceType: adminPasskeys.deviceType,
        backedUp: adminPasskeys.backedUp,
      }).from(adminPasskeys).where(eq(adminPasskeys.credentialId, credentialId)).limit(1)
      return credential ?? null
    },

    async saveAdminPasskey(passkey) {
      await db.insert(adminPasskeys).values(passkey)
    },

    async updateAdminPasskeyCounter(credentialId, counter, deviceType, backedUp) {
      await db.update(adminPasskeys).set({ counter, deviceType, backedUp }).where(eq(adminPasskeys.credentialId, credentialId))
    },

    async savePasskeyChallenge(adminId: string | null, challenge: string, type: PasskeyChallengeType, expiresAt: Date) {
      const [saved] = await db.insert(adminPasskeyChallenges).values({ adminId, challenge, type, expiresAt }).returning({ id: adminPasskeyChallenges.id })
      return saved.id
    },

    async consumePasskeyChallenge(id, type) {
      const [challenge] = await db.delete(adminPasskeyChallenges).where(and(
        eq(adminPasskeyChallenges.id, id),
        eq(adminPasskeyChallenges.type, type),
        gt(adminPasskeyChallenges.expiresAt, new Date()),
      )).returning({ id: adminPasskeyChallenges.id, adminId: adminPasskeyChallenges.adminId, challenge: adminPasskeyChallenges.challenge })
      return challenge ?? null
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