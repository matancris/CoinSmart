"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshChildSession = exports.childLogin = exports.checkFamilyCode = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const access_1 = require("../shared/access");
const pins_1 = require("../shared/pins");
// A 4-digit PIN has only 10,000 options, so failed guesses lock the family's child login for a while
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
function normalizeFamilyCode(value) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{6}$/.test(code))
        throw new https_1.HttpsError('invalid-argument', 'errors.invalidFamilyCode');
    return code;
}
async function findFamilyByCode(code) {
    const snap = await access_1.db.collection('families').where('code', '==', code).limit(1).get();
    return snap.empty ? null : snap.docs[0];
}
function attemptsRef(familyId) {
    return access_1.db.doc(`loginAttempts/${familyId}`);
}
async function assertNotLocked(familyId) {
    const data = (await attemptsRef(familyId).get()).data();
    if ((data?.lockedUntilMs ?? 0) > Date.now()) {
        throw new https_1.HttpsError('resource-exhausted', 'errors.tooManyAttempts');
    }
}
async function registerFailure(familyId) {
    const ref = attemptsRef(familyId);
    await access_1.db.runTransaction(async (tx) => {
        const data = (await tx.get(ref)).data();
        const now = Date.now();
        const windowStartMs = data?.windowStartMs ?? 0;
        const inWindow = now - windowStartMs < LOCK_MS;
        const failures = (inWindow ? data?.failures ?? 0 : 0) + 1;
        tx.set(ref, failures >= MAX_FAILURES
            ? { failures: 0, windowStartMs: now, lockedUntilMs: now + LOCK_MS }
            : { failures, windowStartMs: inWindow ? windowStartMs : now, lockedUntilMs: 0 });
    });
}
function sessionExpiry() {
    return firestore_1.Timestamp.fromMillis(Date.now() + access_1.CHILD_SESSION_MS);
}
exports.checkFamilyCode = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'errors.generic');
    const code = normalizeFamilyCode(request.data?.familyCode);
    return { valid: (await findFamilyByCode(code)) !== null };
});
exports.childLogin = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'errors.generic');
    if (request.auth.token.firebase?.sign_in_provider !== 'anonymous') {
        throw new https_1.HttpsError('failed-precondition', 'errors.generic');
    }
    const data = request.data;
    const code = normalizeFamilyCode(data?.familyCode);
    const pin = data?.pin;
    if (!(0, pins_1.isValidPin)(pin))
        throw new https_1.HttpsError('invalid-argument', 'errors.invalidPin');
    const family = await findFamilyByCode(code);
    if (!family)
        throw new https_1.HttpsError('not-found', 'errors.invalidFamilyCode');
    const familyId = family.id;
    await assertNotLocked(familyId);
    const records = await (0, pins_1.loadFamilyPins)(familyId);
    let matchedId = null;
    for (const [childId, record] of records) {
        if (await (0, pins_1.verifyPin)(pin, record)) {
            matchedId = childId;
            break;
        }
    }
    const child = matchedId ? (await access_1.db.doc(`users/${matchedId}`).get()).data() : undefined;
    if (!matchedId || !child || child.role !== 'child' || child.familyId !== familyId || child.isActive === false) {
        await registerFailure(familyId);
        throw new https_1.HttpsError('permission-denied', 'errors.invalidPin');
    }
    const batch = access_1.db.batch();
    if (records.get(matchedId)?.algo !== 'scrypt') {
        batch.set((0, pins_1.pinRef)(familyId, matchedId), await (0, pins_1.hashPin)(pin));
    }
    batch.delete(attemptsRef(familyId));
    batch.set(access_1.db.doc(`childSessions/${request.auth.uid}`), {
        userId: matchedId,
        familyId,
        createdAt: firestore_1.Timestamp.now(),
        expiresAt: sessionExpiry(),
    });
    await batch.commit();
    return { userId: matchedId, familyId };
});
// Extends a still-valid session when the child reopens the app; never creates one
exports.refreshChildSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'errors.generic');
    const childId = (0, access_1.requireDocId)(request.data?.childId);
    const session = await (0, access_1.getChildSession)(request.auth.uid);
    const child = session ? (await access_1.db.doc(`users/${childId}`).get()).data() : undefined;
    if (!session || session.userId !== childId || !child || child.isActive === false) {
        throw new https_1.HttpsError('permission-denied', 'errors.sessionExpired');
    }
    await access_1.db.doc(`childSessions/${request.auth.uid}`).update({ expiresAt: sessionExpiry() });
    return { familyId: session.familyId };
});
//# sourceMappingURL=childAuth.js.map