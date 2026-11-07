export type AccountType = 'customer' | 'admin'

export interface AuthAccount {
  id: string
  email: string
  passwordHash: string | null
  status: 'active' | 'suspended' | 'deactivated'
  firstName?: string
  lastName?: string
  fullName?: string
}

export interface AuthPrincipal {
  accountType: AccountType
  accountId: string
  sessionId: string
  account: AuthAccount
}

export interface CreateSessionInput {
  accountType: AccountType
  accountId: string
  refreshTokenHash: string
  expiresAt: Date
  deviceId?: string
  ipAddress?: string
  userAgent?: string
}

export type AuthProvider = 'google' | 'apple'
export type PasskeyChallengeType = 'registration' | 'authentication'

export interface VerifiedCustomerIdentity {
  provider: AuthProvider
  subject: string
  email: string
  firstName: string
  lastName: string
}

export interface AdminPasskey {
  id: string
  adminId: string
  credentialId: string
  publicKey: string
  counter: number
  transports: string[]
  deviceType: string
  backedUp: boolean
}

export interface PasskeyChallenge {
  id: string
  adminId: string | null
  challenge: string
}

export interface AuthRepository {
  findAccount(accountType: AccountType, email: string): Promise<AuthAccount | null>
  findAdminById(id: string): Promise<AuthAccount | null>
  createCustomer(input: {
    firstName: string
    lastName: string
    email: string
    phoneNumber?: string
    passwordHash: string | null
  }): Promise<AuthAccount>
  findOrCreateSocialCustomer(input: VerifiedCustomerIdentity): Promise<AuthAccount>
  countAdminPasskeys(): Promise<number>
  listAdminPasskeys(adminId: string): Promise<AdminPasskey[]>
  findAdminPasskey(credentialId: string): Promise<AdminPasskey | null>
  saveAdminPasskey(passkey: Omit<AdminPasskey, 'id'>): Promise<void>
  updateAdminPasskeyCounter(credentialId: string, counter: number, deviceType: string, backedUp: boolean): Promise<void>
  savePasskeyChallenge(adminId: string | null, challenge: string, type: PasskeyChallengeType, expiresAt: Date): Promise<string>
  consumePasskeyChallenge(id: string, type: PasskeyChallengeType): Promise<PasskeyChallenge | null>
  createSession(input: CreateSessionInput): Promise<string>
  rotateSession(accountType: AccountType, currentHash: string, nextHash: string, expiresAt: Date): Promise<AuthPrincipal | null>
  revokeSession(accountType: AccountType, accountId: string, sessionId: string): Promise<void>
  isSessionActive(accountType: AccountType, accountId: string, sessionId: string): Promise<boolean>
}