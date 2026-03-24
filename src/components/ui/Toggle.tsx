import styles from './Toggle.module.scss'

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  return (
    <label className={[styles.toggle, disabled ? styles.disabled : ''].filter(Boolean).join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className={styles.input}
      />
      <span className={styles.track} />
      <span className={styles.label}>{label}</span>
    </label>
  )
}
