import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { authorizeParent, cleanString, db, requireDocId, revokeChildSessions, round2 } from '../shared/access'
import { hashPin, isPinTaken, isValidPin, loadFamilyPins, pinRef } from '../shared/pins'

interface CreateChildRequest {
  displayName?: unknown
  avatarEmoji?: unknown
  pin?: unknown
  initialBalance?: unknown
}

export const createChild = onCall<CreateChildRequest>(async (request) => {
  const { familyId } = await authorizeParent(request.auth)
  const { displayName, avatarEmoji, pin, initialBalance } = request.data ?? {}

  const name = cleanString(displayName, 50)
  const emoji = cleanString(avatarEmoji, 16) || '😊'
  const balance = initialBalance === undefined ? 0 : initialBalance
  if (!name || !isValidPin(pin)) throw new HttpsError('invalid-argument', 'errors.generic')
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0 || balance > 1_000_000) {
    throw new HttpsError('invalid-argument', 'errors.generic')
  }

  const records = await loadFamilyPins(familyId)
  if (await isPinTaken(pin, records)) throw new HttpsError('already-exists', 'errors.pinInUse')

  const childRef = db.collection('users').doc()
  const batch = db.batch()
  batch.set(childRef, {
    id: childRef.id,
    familyId,
    role: 'child',
    displayName: name,
    avatarEmoji: emoji,
    balance: round2(balance),
    totalSavings: 0,
    isActive: true,
    createdAt: new Date(),
  })
  batch.set(db.doc(`families/${familyId}/loginProfiles/${childRef.id}`), {
    userId: childRef.id,
    displayName: name,
    avatarEmoji: emoji,
  })
  batch.set(pinRef(familyId, childRef.id), await hashPin(pin))
  await batch.commit()

  return { id: childRef.id }
})

// Changing a PIN also signs the child out everywhere, so a parent can cut off a lost device
export const setChildPin = onCall<{ childId?: unknown; pin?: unknown }>(async (request) => {
  const { familyId } = await authorizeParent(request.auth)
  const childId = requireDocId(request.data?.childId)
  const pin = request.data?.pin
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'errors.invalidPin')

  const child = (await db.doc(`users/${childId}`).get()).data()
  if (!child || child.role !== 'child' || child.familyId !== familyId) {
    throw new HttpsError('not-found', 'errors.userNotFound')
  }

  const records = await loadFamilyPins(familyId)
  if (await isPinTaken(pin, records, childId)) throw new HttpsError('already-exists', 'errors.pinInUse')

  const profileRef = db.doc(`families/${familyId}/loginProfiles/${childId}`)
  const batch = db.batch()
  batch.set(pinRef(familyId, childId), await hashPin(pin))
  // Children created before login profiles existed have none yet
  if (!(await profileRef.get()).exists) {
    batch.set(profileRef, {
      userId: childId,
      displayName: child.displayName ?? '',
      avatarEmoji: child.avatarEmoji ?? '😊',
    })
  }
  await batch.commit()
  await revokeChildSessions(childId)

  return { success: true }
})
