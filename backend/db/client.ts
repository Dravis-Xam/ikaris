import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { logger } from '../lib/logger.js'

export function createDatabase(connectionString?: string, readConnectionString?: string) {
  if (!connectionString) return undefined

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  const readPool = readConnectionString && readConnectionString !== connectionString
    ? new Pool({
      connectionString: readConnectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    : undefined

  pool.on('error', (error: Error) => logger.error({ err: error }, 'Unexpected PostgreSQL pool error'))
  readPool?.on('error', (error: Error) => logger.error({ err: error }, 'Unexpected PostgreSQL read pool error'))

  return { pool, readPool, db: drizzle(pool) }
}