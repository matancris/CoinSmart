import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { Family } from '@/types'
import { toDate } from '@/utils/date'

export async function getFamily(familyId: string): Promise<Family> {
  const snap = await getDoc(doc(db, 'families', familyId))
  if (!snap.exists()) throw new Error('Family not found')
  const data = snap.data()
  return { id: snap.id, ...data, createdAt: toDate(data.createdAt) } as Family
}

export async function updateFamily(familyId: string, updates: Partial<Family>): Promise<void> {
  await updateDoc(doc(db, 'families', familyId), updates)
}
