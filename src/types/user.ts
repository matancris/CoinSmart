export type UserRole = 'parent' | 'child'

export interface AppUser {
  id: string
  familyId: string
  role: UserRole
  displayName: string
  avatarEmoji: string
  email?: string
  balance: number
  totalSavings: number
  isActive: boolean
  createdAt: Date
}
