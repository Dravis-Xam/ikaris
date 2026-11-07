import bcrypt from 'bcryptjs'
import { Router, type Request } from 'express'
import rateLimit from 'express-rate-limit'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server'
import { z } from 'zod'
import { requireAccount } from './authorization.js'
import { verifyCustomerIdentityToken } from './identity-providers.js'
import { HttpError } from '../http/errors.js'
import { createAccessToken, createRefreshToken, hashRefreshToken, verifyAccessToken } from './tokens.js'
import type { AccountType, AuthAccount, AuthPrincipal, AuthRepository, AuthProvider } from './types.js'

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
const tokenSchema = z.object({ credential: z.string().min(16).max(8192) })
const setupSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) })
const ceremonySchema = z.object({ challengeId: z.string().uuid(), response: z.record(z.string(), z.unknown()) })

const invalidPasswordHash = '$2b$12$4G7fI8XpqW8G4HfYq6GqCOW9vVd2HljlrbT4zK09z6IB0h8.eRzBq'

export interface AuthRouterSettings {
  googleClientId?: string
  appleClientId?: string
  webAuthnRpId: string
  webAuthnOrigin: string
}

export function createAuthRouter(repository: AuthRepository, accessTokenSecret: string, settings: AuthRouterSettings) {
  const router = Router()
  router.use('/customer', createAccountRouter('customer', repository, accessTokenSecret, settings))
  router.use('/admin', createAdminPasskeyRouter(repository, accessTokenSecret, settings))
  return router
}

function createAccountRouter(accountType: 'customer', repository: AuthRepository, secret: string, settings: AuthRouterSettings) {
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

      if (!account || !account.passwordHash || !passwordMatches || account.status !== 'active') {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
      }

      const tokens = await issueTokens(accountType, account, request, repository, secret)
      response.json({ account: publicAccount(account), ...tokens })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  for (const provider of ['google', 'apple'] as const) {
    router.post(`/${provider}`, authRateLimit, async (request, response, next) => {
      try {
        const { credential } = tokenSchema.parse(request.body)
        const configuredClientId = provider === 'google' ? settings.googleClientId : settings.appleClientId
        if (!configuredClientId) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED', `${provider} sign-in is not configured`)

        let identity
        try {
          identity = await verifyCustomerIdentityToken(provider, credential, {
            google: settings.googleClientId,
            apple: settings.appleClientId,
          })
        } catch {
          throw new HttpError(401, 'INVALID_IDENTITY_TOKEN', `${provider} identity could not be verified`)
        }
        const account = await repository.findOrCreateSocialCustomer(identity)
        if (account.status !== 'active') throw new HttpError(403, 'ACCOUNT_UNAVAILABLE', 'This account is unavailable')
        const tokens = await issueTokens(accountType, account, request, repository, secret)
        response.json({ account: publicAccount(account), ...tokens })
      } catch (error) {
        next(toHttpError(error))
      }
    })
  }

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

function createAdminPasskeyRouter(repository: AuthRepository, secret: string, settings: AuthRouterSettings) {
  const router = Router()
  const authRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false })

  router.get('/passkey/status', async (_request, response, next) => {
    try {
      response.json({ setupRequired: await repository.countAdminPasskeys() === 0 })
    } catch (error) {
      next(error)
    }
  })

  router.post('/passkey/setup/options', authRateLimit, async (request, response, next) => {
    try {
      const { email, password } = setupSchema.parse(request.body)
      if (await repository.countAdminPasskeys() > 0) {
        throw new HttpError(409, 'PASSKEY_ALREADY_ENROLLED', 'Owner passkey setup has already been completed')
      }
      const account = await repository.findAccount('admin', email)
      const passwordMatches = await bcrypt.compare(password, account?.passwordHash ?? invalidPasswordHash)
      if (!account || !passwordMatches || account.status !== 'active') {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Owner email or setup password is incorrect')
      }

      const options = await generateRegistrationOptions({
        rpName: 'A Sole Vennetta',
        rpID: settings.webAuthnRpId,
        userID: Buffer.from(account.id),
        userName: account.email,
        userDisplayName: account.fullName ?? account.email,
        timeout: 60_000,
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      })
      const challengeId = await repository.savePasskeyChallenge(account.id, options.challenge, 'registration', new Date(Date.now() + 5 * 60_000))
      response.json({ challengeId, options })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/passkey/setup/verify', authRateLimit, async (request, response, next) => {
    try {
      const { challengeId, response: credentialResponse } = ceremonySchema.parse(request.body)
      const challenge = await repository.consumePasskeyChallenge(challengeId, 'registration')
      if (!challenge?.adminId) throw new HttpError(400, 'INVALID_PASSKEY_CHALLENGE', 'Passkey setup challenge is invalid or expired')
      if (await repository.countAdminPasskeys() > 0) throw new HttpError(409, 'PASSKEY_ALREADY_ENROLLED', 'Owner passkey setup has already been completed')

      let verification
      try {
        verification = await verifyRegistrationResponse({
          response: credentialResponse as unknown as RegistrationResponseJSON,
          expectedChallenge: challenge.challenge,
          expectedOrigin: settings.webAuthnOrigin,
          expectedRPID: settings.webAuthnRpId,
          requireUserVerification: true,
        })
      } catch {
        throw new HttpError(401, 'PASSKEY_VERIFICATION_FAILED', 'Passkey could not be verified')
      }
      if (!verification.verified || !verification.registrationInfo) {
        throw new HttpError(401, 'PASSKEY_VERIFICATION_FAILED', 'Passkey could not be verified')
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
      await repository.saveAdminPasskey({
        adminId: challenge.adminId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      })
      const account = await repository.findAdminById(challenge.adminId)
      if (!account || account.status !== 'active') throw new HttpError(403, 'ACCOUNT_UNAVAILABLE', 'Owner account is unavailable')
      const tokens = await issueTokens('admin', account, request, repository, secret)
      response.status(201).json({ account: publicAccount(account), ...tokens })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/passkey/login/options', authRateLimit, async (_request, response, next) => {
    try {
      if (await repository.countAdminPasskeys() === 0) {
        throw new HttpError(409, 'PASSKEY_SETUP_REQUIRED', 'Set up the owner passkey before signing in')
      }
      const options = await generateAuthenticationOptions({
        rpID: settings.webAuthnRpId,
        timeout: 60_000,
        userVerification: 'required',
      })
      const challengeId = await repository.savePasskeyChallenge(null, options.challenge, 'authentication', new Date(Date.now() + 5 * 60_000))
      response.json({ challengeId, options })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/passkey/login/verify', authRateLimit, async (request, response, next) => {
    try {
      const { challengeId, response: credentialResponse } = ceremonySchema.parse(request.body)
      const challenge = await repository.consumePasskeyChallenge(challengeId, 'authentication')
      if (!challenge) throw new HttpError(400, 'INVALID_PASSKEY_CHALLENGE', 'Passkey sign-in challenge is invalid or expired')
      const credentialId = typeof credentialResponse.id === 'string' ? credentialResponse.id : ''
      const savedCredential = await repository.findAdminPasskey(credentialId)
      if (!savedCredential) throw new HttpError(401, 'INVALID_PASSKEY', 'Passkey is not recognized')

      let verification
      try {
        verification = await verifyAuthenticationResponse({
          response: credentialResponse as unknown as AuthenticationResponseJSON,
          expectedChallenge: challenge.challenge,
          expectedOrigin: settings.webAuthnOrigin,
          expectedRPID: settings.webAuthnRpId,
          credential: {
            id: savedCredential.credentialId,
            publicKey: Buffer.from(savedCredential.publicKey, 'base64url'),
            counter: savedCredential.counter,
            transports: savedCredential.transports as AuthenticatorTransport[],
          } as WebAuthnCredential,
          requireUserVerification: true,
        })
      } catch {
        throw new HttpError(401, 'PASSKEY_VERIFICATION_FAILED', 'Passkey could not be verified')
      }
      if (!verification.verified) throw new HttpError(401, 'PASSKEY_VERIFICATION_FAILED', 'Passkey could not be verified')

      const { newCounter, credentialDeviceType, credentialBackedUp } = verification.authenticationInfo
      await repository.updateAdminPasskeyCounter(savedCredential.credentialId, newCounter, credentialDeviceType, credentialBackedUp)
      const account = await repository.findAdminById(savedCredential.adminId)
      if (!account || account.status !== 'active') throw new HttpError(403, 'ACCOUNT_UNAVAILABLE', 'Owner account is unavailable')
      const tokens = await issueTokens('admin', account, request, repository, secret)
      response.json({ account: publicAccount(account), ...tokens })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/refresh', async (request, response, next) => {
    try {
      const { refreshToken } = refreshSchema.parse(request.body)
      const nextRefreshToken = createRefreshToken()
      const principal = await repository.rotateSession('admin', hashRefreshToken(refreshToken), hashRefreshToken(nextRefreshToken), refreshExpiry())
      if (!principal) throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired')
      response.json({
        account: publicAccount(principal.account),
        accessToken: createAccessToken('admin', principal.accountId, principal.sessionId, secret),
        refreshToken: nextRefreshToken,
        expiresIn: 900,
      })
    } catch (error) {
      next(toHttpError(error))
    }
  })

  router.post('/logout', requireAccount('admin', repository, secret), async (_request, response, next) => {
    try {
      const principal = response.locals.auth as AuthPrincipal
      await repository.revokeSession('admin', principal.accountId, principal.sessionId)
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