import { createHash, randomBytes } from 'node:crypto'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import type { AccountType } from './types.js'

export interface AccessClaims extends JwtPayload {
  sub: string
  accountType: AccountType
  sessionId: string
}

export function createRefreshToken() {
  return randomBytes(48).toString('base64url')
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createAccessToken(accountType: AccountType, accountId: string, sessionId: string, secret: string) {
  return jwt.sign({ accountType, sessionId }, secret, {
    subject: accountId,
    audience: accountType,
    issuer: 'diana-phone-shop',
    expiresIn: '15m',
  })
}

export function verifyAccessToken(token: string, accountType: AccountType, secret: string): AccessClaims {
  const claims = jwt.verify(token, secret, {
    audience: accountType,
    issuer: 'diana-phone-shop',
  })

  if (
    typeof claims === 'string'
    || claims.accountType !== accountType
    || typeof claims.sub !== 'string'
    || typeof claims.sessionId !== 'string'
  ) {
    throw new Error('Invalid access token')
  }

  return claims as AccessClaims
}