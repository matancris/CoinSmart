import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useWalletStore } from '@/stores'
import { Spinner, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils'
import type { TransactionType } from '@/types'
import styles from './KidDashboard.module.scss'

const TX_ICONS: Record<TransactionType, string> = {
  deposit: '💰',
  withdrawal: '💸',
  purchase: '🛒',
  transfer_to_savings: '�',
  transfer_from_savings: '🔙',
  deposit_to_savings: '💵',
  interest: '✨',
}

const POSITIVE_TYPES: TransactionType[] = ['deposit', 'transfer_from_savings', 'deposit_to_savings', 'interest']

export function KidDashboard() {
  const { t } = useTranslation()
  const appUser = useAuthStore(s => s.appUser)
  const { balance, totalSavings, transactions, savingsGoals, isLoading } = useWalletStore(s => s)
  const { fetchWallet } = useWalletStore(s => s.actions)

  useEffect(() => {
    if (appUser?.id) fetchWallet(appUser.id)
  }, [appUser?.id, fetchWallet])

  if (isLoading) return <Spinner size="lg" fullPage />

  const recentTx = transactions.slice(0, 5)
  const activeGoals = savingsGoals.filter(g => g.status === 'active')

  return (
    <div className={styles.page}>
      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>{t('kid.balance')}</span>
        <span className={styles.balanceAmount}>{formatCurrency(balance)}</span>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('kid.savingsSummary')}</h2>
          <Link to="/wallet/savings" className={styles.sectionLink}>{t('common.edit')}</Link>
        </div>
        <div className={styles.savingsBar}>
          <span className={styles.savingsIcon}>�</span>
          <div className={styles.savingsInfo}>
            <span className={styles.savingsLabel}>{t('kid.totalSaved')}</span>
            <span className={styles.savingsAmount}>{formatCurrency(totalSavings)}</span>
          </div>
          <span className={styles.goalsCount}>
            {activeGoals.length} {t('kid.activeGoals')}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('kid.recentTransactions')}</h2>
          <Link to="/wallet/transactions" className={styles.sectionLink}>{t('common.loadMore')}</Link>
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
      </div>
    </div>
  )
}
