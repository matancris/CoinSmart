"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renewSavingsGoal = exports.deleteSavingsGoal = exports.moveSavings = exports.createSavingsGoal = void 0;
exports.settleMaturity = settleMaturity;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const access_1 = require("../shared/access");
// Keep in sync with SAVINGS_PLANS in src/utils/savings.ts — the server copy is the one that counts
const SAVINGS_PLANS = {
    flexible: { annualRate: 0.03, lockMonths: 0 },
    locked_2m: { annualRate: 0.06, lockMonths: 2 },
    locked_6m: { annualRate: 0.12, lockMonths: 6 },
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function toDate(value) {
    if (value instanceof firestore_1.Timestamp)
        return value.toDate();
    if (value instanceof Date)
        return value;
    return null;
}
function isLocked(data, now) {
    const maturityDate = toDate(data.maturityDate);
    return maturityDate !== null && now < maturityDate;
}
function proRataInterest(data, now) {
    const currentAmount = data.currentAmount ?? 0;
    const interestRate = data.interestRate ?? 0;
    if (interestRate <= 0 || currentAmount <= 0)
        return 0;
    const lastInterestAt = toDate(data.lastInterestAt) ?? toDate(data.createdAt) ?? now;
    const daysElapsed = Math.floor((now.getTime() - lastInterestAt.getTime()) / MS_PER_DAY);
    if (daysElapsed <= 0)
        return 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return (0, access_1.round2)(currentAmount * (interestRate / 12) * (daysElapsed / daysInMonth));
}
function addMonths(from, months) {
    const date = new Date(from);
    date.setMonth(date.getMonth() + months);
    return date;
}
// A locked goal earns its plan's rate only until maturityDate, then the flexible rate. Settling
// pays what the locked rate owes up to maturity and switches the goal over, exactly once
function settleMaturity(data, now) {
    const maturityDate = toDate(data.maturityDate);
    if (!maturityDate || maturityDate > now || data.maturedAt)
        return null;
    // Runs before the rate changes, so it pays the locked rate. Goals that already earned interest
    // past maturity get nothing here and keep what they earned
    const interest = proRataInterest(data, maturityDate);
    const lastInterestAt = toDate(data.lastInterestAt) ?? toDate(data.createdAt) ?? maturityDate;
    const updates = {
        interestRate: SAVINGS_PLANS.flexible.annualRate,
        maturedAt: maturityDate,
        lastInterestAt: lastInterestAt > maturityDate ? lastInterestAt : maturityDate,
    };
    if (interest > 0) {
        updates.currentAmount = (0, access_1.round2)((data.currentAmount ?? 0) + interest);
        updates.accruedInterest = (0, access_1.round2)((data.accruedInterest ?? 0) + interest);
    }
    return { interest, updates, goal: { ...data, ...updates } };
}
function writeInterestTransaction(tx, userId, amount, balanceAfter, goal, savingsId, now) {
    const txRef = access_1.db.collection(`users/${userId}/transactions`).doc();
    tx.set(txRef, {
        id: txRef.id,
        type: 'interest',
        amount,
        balanceAfter,
        description: goal.name ?? '',
        savingsId,
        createdAt: now,
        createdBy: 'system',
    });
}
exports.createSavingsGoal = (0, https_1.onCall)(async (request) => {
    const { userId, name, targetAmount, savingsType } = request.data ?? {};
    await (0, access_1.authorizeForChild)(request.auth, userId);
    if (typeof savingsType !== 'string' || !(savingsType in SAVINGS_PLANS)) {
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    }
    const plan = SAVINGS_PLANS[savingsType];
    const goalName = (0, access_1.cleanString)(name, 100);
    if (!goalName)
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    const target = targetAmount === undefined || targetAmount === null ? undefined : (0, access_1.requireAmount)(targetAmount);
    const now = new Date();
    const maturityDate = plan.lockMonths > 0 ? addMonths(now, plan.lockMonths) : undefined;
    const ref = access_1.db.collection(`users/${userId}/savings`).doc();
    await ref.set({
        id: ref.id,
        name: goalName,
        currentAmount: 0,
        interestRate: plan.annualRate,
        accruedInterest: 0,
        savingsType,
        status: 'active',
        createdAt: now,
        lastInterestAt: now,
        ...(target !== undefined && { targetAmount: target }),
        ...(maturityDate && { maturityDate }),
    });
    return { id: ref.id };
});
// 'in' moves wallet money into the goal, 'deposit' is a parent adding new money straight into the goal,
// 'out' moves goal money back to the wallet
exports.moveSavings = (0, https_1.onCall)(async (request) => {
    const { userId: rawUserId, savingsId: rawSavingsId, amount: rawAmount, direction, force } = request.data ?? {};
    const { caller } = await (0, access_1.authorizeForChild)(request.auth, rawUserId);
    const userId = rawUserId;
    const savingsId = (0, access_1.requireDocId)(rawSavingsId);
    const amount = (0, access_1.requireAmount)(rawAmount);
    if (direction !== 'in' && direction !== 'deposit' && direction !== 'out') {
        throw new https_1.HttpsError('invalid-argument', 'errors.generic');
    }
    const move = direction;
    // Creating money and breaking a lock are parent-only
    if ((move === 'deposit' || force === true) && caller.role !== 'parent') {
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    }
    const userRef = access_1.db.doc(`users/${userId}`);
    const savingsRef = access_1.db.doc(`users/${userId}/savings/${savingsId}`);
    await access_1.db.runTransaction(async (tx) => {
        const [userSnap, savingsSnap, allGoalsSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(savingsRef),
            tx.get(userRef.collection('savings')),
        ]);
        const user = userSnap.data();
        const storedGoal = savingsSnap.data();
        if (!user || !storedGoal)
            throw new https_1.HttpsError('not-found', 'errors.notFound');
        const now = new Date();
        const balance = user.balance ?? 0;
        // Settle before any amount changes, so money added to a matured goal never earns the locked rate
        const settlement = settleMaturity(storedGoal, now);
        const goal = settlement?.goal ?? storedGoal;
        if (settlement && settlement.interest > 0) {
            writeInterestTransaction(tx, userId, settlement.interest, balance, goal, savingsId, now);
        }
        let currentAmount = goal.currentAmount ?? 0;
        let newBalance = balance;
        const goalUpdates = { ...settlement?.updates };
        let txType;
        if (move === 'out') {
            if (force !== true && isLocked(goal, now))
                throw new https_1.HttpsError('failed-precondition', 'errors.savingsLocked');
            const interest = proRataInterest(goal, now);
            if (interest > 0) {
                currentAmount = (0, access_1.round2)(currentAmount + interest);
                goalUpdates.accruedInterest = (0, access_1.round2)((goal.accruedInterest ?? 0) + interest);
                goalUpdates.lastInterestAt = now;
                writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now);
            }
            if (currentAmount < amount)
                throw new https_1.HttpsError('failed-precondition', 'errors.insufficientBalance');
            currentAmount = (0, access_1.round2)(currentAmount - amount);
            newBalance = (0, access_1.round2)(balance + amount);
            txType = 'transfer_from_savings';
        }
        else {
            if (move === 'in') {
                if (balance < amount)
                    throw new https_1.HttpsError('failed-precondition', 'errors.insufficientBalance');
                newBalance = (0, access_1.round2)(balance - amount);
            }
            // Interest accrues from the first deposit, not from when an empty goal was created
            if (currentAmount <= 0)
                goalUpdates.lastInterestAt = now;
            currentAmount = (0, access_1.round2)(currentAmount + amount);
            txType = move === 'in' ? 'transfer_to_savings' : 'deposit_to_savings';
        }
        goalUpdates.currentAmount = currentAmount;
        tx.update(savingsRef, goalUpdates);
        const otherGoals = allGoalsSnap.docs.filter(d => d.id !== savingsId).map(d => d.data());
        tx.update(userRef, { balance: newBalance, totalSavings: (0, access_1.round2)((0, access_1.sumSavings)(otherGoals) + currentAmount) });
        const txRef = userRef.collection('transactions').doc();
        tx.set(txRef, {
            id: txRef.id,
            type: txType,
            amount,
            balanceAfter: newBalance,
            description: goal.name ?? '',
            savingsId,
            createdAt: now,
            createdBy: caller.actorId,
        });
    });
    return { success: true };
});
// Closing a goal pays everything in it, plus interest earned so far, back into the wallet
exports.deleteSavingsGoal = (0, https_1.onCall)(async (request) => {
    const { userId: rawUserId, savingsId: rawSavingsId, force } = request.data ?? {};
    const { caller } = await (0, access_1.authorizeForChild)(request.auth, rawUserId);
    const userId = rawUserId;
    const savingsId = (0, access_1.requireDocId)(rawSavingsId);
    if (force === true && caller.role !== 'parent')
        throw new https_1.HttpsError('permission-denied', 'errors.generic');
    const userRef = access_1.db.doc(`users/${userId}`);
    const savingsRef = access_1.db.doc(`users/${userId}/savings/${savingsId}`);
    await access_1.db.runTransaction(async (tx) => {
        const [userSnap, savingsSnap, allGoalsSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(savingsRef),
            tx.get(userRef.collection('savings')),
        ]);
        const user = userSnap.data();
        const storedGoal = savingsSnap.data();
        if (!user || !storedGoal)
            throw new https_1.HttpsError('not-found', 'errors.notFound');
        const now = new Date();
        if (force !== true && isLocked(storedGoal, now))
            throw new https_1.HttpsError('failed-precondition', 'errors.savingsLocked');
        const balance = user.balance ?? 0;
        const settlement = settleMaturity(storedGoal, now);
        const goal = settlement?.goal ?? storedGoal;
        if (settlement && settlement.interest > 0) {
            writeInterestTransaction(tx, userId, settlement.interest, balance, goal, savingsId, now);
        }
        let currentAmount = goal.currentAmount ?? 0;
        const interest = proRataInterest(goal, now);
        if (interest > 0) {
            currentAmount = (0, access_1.round2)(currentAmount + interest);
            writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now);
        }
        tx.delete(savingsRef);
        tx.update(userRef, {
            balance: (0, access_1.round2)(balance + currentAmount),
            totalSavings: (0, access_1.sumSavings)(allGoalsSnap.docs.filter(d => d.id !== savingsId).map(d => d.data())),
        });
    });
    return { success: true };
});
// Locks a matured goal again for its plan's period. Locking only limits the child, so the child
// may do it as well as a parent
exports.renewSavingsGoal = (0, https_1.onCall)(async (request) => {
    const { userId: rawUserId, savingsId: rawSavingsId } = request.data ?? {};
    await (0, access_1.authorizeForChild)(request.auth, rawUserId);
    const userId = rawUserId;
    const savingsId = (0, access_1.requireDocId)(rawSavingsId);
    const userRef = access_1.db.doc(`users/${userId}`);
    const savingsRef = access_1.db.doc(`users/${userId}/savings/${savingsId}`);
    await access_1.db.runTransaction(async (tx) => {
        const [userSnap, savingsSnap, allGoalsSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(savingsRef),
            tx.get(userRef.collection('savings')),
        ]);
        const user = userSnap.data();
        const storedGoal = savingsSnap.data();
        if (!user || !storedGoal)
            throw new https_1.HttpsError('not-found', 'errors.notFound');
        const now = new Date();
        const savingsType = storedGoal.savingsType;
        const plan = typeof savingsType === 'string' && savingsType in SAVINGS_PLANS
            ? SAVINGS_PLANS[savingsType]
            : null;
        const maturityDate = toDate(storedGoal.maturityDate);
        if (!plan || plan.lockMonths <= 0 || !maturityDate || maturityDate > now) {
            throw new https_1.HttpsError('failed-precondition', 'errors.generic');
        }
        const balance = user.balance ?? 0;
        const settlement = settleMaturity(storedGoal, now);
        const goal = settlement?.goal ?? storedGoal;
        if (settlement && settlement.interest > 0) {
            writeInterestTransaction(tx, userId, settlement.interest, balance, goal, savingsId, now);
        }
        // Pay the flexible rate owed since maturity before the locked rate takes over again
        let currentAmount = goal.currentAmount ?? 0;
        let accruedInterest = goal.accruedInterest ?? 0;
        const interest = proRataInterest(goal, now);
        if (interest > 0) {
            currentAmount = (0, access_1.round2)(currentAmount + interest);
            accruedInterest = (0, access_1.round2)(accruedInterest + interest);
            writeInterestTransaction(tx, userId, interest, balance, goal, savingsId, now);
        }
        tx.update(savingsRef, {
            currentAmount,
            accruedInterest,
            interestRate: plan.annualRate,
            maturityDate: addMonths(now, plan.lockMonths),
            lastInterestAt: now,
            maturedAt: firestore_1.FieldValue.delete(),
        });
        const otherGoals = allGoalsSnap.docs.filter(d => d.id !== savingsId).map(d => d.data());
        tx.update(userRef, { totalSavings: (0, access_1.round2)((0, access_1.sumSavings)(otherGoals) + currentAmount) });
    });
    return { success: true };
});
//# sourceMappingURL=savings.js.map