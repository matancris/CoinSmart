import styles from './Spinner.module.scss'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
}

export function Spinner({ size = 'md', fullPage = false }: SpinnerProps) {
  const spinner = <div className={[styles.spinner, styles[size]].join(' ')} />

  if (fullPage) {
    return <div className={styles.container}>{spinner}</div>
  }

  return spinner
}
