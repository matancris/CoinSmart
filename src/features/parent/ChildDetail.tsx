import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useWalletStore, useFamilyStore } from '@/stores'
import { Button, Input, Avatar, Spinner, EmptyState, Modal } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { formatCurrency, formatDateTime, formatDate, isGoalLocked, SAVINGS_PLANS, isValidPin, TX_ICONS, POSITIVE_TYPES } from '@/utils'
import type { AppUser, SavingsType } from '@/types'
import styles from './ChildDetail.module.scss'

const PLAN_TYPES: SavingsType[] = ['flexible', 'locked_2m', 'locked_6m']

export function ChildDetail() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appUser = useAuthStore(s => s.appUser)
  const children = useFamilyStore(s => s.children)
  const familyActions = useFamilyStore(s => s.actions)
  const { balance, transactions, savingsGoals, isLoading, hasMore } = useWalletStore(s => s)
  const walletActions = useWalletStore(s => s.actions)

  const [child, setChild] = useState<AppUser | null>(null)
  const [actionType, setActionType] = useState<'deposit' | 'withdrawal' | 'purchase'>('deposit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [itemName, setItemName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [showNewGoal, setShowNewGoal] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [hasTarget, setHasTarget] = useState(false)
  const [targetAmount, setTargetAmount] = useState('')
  const [savingsType, setSavingsType] = useState<SavingsType>('flexible')

  const [showTransfer, setShowTransfer] = useState<string | null>(null)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferMode, setTransferMode] = useState<'in' | 'out' | 'direct'>('in')

  const [showSetBalance, setShowSetBalance] = useState(false)
  const [newBalance, setNewBalance] = useState('')

  const [showPinModal, setShowPinModal] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pinError, setPinError] = useState('')

  useEffect(() => {
    const found = children.find(c => c.id === id)
    if (found) {
      setChild(found)
      walletActions.fetchWallet(found.id)
    }
  }, [id, children, walletActions])

  const activeGoals = useMemo(
    () => savingsGoals.filter(g => g.status === 'active'),
    [savingsGoals]
  )

  const handleTransaction = useCallback(async () => {
    if (!child || !appUser || !amount) return
    const numAmount = parseFloat(amount)
    if (numAmount <= 0) return

    setSubmitting(true)
    const success = await walletActions.createTransaction(child.id, {
      type: actionType,
      amount: numAmount,
      description: description || t(`transaction.${actionType}`),
      createdBy: appUser.id,
      ...(actionType === 'purchase' && itemName ? { itemName } : {}),
    })
    setSubmitting(false)

    if (success) {
      setAmount('')
      setDescription('')
      setItemName('')
      toast(t('common.success'), 'success')
    }
  }, [child, appUser, amount, description, itemName, actionType, walletActions, t])

  const handleDeleteTx = useCallback(async (txId: string) => {
    if (!child || !confirm(t('parent.confirmDelete'))) return
    await walletActions.deleteTransaction(child.id, txId)
  }, [child, walletActions, t])

  const handleCreateGoal = useCallback(async () => {
    if (!child || !goalName.trim()) return
    setSubmitting(true)
    const success = await walletActions.createSavingsGoal(child.id, {
      name: goalName.trim(),
      targetAmount: hasTarget && targetAmount ? parseFloat(targetAmount) : undefined,
      savingsType,
    })
    setSubmitting(false)
    if (success) {
      setShowNewGoal(false)
      setGoalName('')
      setHasTarget(false)
      setTargetAmount('')
      setSavingsType('flexible')
    }
  }, [child, goalName, hasTarget, targetAmount, savingsType, walletActions])

  const handleTransfer = useCallback(async () => {
    if (!child || !appUser || !showTransfer || !transferAmount) return
    const numAmount = parseFloat(transferAmount)
    if (numAmount <= 0) return

    setSubmitting(true)
    const fn = transferMode === 'direct'
      ? walletActions.depositToSavings
      : transferMode === 'in'
        ? walletActions.transferToSavings
        : (userId: string, savingsId: string, amt: number, createdBy: string) =>
            walletActions.withdrawFromSavings(userId, savingsId, amt, createdBy, true)
    const success = await fn(child.id, showTransfer, numAmount, appUser.id)
    setSubmitting(false)

    if (success) {
      setShowTransfer(null)
      setTransferAmount('')
    }
  }, [child, appUser, showTransfer, transferAmount, transferMode, walletActions])

  const handleSetBalance = useCallback(async () => {
    if (!child) return
    const num = parseFloat(newBalance)
    if (isNaN(num) || num < 0) return

    setSubmitting(true)
    const success = await walletActions.setBalance(child.id, num)
    setSubmitting(false)

    if (success) {
      setShowSetBalance(false)
    }
  }, [child, newBalance, walletActions])

  const handleResetPin = useCallback(async () => {
    if (!child) return
    if (!isValidPin(newPin)) {
      setPinError(t('errors.invalidPin'))
      return
    }

    setSubmitting(true)
    const success = await familyActions.updateChild(child.id, { pin: newPin })
    setSubmitting(false)

    if (success) {
      setShowPinModal(false)
      setNewPin('')
      setPinError('')
      toast(t('parent.pinResetSuccess'), 'success')
    }
  }, [child, newPin, familyActions, t])

  const handleDeleteGoal = useCallback(async (goalId: string) => {
    if (!child || !confirm(t('common.confirmDelete'))) return
    await walletActions.deleteSavingsGoal(child.id, goalId, true)
  }, [child, walletActions, t])

  if (!child || isLoading) return <Spinner size="lg" fullPage />

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>
        ← {t('common.back')}
      </button>

      <div className={styles.profileCard}>
        <div className={styles.profileHeader}>
          <Avatar emoji={child.avatarEmoji} size="xl" />
          <div className={styles.profileInfo}>
            <h1 className={styles.profileName}>{child.displayName}</h1>
            <span className={styles.profileBalance}>{formatCurrency(balance)}</span>
            <span className={styles.profileSavings}>
              {t('kid.savings')}: {formatCurrency(child.totalSavings)}
            </span>
          </div>
        </div>
        <div className={styles.profileActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setNewBalance(String(balance)); setShowSetBalance(true) }}
          >
            {t('parent.setBalance')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setNewPin(''); setPinError(''); setShowPinModal(true) }}
          >
            {t('parent.resetPin')}
          </Button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t('parent.deposit')} / {t('parent.withdrawal')} / {t('parent.purchase')}
        </h2>
        <div className={styles.actionForm}>
          <div className={styles.formRow}>
            <Button
              variant={actionType === 'deposit' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActionType('deposit')}
            >
              {t('parent.deposit')}
            </Button>
            <Button
              variant={actionType === 'withdrawal' ? 'danger' : 'secondary'}
              size="sm"
              onClick={() => setActionType('withdrawal')}
            >
              {t('parent.withdrawal')}
            </Button>
            <Button
              variant={actionType === 'purchase' ? 'danger' : 'secondary'}
              size="sm"
              onClick={() => setActionType('purchase')}
            >
              {t('parent.purchase')}
            </Button>
          </div>
          <div className={styles.formRow}>
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
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          {actionType === 'purchase' && (
            <div className={styles.formRow}>
              <Input
                label={t('kid.itemName')}
                value={itemName}
                onChange={e => setItemName(e.target.value)}
              />
            </div>
          )}
          <div className={styles.formActions}>
            <Button onClick={handleTransaction} disabled={submitting || !amount}>
              {submitting ? t('common.loading') : t('common.confirm')}
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.savingsHeader}>
          <h2 className={styles.sectionTitle}>{t('parent.savingsOverview')}</h2>
          <Button size="sm" onClick={() => setShowNewGoal(true)}>
            {t('parent.newGoal')}
          </Button>
        </div>

        {activeGoals.length > 0 ? (
          <div className={styles.goalsList}>
            {activeGoals.map(goal => {
              const progress = goal.targetAmount
                ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                : 0
              const locked = isGoalLocked(goal)

              return (
                <div key={goal.id} className={styles.goalCard}>
                  <div className={styles.goalHeader}>
                    <span className={styles.goalName}>🚀 {goal.name}</span>
                    <span className={styles.goalAmount}>{formatCurrency(goal.currentAmount)}</span>
                  </div>
                  {(goal.interestRate > 0 || locked || goal.accruedInterest > 0) && (
                    <div className={styles.goalInterestInfo}>
                      {goal.interestRate > 0 && (
                        <span className={styles.interestBadge}>
                          ✨ {Math.round(goal.interestRate * 100)}% {t('savings.annualRate')}
                        </span>
                      )}
                      {locked && goal.maturityDate && (
                        <span className={styles.lockBadge}>
                          🔒 {t('savings.unlocksOn', { date: formatDate(goal.maturityDate) })}
                        </span>
                      )}
                      {goal.accruedInterest > 0 && (
                        <span className={styles.interestEarned}>
                          {t('savings.interestEarned')}: {formatCurrency(goal.accruedInterest)}
                        </span>
                      )}
                    </div>
                  )}
                  {goal.targetAmount && (
                    <>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className={styles.goalMeta}>
                        <span className={styles.goalTarget}>
                          {t('kid.targetAmount')}: {formatCurrency(goal.targetAmount)}
                        </span>
                        <span className={styles.goalPercent}>{Math.round(progress)}%</span>
                      </div>
                    </>
                  )}
                  <div className={styles.goalActions}>
                    <Button
                      size="sm"
                      onClick={() => { setShowTransfer(goal.id); setTransferMode('in') }}
                    >
                      {t('parent.transferToSavings')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setShowTransfer(goal.id); setTransferMode('direct') }}
                    >
                      {t('parent.depositToSavings')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setShowTransfer(goal.id); setTransferMode('out') }}
                    >
                      {t('parent.withdrawFromSavings')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteGoal(goal.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            emoji="🚀"
            title={t('kid.noSavings')}
            action={<Button onClick={() => setShowNewGoal(true)}>{t('parent.newGoal')}</Button>}
          />
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('parent.transactionHistory')}</h2>
        <div className={styles.transactionList}>
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
                    <span className={styles.txDate}>{formatDateTime(tx.createdAt)}</span>
                  </div>
                </div>
                <span className={[styles.txAmount, isPositive ? styles.positive : styles.negative].join(' ')}>
                  {isPositive ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
                <div className={styles.txActions}>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteTx(tx.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        {transactions.length === 0 && (
          <EmptyState emoji="📭" title={t('kid.noTransactions')} />
        )}

        {hasMore && (
          <Button
            variant="ghost"
            onClick={() => child && walletActions.fetchTransactions(child.id, true)}
          >
            {t('common.loadMore')}
          </Button>
        )}
      </div>

      <Modal
        isOpen={showNewGoal}
        onClose={() => setShowNewGoal(false)}
        title={t('parent.newGoal')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNewGoal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateGoal} disabled={submitting || !goalName.trim()}>
              {submitting ? t('common.loading') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className={styles.newGoalForm}>
          <Input
            label={t('kid.goalName')}
            value={goalName}
            onChange={e => setGoalName(e.target.value)}
            required
          />
          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>{t('savings.setTarget')}</span>
            <button
              type="button"
              className={`${styles.toggle} ${hasTarget ? styles.toggleActive : ''}`}
              onClick={() => { setHasTarget(prev => !prev); if (hasTarget) setTargetAmount('') }}
              aria-pressed={hasTarget}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          {hasTarget && (
            <Input
              label={`${t('kid.targetAmount')} (${t('common.currency')})`}
              type="number"
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              min="0"
              dir="ltr"
            />
          )}
          <div className={styles.planSelector}>
            <label className={styles.planLabel}>{t('savings.choosePlan')}</label>
            {PLAN_TYPES.map(type => {
              const plan = SAVINGS_PLANS[type]
              const selected = savingsType === type
              return (
                <button
                  key={type}
                  type="button"
                  className={`${styles.planOption} ${selected ? styles.planOptionSelected : ''}`}
                  onClick={() => setSavingsType(type)}
                >
                  <span className={styles.planName}>{t(`savings.plan.${type}`)}</span>
                  <span className={styles.planDetails}>
                    {Math.round(plan.annualRate * 100)}% {t('savings.annualRate')}
                    {' · '}
                    {plan.lockMonths > 0
                      ? t('savings.lockedFor', { months: plan.lockMonths })
                      : t('savings.noLock')
                    }
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!showTransfer}
        onClose={() => setShowTransfer(null)}
        title={transferMode === 'direct' ? t('parent.depositToSavings') : transferMode === 'in' ? t('parent.transferToSavings') : t('parent.withdrawFromSavings')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowTransfer(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleTransfer} disabled={submitting || !transferAmount}>
              {submitting ? t('common.loading') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <Input
          label={t('kid.amount')}
          type="number"
          value={transferAmount}
          onChange={e => setTransferAmount(e.target.value)}
          min="0"
          dir="ltr"
        />
      </Modal>

      <Modal
        isOpen={showSetBalance}
        onClose={() => setShowSetBalance(false)}
        title={t('parent.setBalance')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowSetBalance(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSetBalance} disabled={submitting || newBalance === ''}>
              {submitting ? t('common.loading') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <Input
          label={`${t('kid.balance')} (${t('common.currency')})`}
          type="number"
          value={newBalance}
          onChange={e => setNewBalance(e.target.value)}
          min="0"
          dir="ltr"
        />
      </Modal>

      <Modal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        title={t('parent.resetPin')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPinModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleResetPin} disabled={submitting || !newPin}>
              {submitting ? t('common.loading') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <Input
          label={t('parent.newPin')}
          type="tel"
          inputMode="numeric"
          maxLength={4}
          value={newPin}
          onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
          error={pinError}
          dir="ltr"
        />
      </Modal>
    </div>
  )
}
