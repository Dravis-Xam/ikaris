import { Router, type Request, type RequestHandler, type Response } from 'express'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { z } from 'zod'
import { requireAccount } from '../auth/authorization.js'
import type { AuthRepository } from '../auth/types.js'
import { HttpError } from '../http/errors.js'
import type { CommerceRepository, ProductFilters } from './types.js'

const uuid = z.string().uuid()
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
const productInput = z.object({
  name: z.string().trim().min(1).max(240),
  description: z.string().max(10_000).optional(),
  brand: z.string().trim().min(1).max(120),
  categoryId: uuid,
  basePrice: z.coerce.number().finite().min(0).transform((value) => value.toFixed(2)),
  discountPrice: z.union([z.coerce.number().finite().min(0).transform((value) => value.toFixed(2)), z.null()]).optional(),
  images: z.array(z.string().url().max(2_048)).max(12).default([]),
  status: z.enum(['draft', 'active', 'archived']).optional(),
})
const categoryInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).optional(),
  parentCategoryId: uuid.optional(),
})
const categoryPatch = categoryInput.partial().extend({ parentCategoryId: uuid.nullable().optional() })
const variantInput = z.object({
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(60),
  sku: z.string().trim().min(1).max(80),
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
  priceAdjustment: z.coerce.number().finite().transform((value) => value.toFixed(2)).optional(),
})
const variantPatch = variantInput.partial().omit({ stockQuantity: true })
const orderInput = z.object({ addressId: uuid })
const orderStatusInput = z.object({ status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']) })

export function createCommerceRouter(
  commerce: CommerceRepository,
  auth: AuthRepository,
  accessTokenSecret: string,
  redis?: Redis,
  notifications?: Queue,
) {
  const router = Router()
  const requireCustomer = requireAccount('customer', auth, accessTokenSecret)
  const requireAdmin = requireAccount('admin', auth, accessTokenSecret)

  router.get('/categories', route(async (_request, response) => {
    response.json({ items: await cached(redis, 'categories', 300, () => commerce.listCategories()) })
  }))

  router.get('/products', route(async (request, response) => {
    const filters = parseProductFilters(request.query, false)
    response.json(await cached(redis, `products:${JSON.stringify(filters)}`, 60, () => commerce.listProducts(filters)))
  }))

  router.get('/products/:id', route(async (request, response) => {
    const id = uuid.parse(request.params.id)
    const product = await cached(redis, `product:${id}`, 60, () => commerce.getProduct(id))
    if (!product || product.status !== 'active') throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product was not found')
    response.json({ item: product })
  }))

  router.use('/admin', requireAdmin)
  router.post('/admin/categories', route(async (request, response) => {
    const input = categoryInput.parse(request.body)
    const item = await commerce.createCategory(input)
    await invalidateCatalog(redis)
    response.status(201).json({ item })
  }))
  router.patch('/admin/categories/:id', route(async (request, response) => {
    const item = await commerce.updateCategory(uuid.parse(request.params.id), categoryPatch.parse(request.body))
    if (!item) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category was not found')
    await invalidateCatalog(redis)
    response.json({ item })
  }))
  router.delete('/admin/categories/:id', route(async (request, response) => {
    if (!await commerce.deleteCategory(uuid.parse(request.params.id))) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category was not found')
    await invalidateCatalog(redis)
    response.status(204).end()
  }))
  router.get('/admin/products', route(async (request, response) => {
    response.json(await commerce.listProducts(parseProductFilters(request.query, true)))
  }))
  router.post('/admin/products', route(async (request, response) => {
    const item = await commerce.createProduct(productInput.parse(request.body))
    await invalidateCatalog(redis)
    response.status(201).json({ item })
  }))
  router.patch('/admin/products/:id', route(async (request, response) => {
    const item = await commerce.updateProduct(uuid.parse(request.params.id), productInput.partial().parse(request.body))
    if (!item) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product was not found')
    await invalidateCatalog(redis)
    response.json({ item })
  }))
  router.delete('/admin/products/:id', route(async (request, response) => {
    if (!await commerce.archiveProduct(uuid.parse(request.params.id))) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product was not found')
    await invalidateCatalog(redis)
    response.status(204).end()
  }))
  router.post('/admin/products/:id/variants', route(async (request, response) => {
    const item = await commerce.createVariant(uuid.parse(request.params.id), variantInput.parse(request.body))
    if (!item) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product was not found')
    await invalidateCatalog(redis)
    response.status(201).json({ item })
  }))
  router.patch('/admin/products/:id/variants/:variantId', route(async (request, response) => {
    const item = await commerce.updateVariant(
      uuid.parse(request.params.id), uuid.parse(request.params.variantId), variantPatch.parse(request.body),
    )
    if (!item) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Product variant was not found')
    await invalidateCatalog(redis)
    response.json({ item })
  }))
  router.patch('/admin/variants/:variantId/inventory', route(async (request, response) => {
    const input = z.object({ quantityDelta: z.coerce.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0), referenceId: uuid.optional() }).parse(request.body)
    const item = await commerce.adjustInventory(uuid.parse(request.params.variantId), input.quantityDelta, input.referenceId)
    if (!item) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Product variant was not found')
    await invalidateCatalog(redis)
    response.status(201).json({ item })
  }))
  router.get('/admin/variants/:variantId/inventory', route(async (request, response) => {
    const page = pageSchema.parse(request.query)
    response.json(await commerce.listInventory(uuid.parse(request.params.variantId), page.page, page.pageSize))
  }))
  router.get('/admin/orders', route(async (request, response) => {
    const page = pageSchema.parse(request.query)
    response.json(await commerce.listOrders('', page.page, page.pageSize, true))
  }))
  router.patch('/admin/orders/:id/status', route(async (request, response) => {
    const { status } = orderStatusInput.parse(request.body)
    const item = await commerce.updateOrderStatus(uuid.parse(request.params.id), status)
    if (!item) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order was not found')
    response.json({ item })
  }))

  router.use(requireCustomer)
  router.get('/cart', route(async (_request, response) => {
    const principal = getPrincipal(response)
    response.json({ items: await commerce.getCart(principal.accountId) })
  }))
  router.post('/cart/items', route(async (request, response) => {
    const input = z.object({ variantId: uuid, quantity: z.coerce.number().int().min(1).max(100) }).parse(request.body)
    const item = await commerce.addCartItem(getPrincipal(response).accountId, input.variantId, input.quantity)
    if (!item) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Available product variant was not found')
    response.status(201).json({ item })
  }))
  router.patch('/cart/items/:id', route(async (request, response) => {
    const { quantity } = z.object({ quantity: z.coerce.number().int().min(1).max(100) }).parse(request.body)
    const item = await commerce.updateCartItem(getPrincipal(response).accountId, uuid.parse(request.params.id), quantity)
    if (!item) throw new HttpError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found')
    response.json({ item })
  }))
  router.delete('/cart/items/:id', route(async (request, response) => {
    if (!await commerce.removeCartItem(getPrincipal(response).accountId, uuid.parse(request.params.id))) {
      throw new HttpError(404, 'CART_ITEM_NOT_FOUND', 'Cart item was not found')
    }
    response.status(204).end()
  }))
  router.post('/orders', route(async (request, response) => {
    const { addressId } = orderInput.parse(request.body)
    const idempotencyKey = request.get('idempotency-key')?.trim()
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key header between 8 and 128 characters')
    }
    const result = await commerce.createOrder(getPrincipal(response).accountId, addressId, idempotencyKey)
    if (!result.duplicate && notifications) {
      await notifications.add('order-created', {
        userId: getPrincipal(response).accountId,
        type: 'order_created',
        payload: { orderId: result.order.id },
      })
    }
    response.status(result.duplicate ? 200 : 201).json({ item: result.order, duplicate: result.duplicate })
  }))
  router.get('/orders', route(async (request, response) => {
    const page = pageSchema.parse(request.query)
    response.json(await commerce.listOrders(getPrincipal(response).accountId, page.page, page.pageSize, false))
  }))
  router.get('/orders/:id', route(async (request, response) => {
    const item = await commerce.getOrder(getPrincipal(response).accountId, uuid.parse(request.params.id), false)
    if (!item) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order was not found')
    response.json({ item })
  }))

  return router
}

async function cached<T>(redis: Redis | undefined, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (!redis) return load()
  const cacheKey = `dps:catalog:${key}`
  try {
    if (redis.status === 'wait') await redis.connect()
    const value = await redis.get(cacheKey)
    if (value) return JSON.parse(value) as T
  } catch {
    return load()
  }
  const value = await load()
  try {
    await redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    return value
  }
  return value
}

async function invalidateCatalog(redis?: Redis) {
  if (!redis) return
  try {
    if (redis.status === 'wait') await redis.connect()
    let cursor = '0'
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'dps:catalog:*', 'COUNT', 100)
      cursor = nextCursor
      if (keys.length) await redis.del(...keys)
    } while (cursor !== '0')
  } catch {
    return
  }
}

function parseProductFilters(query: Request['query'], includeInactive: boolean): ProductFilters {
  const parsed = pageSchema.extend({
    q: z.string().trim().max(200).optional(),
    categoryId: uuid.optional(),
    brand: z.string().trim().max(120).optional(),
    size: z.string().trim().max(20).optional(),
    color: z.string().trim().max(60).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  }).parse(query)

  return {
    query: parsed.q,
    categoryId: parsed.categoryId,
    brand: parsed.brand,
    size: parsed.size,
    color: parsed.color,
    sort: parsed.sort,
    page: parsed.page,
    pageSize: parsed.pageSize,
    includeInactive,
  }
}

function getPrincipal(response: Response) {
  const principal = response.locals.auth as { accountId?: string } | undefined
  if (!principal?.accountId) throw new HttpError(401, 'UNAUTHENTICATED', 'A valid access token is required')
  return principal as { accountId: string }
}

function route(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch((error: unknown) => {
      if (error instanceof HttpError) return next(error)
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed'))
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === '23505') return next(new HttpError(409, 'RESOURCE_CONFLICT', 'A record with the same unique value already exists'))
        if (error.code === '23503') return next(new HttpError(400, 'INVALID_REFERENCE', 'A referenced record does not exist'))
        if (error.code === '23514') return next(new HttpError(400, 'CONSTRAINT_VIOLATION', 'The request violates a data constraint'))
      }
      next(error)
    })
  }
}