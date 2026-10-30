import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../http/app.js'
import { hashRefreshToken } from './tokens.js'
import type { AccountType, AuthAccount, AuthPrincipal, AuthRepository, CreateSessionInput } from './types.js'

const secret = 'test-secret-with-more-than-thirty-two-characters'

class MemoryAuthRepository implements AuthRepository {
  readonly accounts: AuthAccount[] = []
  readonly sessions = new Map<string, { principal: AuthPrincipal; tokenHash: string; active: boolean }>()

  async findAccount(accountType: AccountType, email: string) {
    return this.accounts.find((account) => account.email === email && account.fullName ? accountType === 'admin' : accountType === 'customer') ?? null
  }

  async createCustomer(input: { firstName: string; lastName: string; email: string; phoneNumber?: string; passwordHash: string }) {
    const account: AuthAccount = { ...input, id: randomUUID(), status: 'active' }
    this.accounts.push(account)
    return account
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

    expect(adminLogin.status).toBe(200)
    expect(crossScope.status).toBe(401)
    expect(adminRegister.status).toBe(404)
  })
})