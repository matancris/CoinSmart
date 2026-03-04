import { type InputHTMLAttributes, forwardRef } from 'react'
import styles from './Input.module.scss'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, className, ...props }, ref) {
    return (
      <div className={styles.wrapper}>
        {label && <label className={styles.label}>{label}</label>}
        <input
          ref={ref}
          className={[
            styles.input,
            error ? styles.error : '',
            className ?? '',
          ].filter(Boolean).join(' ')}
          {...props}
        />
        {error && <span className={styles.errorText}>{error}</span>}
      </div>
    )
  }
)
