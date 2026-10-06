"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHILD_SESSION_MS = exports.db = void 0;
exports.round2 = round2;
exports.requireDocId = requireDocId;
exports.requireAmount = requireAmount;
exports.cleanString = cleanString;
exports.getChildSession = getChildSession;
exports.authorizeParent = authorizeParent;
exports.authorizeForChild = authorizeForChild;
exports.revokeChildSessions = revokeChildSessions;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.db = (0, firestore_1.getFirestore)();
// Children sign in anonymously; childLogin links that anonymous uid to the child for this long
exports.CHILD_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function round2(value) {
    return Math.round(value * 100) / 100;
}
function requireDocId(value) {
    if (typeof value !== 'string' || !DOC_ID_RE.test(value)) {
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    }
    return value;
}
function requireAmount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    }
    return round2(value);
}
function cleanString(value, maxLength) {
    if (typeof value !== 'string')
        return '';
    return value.trim().slice(0, maxLength);
}
function requireAuth(auth) {
    if (!auth)
        throw new https_1.HttpsError('unauthenticated', 'errors.generic');
    return auth;
}
function isAnonymous(auth) {
    return auth.token.firebase?.sign_in_provider === 'anonymous';
}
async function getChildSession(uid) {
    const data = (await exports.db.doc(`childSessions/${uid}`).get()).data();
    if (!data)
        return null;
    const expiresAt = data.expiresAt instanceof firestore_1.Timestamp ? data.expiresAt.toMillis() : 0;
    if (expiresAt <= Date.now())
        return null;
    return { userId: data.userId, familyId: data.familyId };
}
async function authorizeParent(auth) {
    const verified = requireAuth(auth);
    if (isAnonymous(verified))
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    const parent = (await exports.db.doc(`users/${verified.uid}`).get()).data();
    if (parent?.role !== 'parent' || typeof parent.familyId !== 'string') {
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    }
    return { role: 'parent', actorId: verified.uid, familyId: parent.familyId };
}
// Allows the child's own session or a parent from the same family
async function authorizeForChild(auth, childIdInput) {
    const verified = requireAuth(auth);
    const childId = requireDocId(childIdInput);
    const child = (await exports.db.doc(`users/${childId}`).get()).data();
    if (!child || child.role !== 'child')
        throw new https_1.HttpsError('not-found', 'errors.userNotFound');
    if (!isAnonymous(verified)) {
        const parent = (await exports.db.doc(`users/${verified.uid}`).get()).data();
        if (parent?.role === 'parent' && parent.familyId === child.familyId) {
            return { caller: { role: 'parent', actorId: verified.uid, familyId: child.familyId }, child };
        }
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    }
    const session = await getChildSession(verified.uid);
    if (session?.userId !== childId || child.isActive === false) {
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    }
    return { caller: { role: 'child', actorId: childId, familyId: child.familyId }, child };
}
async function revokeChildSessions(childId) {
    const sessions = await exports.db.collection('childSessions').where('userId', '==', childId).get();
    if (sessions.empty)
        return;
    const batch = exports.db.batch();
    sessions.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
}
//# sourceMappingURL=access.js.map