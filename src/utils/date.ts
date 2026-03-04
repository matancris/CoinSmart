const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(date: Date): string {
  return dateFormatter.format(date)
}

export function formatTime(date: Date): string {
  return timeFormatter.format(date)
}

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date)
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value)
  }
  return new Date()
}
