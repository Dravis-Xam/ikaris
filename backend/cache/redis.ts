import { Redis } from 'ioredis'
import { logger } from '../lib/logger.js'

export function createRedisConnection(url?: string) {
  if (!url) return undefined

  const connection = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: (attempt: number) => Math.min(attempt * 250, 5_000),
  })

  connection.on('error', (error: Error) => logger.error({ err: error }, 'Redis connection error'))
  return connection
}