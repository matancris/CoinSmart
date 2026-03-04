import { type ReactNode } from 'react'
import styles from './EmptyState.module.scss'

interface EmptyStateProps {
  emoji?: string
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ emoji = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emoji}>{emoji}</span>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
