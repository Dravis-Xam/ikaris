import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAccessToken } from '../auth/tokens.js'
import type { AuthRepository } from '../auth/types.js'
import { createApp } from '../http/app.js'
import type { SyncRepository } from './repository.js'

const tokenSecret = 'test-secret-with-more-than-thirty-two-characters'
const customerId = randomUUID()
const customerSessionId = randomUUID()
let receivedCursor: string | undefined
const authRepository: AuthRepository = {
  async findAccount() { return null },
  async findAdminById() { return null },
  async createCustomer() { throw new Error('not used') },
  async findOrCreateSocialCustomer() { throw new Error('not used') },
  async countAdminPasskeys() { return 0 },
  async listAdminPasskeys() { return [] },
  async findAdminPasskey() { return null },
  async saveAdminPasskey() {},
  async updateAdminPasskeyCounter() {},
  async savePasskeyChallenge() { return randomUUID() },
  async consumePasskeyChallenge() { return null },
  async createSession() { return randomUUID() },
  async rotateSession() { return null },
  async revokeSession() {},
  async isSessionActive(type, id, sessionId) {
    return (type === 'customer' && id === customerId && sessionId === customerSessionId)
      || (type === 'admin' && id === 'admin-id' && sessionId === 'admin-session')
  },
}
const syncRepository: SyncRepository = {
  async push(_type, _id, operations) { return operations.map(({ operationId }) => ({ operationId, status: 'succeeded', duplicate: false })) },
  async pull(_type, _id, cursor) { receivedCursor = cursor; return { cursor: cursor ?? 'initial-cursor', changes: {} } },
  async status(type) { return { accountType: type } },
}
const app = createApp({ authRepository, syncRepository, accessTokenSecret: tokenSecret })
const customerToken = createAccessToken('customer', customerId, customerSessionId, tokenSecret)

describe('offline sync routes', () => {
  it('requires authentication and rejects malformed queued operation payloads', async () => {
    const unauthenticated = await request(app).get('/api/v1/sync/customer/status')
    const invalid = await request(app).post('/api/v1/sync/customer/push')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ operations: [{
        operationId: randomUUID(), deviceId: 'device-1', type: 'wishlist.add', payload: { shoeId: 'bad-id' },
      }] })

    expect(unauthenticated.status).toBe(401)
    expect(invalid.status).toBe(400)
  })

  it('accepts a valid idempotent operation batch and incremental cursor', async () => {
    const operationId = randomUUID()
    const pushed = await request(app).post('/api/v1/sync/customer/push')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ operations: [{
        operationId, deviceId: 'phone-1', type: 'wishlist.add', payload: { shoeId: randomUUID() },
      }] })
    const cursor = new Date(Date.now() - 10_000).toISOString()
    const pulled = await request(app).get(`/api/v1/sync/customer/pull?cursor=${encodeURIComponent(cursor)}`)
      .set('Authorization', `Bearer ${customerToken}`)
    const crossRole = await request(app).get('/api/v1/sync/admin/status')
      .set('Authorization', `Bearer ${customerToken}`)

    expect(pushed.status).toBe(200)
    expect(pushed.body.results[0].operationId).toBe(operationId)
    expect(pulled.status).toBe(200)
    expect(receivedCursor).toBe(cursor)
    expect(crossRole.status).toBe(401)
  })

  it('keeps offline order requests constrained to a valid address', async () => {
    const invalid = await request(app).post('/api/v1/sync/customer/push')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ operations: [{
        operationId: randomUUID(), deviceId: 'phone-1', type: 'order.create', payload: { addressId: 'invalid' },
      }] })

    expect(invalid.status).toBe(400)
  })
})