import 'dotenv/config'
import process from 'node:process'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: optionalUrl(),
  DATABASE_READ_URL: optionalUrl(),
  REDIS_URL: optionalUrl(),
  CLIENT_ORIGIN: optionalUrl(),
  ACCESS_TOKEN_SECRET: z.string().min(32).optional(),
  REFRESH_TOKEN_SECRET: z.string().min(32).optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: optionalString(),
  APPLE_CLIENT_ID: optionalString(),
  WEBAUTHN_RP_ID: z.string().min(1).optional(),
  WEBAUTHN_ORIGIN: optionalUrl(),
})

const productionEnvironmentSchema = environmentSchema.superRefine((environment, context) => {
  if (environment.NODE_ENV !== 'production') return
  if (!environment.DATABASE_URL) {
    context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' })
  }
  if (!environment.ACCESS_TOKEN_SECRET) {
    context.addIssue({ code: 'custom', path: ['ACCESS_TOKEN_SECRET'], message: 'ACCESS_TOKEN_SECRET is required in production' })
  }
  if (!environment.GOOGLE_CLIENT_ID) {
    context.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'GOOGLE_CLIENT_ID is required in production' })
  }
  if (!environment.APPLE_CLIENT_ID) {
    context.addIssue({ code: 'custom', path: ['APPLE_CLIENT_ID'], message: 'APPLE_CLIENT_ID is required in production' })
  }
  if (!environment.WEBAUTHN_RP_ID) {
    context.addIssue({ code: 'custom', path: ['WEBAUTHN_RP_ID'], message: 'WEBAUTHN_RP_ID is required in production' })
  }
  const webAuthnOrigin = environment.WEBAUTHN_ORIGIN ?? environment.CLIENT_ORIGIN
  if (!webAuthnOrigin || new URL(webAuthnOrigin).protocol !== 'https:') {
    context.addIssue({ code: 'custom', path: ['WEBAUTHN_ORIGIN'], message: 'WEBAUTHN_ORIGIN must be an HTTPS origin in production' })
  } else if (environment.WEBAUTHN_RP_ID) {
    const hostname = new URL(webAuthnOrigin).hostname
    if (hostname !== environment.WEBAUTHN_RP_ID && !hostname.endsWith(`.${environment.WEBAUTHN_RP_ID}`)) {
      context.addIssue({ code: 'custom', path: ['WEBAUTHN_RP_ID'], message: 'WEBAUTHN_RP_ID must match or be a parent of WEBAUTHN_ORIGIN' })
    }
  }
})

function optionalUrl() {
  return z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional())
}

function optionalString() {
  return z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional())
}

export type AppEnvironment = z.infer<typeof environmentSchema>

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  return productionEnvironmentSchema.parse(source)
}