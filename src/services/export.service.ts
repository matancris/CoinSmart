import { transactionService, savingsService, allowanceService } from '@/services'
import type { AppUser, Transaction, SavingsGoal } from '@/types'
import { i18n } from '@/i18n'
import { formatDateTime, formatDate } from '@/utils/date'

async function fetchAllTransactions(userId: string): Promise<Transaction[]> {
  const all: Transaction[] = []
  let lastDoc: Parameters<typeof transactionService.getTransactions>[2] = undefined

  while (true) {
    const result = await transactionService.getTransactions(userId, 100, lastDoc)
    all.push(...result.transactions)
    if (!result.lastDoc || result.transactions.length < 100) break
    lastDoc = result.lastDoc
  }

  return all
}

export async function exportFamilyData(children: AppUser[], familyName: string): Promise<void> {
  const XLSX = await import('xlsx')
  const t = i18n.t.bind(i18n)
  const isHebrew = i18n.language === 'he'

  const wb = XLSX.utils.book_new()

  // Prefetch savings goals for all children (reused in summary + per-child sheets)
  const goalsMap = new Map<string, SavingsGoal[]>()
  await Promise.all(children.map(async c => {
    const goals = await savingsService.getSavingsGoals(c.id)
    goalsMap.set(c.id, goals)
  }))

  // Summary sheet
  const savingsTypes = ['flexible', 'locked_2m', 'locked_6m'] as const
  const summaryHeaders = [
    t('export.name'),
    t('export.balance'),
    t('export.totalSavings'),
    ...savingsTypes.map(st => t(`savings.plan.${st}`)),
    t('export.createdAt'),
  ]
  const summaryData = children.map(c => {
    const goals = goalsMap.get(c.id) ?? []
    const byType = (type: string) =>
      goals.filter(g => g.savingsType === type).reduce((sum, g) => sum + g.currentAmount, 0)
    return [
      c.displayName,
      c.balance,
      c.totalSavings,
      ...savingsTypes.map(st => byType(st) || ''),
      formatDate(c.createdAt),
    ]
  })
  const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryData])
  if (isHebrew) summaryWs['!RTL'] = true
  XLSX.utils.book_append_sheet(wb, summaryWs, t('export.summary'))

  // Per-child sheets
  for (const child of children) {
    const goals = goalsMap.get(child.id) ?? []
    const [transactions, childAllowances] = await Promise.all([
      fetchAllTransactions(child.id),
      allowanceService.getAllowances(child.id),
    ])

    const rows: (string | number)[][] = []

    // Transactions section
    rows.push([t('export.transactions')])
    rows.push([
      t('export.date'),
      t('export.type'),
      t('export.amount'),
      t('export.balanceAfter'),
      t('export.description'),
    ])
    for (const tx of transactions) {
      rows.push([
        formatDateTime(tx.createdAt),
        t(`transaction.${tx.type}`),
        tx.amount,
        tx.balanceAfter,
        tx.description,
      ])
    }
    if (transactions.length === 0) {
      rows.push([t('common.noData')])
    }

    rows.push([])

    // Savings section
    rows.push([t('export.savings')])
    rows.push([
      t('export.name'),
      t('export.currentAmount'),
      t('export.targetAmount'),
      t('export.interestRate'),
      t('export.interestEarned'),
      t('export.type'),
      t('export.createdAt'),
    ])
    for (const goal of goals) {
      rows.push([
        goal.name,
        goal.currentAmount,
        goal.targetAmount ?? '',
        `${Math.round(goal.interestRate * 100)}%`,
        goal.accruedInterest,
        t(`savings.plan.${goal.savingsType}`),
        formatDate(goal.createdAt),
      ])
    }
    if (goals.length === 0) {
      rows.push([t('common.noData')])
    }

    rows.push([])

    // Allowances section
    rows.push([t('export.allowances')])
    rows.push([
      t('export.amount'),
      t('export.frequency'),
      t('export.description'),
      t('export.status'),
      t('export.nextDue'),
    ])
    for (const a of childAllowances) {
      rows.push([
        a.amount,
        a.frequency === 'every_x_days'
          ? t('allowance.everyXDaysLabel', { days: a.intervalDays ?? 7 })
          : t('allowance.monthlyOnDay', { day: a.dayOfMonth ?? 1 }),
        a.description,
        t(`allowance.${a.status}`),
        formatDate(a.nextDueAt),
      ])
    }
    if (childAllowances.length === 0) {
      rows.push([t('common.noData')])
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (isHebrew) ws['!RTL'] = true

    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = child.displayName.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `CoinSmart_${familyName}_${dateStr}.xlsx`)
}
