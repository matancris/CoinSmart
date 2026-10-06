import {
  doc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, onSnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/config/firebase'
import type { AppUser, SiblingProfile } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'

// Runs on the server so the PIN is hashed there and never stored where the browser can read it
export async function createChild(data: {
  familyId: string
  displayName: string
  avatarEmoji: string
  pin: string
  initialBalance: number
}): Promise<AppUser> {
  const create = httpsCallable<
    { displayName: string; avatarEmoji: string; pin: string; initialBalance: number },
    { id: string }
  >(functions, 'createChild')
  const { data: result } = await create({
    displayName: sanitizeString(data.displayName, 50),
    avatarEmoji: data.avatarEmoji,
    pin: data.pin,
    initialBalance: data.initialBalance,
  })
  return getUser(result.id)
}

export async function getUser(userId: string): Promise<AppUser> {
  const snap = await getDoc(doc(db, 'users', userId))
  if (!snap.exists()) throw new Error('errors.userNotFound')
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

// Live so the parent sees allowances, interest and kids' spending land without refreshing
export function subscribeChildrenByFamily(
  familyId: string,
  onData: (children: AppUser[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(
    collection(db, 'users'),
    where('familyId', '==', familyId),
    where('role', '==', 'child')
  )
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(d => parseUser(d.id, d.data()))),
    onError
  )
}

export async function updateUser(userId: string, updates: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', userId), updates as Record<string, string | number | boolean | Date | undefined>)
}

// Also signs the child out on every device
export async function updateChildPin(childId: string, newPin: string): Promise<void> {
  const setPin = httpsCallable<{ childId: string; pin: string }, { success: boolean }>(functions, 'setChildPin')
  await setPin({ childId, pin: newPin })
}

export async function setBalance(userId: string, newBalance: number): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { balance: newBalance })
}

export async function removeChild(userId: string, familyId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { isActive: false })
  await deleteDoc(doc(db, 'families', familyId, 'loginProfiles', userId))
}

export function subscribeUser(
  userId: string,
  onData: (user: AppUser) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (!snap.exists()) {
        onError(new Error('errors.userNotFound'))
        return
      }
      onData(parseUser(snap.id, snap.data()))
    },
    onError
  )
}

export async function getSiblingProfiles(familyId: string, currentUserId: string): Promise<SiblingProfile[]> {
  const snap = await getDocs(collection(db, 'families', familyId, 'loginProfiles'))
  return snap.docs
    .filter(d => d.id !== currentUserId)
    .map(d => {
      const data = d.data()
      return {
        id: d.id,
        displayName: data.displayName as string,
        avatarEmoji: (data.avatarEmoji as string) ?? '😊',
      }
    })
}

export async function updateLoginProfileAvatar(familyId: string, childId: string, avatarEmoji: string): Promise<void> {
  await updateDoc(doc(db, 'families', familyId, 'loginProfiles', childId), { avatarEmoji })
}

function parseUser(id: string, data: Record<string, unknown>): AppUser {
  return {
    id,
    familyId: data.familyId as string,
    role: data.role as AppUser['role'],
    displayName: data.displayName as string,
    avatarEmoji: (data.avatarEmoji as string) ?? '😊',
    email: data.email as string | undefined,
    balance: (data.balance as number) ?? 0,
    totalSavings: (data.totalSavings as number) ?? 0,
    isActive: (data.isActive as boolean) ?? true,
    createdAt: toDate(data.createdAt),
    canTransferToSiblings: data.canTransferToSiblings as boolean | undefined,
  }
}
