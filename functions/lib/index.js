"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferToChild = exports.onTransactionCreated = void 0;
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
var onTransactionCreated_1 = require("./notifications/onTransactionCreated");
Object.defineProperty(exports, "onTransactionCreated", { enumerable: true, get: function () { return onTransactionCreated_1.onTransactionCreated; } });
var transferToChild_1 = require("./transfers/transferToChild");
Object.defineProperty(exports, "transferToChild", { enumerable: true, get: function () { return transferToChild_1.transferToChild; } });
//# sourceMappingURL=index.js.map