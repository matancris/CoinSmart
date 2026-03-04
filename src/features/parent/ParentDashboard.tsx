import { useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useFamilyStore } from '@/stores'
import { Avatar, Spinner, EmptyState, Button } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils'
import styles from './ParentDashboard.module.scss'

export function ParentDashboard() {
  const { t } = useTranslation()
  const family = useAuthStore(s => s.family)
  const children = useFamilyStore(s => s.children)
  const isLoading = useFamilyStore(s => s.isLoading)
  const { fetchChildren } = useFamilyStore(s => s.actions)

  useEffect(() => {
    if (family?.id) fetchChildren(family.id)
  }, [family?.id, fetchChildren])

  const stats = useMemo(() => ({
    totalChildren: children.length,
    totalBalance: children.reduce((sum, c) => sum + c.balance, 0),
    totalSavings: children.reduce((sum, c) => sum + c.totalSavings, 0),
  }), [children])

  const handleShare = useCallback(async () => {
    if (!family?.code) return
    const link = `${window.location.origin}/join/${family.code}`
    if (navigator.share) {
      try {
        await navigator.share({ title: t('app.name'), url: link })
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(link)
      toast(t('parent.linkCopied'), 'success')
    }
  }, [family?.code, t])

  if (isLoading) return <Spinner size="lg" fullPage />

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('parent.dashboard')}</h1>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>👧</span>
          <span className={styles.statLabel}>{t('parent.totalChildren')}</span>
          <span className={styles.statValue}>{stats.totalChildren}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>💰</span>
          <span className={styles.statLabel}>{t('parent.totalBalance')}</span>
          <span className={styles.statValue}>{formatCurrency(stats.totalBalance)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>🚀</span>
          <span className={styles.statLabel}>{t('parent.totalSavings')}</span>
          <span className={styles.statValue}>{formatCurrency(stats.totalSavings)}</span>
        </div>
      </div>

      <div className={styles.familyCodeCard}>
        <div>
          <div className={styles.codeLabel}>{t('parent.familyCode')}</div>
          <div className={styles.codeValue}>{family?.code}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={styles.shareBtn}
          onClick={handleShare}
        >
          {t('parent.shareCode')}
        </Button>
      </div>

      <div className={styles.childrenGrid}>
        {children.map(child => (
          <Link
            key={child.id}
            to={`/manage/children/${child.id}`}
            className={styles.childCard}
          >
            <Avatar emoji={child.avatarEmoji} size="lg" />
            <span className={styles.childName}>{child.displayName}</span>
            <span className={styles.childBalance}>{formatCurrency(child.balance)}</span>
            <span className={styles.childSavings}>
              {t('kid.savings')}: {formatCurrency(child.totalSavings)}
            </span>
          </Link>
        ))}
      </div>

      {children.length === 0 && (
        <EmptyState
          emoji="👶"
          title={t('common.noData')}
          action={
            <Link to="/manage/children">
              <Button>{t('parent.addChild')}</Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
