"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTransactionCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const v2_1 = require("firebase-functions/v2");
const db = (0, firestore_2.getFirestore)();
const messaging = (0, messaging_1.getMessaging)();
// FCM requires an absolute HTTPS link for notification clicks
const APP_URL = process.env.APP_URL ?? `https://${process.env.GCLOUD_PROJECT}.web.app`;
async function sendNotification(recipientId, { title, body, path, tag }) {
    const userSnap = await db.doc(`users/${recipientId}`).get();
    if (!userSnap.exists)
        return;
    const userData = userSnap.data();
    const tokens = [...new Set(userData.fcmTokens ?? [])];
    if (tokens.length === 0)
        return;
    const link = `${APP_URL}${path}`;
    // A notification payload (not data-only) lets the browser display it even when the
    // service worker was killed, and iOS revokes push permission after silent pushes
    const response = await messaging.sendEachForMulticast({
        tokens,
        data: { title, body, link, tag },
        webpush: {
            headers: { Urgency: 'high', TTL: String(24 * 60 * 60) },
            notification: {
                title,
                body,
                icon: '/pwa-192x192.png',
                badge: '/pwa-64x64.png',
                dir: 'rtl',
                lang: 'he',
                tag,
                renotify: true,
            },
            fcmOptions: { link },
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
            else {
                v2_1.logger.warn('FCM send failed', { recipientId, code });
            }
        }
    });
    if (staleTokens.length > 0) {
        await db.doc(`users/${recipientId}`).update({
            fcmTokens: firestore_2.FieldValue.arrayRemove(...staleTokens),
        });
    }
}
async function getFamilyParentIds(familyId) {
    const parentsSnap = await db
        .collection('users')
        .where('familyId', '==', familyId)
        .where('role', '==', 'parent')
        .get();
    return parentsSnap.docs.map(d => d.id);
}
function formatAmount(amount) {
    return `₪${amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
}
exports.onTransactionCreated = (0, firestore_1.onDocumentCreated)('users/{userId}/transactions/{txId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const tx = snapshot.data();
    const userId = event.params.userId;
    const amount = formatAmount(tx.amount);
    // Deposit from parent → notify child
    if (tx.type === 'deposit' && tx.createdBy !== userId) {
        await sendNotification(userId, {
            title: 'הפקדה חדשה! 💰',
            body: `קיבלת ${amount} לארנק שלך`,
            path: '/wallet',
            tag: `deposit-${event.params.txId}`,
        });
        return;
    }
    // Scheduled allowance → notify child
    if (tx.type === 'allowance') {
        await sendNotification(userId, {
            title: 'דמי כיס הגיעו! 🎉',
            body: `${amount} נכנסו לארנק שלך${tx.description ? ` — ${tx.description}` : ''}`,
            path: '/wallet',
            tag: 'allowance',
        });
        return;
    }
    // Monthly interest → notify child, it's the moment saving pays off
    if (tx.type === 'interest' && tx.createdBy === 'system') {
        await sendNotification(userId, {
            title: 'החיסכון שלך גדל! 🚀',
            body: `הרווחת ${amount} ריבית${tx.description ? ` על "${tx.description}"` : ''}`,
            path: '/wallet/savings',
            tag: 'interest',
        });
        return;
    }
    // Transfer received from sibling → notify recipient child + all parents
    if (tx.type === 'transfer_in' && tx.recipientName) {
        await sendNotification(userId, {
            title: 'העברה חדשה! 🎁',
            body: `קיבלת ${amount} מ${tx.recipientName}`,
            path: '/wallet',
            tag: `transfer-${event.params.txId}`,
        });
        const recipientSnap = await db.doc(`users/${userId}`).get();
        if (recipientSnap.exists) {
            const recipientData = recipientSnap.data();
            const parentIds = await getFamilyParentIds(recipientData.familyId);
            await Promise.all(parentIds.map(parentId => sendNotification(parentId, {
                title: 'העברה בין ילדים',
                body: `${tx.recipientName} שלח/ה ${amount} ל${recipientData.displayName}`,
                path: `/manage/children/${userId}`,
                tag: `transfer-${event.params.txId}`,
            })));
        }
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
        const parentIds = await getFamilyParentIds(childData.familyId);
        const desc = tx.description ? ` — ${tx.description}` : '';
        await Promise.all(parentIds.map(parentId => sendNotification(parentId, {
            title: 'הוצאה חדשה',
            body: `${childData.displayName} הוציא/ה ${amount}${desc}`,
            path: `/manage/children/${userId}`,
            tag: `expense-${event.params.txId}`,
        })));
    }
});
//# sourceMappingURL=onTransactionCreated.js.map