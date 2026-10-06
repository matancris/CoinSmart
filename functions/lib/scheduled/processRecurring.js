"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRecurring = void 0;
exports.processChild = processChild;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// Schedules are defined in the families' local time, but Cloud Functions run in UTC
const TIME_ZONE = 'Asia/Jerusalem';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Guards against a corrupt schedule turning into an endless payout loop
const MAX_PERIODS = 400;
const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
});
function readParts(date) {
    const parts = {};
    for (const { type, value } of partsFormatter.formatToParts(date)) {
        if (type !== 'literal')
            parts[type] = Number(value);
    }
    return parts;
}
function zonedParts(date) {
    const { year, month, day } = readParts(date);
    return { year, month: month - 1, day };
}
function zoneOffsetMs(date) {
    const p = readParts(date);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
// Date.UTC normalizes overflow, so day 32 or month 12 roll over correctly
function zonedMidnight(year, month, day) {
    const utcGuess = Date.UTC(year, month, day);
    const first = utcGuess - zoneOffsetMs(new Date(utcGuess));
    // Re-check in case the guess and the real instant fall on different sides of a DST switch
    return new Date(utcGuess - zoneOffsetMs(new Date(first)));
}
function addZonedDays(from, days) {
    const { year, month, day } = zonedParts(from);
    return zonedMidnight(year, month, day + days);
}
function addZonedMonths(from, months, dayOfMonth) {
    const { year, month } = zonedParts(from);
    return zonedMidnight(year, month + months, dayOfMonth);
}
function nextMonthlyDue(from, dayOfMonth) {
    const { year, month, day } = zonedParts(from);
    return zonedMidnight(year, day >= dayOfMonth ? month + 1 : month, dayOfMonth);
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function toDate(value) {
    if (value instanceof firestore_1.Timestamp)
        return value.toDate();
    if (value instanceof Date)
        return value;
    return null;
}
function planAllowance(ref, data, now) {
    const amount = data.amount;
    const dueAt = toDate(data.nextDueAt);
    if (!dueAt || dueAt > now || typeof amount !== 'number' || amount <= 0)
        return null;
    let periods = 0;
    let nextDueAt = dueAt;
    if (data.frequency === 'monthly') {
        const dayOfMonth = data.dayOfMonth ?? 1;
        while (nextDueAt <= now && periods < MAX_PERIODS) {
            periods++;
            nextDueAt = addZonedMonths(nextDueAt, 1, dayOfMonth);
        }
        // Snap to the configured day so a late first run doesn't shift the schedule permanently
        if (nextDueAt <= now)
            nextDueAt = nextMonthlyDue(now, dayOfMonth);
    }
    else {
        const intervalDays = Math.max(1, data.intervalDays ?? 7);
        while (nextDueAt <= now && periods < MAX_PERIODS) {
            periods++;
            nextDueAt = addZonedDays(nextDueAt, intervalDays);
        }
        if (nextDueAt <= now)
            nextDueAt = new Date(now.getTime() + intervalDays * MS_PER_DAY);
    }
    return {
        ref,
        amount,
        description: data.description ?? '',
        periods,
        nextDueAt,
    };
}
function planInterest(ref, data, now) {
    const currentAmount = data.currentAmount ?? 0;
    const interestRate = data.interestRate ?? 0;
    if (currentAmount <= 0 || interestRate <= 0)
        return null;
    const lastApplied = toDate(data.lastInterestAt) ?? toDate(data.createdAt);
    if (!lastApplied)
        return null;
    const last = zonedParts(lastApplied);
    const current = zonedParts(now);
    const monthsElapsed = (current.year - last.year) * 12 + (current.month - last.month);
    if (monthsElapsed <= 0)
        return null;
    const monthlyRate = interestRate / 12;
    let running = currentAmount;
    const payments = [];
    for (let i = 0; i < Math.min(monthsElapsed, MAX_PERIODS); i++) {
        const interest = round2(running * monthlyRate);
        if (interest <= 0)
            continue;
        payments.push(interest);
        running = round2(running + interest);
    }
    if (payments.length === 0)
        return null;
    const total = payments.reduce((sum, p) => round2(sum + p), 0);
    return {
        ref,
        name: data.name ?? '',
        payments,
        newAmount: running,
        accruedInterest: round2((data.accruedInterest ?? 0) + total),
    };
}
// Runs inside a transaction so it can't double-pay if a child opens the app at the same moment
async function processChild(userId, now) {
    const userRef = db.doc(`users/${userId}`);
    return db.runTransaction(async (tx) => {
        const [userSnap, allowancesSnap, savingsSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(userRef.collection('allowances').where('status', '==', 'active')),
            tx.get(userRef.collection('savings').where('status', '==', 'active')),
        ]);
        if (!userSnap.exists)
            return { allowances: 0, interest: 0 };
        const allowancePlans = allowancesSnap.docs
            .map(d => planAllowance(d.ref, d.data(), now))
            .filter((p) => p !== null && p.periods > 0);
        const interestPlans = savingsSnap.docs
            .map(d => planInterest(d.ref, d.data(), now))
            .filter((p) => p !== null);
        if (allowancePlans.length === 0 && interestPlans.length === 0) {
            return { allowances: 0, interest: 0 };
        }
        const userData = userSnap.data() ?? {};
        let balance = userData.balance ?? 0;
        let totalSavings = userData.totalSavings ?? 0;
        const transactions = userRef.collection('transactions');
        let allowanceCount = 0;
        let interestCount = 0;
        for (const plan of allowancePlans) {
            for (let i = 0; i < plan.periods; i++) {
                balance = round2(balance + plan.amount);
                const txRef = transactions.doc();
                tx.set(txRef, {
                    id: txRef.id,
                    type: 'allowance',
                    amount: plan.amount,
                    balanceAfter: balance,
                    description: plan.description,
                    createdAt: now,
                    createdBy: 'system',
                });
                allowanceCount++;
            }
            tx.update(plan.ref, { lastExecutedAt: now, nextDueAt: plan.nextDueAt });
        }
        for (const plan of interestPlans) {
            for (const payment of plan.payments) {
                totalSavings = round2(totalSavings + payment);
                const txRef = transactions.doc();
                tx.set(txRef, {
                    id: txRef.id,
                    type: 'interest',
                    amount: payment,
                    balanceAfter: balance,
                    description: plan.name,
                    savingsId: plan.ref.id,
                    createdAt: now,
                    createdBy: 'system',
                });
                interestCount++;
            }
            tx.update(plan.ref, {
                currentAmount: plan.newAmount,
                accruedInterest: plan.accruedInterest,
                lastInterestAt: now,
            });
        }
        tx.update(userRef, { balance, totalSavings });
        return { allowances: allowanceCount, interest: interestCount };
    });
}
exports.processRecurring = (0, scheduler_1.onSchedule)({
    // Allowances fall due at local midnight, so one run just after it pays them on the right
    // day while keeping usage far inside the free tier; opening the app covers anything earlier
    schedule: '5 0 * * *',
    timeZone: TIME_ZONE,
    retryCount: 2,
}, async () => {
    const now = new Date();
    const childrenSnap = await db.collection('users').where('role', '==', 'child').get();
    const activeChildren = childrenSnap.docs.filter(d => d.data().isActive !== false);
    const results = await Promise.allSettled(activeChildren.map(d => processChild(d.id, now)));
    let allowances = 0;
    let interest = 0;
    results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
            allowances += result.value.allowances;
            interest += result.value.interest;
        }
        else {
            v2_1.logger.error('processRecurring failed for child', {
                userId: activeChildren[idx].id,
                error: String(result.reason),
            });
        }
    });
    v2_1.logger.info('processRecurring done', { children: activeChildren.length, allowances, interest });
});
//# sourceMappingURL=processRecurring.js.map