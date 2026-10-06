"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransaction = void 0;
const https_1 = require("firebase-functions/v2/https");
const access_1 = require("../shared/access");
// Kids can only spend their own money; adding or removing money is a parent's call
const ALLOWED_TYPES = {
    parent: ['deposit', 'withdrawal', 'purchase'],
    child: ['purchase'],
};
exports.createTransaction = (0, https_1.onCall)(async (request) => {
    const { userId, type, amount: rawAmount, description, itemName, note } = request.data ?? {};
    const { caller } = await (0, access_1.authorizeForChild)(request.auth, userId);
    if (!ALLOWED_TYPES[caller.role].includes(type)) {
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    }
    const txType = type;
    const amount = (0, access_1.requireAmount)(rawAmount);
    const cleanItemName = (0, access_1.cleanString)(itemName, 100);
    const cleanNote = (0, access_1.cleanString)(note, 500);
    const userRef = access_1.db.doc(`users/${userId}`);
    const txRef = userRef.collection('transactions').doc();
    await access_1.db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const balance = userSnap.data()?.balance ?? 0;
        const newBalance = (0, access_1.round2)(balance + (txType === 'deposit' ? amount : -amount));
        if (newBalance < 0)
            throw new https_1.HttpsError('failed-precondition', 'errors.insufficientBalance');
        tx.set(txRef, {
            id: txRef.id,
            type: txType,
            amount,
            balanceAfter: newBalance,
            description: (0, access_1.cleanString)(description, 200),
            createdAt: new Date(),
            createdBy: caller.actorId,
            ...(cleanItemName && { itemName: cleanItemName }),
            ...(cleanNote && { note: cleanNote }),
        });
        tx.update(userRef, { balance: newBalance });
    });
    return { id: txRef.id };
});
//# sourceMappingURL=transactions.js.map