export type AccountType = 'customer' | 'admin'

export interface AuthAccount {
  id: string
  email: string
  passwordHash: string
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

export interface AuthRepository {
  findAccount(accountType: AccountType, email: string): Promise<AuthAccount | null>
  createCustomer(input: {
    firstName: string
    lastName: string
    email: string
    phoneNumber?: string
    passwordHash: string
  }): Promise<AuthAccount>
  createSession(input: CreateSessionInput): Promise<string>
  rotateSession(accountType: AccountType, currentHash: string, nextHash: string, expiresAt: Date): Promise<AuthPrincipal | null>
  revokeSession(accountType: AccountType, accountId: string, sessionId: string): Promise<void>
  isSessionActive(accountType: AccountType, accountId: string, sessionId: string): Promise<boolean>
}