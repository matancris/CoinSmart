import type { TransactionType } from '@/types'
import styles from './Badge.module.scss'

interface BadgeProps {
  label: string
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'accent'
  transactionType?: TransactionType
}

export function Badge({ label, color, transactionType }: BadgeProps) {
  const cls = [
    styles.badge,
    color ? styles[color] : '',
    transactionType ? styles[`tx-${transactionType}`] : '',
  ].filter(Boolean).join(' ')

  return <span className={cls}>{label}</span>
}
