import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import { CHILD_SESSION_MS, db, getChildSession, requireDocId } from '../shared/access'
import { hashPin, isValidPin, loadFamilyPins, pinRef, verifyPin } from '../shared/pins'

// A 4-digit PIN has only 10,000 options, so failed guesses lock the family's child login for a while
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000

function normalizeFamilyCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new HttpsError('invalid-argument', 'errors.invalidFamilyCode')
  return code
}

async function findFamilyByCode(code: string): Promise<DocumentSnapshot | null> {
  const snap = await db.collection('families').where('code', '==', code).limit(1).get()
  return snap.empty ? null : snap.docs[0]
}

function attemptsRef(familyId: string) {
  return db.doc(`loginAttempts/${familyId}`)
}

async function assertNotLocked(familyId: string): Promise<void> {
  const data = (await attemptsRef(familyId).get()).data()
  if (((data?.lockedUntilMs as number | undefined) ?? 0) > Date.now()) {
    throw new HttpsError('resource-exhausted', 'errors.tooManyAttempts')
  }
}

async function registerFailure(familyId: string): Promise<void> {
  const ref = attemptsRef(familyId)
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data()
    const now = Date.now()
    const windowStartMs = (data?.windowStartMs as number | undefined) ?? 0
    const inWindow = now - windowStartMs < LOCK_MS
    const failures = (inWindow ? (data?.failures as number | undefined) ?? 0 : 0) + 1

    tx.set(ref, failures >= MAX_FAILURES
      ? { failures: 0, windowStartMs: now, lockedUntilMs: now + LOCK_MS }
      : { failures, windowStartMs: inWindow ? windowStartMs : now, lockedUntilMs: 0 })
  })
}

function sessionExpiry(): Timestamp {
  return Timestamp.fromMillis(Date.now() + CHILD_SESSION_MS)
}

export const checkFamilyCode = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'errors.generic')
  const code = normalizeFamilyCode((request.data as { familyCode?: unknown } | null)?.familyCode)
  return { valid: (await findFamilyByCode(code)) !== null }
})

export const childLogin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'errors.generic')
  if (request.auth.token.firebase?.sign_in_provider !== 'anonymous') {
    throw new HttpsError('failed-precondition', 'errors.generic')
  }

  const data = request.data as { familyCode?: unknown; pin?: unknown } | null
  const code = normalizeFamilyCode(data?.familyCode)
  const pin = data?.pin
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'errors.invalidPin')

  const family = await findFamilyByCode(code)
  if (!family) throw new HttpsError('not-found', 'errors.invalidFamilyCode')
  const familyId = family.id

  await assertNotLocked(familyId)

  const records = await loadFamilyPins(familyId)
  let matchedId: string | null = null
  for (const [childId, record] of records) {
    if (await verifyPin(pin, record)) {
      matchedId = childId
      break
    }
  }

  const child = matchedId ? (await db.doc(`users/${matchedId}`).get()).data() : undefined
  if (!matchedId || !child || child.role !== 'child' || child.familyId !== familyId || child.isActive === false) {
    await registerFailure(familyId)
    throw new HttpsError('permission-denied', 'errors.invalidPin')
  }

  const batch = db.batch()
  if (records.get(matchedId)?.algo !== 'scrypt') {
    batch.set(pinRef(familyId, matchedId), await hashPin(pin))
  }
  batch.delete(attemptsRef(familyId))
  batch.set(db.doc(`childSessions/${request.auth.uid}`), {
    userId: matchedId,
    familyId,
    createdAt: Timestamp.now(),
    expiresAt: sessionExpiry(),
  })
  await batch.commit()

  return { userId: matchedId, familyId }
})

// Extends a still-valid session when the child reopens the app; never creates one
export const refreshChildSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'errors.generic')
  const childId = requireDocId((request.data as { childId?: unknown } | null)?.childId)

  const session = await getChildSession(request.auth.uid)
  const child = session ? (await db.doc(`users/${childId}`).get()).data() : undefined
  if (!session || session.userId !== childId || !child || child.isActive === false) {
    throw new HttpsError('permission-denied', 'errors.sessionExpired')
  }

  await db.doc(`childSessions/${request.auth.uid}`).update({ expiresAt: sessionExpiry() })
  return { familyId: session.familyId }
})
