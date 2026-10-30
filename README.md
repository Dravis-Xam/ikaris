# Diana Phone Shop

The React frontend and Express API are served from one origin. The backend is a modular monolith using TypeScript, Express, PostgreSQL, Drizzle ORM, Redis, BullMQ, Socket.IO, Zod, JWT, and bcryptjs.

## Development

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Vite hot reloading and the API are served by the same server. Start local PostgreSQL and Redis with Docker Compose, then run migrations:

```sh
docker compose up -d postgres redis
npm run db:migrate
npm run dev
```

The API liveness endpoint is `/api/health`; dependency readiness is `/api/health/ready`. OpenAPI JSON is at `/api/docs/openapi.json`.

For a complete local stack, `docker compose up --build` starts PostgreSQL, Redis, and the app; the app applies migrations before starting. Provision the single store owner once with `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` set in `.env`, then run `npm run db:seed-admin`.

## Modules And API

- Customer auth: `/api/v1/auth/customer/register`, `/login`, `/refresh`, `/logout`.
- Owner auth: `/api/v1/auth/admin/login`, `/refresh`, `/logout`. There is no admin registration endpoint.
- Catalog: public `GET /api/v1/categories`, `GET /api/v1/products`, and `GET /api/v1/products/:id`; admin product/category/variant writes are under `/api/v1/admin`. Admin product creation/update accepts `status: draft|active|archived` to control publication.
- Inventory: admin adjustments at `/api/v1/admin/variants/:variantId/inventory`; each adjustment is recorded in inventory history.
- Cart and orders: customer routes at `/api/v1/cart` and `/api/v1/orders`. Order creation requires an `Idempotency-Key`; stock and prices are checked and reserved transactionally.
- Payments: customer initiation is at `/api/v1/payments/orders/:orderId`; provider callbacks use `/api/v1/payments/:provider/webhook` and must pass HMAC verification.
- Offline sync: `/api/v1/sync/customer/{push,pull,status}` and `/api/v1/sync/admin/{push,pull,status}`. Operations are scoped to the authenticated account and deduplicated by device and operation UUID.

## Database

Drizzle schema modules are in `backend/db/schema`. They define customers, the singleton owner account, sessions, addresses, categories, shoes, variants, stock transactions, carts, orders and snapshot items, payments, offline operations, notifications, reviews, wishlists, audit logs, idempotency records, deliveries, and returns. Database constraints enforce unique SKUs/emails, nonnegative inventory, exactly one session owner, one cart per customer, matching shoe/variant references, and order/address ownership.

Generate a migration after schema changes with `npm run db:generate`; apply it once with `npm run db:migrate`. Keep PostgreSQL as the source of truth. Checkout locks product and variant rows in stable order, uses server-side prices, records inventory reservations, snapshots the purchased item details, and deduplicates orders per customer idempotency key.

## Configuration

Copy `.env.example` to `.env` and set values appropriate for the environment:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `HOST`, `PORT` | Bind address and HTTP port |
| `DATABASE_URL` | Primary PostgreSQL connection |
| `DATABASE_READ_URL` | Optional read-only replica; catalog reads may use it |
| `REDIS_URL` | Redis for caching, BullMQ, and multi-instance Socket.IO |
| `CLIENT_ORIGIN` | Exact allowed browser origin for CORS |
| `ACCESS_TOKEN_SECRET` | At least 32 characters; signs short-lived JWT access tokens |
| `REFRESH_TOKEN_SECRET` | Reserved for token-secret separation; refresh credentials are opaque and stored hashed |
| `PAYMENT_WEBHOOK_SECRET` | At least 32 characters; enables the HMAC example provider |
| `BOOTSTRAP_ADMIN_EMAIL` | Owner email for the one-time seed command |
| `BOOTSTRAP_ADMIN_NAME` | Owner display name for the one-time seed command |
| `BOOTSTRAP_ADMIN_PASSWORD` | Unique password of at least 12 characters for the one-time seed command |

Redis failures bypass catalog caching; PostgreSQL remains authoritative. Product and category cache entries expire after 60 and 300 seconds and are invalidated after admin changes. BullMQ retries notification jobs with exponential backoff and retains failed jobs for inspection.

## Authentication And Payments

Customer and admin routes have separate token audiences and session checks. Passwords use bcryptjs; access tokens expire after 15 minutes; refresh tokens are random opaque values stored as SHA-256 hashes and rotated atomically. Login and customer registration have stricter rate limits than the general API limit. Successful admin catalog, inventory, and order mutations are recorded in `audit_logs`.

Orders begin as `pending_payment` after stock reservation. Only a verified provider webhook can mark payment successful and confirm the order. The included HMAC provider is an integration example, not a payment gateway; a real provider adapter and credentials must be supplied before accepting live payments. A failed payment does not count as success.

## Offline Synchronization

Clients should persist their queue locally and submit UUID-keyed operations with `deviceId`. Supported operations are wishlist add/remove, version-checked profile updates, admin inventory adjustments, and offline order requests. Failed operations may be retried with their original UUID; succeeded operations are acknowledged idempotently. Reusing an operation UUID with different content is rejected. Pull responses include products, customer orders, and wishlist add/remove events since an opaque keyset cursor; archived products are included as removal signals. Server prices, inventory, and payment states remain authoritative. An offline order request is stored as a pending sync operation and is explicitly returned with `orderStatus: pending_sync`; it is not represented as a confirmed order.

## Security And Scaling

Requests use Zod validation, parameterized SQL, Helmet, strict configured CORS, JSON size limits, general and auth-specific rate limits, session-bound role checks, ownership-scoped reads/writes, and secure generic error responses. Production requests require HTTPS behind one trusted proxy hop. Product images are validated storage URLs; binary upload handling is intentionally not exposed.

The API is stateless between requests. PostgreSQL uses bounded connection pools; `DATABASE_READ_URL` is optional and is only used for catalog/category/inventory-history reads. Redis-backed Socket.IO coordination is enabled when Redis is configured; without it, sockets use the local adapter and are not horizontally shared. `deploy/nginx.conf` is a TLS/WebSocket reverse-proxy template; provide certificates and upstream app instances in the deployment environment.

## Testing

```sh
npm test -- backend/auth/router.test.ts backend/commerce/router.test.ts backend/payments backend/sync/router.test.ts
npm run typecheck
npm run lint
npm run build
```

The HTTP tests cover role separation, payload validation, payment signatures, and sync routing. PostgreSQL-dependent order concurrency, migration application, Redis outage, and recovery scenarios require running the local services and are not simulated by the in-memory route tests.

## Deployment And Recovery

Build and run the production server with `npm run build && npm start`, or build the production container with `docker build -t diana-phone-shop .`. Set strong secrets, PostgreSQL/Redis URLs, `CLIENT_ORIGIN`, and `NODE_ENV=production`; production requires `DATABASE_URL` and `ACCESS_TOKEN_SECRET`. Terminate TLS at the trusted reverse proxy and restrict direct database access to the application and migration jobs. Apply migrations once per deployment with `npm run db:migrate` before rolling out application instances. Use `/api/health/ready` for readiness checks and allow graceful termination on `SIGTERM`. The optional admin seed command is `npm run db:seed-admin`; it never overwrites an existing owner account.

Create a custom-format database backup with `DATABASE_URL=... ./scripts/backup-db.sh`; restore using `pg_restore` against a protected target database. Schedule backups and test restore procedures outside the application. Redis uses AOF persistence in the local Compose setup but remains a rebuildable cache/queue service, not the business source of truth.

## Remaining Limitations

- Password recovery/reset and customer account deactivation flows are not implemented.
- Offline order requests remain pending for explicit online re-submission; no automatic server-side acceptance worker is provided.
- The HMAC provider is an integration example, not a live payment gateway; live provider and refund integrations are not configured.
- Images must already be hosted; no Cloudinary/S3 upload endpoint is configured.
- Payment reservations do not yet have an automatic expiry worker; owners should cancel abandoned unpaid orders operationally until one is added.
- Production migration execution, backup scheduling, error monitoring, and restore drills must be provided by the deployment environment.
- Live PostgreSQL concurrency/recovery and Redis failure tests were not run because Docker Compose and a PostgreSQL client are unavailable in this environment.
- No physical sharding is configured; measure workloads before considering it.
