export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'purchase'
  | 'transfer_to_savings'
  | 'transfer_from_savings'
  | 'interest'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  balanceAfter: number
  description: string
  itemName?: string
  createdAt: Date
  createdBy: string
  editedAt?: Date
  editedBy?: string
  note?: string
  savingsId?: string
}
