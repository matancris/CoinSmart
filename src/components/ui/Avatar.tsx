import styles from './Avatar.module.scss'

interface AvatarProps {
  emoji: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({ emoji, size = 'md', className }: AvatarProps) {
  return (
    <div className={[styles.avatar, styles[size], className ?? ''].filter(Boolean).join(' ')}>
      {emoji}
    </div>
  )
}
