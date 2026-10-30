import type { RequestHandler } from 'express'
import { HttpError } from '../http/errors.js'
import { verifyAccessToken } from './tokens.js'
import type { AccountType, AuthRepository } from './types.js'

export function requireAccount(accountType: AccountType, repository: AuthRepository, secret: string): RequestHandler {
  return async (request, response, next) => {
    try {
      const authorization = request.get('authorization')
      if (!authorization?.startsWith('Bearer ')) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'A valid access token is required')
      }

      let claims
      try {
        claims = verifyAccessToken(authorization.slice(7), accountType, secret)
      } catch {
        throw new HttpError(401, 'UNAUTHENTICATED', 'A valid access token is required')
      }

      const active = await repository.isSessionActive(accountType, claims.sub, claims.sessionId)
      if (!active) throw new HttpError(401, 'SESSION_REVOKED', 'The session is no longer active')

      response.locals.auth = {
        accountType,
        accountId: claims.sub,
        sessionId: claims.sessionId,
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}