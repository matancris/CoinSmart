import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '@/config/firebase'
import type { AppUser, Family } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'

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
    name: sanitizeString(familyName, 100),
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
    displayName: sanitizeString(displayName, 50),
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

// The PIN is checked on the server, which links this anonymous sign-in to the child
export async function loginChildWithPin(
  familyCode: string,
  pin: string
): Promise<{ appUser: AppUser; family: Family }> {
  await ensureAnonymousSession()

  const childLogin = httpsCallable<{ familyCode: string; pin: string }, { userId: string; familyId: string }>(
    functions, 'childLogin'
  )
  const { data } = await childLogin({ familyCode: familyCode.toUpperCase(), pin })

  const [appUser, family] = await Promise.all([fetchAppUser(data.userId), fetchFamily(data.familyId)])
  return { appUser, family }
}

export async function validateFamilyCode(familyCode: string): Promise<boolean> {
  await ensureAnonymousSession()
  const checkFamilyCode = httpsCallable<{ familyCode: string }, { valid: boolean }>(functions, 'checkFamilyCode')
  const { data } = await checkFamilyCode({ familyCode: familyCode.toUpperCase() })
  return data.valid
}

// Only extends a session this device already has; a new device must log in with the PIN
export async function refreshChildSession(childId: string): Promise<void> {
  const refresh = httpsCallable<{ childId: string }, { familyId: string }>(functions, 'refreshChildSession')
  await refresh({ childId })
}

export async function fetchAppUser(userId: string): Promise<AppUser> {
  const snap = await getDoc(doc(db, 'users', userId))
  if (!snap.exists()) {
    throw new Error('errors.userNotFound')
  }
  return parseAppUser(snap.id, snap.data())
}

export async function fetchFamily(familyId: string): Promise<Family> {
  const snap = await getDoc(doc(db, 'families', familyId))
  if (!snap.exists()) {
    throw new Error('errors.familyNotFound')
  }
  const data = snap.data()
  return {
    id: snap.id,
    ...data,
    createdAt: toDate(data.createdAt),
  } as Family
}


export async function logout(): Promise<void> {
  const current = auth.currentUser
  if (current?.isAnonymous) {
    await deleteDoc(doc(db, 'childSessions', current.uid)).catch(() => {})
  }
  await signOut(auth)
}

async function ensureAnonymousSession(): Promise<void> {
  // A parent signed in on a shared device must not carry their account into the child's session
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    await signOut(auth)
  }
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
}

function parseAppUser(id: string, data: Record<string, unknown>): AppUser {
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

function generateFamilyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
