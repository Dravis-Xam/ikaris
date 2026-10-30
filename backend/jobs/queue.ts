import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

export function createNotificationQueue(connection: Redis) {
  return new Queue('notifications', {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 1_000,
      removeOnFail: false,
    },
  })
}