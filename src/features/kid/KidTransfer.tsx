import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useWalletStore } from '@/stores'
import { Button, Input, Select } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils'
import styles from './KidTransfer.module.scss'

type Mode = 'purchase' | 'savings'

export function KidTransfer() {
  const { t } = useTranslation()
  const appUser = useAuthStore(s => s.appUser)
  const { balance, savingsGoals } = useWalletStore(s => s)
  const { createTransaction, transferToSavings } = useWalletStore(s => s.actions)

  const [mode, setMode] = useState<Mode>('purchase')
  const [itemName, setItemName] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedGoal, setSelectedGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeGoals = savingsGoals.filter(g => g.status === 'active')

  const handlePurchase = useCallback(async () => {
    if (!appUser?.id || !amount || !itemName.trim()) return
    const numAmount = parseFloat(amount)
    if (numAmount <= 0) return
    if (numAmount > balance) {
      toast(t('kid.insufficientBalance'), 'error')
      return
    }

    setSubmitting(true)
    const success = await createTransaction(appUser.id, {
      type: 'purchase',
      amount: numAmount,
      description: itemName.trim(),
      itemName: itemName.trim(),
      createdBy: appUser.id,
    })
    setSubmitting(false)

    if (success) {
      toast(t('common.success'), 'success')
      setItemName('')
      setAmount('')
    }
  }, [appUser, amount, itemName, balance, createTransaction, t])

  const handleSavingsTransfer = useCallback(async () => {
    if (!appUser?.id || !amount || !selectedGoal) return
    const numAmount = parseFloat(amount)
    if (numAmount <= 0) return
    if (numAmount > balance) {
      toast(t('kid.insufficientBalance'), 'error')
      return
    }

    setSubmitting(true)
    const success = await transferToSavings(appUser.id, selectedGoal, numAmount, appUser.id)
    setSubmitting(false)

    if (success) {
      setAmount('')
      setSelectedGoal('')
    }
  }, [appUser, amount, selectedGoal, balance, transferToSavings, t])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('kid.transfer')}</h1>

      <div className={styles.modeSelector}>
        <button
          className={[styles.modeBtn, mode === 'purchase' ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => setMode('purchase')}
        >
          <span className={styles.modeIcon}>🛒</span>
          <span className={styles.modeLabel}>{t('kid.buySomething')}</span>
        </button>
        <button
          className={[styles.modeBtn, mode === 'savings' ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => setMode('savings')}
        >
          <span className={styles.modeIcon}>🚀</span>
          <span className={styles.modeLabel}>{t('kid.saveMoney')}</span>
        </button>
      </div>

      <div className={styles.form}>
        <div className={styles.balanceInfo}>
          <span className={styles.balanceLabel}>{t('kid.balance')}</span>
          <span className={styles.balanceValue}>{formatCurrency(balance)}</span>
        </div>

        {mode === 'purchase' ? (
          <>
            <Input
              label={t('kid.itemName')}
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              required
            />
            <Input
              label={t('kid.amount')}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="0"
              dir="ltr"
            />
            <Button
              fullWidth
              onClick={handlePurchase}
              disabled={submitting || !itemName.trim() || !amount}
            >
              {submitting ? t('common.loading') : t('kid.buySomething')}
            </Button>
          </>
        ) : (
          <>
            <Select
              label={t('kid.selectGoal')}
              options={activeGoals.map(g => ({
                value: g.id,
                label: `${g.name} (${formatCurrency(g.currentAmount)})`,
              }))}
              value={selectedGoal}
              onChange={e => setSelectedGoal(e.target.value)}
              placeholder={t('kid.selectGoal')}
            />
            <Input
              label={t('kid.amount')}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="0"
              dir="ltr"
            />
            <Button
              fullWidth
              onClick={handleSavingsTransfer}
              disabled={submitting || !selectedGoal || !amount}
            >
              {submitting ? t('common.loading') : t('kid.transferToSavings')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
