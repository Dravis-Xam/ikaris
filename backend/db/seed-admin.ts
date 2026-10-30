import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createDatabase } from './client.js'

const seedSchema = z.object({
  DATABASE_URL: z.string().url(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(200),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(72),
})

const settings = seedSchema.parse(process.env)
const database = createDatabase(settings.DATABASE_URL)

if (!database) throw new Error('DATABASE_URL is required')

try {
  const passwordHash = await bcrypt.hash(settings.BOOTSTRAP_ADMIN_PASSWORD, 12)
  const { rows } = await database.pool.query(
    `INSERT INTO admins (singleton, email, password_hash, full_name)
     VALUES (true, $1, $2, $3)
     ON CONFLICT (singleton) DO NOTHING
     RETURNING id`,
    [settings.BOOTSTRAP_ADMIN_EMAIL, passwordHash, settings.BOOTSTRAP_ADMIN_NAME],
  )
  console.log(rows[0] ? 'Store owner account created.' : 'Store owner account already exists; no changes made.')
} finally {
  await database.pool.end()
}