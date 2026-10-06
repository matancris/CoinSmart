import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore'

export const db = getFirestore()

// Children sign in anonymously; childLogin links that anonymous uid to the child for this long
export const CHILD_SESSION_MS = 30 * 24 * 60 * 60 * 1000

const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export type CallerRole = 'parent' | 'child'

export interface Caller {
  role: CallerRole
  // The parent's uid, or the child's user id (never the anonymous session uid)
  actorId: string
  familyId: string
}

export interface ChildSession {
  userId: string
  familyId: string
}

type Auth = CallableRequest['auth']

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function requireDocId(value: unknown): string {
  if (typeof value !== 'string' || !DOC_ID_RE.test(value)) {
    throw new HttpsError('invalid-argument', 'errors.generic')
  }
  return value
}

export function requireAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw new HttpsError('invalid-argument', 'errors.generic')
  }
  return round2(value)
}

export function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function requireAuth(auth: Auth): NonNullable<Auth> {
  if (!auth) throw new HttpsError('unauthenticated', 'errors.generic')
  return auth
}

function isAnonymous(auth: NonNullable<Auth>): boolean {
  return auth.token.firebase?.sign_in_provider === 'anonymous'
}

export async function getChildSession(uid: string): Promise<ChildSession | null> {
  const data = (await db.doc(`childSessions/${uid}`).get()).data()
  if (!data) return null
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0
  if (expiresAt <= Date.now()) return null
  return { userId: data.userId as string, familyId: data.familyId as string }
}

export async function authorizeParent(auth: Auth): Promise<Caller> {
  const verified = requireAuth(auth)
  if (isAnonymous(verified)) throw new HttpsError('permission-denied', 'errors.generic')

  const parent = (await db.doc(`users/${verified.uid}`).get()).data()
  if (parent?.role !== 'parent' || typeof parent.familyId !== 'string') {
    throw new HttpsError('permission-denied', 'errors.generic')
  }
  return { role: 'parent', actorId: verified.uid, familyId: parent.familyId }
}

// Allows the child's own session or a parent from the same family
export async function authorizeForChild(
  auth: Auth,
  childIdInput: unknown,
): Promise<{ caller: Caller; child: DocumentData }> {
  const verified = requireAuth(auth)
  const childId = requireDocId(childIdInput)

  const child = (await db.doc(`users/${childId}`).get()).data()
  if (!child || child.role !== 'child') throw new HttpsError('not-found', 'errors.userNotFound')

  if (!isAnonymous(verified)) {
    const parent = (await db.doc(`users/${verified.uid}`).get()).data()
    if (parent?.role === 'parent' && parent.familyId === child.familyId) {
      return { caller: { role: 'parent', actorId: verified.uid, familyId: child.familyId }, child }
    }
    throw new HttpsError('permission-denied', 'errors.generic')
  }

  const session = await getChildSession(verified.uid)
  if (session?.userId !== childId || child.isActive === false) {
    throw new HttpsError('permission-denied', 'errors.generic')
  }
  return { caller: { role: 'child', actorId: childId, familyId: child.familyId }, child }
}

export async function revokeChildSessions(childId: string): Promise<void> {
  const sessions = await db.collection('childSessions').where('userId', '==', childId).get()
  if (sessions.empty) return
  const batch = db.batch()
  sessions.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}
