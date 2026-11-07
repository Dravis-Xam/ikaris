import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../http/app.js'
import { createAccessToken } from '../auth/tokens.js'
import type { AccountType, AuthRepository, CreateSessionInput } from '../auth/types.js'
import type { CommerceRepository } from './types.js'

const tokenSecret = 'test-secret-with-more-than-thirty-two-characters'
const customerId = randomUUID()
const adminId = randomUUID()
const customerSessionId = randomUUID()
const adminSessionId = randomUUID()

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
  async createSession(_input: CreateSessionInput) { return randomUUID() },
  async rotateSession() { return null },
  async revokeSession() {},
  async isSessionActive(type: AccountType, id: string, sessionId: string) {
    return (type === 'customer' && id === customerId && sessionId === customerSessionId)
      || (type === 'admin' && id === adminId && sessionId === adminSessionId)
  },
}

const commerceRepository: CommerceRepository = {
  async listCategories() { return [] },
  async createCategory(input) { return input },
  async updateCategory() { return null },
  async deleteCategory() { return false },
  async listProducts(filters) { return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize } },
  async getProduct() { return null },
  async createProduct(input) { return { ...input } },
  async updateProduct() { return null },
  async archiveProduct() { return false },
  async createVariant() { return null },
  async updateVariant() { return null },
  async adjustInventory() { return null },
  async listInventory(_id, page, pageSize) { return { items: [], total: 0, page, pageSize } },
  async getCart() { return [] },
  async addCartItem() { return null },
  async updateCartItem() { return null },
  async removeCartItem() { return false },
  async listAddresses() { return [] },
  async createAddress(_userId, input) { return { id: randomUUID(), ...input, isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } },
  async createOrder() { throw new Error('not used') },
  async listOrders(_id, page, pageSize) { return { items: [], total: 0, page, pageSize } },
  async getOrder() { return null },
  async updateOrderStatus() { return null },
}

const app = createApp({ authRepository, commerceRepository, accessTokenSecret: tokenSecret })
const customerToken = createAccessToken('customer', customerId, customerSessionId, tokenSecret)
const adminToken = createAccessToken('admin', adminId, adminSessionId, tokenSecret)

describe('commerce routes', () => {
  it('allows public product browsing with bounded pagination', async () => {
    const response = await request(app).get('/api/v1/products?page=2&pageSize=10&q=runner')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [], page: 2, pageSize: 10, total: 0 })
  })

  it('rejects invalid pagination and invalid product input', async () => {
    const badBrowse = await request(app).get('/api/v1/products?pageSize=500')
    const badProduct = await request(app).post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Shoe', brand: 'Brand', categoryId: randomUUID(), basePrice: -1 })

    expect(badBrowse.status).toBe(400)
    expect(badProduct.status).toBe(400)
  })

  it('allows the store owner to publish a product', async () => {
    const response = await request(app).post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Daily Runner', brand: 'Diana', categoryId: randomUUID(), basePrice: 75, status: 'active' })

    expect(response.status).toBe(201)
    expect(response.body.item.status).toBe('active')
  })

  it('requires an admin token for catalog writes and a customer token for cart access', async () => {
    const customerWrite = await request(app).post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Running' })
    const adminCart = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${adminToken}`)
    const customerCart = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${customerToken}`)

    expect(customerWrite.status).toBe(401)
    expect(adminCart.status).toBe(401)
    expect(customerCart.status).toBe(200)
  })

  it('requires an idempotency key before creating an order', async () => {
    const response = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId: randomUUID() })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('allows a customer to list and create delivery addresses', async () => {
    const listBefore = await request(app).get('/api/v1/addresses').set('Authorization', `Bearer ${customerToken}`)
    const createAddress = await request(app).post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        recipientName: 'M. Wanjiku',
        phoneNumber: '+254712345678',
        county: 'Nairobi',
        town: 'Westlands',
        streetAddress: '12 Yaya Centre, Suite 4',
        isDefault: true,
      })

    expect(listBefore.status).toBe(200)
    expect(createAddress.status).toBe(201)
    expect(createAddress.body.item.recipientName).toBe('M. Wanjiku')
  })
})
