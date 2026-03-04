import { type HTMLAttributes, type ReactNode } from 'react'
import styles from './Card.module.scss'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'flat'
  kid?: boolean
  noHover?: boolean
  header?: ReactNode
  footer?: ReactNode
}

export function Card({
  variant = 'elevated',
  kid = false,
  noHover = false,
  header,
  footer,
  className,
  children,
  ...props
}: CardProps) {
  const cls = [
    styles.card,
    variant === 'flat' ? styles.flat : '',
    kid ? styles.kid : '',
    noHover ? styles.noHover : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} {...props}>
      {header && <div className={styles.header}>{header}</div>}
      {children}
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}
