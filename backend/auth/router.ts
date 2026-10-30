import bcrypt from 'bcryptjs'
import { Router, type Request } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { requireAccount } from './authorization.js'
import { HttpError } from '../http/errors.js'
import { createAccessToken, createRefreshToken, hashRefreshToken, verifyAccessToken } from './tokens.js'
import type { AccountType, AuthAccount, AuthPrincipal, AuthRepository } from './types.js'

const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase())
const passwordSchema = z.string().min(12).max(72).refine((password) => Buffer.byteLength(password) <= 72)
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) })
const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: emailSchema,
  phoneNumber: z.string().trim().min(7).max(32).optional(),
  password: passwordSchema,
})
const refreshSchema = z.object({ refreshToken: z.string().min(32).max(128) })

const invalidPasswordHash = '$2b$12$4G7fI8XpqW8G4HfYq6GqCOW9vVd2HljlrbT4zK09z6IB0h8.eRzBq'

export function createAuthRouter(repository: AuthRepository, accessTokenSecret: string) {
  const router = Router()
  router.use('/customer', createAccountRouter('customer', repository, accessTokenSecret))
  router.use('/admin', createAccountRouter('admin', repository, accessTokenSecret))
  return router
}

function createAccountRouter(accountType: AccountType, repository: AuthRepository, secret: string) {
  const router = Router()
  const authRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false })

  if (accountType === 'customer') {
    router.post('/register', authRateLimit, async (request, response, next) => {
      try {
        const input = registerSchema.parse(request.body)
        const account = await repository.createCustomer({
          ...input,
          passwordHash: await bcrypt.hash(input.password, 12),
        })
        const tokens = await issueTokens(accountType, account, request, repository, secret)
        response.status(201).json({ account: publicAccount(account), ...tokens })
      } catch (error) {
        next(toHttpError(error))
      }
    })
  }

  router.post('/login', authRateLimit, async (request, response, next) => {
    try {
      const input = loginSchema.parse(request.body)
      const account = await repository.findAccount(accountType, input.email)
      const passwordMatches = await bcrypt.compare(input.password, account?.passwordHash ?? invalidPasswordHash)

      if (!account || !passwordMatches || account.status !== 'active') {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
      }

      const tokens = await issueTokens(accountType, account, request, repository, secret)
      response.json({ account: publicAccount(account), ...tokens })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/refresh', async (request, response, next) => {
    try {
      const { refreshToken } = refreshSchema.parse(request.body)
      const nextRefreshToken = createRefreshToken()
      const principal = await repository.rotateSession(
        accountType,
        hashRefreshToken(refreshToken),
        hashRefreshToken(nextRefreshToken),
        refreshExpiry(),
      )

      if (!principal) throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired')

      response.json({
        account: publicAccount(principal.account),
        accessToken: createAccessToken(accountType, principal.accountId, principal.sessionId, secret),
        refreshToken: nextRefreshToken,
        expiresIn: 900,
      })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/logout', requireAccount(accountType, repository, secret), async (_request, response, next) => {
    try {
      const principal = response.locals.auth as AuthPrincipal
      await repository.revokeSession(accountType, principal.accountId, principal.sessionId)
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  return router
}

async function issueTokens(
  accountType: AccountType,
  account: AuthAccount,
  request: Request,
  repository: AuthRepository,
  secret: string,
) {
  const refreshToken = createRefreshToken()
  const sessionId = await repository.createSession({
    accountType,
    accountId: account.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiry(),
    deviceId: request.get('x-device-id')?.slice(0, 255),
    ipAddress: request.ip,
    userAgent: request.get('user-agent')?.slice(0, 1000),
  })

  return {
    accessToken: createAccessToken(accountType, account.id, sessionId, secret),
    refreshToken,
    expiresIn: 900,
  }
}

function publicAccount(account: AuthAccount) {
  const { passwordHash: _passwordHash, ...safeAccount } = account
  return safeAccount
}

function refreshExpiry() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

function toHttpError(error: unknown, fallbackCode = 'REQUEST_FAILED', fallbackMessage = 'The request could not be completed') {
  if (error instanceof HttpError) return error
  if (error instanceof z.ZodError) return new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed')
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    const candidate = error as { statusCode: number; code?: unknown; message?: unknown }
    return new HttpError(candidate.statusCode, typeof candidate.code === 'string' ? candidate.code : fallbackCode, String(candidate.message ?? fallbackMessage))
  }
  return error instanceof Error ? error : new Error(fallbackMessage)
}