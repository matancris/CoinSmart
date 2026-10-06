import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, getDoc,
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { Allowance, AllowanceFrequency, AllowanceStatus } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'

export async function getAllowances(userId: string): Promise<Allowance[]> {
  const ref = collection(db, 'users', userId, 'allowances')
  const snap = await getDocs(ref)
  return snap.docs.map(d => parseAllowance(d.id, d.data() as Record<string, unknown>))
}

export async function createAllowance(
  userId: string,
  data: {
    amount: number
    frequency: AllowanceFrequency
    intervalDays?: number
    dayOfMonth?: number
    description: string
    createdBy: string
  }
): Promise<Allowance> {
  const ref = doc(collection(db, 'users', userId, 'allowances'))
  const now = new Date()
  const nextDueAt = computeNextDueAt(data.frequency, now, data.intervalDays, data.dayOfMonth)

  const allowance: Allowance = {
    id: ref.id,
    amount: data.amount,
    frequency: data.frequency,
    intervalDays: data.frequency === 'every_x_days' ? data.intervalDays : undefined,
    dayOfMonth: data.frequency === 'monthly' ? data.dayOfMonth : undefined,
    description: sanitizeString(data.description, 100),
    status: 'active',
    createdBy: data.createdBy,
    createdAt: now,
    lastExecutedAt: null,
    nextDueAt,
  }

  const cleanDoc = Object.fromEntries(
    Object.entries(allowance).filter(([, v]) => v !== undefined)
  )

  await setDoc(ref, cleanDoc)
  return allowance
}

export async function updateAllowance(
  userId: string,
  allowanceId: string,
  data: {
    amount?: number
    frequency?: AllowanceFrequency
    intervalDays?: number
    dayOfMonth?: number
    description?: string
  }
): Promise<void> {
  const ref = doc(db, 'users', userId, 'allowances', allowanceId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('errors.notFound')

  const current = snap.data() as Record<string, unknown>
  const frequency = (data.frequency ?? current.frequency) as AllowanceFrequency
  const intervalDays = data.frequency === 'every_x_days'
    ? data.intervalDays
    : (data.intervalDays ?? current.intervalDays) as number | undefined
  const dayOfMonth = data.frequency === 'monthly'
    ? data.dayOfMonth
    : (data.dayOfMonth ?? current.dayOfMonth) as number | undefined

  // Only reschedule when the schedule itself changed — editing amount/description keeps the due date
  const scheduleChanged = frequency !== current.frequency
    || (frequency === 'every_x_days' && intervalDays !== current.intervalDays)
    || (frequency === 'monthly' && dayOfMonth !== current.dayOfMonth)

  const updates: Record<string, unknown> = {}
  if (scheduleChanged) {
    updates.nextDueAt = computeNextDueAt(frequency, new Date(), intervalDays, dayOfMonth)
  }
  if (data.amount !== undefined) updates.amount = data.amount
  if (data.frequency !== undefined) {
    updates.frequency = data.frequency
    if (data.frequency === 'every_x_days') {
      updates.intervalDays = intervalDays
      updates.dayOfMonth = null
    } else {
      updates.dayOfMonth = dayOfMonth
      updates.intervalDays = null
    }
  }
  if (data.description !== undefined) updates.description = sanitizeString(data.description, 100)

  await updateDoc(ref, updates)
}

export async function deleteAllowance(userId: string, allowanceId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'allowances', allowanceId))
}

export async function toggleAllowanceStatus(
  userId: string,
  allowanceId: string,
  currentStatus: AllowanceStatus
): Promise<void> {
  const ref = doc(db, 'users', userId, 'allowances', allowanceId)
  const newStatus: AllowanceStatus = currentStatus === 'active' ? 'paused' : 'active'

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'active') {
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('errors.notFound')
    const data = snap.data() as Record<string, unknown>
    const frequency = data.frequency as AllowanceFrequency
    const intervalDays = data.intervalDays as number | undefined
    const dayOfMonth = data.dayOfMonth as number | undefined
    updates.nextDueAt = computeNextDueAt(frequency, new Date(), intervalDays, dayOfMonth)
  }

  await updateDoc(ref, updates)
}

export function computeNextDueAt(
  frequency: AllowanceFrequency,
  fromDate: Date,
  intervalDays?: number,
  dayOfMonth?: number
): Date {
  if (frequency === 'every_x_days') {
    const days = intervalDays ?? 7
    const next = new Date(fromDate)
    next.setDate(next.getDate() + days)
    next.setHours(0, 0, 0, 0)
    return next
  }

  // monthly
  const day = dayOfMonth ?? 1
  const next = new Date(fromDate)
  next.setHours(0, 0, 0, 0)

  if (next.getDate() >= day) {
    // Move to the 1st first so e.g. Jan 31 + 1 month doesn't overflow into March
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
  }
  next.setDate(day)
  return next
}

function parseAllowance(id: string, data: Record<string, unknown>): Allowance {
  return {
    id,
    amount: (data.amount as number) ?? 0,
    frequency: (data.frequency as AllowanceFrequency) ?? 'every_x_days',
    intervalDays: data.intervalDays as number | undefined,
    dayOfMonth: data.dayOfMonth as number | undefined,
    description: (data.description as string) ?? '',
    status: (data.status as AllowanceStatus) ?? 'active',
    createdBy: (data.createdBy as string) ?? '',
    createdAt: toDate(data.createdAt),
    lastExecutedAt: data.lastExecutedAt ? toDate(data.lastExecutedAt) : null,
    nextDueAt: toDate(data.nextDueAt),
  }
}
