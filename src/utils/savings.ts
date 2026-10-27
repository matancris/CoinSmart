import type { SavingsType } from '@/types'

export const SAVINGS_PLANS: Record<SavingsType, { annualRate: number; lockMonths: number }> = {
  flexible:  { annualRate: 0.03, lockMonths: 0 },
  locked_2m: { annualRate: 0.06, lockMonths: 2 },
  locked_6m: { annualRate: 0.12, lockMonths: 6 },
}

export function isGoalLocked(goal: { maturityDate?: Date }): boolean {
  if (!goal.maturityDate) return false
  return new Date() < goal.maturityDate
}

// The server may not have settled the goal yet, so a passed maturityDate also counts
export function isGoalMatured(goal: { maturityDate?: Date; maturedAt?: Date }): boolean {
  if (goal.maturedAt) return true
  return !!goal.maturityDate && goal.maturityDate <= new Date()
}
