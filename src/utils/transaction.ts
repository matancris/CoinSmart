import type { TransactionType } from '@/types'

export const TX_ICONS: Record<TransactionType, string> = {
  deposit: '\u{1F4B0}',
  withdrawal: '\u{1F4B8}',
  purchase: '\u{1F6D2}',
  transfer_to_savings: '\u{1F680}',
  transfer_from_savings: '\u{1F519}',
  deposit_to_savings: '\u{1F4B5}',
  interest: '\u2728',
}

export const POSITIVE_TYPES: TransactionType[] = ['deposit', 'transfer_from_savings', 'deposit_to_savings', 'interest']
