import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore'
import { auth, db } from '@/config/firebase'
import type { AppUser, Family } from '@/types'
import { toDate } from '@/utils/date'

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export async function registerParent(
  email: string,
  password: string,
  familyName: string,
  displayName: string
): Promise<{ user: AppUser; family: Family }> {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  const familyCode = generateFamilyCode()

  const family: Family = {
    id: cred.user.uid + '_family',
    name: familyName,
    code: familyCode,
    createdBy: cred.user.uid,
    currency: 'ILS',
    savingsInterestRate: 0.05,
    createdAt: new Date(),
  }

  const appUser: AppUser = {
    id: cred.user.uid,
    familyId: family.id,
    role: 'parent',
    displayName,
    avatarEmoji: '👨‍👩‍👧‍👦',
    email,
    balance: 0,
    totalSavings: 0,
    isActive: true,
    createdAt: new Date(),
  }

  await setDoc(doc(db, 'families', family.id), family)
  await setDoc(doc(db, 'users', appUser.id), appUser)

  return { user: appUser, family }
}

export async function loginWithEmail(email: string, password: string): Promise<AppUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return fetchAppUser(cred.user.uid)
}

export async function loginChildWithPin(
  familyCode: string,
  pin: string
): Promise<{ appUser: AppUser; family: Family }> {
  // Sign in anonymously first so Firestore rules allow reads
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }

  const familySnap = await getDocs(
    query(collection(db, 'families'), where('code', '==', familyCode.toUpperCase()))
  )

  if (familySnap.empty) {
    throw new Error('errors.invalidFamilyCode')
  }

  const family = { id: familySnap.docs[0].id, ...familySnap.docs[0].data() } as Family

  const childrenSnap = await getDocs(
    query(
      collection(db, 'users'),
      where('familyId', '==', family.id),
      where('role', '==', 'child'),
      where('isActive', '==', true)
    )
  )

  const matchingChild = childrenSnap.docs.find(d => d.data().pin === pin)
  if (!matchingChild) {
    throw new Error('errors.invalidPin')
  }

  const appUser = parseAppUser(matchingChild.id, matchingChild.data())

  // Stamp child doc with anonymous UID so Firestore rules can verify access
  await updateDoc(doc(db, 'users', appUser.id), { lastAuthUid: auth.currentUser!.uid })

  return { appUser, family }
}

export async function validateFamilyCode(familyCode: string): Promise<boolean> {
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
  const familySnap = await getDocs(
    query(collection(db, 'families'), where('code', '==', familyCode.toUpperCase()))
  )
  return !familySnap.empty
}

export async function fetchAppUser(userId: string): Promise<AppUser> {
  const snap = await getDoc(doc(db, 'users', userId))
  if (!snap.exists()) {
    throw new Error('User not found')
  }
  return parseAppUser(snap.id, snap.data())
}

export async function fetchFamily(familyId: string): Promise<Family> {
  const snap = await getDoc(doc(db, 'families', familyId))
  if (!snap.exists()) {
    throw new Error('Family not found')
  }
  const data = snap.data()
  return {
    id: snap.id,
    ...data,
    createdAt: toDate(data.createdAt),
  } as Family
}


export async function signInAsAnonymous(): Promise<void> {
  await signInAnonymously(auth)
}

export async function updateLastAuthUid(userId: string): Promise<void> {
  if (!auth.currentUser) return
  await updateDoc(doc(db, 'users', userId), { lastAuthUid: auth.currentUser.uid })
}

export async function logout(): Promise<void> {
  await signOut(auth)
}

function parseAppUser(id: string, data: Record<string, unknown>): AppUser {
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

function generateFamilyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
