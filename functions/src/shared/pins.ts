import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from './access'

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number) => Promise<Buffer>

// 'sha256' is the format the web app used to write before hashing moved to the server
export interface PinRecord {
  algo: 'scrypt' | 'sha256'
  hash: string
  salt: string
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin)
}

export async function hashPin(pin: string): Promise<PinRecord> {
  const salt = randomBytes(16).toString('hex')
  const hash = (await scrypt(pin, salt, 32)).toString('hex')
  return { algo: 'scrypt', hash, salt }
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const actual = record.algo === 'scrypt'
    ? (await scrypt(pin, record.salt, 32)).toString('hex')
    : createHash('sha256').update(pin + record.salt).digest('hex')
  const a = Buffer.from(actual, 'hex')
  const b = Buffer.from(record.hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function pinRef(familyId: string, childId: string) {
  return db.doc(`families/${familyId}/pins/${childId}`)
}

// Returns the PIN record of every child who can still log in (has a login profile).
// Hashes the old web app left in the client-readable loginProfiles are moved here on the way.
export async function loadFamilyPins(familyId: string): Promise<Map<string, PinRecord>> {
  const [profilesSnap, pinsSnap] = await Promise.all([
    db.collection(`families/${familyId}/loginProfiles`).get(),
    db.collection(`families/${familyId}/pins`).get(),
  ])

  const stored = new Map<string, PinRecord>()
  pinsSnap.docs.forEach(d => stored.set(d.id, d.data() as PinRecord))

  const records = new Map<string, PinRecord>()
  const batch = db.batch()
  let migrated = 0

  for (const profile of profilesSnap.docs) {
    const { pinHash, pinSalt } = profile.data()
    let record = stored.get(profile.id)

    if (typeof pinHash === 'string') {
      if (!record && typeof pinSalt === 'string') {
        record = { algo: 'sha256', hash: pinHash, salt: pinSalt }
        batch.set(pinRef(familyId, profile.id), record)
      }
      batch.update(profile.ref, { pinHash: FieldValue.delete(), pinSalt: FieldValue.delete() })
      migrated++
    }

    if (record) records.set(profile.id, record)
  }

  if (migrated > 0) await batch.commit()
  return records
}

// Child login matches the PIN against every child in the family, so PINs must be unique per family
export async function isPinTaken(
  pin: string,
  records: Map<string, PinRecord>,
  excludeChildId?: string,
): Promise<boolean> {
  for (const [childId, record] of records) {
    if (childId === excludeChildId) continue
    if (await verifyPin(pin, record)) return true
  }
  return false
}
