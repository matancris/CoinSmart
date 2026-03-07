import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  collection, query, where, onSnapshot,
} from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { AppUser, LoginProfile } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'
import { generateSalt, hashPin } from '@/utils/crypto'

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
    displayName: sanitizeString(data.displayName, 50),
    avatarEmoji: data.avatarEmoji,
    balance: data.initialBalance,
    totalSavings: 0,
    isActive: true,
    createdAt: new Date(),
  }

  const salt = generateSalt()
  const pinHash = await hashPin(data.pin, salt)

  const loginProfile: LoginProfile = {
    userId: id,
    displayName: child.displayName,
    avatarEmoji: child.avatarEmoji,
    pinHash,
    pinSalt: salt,
  }

  await setDoc(doc(db, 'users', id), child)
  await setDoc(doc(db, 'families', data.familyId, 'loginProfiles', id), loginProfile)

  return child
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

export async function updateUser(userId: string, updates: Partial<AppUser>): Promise<void> {
  await updateDoc(doc(db, 'users', userId), updates as Record<string, string | number | boolean | Date | undefined>)
}

export async function updateChildPin(familyId: string, childId: string, newPin: string): Promise<void> {
  const salt = generateSalt()
  const pinHash = await hashPin(newPin, salt)

  const profileRef = doc(db, 'families', familyId, 'loginProfiles', childId)
  const profileSnap = await getDoc(profileRef)

  if (profileSnap.exists()) {
    await updateDoc(profileRef, { pinHash, pinSalt: salt })
  } else {
    // Migrate: create full loginProfile for pre-existing children
    const user = await getUser(childId)
    const profile: LoginProfile = {
      userId: childId,
      displayName: user.displayName,
      avatarEmoji: user.avatarEmoji,
      pinHash,
      pinSalt: salt,
    }
    await setDoc(profileRef, profile)
  }
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
  }
}
