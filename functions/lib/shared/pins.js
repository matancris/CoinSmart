"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidPin = isValidPin;
exports.hashPin = hashPin;
exports.verifyPin = verifyPin;
exports.pinRef = pinRef;
exports.loadFamilyPins = loadFamilyPins;
exports.isPinTaken = isPinTaken;
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
const firestore_1 = require("firebase-admin/firestore");
const access_1 = require("./access");
const scrypt = (0, node_util_1.promisify)(node_crypto_1.scrypt);
function isValidPin(pin) {
    return typeof pin === 'string' && /^\d{4}$/.test(pin);
}
async function hashPin(pin) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const hash = (await scrypt(pin, salt, 32)).toString('hex');
    return { algo: 'scrypt', hash, salt };
}
async function verifyPin(pin, record) {
    const actual = record.algo === 'scrypt'
        ? (await scrypt(pin, record.salt, 32)).toString('hex')
        : (0, node_crypto_1.createHash)('sha256').update(pin + record.salt).digest('hex');
    const a = Buffer.from(actual, 'hex');
    const b = Buffer.from(record.hash, 'hex');
    return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
}
function pinRef(familyId, childId) {
    return access_1.db.doc(`families/${familyId}/pins/${childId}`);
}
// Returns the PIN record of every child who can still log in (has a login profile).
// Hashes the old web app left in the client-readable loginProfiles are moved here on the way.
async function loadFamilyPins(familyId) {
    const [profilesSnap, pinsSnap] = await Promise.all([
        access_1.db.collection(`families/${familyId}/loginProfiles`).get(),
        access_1.db.collection(`families/${familyId}/pins`).get(),
    ]);
    const stored = new Map();
    pinsSnap.docs.forEach(d => stored.set(d.id, d.data()));
    const records = new Map();
    const batch = access_1.db.batch();
    let migrated = 0;
    for (const profile of profilesSnap.docs) {
        const { pinHash, pinSalt } = profile.data();
        let record = stored.get(profile.id);
        if (typeof pinHash === 'string') {
            if (!record && typeof pinSalt === 'string') {
                record = { algo: 'sha256', hash: pinHash, salt: pinSalt };
                batch.set(pinRef(familyId, profile.id), record);
            }
            batch.update(profile.ref, { pinHash: firestore_1.FieldValue.delete(), pinSalt: firestore_1.FieldValue.delete() });
            migrated++;
        }
        if (record)
            records.set(profile.id, record);
    }
    if (migrated > 0)
        await batch.commit();
    return records;
}
// Child login matches the PIN against every child in the family, so PINs must be unique per family
async function isPinTaken(pin, records, excludeChildId) {
    for (const [childId, record] of records) {
        if (childId === excludeChildId)
            continue;
        if (await verifyPin(pin, record))
            return true;
    }
    return false;
}
//# sourceMappingURL=pins.js.map