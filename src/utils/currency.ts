const formatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return formatter.format(amount)
}

export function parseCurrencyInput(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100
}
