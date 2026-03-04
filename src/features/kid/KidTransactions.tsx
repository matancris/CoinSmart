import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useWalletStore } from '@/stores'
import { Button, Spinner, EmptyState } from '@/components/ui'
import { formatCurrency, formatDateTime } from '@/utils'
import type { TransactionType } from '@/types'
import styles from './KidTransactions.module.scss'

const TX_ICONS: Record<TransactionType, string> = {
  deposit: '💰',
  withdrawal: '💸',
  purchase: '🛒',
  transfer_to_savings: '🚀',
  transfer_from_savings: '🔙',
  interest: '✨',
}

const POSITIVE_TYPES: TransactionType[] = ['deposit', 'transfer_from_savings', 'interest']

export function KidTransactions() {
  const { t } = useTranslation()
  const appUser = useAuthStore(s => s.appUser)
  const { transactions, isLoading, hasMore } = useWalletStore(s => s)
  const { fetchTransactions } = useWalletStore(s => s.actions)

  useEffect(() => {
    if (appUser?.id) fetchTransactions(appUser.id)
  }, [appUser?.id, fetchTransactions])

  if (isLoading && transactions.length === 0) return <Spinner size="lg" fullPage />

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('kid.transactions')}</h1>

      {transactions.length > 0 ? (
        <div className={styles.list}>
          {transactions.map(tx => {
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
                    <span className={styles.txMeta}>
                      {formatDateTime(tx.createdAt)} · {t(`transaction.${tx.type}`)}
                    </span>
                  </div>
                </div>
                <div className={styles.txRight}>
                  <span className={[styles.txAmount, isPositive ? styles.positive : styles.negative].join(' ')}>
                    {isPositive ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                  <span className={styles.txBalance}>{formatCurrency(tx.balanceAfter)}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState emoji="📭" title={t('kid.noTransactions')} />
      )}

      {hasMore && (
        <div className={styles.loadMore}>
          <Button
            variant="secondary"
            onClick={() => appUser?.id && fetchTransactions(appUser.id, true)}
            disabled={isLoading}
          >
            {isLoading ? t('common.loading') : t('common.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
