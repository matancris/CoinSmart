import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { authorizeForChild, cleanString, db, requireAmount, round2, type CallerRole } from '../shared/access'

type ManualTransactionType = 'deposit' | 'withdrawal' | 'purchase'

// Kids can only spend their own money; adding or removing money is a parent's call
const ALLOWED_TYPES: Record<CallerRole, ManualTransactionType[]> = {
  parent: ['deposit', 'withdrawal', 'purchase'],
  child: ['purchase'],
}

interface CreateTransactionRequest {
  userId?: unknown
  type?: unknown
  amount?: unknown
  description?: unknown
  itemName?: unknown
  note?: unknown
}

export const createTransaction = onCall<CreateTransactionRequest>(async (request) => {
  const { userId, type, amount: rawAmount, description, itemName, note } = request.data ?? {}
  const { caller } = await authorizeForChild(request.auth, userId)

  if (!ALLOWED_TYPES[caller.role].includes(type as ManualTransactionType)) {
    throw new HttpsError('permission-denied', 'errors.generic')
  }
  const txType = type as ManualTransactionType
  const amount = requireAmount(rawAmount)
  const cleanItemName = cleanString(itemName, 100)
  const cleanNote = cleanString(note, 500)

  const userRef = db.doc(`users/${userId as string}`)
  const txRef = userRef.collection('transactions').doc()

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    const balance = (userSnap.data()?.balance as number | undefined) ?? 0
    const newBalance = round2(balance + (txType === 'deposit' ? amount : -amount))
    if (newBalance < 0) throw new HttpsError('failed-precondition', 'errors.insufficientBalance')

    tx.set(txRef, {
      id: txRef.id,
      type: txType,
      amount,
      balanceAfter: newBalance,
      description: cleanString(description, 200),
      createdAt: new Date(),
      createdBy: caller.actorId,
      ...(cleanItemName && { itemName: cleanItemName }),
      ...(cleanNote && { note: cleanNote }),
    })
    tx.update(userRef, { balance: newBalance })
  })

  return { id: txRef.id }
})
