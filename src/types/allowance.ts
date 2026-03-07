export type AllowanceFrequency = 'every_x_days' | 'monthly'
export type AllowanceStatus = 'active' | 'paused'

export interface Allowance {
  id: string
  amount: number
  frequency: AllowanceFrequency
  intervalDays?: number
  dayOfMonth?: number
  description: string
  status: AllowanceStatus
  createdBy: string
  createdAt: Date
  lastExecutedAt: Date | null
  nextDueAt: Date
}
