export interface ProductFilters {
  query?: string
  categoryId?: string
  brand?: string
  size?: string
  color?: string
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name'
  page: number
  pageSize: number
  includeInactive?: boolean
}

export interface ProductInput {
  name: string
  description?: string
  brand: string
  categoryId: string
  basePrice: string
  discountPrice?: string | null
  images: string[]
  status?: 'draft' | 'active' | 'archived'
}

export interface VariantInput {
  size: string
  color: string
  sku: string
  stockQuantity?: number
  priceAdjustment?: string
}

export interface OrderResult {
  order: Record<string, unknown>
  duplicate: boolean
}

export interface CommerceRepository {
  listCategories(): Promise<Record<string, unknown>[]>
  createCategory(input: { name: string; description?: string; parentCategoryId?: string }): Promise<Record<string, unknown>>
  updateCategory(id: string, input: { name?: string; description?: string | null; parentCategoryId?: string | null }): Promise<Record<string, unknown> | null>
  deleteCategory(id: string): Promise<boolean>
  listProducts(filters: ProductFilters): Promise<{ items: Record<string, unknown>[]; page: number; pageSize: number; total: number }>
  getProduct(id: string): Promise<Record<string, unknown> | null>
  createProduct(input: ProductInput): Promise<Record<string, unknown>>
  updateProduct(id: string, input: Partial<ProductInput>): Promise<Record<string, unknown> | null>
  archiveProduct(id: string): Promise<boolean>
  createVariant(shoeId: string, input: VariantInput): Promise<Record<string, unknown> | null>
  updateVariant(shoeId: string, variantId: string, input: Partial<VariantInput>): Promise<Record<string, unknown> | null>
  adjustInventory(variantId: string, quantityDelta: number, referenceId?: string): Promise<Record<string, unknown> | null>
  listInventory(variantId: string, page: number, pageSize: number): Promise<{ items: Record<string, unknown>[]; page: number; pageSize: number; total: number }>
  getCart(userId: string): Promise<Record<string, unknown>[]>
  addCartItem(userId: string, variantId: string, quantity: number): Promise<Record<string, unknown> | null>
  updateCartItem(userId: string, itemId: string, quantity: number): Promise<Record<string, unknown> | null>
  removeCartItem(userId: string, itemId: string): Promise<boolean>
  listAddresses(userId: string): Promise<Record<string, unknown>[]>
  createAddress(userId: string, input: {
    recipientName: string
    phoneNumber: string
    county: string
    town: string
    streetAddress: string
    isDefault?: boolean
  }): Promise<Record<string, unknown>>
  createOrder(userId: string, addressId: string, idempotencyKey: string): Promise<OrderResult>
  listOrders(userId: string, page: number, pageSize: number, admin: boolean): Promise<{ items: Record<string, unknown>[]; page: number; pageSize: number; total: number }>
  getOrder(userId: string, orderId: string, admin: boolean): Promise<Record<string, unknown> | null>
  updateOrderStatus(orderId: string, status: string): Promise<Record<string, unknown> | null>
}