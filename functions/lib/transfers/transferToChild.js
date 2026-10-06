"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferToChild = void 0;
const https_1 = require("firebase-functions/v2/https");
const access_1 = require("../shared/access");
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
    (0, access_1.requireDocId)(senderId);
    (0, access_1.requireDocId)(recipientId);
    if (senderId === recipientId) {
        throw new https_1.HttpsError('invalid-argument', 'Cannot transfer to yourself');
    }
    const session = await (0, access_1.getChildSession)(callerUid);
    const senderRef = access_1.db.doc(`users/${senderId}`);
    const recipientRef = access_1.db.doc(`users/${recipientId}`);
    const now = new Date();
    const sanitizedNote = note?.trim().slice(0, 500);
    // Read and write inside one transaction so concurrent transfers can't overdraw the sender
    await access_1.db.runTransaction(async (tx) => {
        const [senderSnap, recipientSnap] = await Promise.all([tx.get(senderRef), tx.get(recipientRef)]);
        if (!senderSnap.exists) {
            throw new https_1.HttpsError('not-found', 'errors.userNotFound');
        }
        if (!recipientSnap.exists) {
            throw new https_1.HttpsError('not-found', 'errors.userNotFound');
        }
        const senderData = senderSnap.data();
        const recipientData = recipientSnap.data();
        // Only the sending child's own session may move their money
        if (session?.userId !== senderId || senderData.isActive === false) {
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
        // Names come from the stored profiles so a caller can't make the history show someone else
        const fromName = senderData.displayName ?? senderName;
        const toName = recipientData.displayName ?? recipientName;
        const description = note?.trim().slice(0, 200) || toName;
        const senderBalance = senderData.balance ?? 0;
        if (senderBalance < amount) {
            throw new https_1.HttpsError('failed-precondition', 'errors.insufficientBalance');
        }
        const senderNewBalance = Math.round((senderBalance - amount) * 100) / 100;
        const recipientBalance = recipientData.balance ?? 0;
        const recipientNewBalance = Math.round((recipientBalance + amount) * 100) / 100;
        const senderTxRef = access_1.db.collection(`users/${senderId}/transactions`).doc();
        tx.set(senderTxRef, {
            id: senderTxRef.id,
            type: 'transfer_out',
            amount,
            balanceAfter: senderNewBalance,
            description,
            createdAt: now,
            createdBy: senderId,
            recipientId,
            recipientName: toName,
            ...(sanitizedNote ? { note: sanitizedNote } : {}),
        });
        tx.update(senderRef, { balance: senderNewBalance });
        const recipientTxRef = access_1.db.collection(`users/${recipientId}/transactions`).doc();
        tx.set(recipientTxRef, {
            id: recipientTxRef.id,
            type: 'transfer_in',
            amount,
            balanceAfter: recipientNewBalance,
            description,
            createdAt: now,
            createdBy: senderId,
            recipientId: senderId,
            recipientName: fromName,
            ...(sanitizedNote ? { note: sanitizedNote } : {}),
        });
        tx.update(recipientRef, { balance: recipientNewBalance });
    });
    return { success: true };
});
//# sourceMappingURL=transferToChild.js.map