export type SavingsStatus = 'active' | 'completed' | 'withdrawn'

export type SavingsType = 'flexible' | 'locked_2m' | 'locked_6m'

export interface SavingsGoal {
  id: string
  name: string
  targetAmount?: number
  currentAmount: number
  interestRate: number
  accruedInterest: number
  savingsType: SavingsType
  status: SavingsStatus
  createdAt: Date
  maturityDate?: Date
  lastInterestAt?: Date
}
