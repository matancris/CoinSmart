import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

initializeApp()

const db = getFirestore()
const messaging = getMessaging()

interface TransactionData {
  type: string
  amount: number
  description?: string
  createdBy: string
}

interface UserData {
  role: 'parent' | 'child'
  familyId: string
  displayName: string
  fcmTokens?: string[]
}

async function sendNotification(
  recipientId: string,
  title: string,
  body: string,
): Promise<void> {
  const userSnap = await db.doc(`users/${recipientId}`).get()
  if (!userSnap.exists) return

  const userData = userSnap.data() as UserData
  const tokens = userData.fcmTokens
  if (!tokens || tokens.length === 0) return

  const response = await messaging.sendEachForMulticast({
    tokens,
    data: { title, body },
  })

  // Prune stale tokens
  const staleTokens: string[] = []
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error?.code
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        staleTokens.push(tokens[idx])
      }
    }
  })

  if (staleTokens.length > 0) {
    await db.doc(`users/${recipientId}`).update({
      fcmTokens: FieldValue.arrayRemove(...staleTokens),
    })
  }
}

export const onTransactionCreated = onDocumentCreated(
  'users/{userId}/transactions/{txId}',
  async (event) => {
    const snapshot = event.data
    if (!snapshot) return

    const tx = snapshot.data() as TransactionData
    const userId = event.params.userId

    // Deposit from parent → notify child
    if (tx.type === 'deposit' && tx.createdBy !== userId) {
      await sendNotification(
        userId,
        'הפקדה חדשה!',
        `קיבלת ₪${tx.amount} לארנק שלך`,
      )
      return
    }

    // Withdrawal/purchase by child → notify all parents in family
    if (
      (tx.type === 'withdrawal' || tx.type === 'purchase') &&
      tx.createdBy === userId
    ) {
      const userSnap = await db.doc(`users/${userId}`).get()
      if (!userSnap.exists) return

      const childData = userSnap.data() as UserData
      if (childData.role !== 'child') return

      const parentsSnap = await db
        .collection('users')
        .where('familyId', '==', childData.familyId)
        .where('role', '==', 'parent')
        .get()

      const desc = tx.description ? ` — ${tx.description}` : ''
      const promises = parentsSnap.docs.map((parentDoc) =>
        sendNotification(
          parentDoc.id,
          'הוצאה חדשה',
          `${childData.displayName} הוציא/ה ₪${tx.amount}${desc}`,
        ),
      )

      await Promise.all(promises)
    }
  },
)
