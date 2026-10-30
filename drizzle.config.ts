import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import process from 'node:process'

export default defineConfig({
  dialect: 'postgresql',
  schema: './backend/db/schema/index.ts',
  out: './backend/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://shop:shop@localhost:5432/shoe_shop',
  },
})