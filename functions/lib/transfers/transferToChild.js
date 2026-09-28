"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferToChild = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
exports.transferToChild = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const callerUid = request.auth.uid;
    const { senderId, senderName, recipientId, recipientName, amount, note } = request.data;
    if (!senderId || !senderName || !recipientId || !recipientName) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required fields');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new https_1.HttpsError('invalid-argument', 'Amount must be positive');
    }
    if (senderId === recipientId) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot transfer to yourself');
    }
    const senderRef = db.doc(`users/${senderId}`);
    const recipientRef = db.doc(`users/${recipientId}`);
    const now = new Date();
    const description = note?.trim().slice(0, 200) || recipientName;
    const sanitizedNote = note?.trim().slice(0, 500);
    // Read and write inside one transaction so concurrent transfers can't overdraw the sender
    await db.runTransaction(async (tx) => {
        const [senderSnap, recipientSnap] = await Promise.all([tx.get(senderRef), tx.get(recipientRef)]);
        if (!senderSnap.exists) {
            throw new https_1.HttpsError('not-found', 'errors.userNotFound');
        }
        if (!recipientSnap.exists) {
            throw new https_1.HttpsError('not-found', 'errors.userNotFound');
        }
        const senderData = senderSnap.data();
        const recipientData = recipientSnap.data();
        // Children sign in anonymously; their session UID is stamped on the user doc as lastAuthUid
        if (callerUid !== senderId && senderData.lastAuthUid !== callerUid) {
            throw new https_1.HttpsError('permission-denied', 'errors.generic');
        }
        // Verify both are children in the same family
        if (senderData.role !== 'child' || recipientData.role !== 'child') {
            throw new https_1.HttpsError('permission-denied', 'Only children can transfer to each other');
        }
        if (senderData.familyId !== recipientData.familyId) {
            throw new https_1.HttpsError('permission-denied', 'Must be in the same family');
        }
        if (senderData.canTransferToSiblings === false) {
            throw new https_1.HttpsError('permission-denied', 'errors.generic');
        }
        const senderBalance = senderData.balance ?? 0;
        if (senderBalance < amount) {
            throw new https_1.HttpsError('failed-precondition', 'errors.insufficientBalance');
        }
        const senderNewBalance = Math.round((senderBalance - amount) * 100) / 100;
        const recipientBalance = recipientData.balance ?? 0;
        const recipientNewBalance = Math.round((recipientBalance + amount) * 100) / 100;
        const senderTxRef = db.collection(`users/${senderId}/transactions`).doc();
        tx.set(senderTxRef, {
            id: senderTxRef.id,
            type: 'transfer_out',
            amount,
            balanceAfter: senderNewBalance,
            description,
            createdAt: now,
            createdBy: senderId,
            recipientId,
            recipientName,
            ...(sanitizedNote ? { note: sanitizedNote } : {}),
        });
        tx.update(senderRef, { balance: senderNewBalance });
        const recipientTxRef = db.collection(`users/${recipientId}/transactions`).doc();
        tx.set(recipientTxRef, {
            id: recipientTxRef.id,
            type: 'transfer_in',
            amount,
            balanceAfter: recipientNewBalance,
            description,
            createdAt: now,
            createdBy: senderId,
            recipientId: senderId,
            recipientName: senderName,
            ...(sanitizedNote ? { note: sanitizedNote } : {}),
        });
        tx.update(recipientRef, { balance: recipientNewBalance });
    });
    return { success: true };
});
//# sourceMappingURL=transferToChild.js.map