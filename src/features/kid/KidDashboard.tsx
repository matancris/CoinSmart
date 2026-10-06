import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWalletStore } from '@/stores'
import { Spinner, EmptyState } from '@/components/ui'
import { NotificationPrompt } from '@/components/notifications'
import { formatCurrency, formatDate, TX_ICONS, POSITIVE_TYPES } from '@/utils'
import styles from './KidDashboard.module.scss'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysUntil(date: Date): number {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((date.getTime() - startOfToday.getTime()) / MS_PER_DAY))
}

export function KidDashboard() {
  const { t } = useTranslation()
  const balance = useWalletStore(s => s.balance)
  const totalSavings = useWalletStore(s => s.totalSavings)
  const transactions = useWalletStore(s => s.transactions)
  const savingsGoals = useWalletStore(s => s.savingsGoals)
  const allowances = useWalletStore(s => s.allowances)
  const isLoading = useWalletStore(s => s.isLoading)

  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions])
  const activeGoalsCount = useMemo(
    () => savingsGoals.filter(g => g.status === 'active').length,
    [savingsGoals]
  )

  // Seeing when the next allowance lands helps kids plan purchases
  const nextAllowance = useMemo(() => {
    const active = allowances.filter(a => a.status === 'active')
    if (active.length === 0) return null
    return active.reduce((soonest, a) => (a.nextDueAt < soonest.nextDueAt ? a : soonest))
  }, [allowances])

  if (isLoading && transactions.length === 0) return <Spinner size="lg" fullPage />

  const nextAllowanceDays = nextAllowance ? daysUntil(nextAllowance.nextDueAt) : 0
  const nextAllowanceWhen = nextAllowanceDays === 0
    ? t('kid.nextAllowanceToday')
    : nextAllowanceDays === 1
      ? t('kid.nextAllowanceTomorrow')
      : t('kid.nextAllowanceIn', { count: nextAllowanceDays })

  return (
    <div className={styles.page}>
      <NotificationPrompt audience="kid" />

      <section className={styles.balanceCard}>
        <span className={styles.balanceLabel}>{t('kid.balance')}</span>
        <span className={styles.balanceAmount}>{formatCurrency(balance)}</span>
        <div className={styles.balanceStats}>
          <Link to="/wallet/savings" className={styles.balanceStat}>
            <span className={styles.statIcon}>🚀</span>
            <span className={styles.statText}>
              <span className={styles.statLabel}>{t('kid.totalSaved')}</span>
              <span className={styles.statValue}>{formatCurrency(totalSavings)}</span>
            </span>
          </Link>
          <Link to="/wallet/savings" className={styles.balanceStat}>
            <span className={styles.statIcon}>🎯</span>
            <span className={styles.statText}>
              <span className={styles.statLabel}>{t('kid.activeGoals')}</span>
              <span className={styles.statValue}>{activeGoalsCount}</span>
            </span>
          </Link>
        </div>
      </section>

      <div className={styles.quickActions}>
        <Link to="/wallet/savings" className={styles.quickAction}>
          <span className={[styles.quickIcon, styles.savingsTone].join(' ')}>🐷</span>
          <span className={styles.quickLabel}>{t('kid.saveMoney')}</span>
        </Link>
        <Link to="/wallet/transfer" className={styles.quickAction}>
          <span className={[styles.quickIcon, styles.transferTone].join(' ')}>💸</span>
          <span className={styles.quickLabel}>{t('kid.sendMoney')}</span>
        </Link>
        <Link to="/wallet/transactions" className={styles.quickAction}>
          <span className={[styles.quickIcon, styles.historyTone].join(' ')}>📋</span>
          <span className={styles.quickLabel}>{t('kid.transactions')}</span>
        </Link>
      </div>

      {nextAllowance && (
        <div className={styles.allowanceCard}>
          <span className={styles.allowanceIcon}>📅</span>
          <div className={styles.allowanceText}>
            <span className={styles.allowanceLabel}>{t('kid.nextAllowance')}</span>
            <span className={styles.allowanceWhen}>
              {nextAllowanceWhen} · {formatDate(nextAllowance.nextDueAt)}
            </span>
          </div>
          <span className={styles.allowanceAmount}>+{formatCurrency(nextAllowance.amount)}</span>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('kid.recentTransactions')}</h2>
          <Link to="/wallet/transactions" className={styles.sectionLink}>{t('kid.seeAll')}</Link>
        </div>

        {recentTx.length > 0 ? (
          <div className={styles.txList}>
            {recentTx.map(tx => {
              const isPositive = POSITIVE_TYPES.includes(tx.type)
              return (
                <div key={tx.id} className={styles.txRow}>
                  <div className={styles.txInfo}>
                    <span className={[styles.txIcon, styles[`txType-${tx.type}`]].join(' ')}>
                      {TX_ICONS[tx.type]}
                    </span>
                    <div className={styles.txDetails}>
                      <span className={styles.txDesc}>
                        {tx.description || t(`transaction.${tx.type}`)}
                      </span>
                      <span className={styles.txDate}>{formatDate(tx.createdAt)}</span>
                    </div>
                  </div>
                  <span className={[styles.txAmount, isPositive ? styles.positive : styles.negative].join(' ')}>
                    {isPositive ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState emoji="📭" title={t('kid.noTransactions')} />
        )}
      </section>
    </div>
  )
}
