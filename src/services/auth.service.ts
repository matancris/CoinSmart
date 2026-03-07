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
import type { AppUser, Family, LoginProfile } from '@/types'
import { toDate } from '@/utils/date'
import { sanitizeString } from '@/utils/validation'
import { hashPin } from '@/utils/crypto'

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

  // Query login profiles instead of user docs
  const profilesSnap = await getDocs(
    collection(db, 'families', family.id, 'loginProfiles')
  )

  let matchedProfile: LoginProfile | null = null
  for (const profileDoc of profilesSnap.docs) {
    const profile = profileDoc.data() as LoginProfile
    const inputHash = await hashPin(pin, profile.pinSalt)
    if (inputHash === profile.pinHash) {
      matchedProfile = profile
      break
    }
  }

  if (!matchedProfile) {
    throw new Error('errors.invalidPin')
  }

  // Stamp child doc with anonymous UID so Firestore rules can verify access
  await updateDoc(doc(db, 'users', matchedProfile.userId), { lastAuthUid: auth.currentUser!.uid })

  const appUser = await fetchAppUser(matchedProfile.userId)

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
