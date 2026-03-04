import { useCallback, useSyncExternalStore } from 'react'
import styles from './Toast.module.scss'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
let toasts: ToastItem[] = []
let listeners: Array<() => void> = []

function emitChange() {
  listeners.forEach(l => l())
}

export function toast(message: string, type: ToastType = 'info') {
  const id = ++toastId
  toasts = [...toasts, { id, message, type }]
  emitChange()
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emitChange()
  }, 3500)
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
    <div className={styles.container}>
      {items.map(item => (
        <div key={item.id} className={[styles.toast, styles[item.type]].join(' ')}>
          <span className={styles.message}>{item.message}</span>
          <button className={styles.closeBtn} onClick={() => dismiss(item.id)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
