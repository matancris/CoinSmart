"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTransactionCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
(0, app_1.initializeApp)();
const db = (0, firestore_2.getFirestore)();
const messaging = (0, messaging_1.getMessaging)();
async function sendNotification(recipientId, title, body) {
    const userSnap = await db.doc(`users/${recipientId}`).get();
    if (!userSnap.exists)
        return;
    const userData = userSnap.data();
    const tokens = userData.fcmTokens;
    if (!tokens || tokens.length === 0)
        return;
    const response = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        webpush: {
            notification: {
                icon: '/icon-192.png',
                dir: 'rtl',
            },
        },
    });
    // Prune stale tokens
    const staleTokens = [];
    response.responses.forEach((resp, idx) => {
        if (!resp.success) {
            const code = resp.error?.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
                staleTokens.push(tokens[idx]);
            }
        }
    });
    if (staleTokens.length > 0) {
        await db.doc(`users/${recipientId}`).update({
            fcmTokens: firestore_2.FieldValue.arrayRemove(...staleTokens),
        });
    }
}
exports.onTransactionCreated = (0, firestore_1.onDocumentCreated)('users/{userId}/transactions/{txId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const tx = snapshot.data();
    const userId = event.params.userId;
    // Deposit from parent → notify child
    if (tx.type === 'deposit' && tx.createdBy !== userId) {
        await sendNotification(userId, 'הפקדה חדשה!', `קיבלת ₪${tx.amount} לארנק שלך`);
        return;
    }
    // Withdrawal/purchase by child → notify all parents in family
    if ((tx.type === 'withdrawal' || tx.type === 'purchase') &&
        tx.createdBy === userId) {
        const userSnap = await db.doc(`users/${userId}`).get();
        if (!userSnap.exists)
            return;
        const childData = userSnap.data();
        if (childData.role !== 'child')
            return;
        const parentsSnap = await db
            .collection('users')
            .where('familyId', '==', childData.familyId)
            .where('role', '==', 'parent')
            .get();
        const desc = tx.description ? ` — ${tx.description}` : '';
        const promises = parentsSnap.docs.map((parentDoc) => sendNotification(parentDoc.id, 'הוצאה חדשה', `${childData.displayName} הוציא/ה ₪${tx.amount}${desc}`));
        await Promise.all(promises);
    }
});
//# sourceMappingURL=onTransactionCreated.js.map