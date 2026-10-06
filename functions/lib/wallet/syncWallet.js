"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncWallet = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const access_1 = require("../shared/access");
const pins_1 = require("../shared/pins");
const processRecurring_1 = require("../scheduled/processRecurring");
// Pays anything due right away when the wallet opens, instead of waiting for the daily job
exports.syncWallet = (0, https_1.onCall)(async (request) => {
    const { userId } = request.data ?? {};
    const { caller } = await (0, access_1.authorizeForChild)(request.auth, userId);
    if (caller.role === 'parent') {
        // Moves PIN hashes left by the old web app out of client-readable docs
        await (0, pins_1.loadFamilyPins)(caller.familyId).catch((error) => {
            v2_1.logger.warn('PIN migration failed', { familyId: caller.familyId, error: String(error) });
        });
    }
    return (0, processRecurring_1.processChild)(userId, new Date());
});
//# sourceMappingURL=syncWallet.js.map