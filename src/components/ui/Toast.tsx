import { useCallback, useSyncExternalStore } from 'react'
import styles from './Toast.module.scss'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  title?: string
  type: ToastType
}

interface ToastOptions {
  title?: string
  durationMs?: number
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: '🔔',
  warning: '⚠',
}

let toastId = 0
let toasts: ToastItem[] = []
let listeners: Array<() => void> = []

function emitChange() {
  listeners.forEach(l => l())
}

export function toast(message: string, type: ToastType = 'info', { title, durationMs }: ToastOptions = {}) {
  if (!message.trim() && !title?.trim()) return
  const id = ++toastId
  toasts = [...toasts, { id, message, title, type }]
  emitChange()
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emitChange()
  }, durationMs ?? (title ? 6000 : 3500))
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function getSnapshot() {
  return toasts
}

export function ToastContainer() {
  const items = useSyncExternalStore(subscribe, getSnapshot)

  const dismiss = useCallback((id: number) => {
    toasts = toasts.filter(t => t.id !== id)
    emitChange()
  }, [])

  if (items.length === 0) return null

  return (
    <div className={styles.container} role="status" aria-live="polite">
      {items.map(item => (
        <div key={item.id} className={[styles.toast, styles[item.type]].join(' ')}>
          <span className={styles.icon} aria-hidden>{TOAST_ICONS[item.type]}</span>
          <div className={styles.content}>
            {item.title && <span className={styles.title}>{item.title}</span>}
            <span className={styles.message}>{item.message}</span>
          </div>
          <button className={styles.closeBtn} onClick={() => dismiss(item.id)} aria-label="close">
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
