"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setChildPin = exports.createChild = void 0;
const https_1 = require("firebase-functions/v2/https");
const access_1 = require("../shared/access");
const pins_1 = require("../shared/pins");
exports.createChild = (0, https_1.onCall)(async (request) => {
    const { familyId } = await (0, access_1.authorizeParent)(request.auth);
    const { displayName, avatarEmoji, pin, initialBalance } = request.data ?? {};
    const name = (0, access_1.cleanString)(displayName, 50);
    const emoji = (0, access_1.cleanString)(avatarEmoji, 16) || '😊';
    const balance = initialBalance === undefined ? 0 : initialBalance;
    if (!name || !(0, pins_1.isValidPin)(pin))
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0 || balance > 1_000_000) {
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    }
    const records = await (0, pins_1.loadFamilyPins)(familyId);
    if (await (0, pins_1.isPinTaken)(pin, records))
        throw new https_1.HttpsError('already-exists', 'errors.pinInUse');
    const childRef = access_1.db.collection('users').doc();
    const batch = access_1.db.batch();
    batch.set(childRef, {
        id: childRef.id,
        familyId,
        role: 'child',
        displayName: name,
        avatarEmoji: emoji,
        balance: (0, access_1.round2)(balance),
        totalSavings: 0,
        isActive: true,
        createdAt: new Date(),
    });
    batch.set(access_1.db.doc(`families/${familyId}/loginProfiles/${childRef.id}`), {
        userId: childRef.id,
        displayName: name,
        avatarEmoji: emoji,
    });
    batch.set((0, pins_1.pinRef)(familyId, childRef.id), await (0, pins_1.hashPin)(pin));
    await batch.commit();
    return { id: childRef.id };
});
// Changing a PIN also signs the child out everywhere, so a parent can cut off a lost device
exports.setChildPin = (0, https_1.onCall)(async (request) => {
    const { familyId } = await (0, access_1.authorizeParent)(request.auth);
    const childId = (0, access_1.requireDocId)(request.data?.childId);
    const pin = request.data?.pin;
    if (!(0, pins_1.isValidPin)(pin))
        throw new https_1.HttpsError('invalid-argument', 'errors.invalidPin');
    const child = (await access_1.db.doc(`users/${childId}`).get()).data();
    if (!child || child.role !== 'child' || child.familyId !== familyId) {
        throw new https_1.HttpsError('not-found', 'errors.userNotFound');
    }
    const records = await (0, pins_1.loadFamilyPins)(familyId);
    if (await (0, pins_1.isPinTaken)(pin, records, childId))
        throw new https_1.HttpsError('already-exists', 'errors.pinInUse');
    const profileRef = access_1.db.doc(`families/${familyId}/loginProfiles/${childId}`);
    const batch = access_1.db.batch();
    batch.set((0, pins_1.pinRef)(familyId, childId), await (0, pins_1.hashPin)(pin));
    // Children created before login profiles existed have none yet
    if (!(await profileRef.get()).exists) {
        batch.set(profileRef, {
            userId: childId,
            displayName: child.displayName ?? '',
            avatarEmoji: child.avatarEmoji ?? '😊',
        });
    }
    await batch.commit();
    await (0, access_1.revokeChildSessions)(childId);
    return { success: true };
});
//# sourceMappingURL=children.js.map