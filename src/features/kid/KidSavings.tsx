import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useWalletStore } from '@/stores'
import { Button, Modal, Input, Spinner, EmptyState } from '@/components/ui'
import { formatCurrency, formatDate, isGoalLocked, isGoalMatured, SAVINGS_PLANS } from '@/utils'
import type { SavingsGoal, SavingsType } from '@/types'
import styles from './KidSavings.module.scss'

const PLAN_TYPES: SavingsType[] = ['flexible', 'locked_2m', 'locked_6m']

export function KidSavings() {
  const { t } = useTranslation()
  const appUser = useAuthStore(s => s.appUser)
  const { savingsGoals, isLoading } = useWalletStore(s => s)
  const { fetchSavings, createSavingsGoal, transferToSavings, withdrawFromSavings, deleteSavingsGoal, renewSavingsGoal } = useWalletStore(s => s.actions)

  const [showNewGoal, setShowNewGoal] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [hasTarget, setHasTarget] = useState(false)
  const [targetAmount, setTargetAmount] = useState('')
  const [savingsType, setSavingsType] = useState<SavingsType>('flexible')
  const [showTransfer, setShowTransfer] = useState<string | null>(null)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferMode, setTransferMode] = useState<'in' | 'out'>('in')
  const [renewGoal, setRenewGoal] = useState<SavingsGoal | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (appUser?.id) fetchSavings(appUser.id)
  }, [appUser?.id, fetchSavings])

  const activeGoals = useMemo(
    () => savingsGoals.filter(g => g.status === 'active'),
    [savingsGoals]
  )

  const handleCreateGoal = useCallback(async () => {
    if (!appUser?.id || !goalName.trim()) return
    setSubmitting(true)
    const parsedTarget = parseFloat(targetAmount)
    const success = await createSavingsGoal(appUser.id, {
      name: goalName.trim(),
      targetAmount: hasTarget && parsedTarget > 0 ? parsedTarget : undefined,
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
  }, [appUser?.id, goalName, hasTarget, targetAmount, savingsType, createSavingsGoal])

  const handleTransfer = useCallback(async () => {
    if (!appUser?.id || !showTransfer || !transferAmount) return
    const amount = parseFloat(transferAmount)
    if (amount <= 0) return

    setSubmitting(true)
    const fn = transferMode === 'in' ? transferToSavings : withdrawFromSavings
    const success = await fn(appUser.id, showTransfer, amount)
    setSubmitting(false)

    if (success) {
      setShowTransfer(null)
      setTransferAmount('')
    }
  }, [appUser?.id, showTransfer, transferAmount, transferMode, transferToSavings, withdrawFromSavings])

  const handleDeleteGoal = useCallback(async (goalId: string) => {
    if (!appUser?.id || !confirm(t('common.confirmDelete'))) return
    await deleteSavingsGoal(appUser.id, goalId)
  }, [appUser?.id, deleteSavingsGoal, t])

  const handleRenew = useCallback(async () => {
    if (!appUser?.id || !renewGoal) return
    setSubmitting(true)
    const success = await renewSavingsGoal(appUser.id, renewGoal.id)
    setSubmitting(false)
    if (success) setRenewGoal(null)
  }, [appUser?.id, renewGoal, renewSavingsGoal])

  if (isLoading && savingsGoals.length === 0) return <Spinner size="lg" fullPage />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('kid.savings')}</h1>
        <Button size="sm" onClick={() => setShowNewGoal(true)}>{t('kid.newGoal')}</Button>
      </div>

      {activeGoals.length > 0 ? (
        <div className={styles.goalsList}>
          {activeGoals.map(goal => {
            const progress = goal.targetAmount
              ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
              : 0
            const locked = isGoalLocked(goal)
            const matured = isGoalMatured(goal)
            const renewPlan = matured ? SAVINGS_PLANS[goal.savingsType] : null
            // A matured goal earns the flexible rate even before the server has settled it
            const interestRate = matured ? SAVINGS_PLANS.flexible.annualRate : goal.interestRate

            return (
              <div key={goal.id} className={styles.goalCard}>
                <div className={styles.goalHeader}>
                  <span className={styles.goalName}>🚀 {goal.name}</span>
                  <span className={styles.goalAmount}>{formatCurrency(goal.currentAmount)}</span>
                </div>
                {(interestRate > 0 || locked || matured || goal.accruedInterest > 0) && (
                  <div className={styles.goalInterestInfo}>
                    {interestRate > 0 && (
                      <span className={styles.interestBadge}>
                        ✨ {Math.round(interestRate * 100)}% {t('savings.annualRate')}
                      </span>
                    )}
                    {matured && (
                      <span className={styles.maturedBadge}>
                        🎉 {t('savings.matured')}
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
                {!!goal.targetAmount && (
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
                    {t('kid.transferToSavings')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={locked}
                    onClick={() => { setShowTransfer(goal.id); setTransferMode('out') }}
                  >
                    {t('kid.withdrawFromSavings')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={locked}
                    onClick={() => handleDeleteGoal(goal.id)}
                  >
                    {t('common.delete')}
                  </Button>
                  {renewPlan && renewPlan.lockMonths > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRenewGoal(goal)}
                    >
                      {t('savings.renew', { months: renewPlan.lockMonths, rate: Math.round(renewPlan.annualRate * 100) })}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          emoji="🚀"
          title={t('kid.noSavings')}
          action={<Button onClick={() => setShowNewGoal(true)}>{t('kid.newGoal')}</Button>}
        />
      )}

      <Modal
        isOpen={showNewGoal}
        onClose={() => setShowNewGoal(false)}
        title={t('kid.newGoal')}
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
        title={transferMode === 'in' ? t('kid.transferToSavings') : t('kid.withdrawFromSavings')}
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
        isOpen={!!renewGoal}
        onClose={() => setRenewGoal(null)}
        title={t('savings.renewTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenewGoal(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRenew} disabled={submitting}>
              {submitting ? t('common.loading') : t('common.confirm')}
            </Button>
          </>
        }
      >
        {renewGoal && (
          <p className={styles.confirmText}>
            {t('savings.renewConfirm', {
              name: renewGoal.name,
              months: SAVINGS_PLANS[renewGoal.savingsType].lockMonths,
              rate: Math.round(SAVINGS_PLANS[renewGoal.savingsType].annualRate * 100),
            })}
          </p>
        )}
      </Modal>
    </div>
  )
}
