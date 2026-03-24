import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useWalletStore } from '@/stores'
import { Button, Input, Select, Avatar, EmptyState } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils'
import styles from './KidTransfer.module.scss'

type Mode = 'purchase' | 'savings' | 'sibling'

export function KidTransfer() {
  const { t } = useTranslation()
  const appUser = useAuthStore(s => s.appUser)
  const { balance, savingsGoals, siblings } = useWalletStore(s => s)
  const { createTransaction, transferToSavings, transferToChild, fetchSiblings } = useWalletStore(s => s.actions)

  const [mode, setMode] = useState<Mode>('purchase')
  const [itemName, setItemName] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedGoal, setSelectedGoal] = useState('')
  const [selectedSibling, setSelectedSibling] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeGoals = savingsGoals.filter(g => g.status === 'active')
  const canTransfer = appUser?.canTransferToSiblings !== false

  useEffect(() => {
    if (canTransfer && appUser?.familyId && appUser?.id) {
      fetchSiblings(appUser.familyId, appUser.id)
    }
  }, [appUser?.familyId, appUser?.id, fetchSiblings])

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

  const handleSiblingTransfer = useCallback(async () => {
    if (!appUser?.id || !amount || !selectedSibling) return
    const numAmount = parseFloat(amount)
    if (numAmount <= 0) return
    if (numAmount > balance) {
      toast(t('kid.insufficientBalance'), 'error')
      return
    }

    const sibling = siblings.find(s => s.id === selectedSibling)
    if (!sibling) return

    setSubmitting(true)
    const success = await transferToChild(
      appUser.id,
      appUser.displayName,
      sibling.id,
      sibling.displayName,
      numAmount,
      note.trim() || undefined
    )
    setSubmitting(false)

    if (success) {
      setAmount('')
      setSelectedSibling('')
      setNote('')
    }
  }, [appUser, amount, selectedSibling, siblings, balance, note, transferToChild, t])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('kid.transfer')}</h1>

      <div className={[styles.modeSelector, !canTransfer ? styles.twoColumns : ''].filter(Boolean).join(' ')}>
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
        {canTransfer && (
          <button
            className={[styles.modeBtn, mode === 'sibling' ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => setMode('sibling')}
          >
            <span className={styles.modeIcon}>🤝</span>
            <span className={styles.modeLabel}>{t('kid.sendToSibling')}</span>
          </button>
        )}
      </div>

      <div className={styles.form}>
        <div className={styles.balanceInfo}>
          <span className={styles.balanceLabel}>{t('kid.balance')}</span>
          <span className={styles.balanceValue}>{formatCurrency(balance)}</span>
        </div>

        {mode === 'purchase' && (
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
        )}

        {mode === 'savings' && (
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

        {mode === 'sibling' && (
          <>
            {siblings.length === 0 ? (
              <EmptyState
                emoji="👨‍👩‍👧‍👦"
                title={t('kid.noSiblings')}
              />
            ) : (
              <>
                <label className={styles.siblingLabel}>{t('kid.selectSibling')}</label>
                <div className={styles.siblingList}>
                  {siblings.map(s => (
                    <button
                      key={s.id}
                      className={[styles.siblingCard, selectedSibling === s.id ? styles.active : ''].filter(Boolean).join(' ')}
                      onClick={() => setSelectedSibling(s.id)}
                    >
                      <Avatar emoji={s.avatarEmoji} size="md" />
                      <span className={styles.siblingName}>{s.displayName}</span>
                    </button>
                  ))}
                </div>
                <Input
                  label={t('kid.amount')}
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="0"
                  dir="ltr"
                />
                <Input
                  label={t('kid.description')}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <Button
                  fullWidth
                  onClick={handleSiblingTransfer}
                  disabled={submitting || !selectedSibling || !amount}
                >
                  {submitting ? t('common.loading') : t('kid.sendMoney')}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
