import { Worker, type Job } from 'bullmq'
import type { Pool } from 'pg'
import type { Redis } from 'ioredis'
import { logger } from '../lib/logger.js'

interface NotificationJob {
  userId: string
  type: string
  payload: Record<string, unknown>
}

export function createNotificationWorker(connection: Redis, pool: Pool) {
  const worker = new Worker<NotificationJob>('notifications', async (job: Job<NotificationJob>) => {
    const { userId, type, payload } = job.data
    await pool.query(
      'INSERT INTO notifications (user_id, type, payload) VALUES ($1, $2, $3)',
      [userId, type, payload],
    )
  }, {
    connection,
    concurrency: 5,
  })

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, attemptsMade: job?.attemptsMade, err: error }, 'Notification job failed')
  })
  worker.on('error', (error) => logger.error({ err: error }, 'Notification worker error'))
  return worker
}