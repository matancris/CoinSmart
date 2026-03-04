import {
  doc, setDoc, getDoc, getDocs, updateDoc,
  collection, query, where,
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { AppUser } from '@/types'
import { toDate } from '@/utils/date'

export async function createChild(data: {
  familyId: string
  displayName: string
  avatarEmoji: string
  pin: string
  initialBalance: number
}): Promise<AppUser> {
  const id = doc(collection(db, 'users')).id

  const child: AppUser = {
    id,
    familyId: data.familyId,
    role: 'child',
    displayName: data.displayName,
    avatarEmoji: data.avatarEmoji,
    pin: data.pin,
    balance: data.initialBalance,
    totalSavings: 0,
    isActive: true,
    createdAt: new Date(),
  }

  await setDoc(doc(db, 'users', id), child)
  return child
}

export async function getUser(userId: string): Promise<AppUser> {
  const snap = await getDoc(doc(db, 'users', userId))
  if (!snap.exists()) throw new Error('User not found')
  return parseUser(snap.id, snap.data())
}

export async function getChildrenByFamily(familyId: string): Promise<AppUser[]> {
  const q = query(
    collection(db, 'users'),
    where('familyId', '==', familyId),
    where('role', '==', 'child')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => parseUser(d.id, d.data()))
}

export async function updateUser(userId: string, updates: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', userId), updates as Record<string, unknown>)
}

export async function setBalance(userId: string, newBalance: number): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { balance: newBalance })
}

export async function removeChild(userId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { isActive: false })
}

function parseUser(id: string, data: Record<string, unknown>): AppUser {
  return {
    id,
    familyId: data.familyId as string,
    role: data.role as AppUser['role'],
    displayName: data.displayName as string,
    avatarEmoji: (data.avatarEmoji as string) ?? '😊',
    email: data.email as string | undefined,
    pin: data.pin as string | undefined,
    balance: (data.balance as number) ?? 0,
    totalSavings: (data.totalSavings as number) ?? 0,
    isActive: (data.isActive as boolean) ?? true,
    createdAt: toDate(data.createdAt),
  }
}
