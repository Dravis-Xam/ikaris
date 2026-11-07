export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Diana Phone Shop API',
    version: '1.0.0',
    description: 'Single-store shoe commerce API. Payment success is provider-verified; offline orders remain pending_sync until accepted.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } },
      },
      Page: { type: 'object', properties: { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 }, total: { type: 'integer' } } },
      Order: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, orderNumber: { type: 'string' }, status: { type: 'string' }, paymentStatus: { type: 'string' }, totalAmount: { type: 'string' } } },
      SyncOperation: {
        type: 'object', required: ['operationId', 'deviceId', 'type', 'payload'],
        properties: {
          operationId: { type: 'string', format: 'uuid' },
          deviceId: { type: 'string' },
          type: { type: 'string', enum: ['wishlist.add', 'wishlist.remove', 'profile.update', 'order.create', 'inventory.adjust'] },
          payload: { type: 'object' },
        },
      },
    },
  },
  paths: {
    '/health': { get: { summary: 'Liveness check', responses: { '200': { description: 'Process is alive' } } } },
    '/health/ready': { get: { summary: 'Dependency readiness check', responses: { '200': { description: 'Ready' }, '503': { description: 'A required service is not ready' } } } },
    '/auth/customer/register': { post: { summary: 'Register a customer', responses: { '201': { description: 'Customer registered' }, '400': { description: 'Invalid input' } } } },
    '/auth/customer/login': { post: { summary: 'Customer login', responses: { '200': { description: 'Tokens issued' }, '401': { description: 'Invalid credentials' } } } },
    '/auth/customer/google': { post: { summary: 'Verify Google identity token and sign in customer', responses: { '200': { description: 'Tokens issued' }, '401': { description: 'Identity token invalid' }, '503': { description: 'Google sign-in is not configured' } } } },
    '/auth/customer/apple': { post: { summary: 'Verify Apple identity token and sign in customer', responses: { '200': { description: 'Tokens issued' }, '401': { description: 'Identity token invalid' }, '503': { description: 'Apple sign-in is not configured' } } } },
    '/auth/customer/refresh': { post: { summary: 'Rotate customer refresh token', responses: { '200': { description: 'Tokens rotated' }, '401': { description: 'Invalid or reused refresh token' } } } },
    '/auth/admin/passkey/status': { get: { summary: 'Check whether owner passkey setup is required', responses: { '200': { description: 'Owner passkey setup status' } } } },
    '/auth/admin/passkey/setup/options': { post: { summary: 'Begin one-time owner passkey enrollment using bootstrap credentials', responses: { '200': { description: 'WebAuthn registration options' }, '409': { description: 'Passkey already enrolled' } } } },
    '/auth/admin/passkey/setup/verify': { post: { summary: 'Verify and persist the owner passkey', responses: { '201': { description: 'Passkey enrolled and owner session issued' } } } },
    '/auth/admin/passkey/login/options': { post: { summary: 'Begin owner passkey authentication', responses: { '200': { description: 'WebAuthn authentication options' }, '409': { description: 'Initial passkey setup required' } } } },
    '/auth/admin/passkey/login/verify': { post: { summary: 'Verify owner passkey and issue session', responses: { '200': { description: 'Tokens issued' }, '401': { description: 'Passkey invalid' } } } },
    '/products': { get: { summary: 'Browse products', parameters: [{ in: 'query', name: 'q', schema: { type: 'string' } }, { in: 'query', name: 'categoryId', schema: { type: 'string', format: 'uuid' } }, { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1 } }, { in: 'query', name: 'pageSize', schema: { type: 'integer', minimum: 1, maximum: 100 } }], responses: { '200': { description: 'Paginated catalog' } } } },
    '/products/{id}': { get: { summary: 'Get an active product', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Product details' }, '404': { description: 'Product not found' } } } },
    '/admin/products': { post: { summary: 'Create a product', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Product created' }, '401': { description: 'Admin authentication required' } } }, get: { summary: 'Admin product list', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated products including drafts' } } } },
    '/admin/products/{id}': { patch: { summary: 'Update a product', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Updated product' } } }, delete: { summary: 'Archive a product', security: [{ bearerAuth: [] }], responses: { '204': { description: 'Product archived' } } } },
    '/admin/products/{id}/variants': { post: { summary: 'Create size/color/SKU variant', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Variant created' } } } },
    '/admin/variants/{variantId}/inventory': { patch: { summary: 'Adjust inventory and write audit transaction', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Inventory adjustment recorded' }, '409': { description: 'Insufficient stock' } } } },
    '/cart': { get: { summary: 'Get the authenticated customer cart', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Cart items with server prices' } } } },
    '/cart/items': { post: { summary: 'Add a variant to cart', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Cart item added' } } } },
    '/orders': { post: { summary: 'Create an idempotent order; stock is checked transactionally', security: [{ bearerAuth: [] }], parameters: [{ in: 'header', name: 'Idempotency-Key', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } }], responses: { '201': { description: 'Order created' }, '409': { description: 'Insufficient stock' } } }, get: { summary: 'List customer orders', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Paginated order history' } } } },
    '/payments/orders/{orderId}': { post: { summary: 'Initiate pending payment with a configured provider', security: [{ bearerAuth: [] }], responses: { '201': { description: 'Pending payment instructions' } } } },
    '/payments/{provider}/webhook': { post: { summary: 'Verify provider-signed payment callback', responses: { '200': { description: 'Callback accepted' }, '401': { description: 'Invalid provider signature' } } } },
    '/sync/customer/push': {
      post: {
        summary: 'Submit idempotent offline operations; order.create remains pending_sync',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  operations: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SyncOperation' },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Per-operation acknowledgements' } },
      },
    },
    '/sync/customer/pull': { get: { summary: 'Get incremental customer changes', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Changes and next cursor' } } } },
    '/sync/customer/status': { get: { summary: 'Get sync operation counts', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Operation status counts' } } } },
    '/sync/admin/push': { post: { summary: 'Submit authorized admin offline operations', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Per-operation acknowledgements' } } } },
    '/sync/admin/pull': { get: { summary: 'Get incremental admin changes', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Changes and next cursor' } } } },
  },
}