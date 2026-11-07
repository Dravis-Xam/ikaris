import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../http/app.js'
import { hashRefreshToken } from './tokens.js'
import type { AccountType, AdminPasskey, AuthAccount, AuthPrincipal, AuthRepository, CreateSessionInput, PasskeyChallenge, PasskeyChallengeType } from './types.js'

const secret = 'test-secret-with-more-than-thirty-two-characters'

class MemoryAuthRepository implements AuthRepository {
  readonly accounts: AuthAccount[] = []
  readonly sessions = new Map<string, { principal: AuthPrincipal; tokenHash: string; active: boolean }>()
  readonly passkeys: AdminPasskey[] = []
  readonly challenges = new Map<string, PasskeyChallenge & { type: PasskeyChallengeType; expiresAt: Date }>()

  async findAccount(accountType: AccountType, email: string) {
    return this.accounts.find((account) => account.email === email && account.fullName ? accountType === 'admin' : accountType === 'customer') ?? null
  }

  async findAdminById(id: string) {
    return this.accounts.find((account) => account.id === id && Boolean(account.fullName)) ?? null
  }

  async createCustomer(input: { firstName: string; lastName: string; email: string; phoneNumber?: string; passwordHash: string | null }) {
    const account: AuthAccount = { ...input, id: randomUUID(), status: 'active' }
    this.accounts.push(account)
    return account
  }

  async findOrCreateSocialCustomer(input: { provider: 'google' | 'apple'; subject: string; email: string; firstName: string; lastName: string }) {
    const account = this.accounts.find((candidate) => candidate.email === input.email && !candidate.fullName)
    if (account) return account
    return this.createCustomer({ ...input, passwordHash: null })
  }

  async countAdminPasskeys() { return this.passkeys.length }
  async listAdminPasskeys(adminId: string) { return this.passkeys.filter((passkey) => passkey.adminId === adminId) }
  async findAdminPasskey(credentialId: string) { return this.passkeys.find((passkey) => passkey.credentialId === credentialId) ?? null }
  async saveAdminPasskey(passkey: Omit<AdminPasskey, 'id'>) { this.passkeys.push({ ...passkey, id: randomUUID() }) }
  async updateAdminPasskeyCounter(credentialId: string, counter: number, deviceType: string, backedUp: boolean) {
    const passkey = await this.findAdminPasskey(credentialId)
    if (passkey) Object.assign(passkey, { counter, deviceType, backedUp })
  }
  async savePasskeyChallenge(adminId: string | null, challenge: string, type: PasskeyChallengeType, expiresAt: Date) {
    const id = randomUUID()
    this.challenges.set(id, { id, adminId, challenge, type, expiresAt })
    return id
  }
  async consumePasskeyChallenge(id: string, type: PasskeyChallengeType) {
    const challenge = this.challenges.get(id)
    if (!challenge || challenge.type !== type || challenge.expiresAt <= new Date()) return null
    this.challenges.delete(id)
    return { id, adminId: challenge.adminId, challenge: challenge.challenge }
  }

  async createSession(input: CreateSessionInput) {
    const account = this.accounts.find((candidate) => candidate.id === input.accountId)!
    const sessionId = randomUUID()
    const principal = { accountType: input.accountType, accountId: account.id, sessionId, account }
    this.sessions.set(sessionId, { principal, tokenHash: input.refreshTokenHash, active: true })
    return sessionId
  }

  async rotateSession(accountType: AccountType, currentHash: string, nextHash: string): Promise<AuthPrincipal | null> {
    const session = [...this.sessions.values()].find((candidate) => candidate.active && candidate.tokenHash === currentHash && candidate.principal.accountType === accountType)
    if (!session) return null
    session.tokenHash = nextHash
    return session.principal
  }

  async revokeSession(accountType: AccountType, accountId: string, sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (session?.principal.accountId === accountId && session.principal.accountType === accountType) session.active = false
  }

  async isSessionActive(accountType: AccountType, accountId: string, sessionId: string) {
    const session = this.sessions.get(sessionId)
    return Boolean(session?.active && session.principal.accountId === accountId && session.principal.accountType === accountType)
  }

  addAdmin(account: AuthAccount) {
    this.accounts.push({ ...account, fullName: 'Store Owner' })
  }
}

describe('customer and admin authentication', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('registers customers and stores only a hash of each refresh token', async () => {
    const repository = new MemoryAuthRepository()
    const response = await request(createApp({ authRepository: repository, accessTokenSecret: secret }))
      .post('/api/v1/auth/customer/register')
      .send({ firstName: 'Ada', lastName: 'Shoe', email: 'ADA@example.com', password: 'a-strong-password-123' })

    expect(response.status).toBe(201)
    expect(response.body.account.email).toBe('ada@example.com')
    expect(response.body.account.passwordHash).toBeUndefined()
    expect([...repository.sessions.values()][0].tokenHash).toBe(hashRefreshToken(response.body.refreshToken))
  })

  it('rotates refresh tokens once and rejects the previous token', async () => {
    const repository = new MemoryAuthRepository()
    const app = createApp({ authRepository: repository, accessTokenSecret: secret })
    const registered = await request(app).post('/api/v1/auth/customer/register').send({
      firstName: 'Ada', lastName: 'Shoe', email: 'ada@example.com', password: 'a-strong-password-123',
    })

    const rotated = await request(app).post('/api/v1/auth/customer/refresh').send({ refreshToken: registered.body.refreshToken })
    const replay = await request(app).post('/api/v1/auth/customer/refresh').send({ refreshToken: registered.body.refreshToken })

    expect(rotated.status).toBe(200)
    expect(rotated.body.refreshToken).not.toBe(registered.body.refreshToken)
    expect(replay.status).toBe(401)
  })

  it('keeps customer and admin auth boundaries separate', async () => {
    const repository = new MemoryAuthRepository()
    repository.addAdmin({
      id: randomUUID(),
      email: 'owner@example.com',
      passwordHash: await bcrypt.hash('admin-password-123', 4),
      status: 'active',
    })
    const app = createApp({ authRepository: repository, accessTokenSecret: secret })
    const adminLogin = await request(app).post('/api/v1/auth/admin/login').send({
      email: 'owner@example.com', password: 'admin-password-123',
    })

    const crossScope = await request(app).post('/api/v1/auth/customer/logout')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    const adminRegister = await request(app).post('/api/v1/auth/admin/register').send({})

    expect(adminLogin.status).toBe(404)
    expect(crossScope.status).toBe(401)
    expect(adminRegister.status).toBe(404)
  })

  it('uses the seeded password only for first-time owner passkey setup', async () => {
    const repository = new MemoryAuthRepository()
    repository.addAdmin({
      id: randomUUID(),
      email: 'owner@example.com',
      passwordHash: await bcrypt.hash('admin-password-123', 4),
      status: 'active',
    })
    const app = createApp({ authRepository: repository, accessTokenSecret: secret })

    const status = await request(app).get('/api/v1/auth/admin/passkey/status')
    const options = await request(app).post('/api/v1/auth/admin/passkey/setup/options').send({
      email: 'owner@example.com', password: 'admin-password-123',
    })
    const invalidVerification = await request(app).post('/api/v1/auth/admin/passkey/setup/verify').send({
      challengeId: options.body.challengeId, response: {},
    })
    const replayedVerification = await request(app).post('/api/v1/auth/admin/passkey/setup/verify').send({
      challengeId: options.body.challengeId, response: {},
    })
    const repeatSetup = await request(app).post('/api/v1/auth/admin/passkey/setup/options').send({
      email: 'owner@example.com', password: 'wrong-password',
    })

    expect(status.status).toBe(200)
    expect(status.body.setupRequired).toBe(true)
    expect(options.status).toBe(200)
    expect(options.body.options.authenticatorSelection.userVerification).toBe('required')
    expect(repository.challenges.size).toBe(0)
    expect(invalidVerification.status).toBe(401)
    expect(replayedVerification.status).toBe(400)
    expect(repeatSetup.status).toBe(401)
  })

  it('rejects owner passkey login until first-time setup is complete', async () => {
    const response = await request(createApp({ authRepository: new MemoryAuthRepository(), accessTokenSecret: secret }))
      .post('/api/v1/auth/admin/passkey/login/options')

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('PASSKEY_SETUP_REQUIRED')
  })

  it('does not issue a customer session when social providers are unconfigured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    const response = await request(createApp({ authRepository: new MemoryAuthRepository(), accessTokenSecret: secret }))
      .post('/api/v1/auth/customer/google')
      .send({ credential: 'a-valid-looking-provider-token-string' })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED')
  })
})