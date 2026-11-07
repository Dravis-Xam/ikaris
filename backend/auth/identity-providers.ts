import { OAuth2Client } from 'google-auth-library'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AuthProvider, VerifiedCustomerIdentity } from './types.js'

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

export async function verifyCustomerIdentityToken(
  provider: AuthProvider,
  token: string,
  clientIds: { google?: string; apple?: string },
): Promise<VerifiedCustomerIdentity> {
  if (provider === 'google') {
    if (!clientIds.google) throw new Error('Google sign-in is not configured')
    const client = new OAuth2Client(clientIds.google)
    const ticket = await client.verifyIdToken({ idToken: token, audience: clientIds.google })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new Error('Google did not provide a verified email address')
    }
    return {
      provider,
      subject: payload.sub,
      email: payload.email,
      firstName: payload.given_name ?? 'Google',
      lastName: payload.family_name ?? 'Customer',
    }
  }

  if (!clientIds.apple) throw new Error('Apple sign-in is not configured')
  const { payload } = await jwtVerify(token, appleKeys, {
    issuer: 'https://appleid.apple.com',
    audience: clientIds.apple,
  })
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !isVerified(payload.email_verified)) {
    throw new Error('Apple did not provide a verified email address')
  }
  return {
    provider,
    subject: payload.sub,
    email: payload.email,
    firstName: 'Apple',
    lastName: 'Customer',
  }
}

function isVerified(value: unknown) {
  return value === true || value === 'true'
}
