import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useNotificationStore } from '@/stores'
import { Button } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import styles from './NotificationPrompt.module.scss'

interface NotificationPromptProps {
  audience: 'kid' | 'parent'
}

export function NotificationPrompt({ audience }: NotificationPromptProps) {
  const { t } = useTranslation()
  const userId = useAuthStore(s => s.appUser?.id)
  const status = useNotificationStore(s => s.status)
  const promptDismissed = useNotificationStore(s => s.promptDismissed)
  const { enable, dismissPrompt } = useNotificationStore(s => s.actions)
  const [busy, setBusy] = useState(false)

  const handleEnable = useCallback(async () => {
    if (!userId) return
    setBusy(true)
    const result = await enable(userId)
    setBusy(false)
    if (result === 'granted') toast(t('notifications.enabled'), 'success')
    else if (result === 'denied') toast(t('notifications.blocked'), 'warning')
  }, [userId, enable, t])

  if (status !== 'default' || promptDismissed) return null

  return (
    <div className={styles.prompt} role="region" aria-label={t('notifications.enableTitle')}>
      <span className={styles.icon} aria-hidden>🔔</span>
      <div className={styles.text}>
        <span className={styles.title}>{t('notifications.enableTitle')}</span>
        <span className={styles.description}>
          {t(audience === 'kid' ? 'notifications.enableKid' : 'notifications.enableParent')}
        </span>
      </div>
      <div className={styles.actions}>
        <Button size="sm" onClick={handleEnable} disabled={busy}>
          {t('notifications.enable')}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismissPrompt}>
          {t('notifications.later')}
        </Button>
      </div>
    </div>
  )
}
