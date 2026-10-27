# Savings maturity: what happens when a lock ends

## Problem

Locked plans (`locked_2m` at 6%, `locked_6m` at 12%) pay a higher rate because the child can't touch
the money. Today nothing changes when the lock ends: `planInterest` (`functions/src/scheduled/processRecurring.ts`)
and `proRataInterest` (`functions/src/wallet/savings.ts`) both use the goal's stored `interestRate` and
never look at `maturityDate`. A matured goal can be withdrawn anytime like a flexible one, but it keeps
the locked rate forever.

## Decision (settled — don't re-open)

**Option A: at maturity the goal drops to the flexible rate, and the child can renew the lock.**

- Interest up to the maturity date is paid at the locked rate. After that the goal earns the flexible
  rate (`SAVINGS_PLANS.flexible.annualRate`, 3%).
- The money stays in the goal. It isn't paid out to the wallet and doesn't lock again on its own.
- The goal shows a "matured" badge and a **Renew** button.
- **Renew** locks the goal again for the same plan's period at that plan's rate.
- **Both the kid and the parent can renew.** Use `authorizeForChild` with no parent-only check, because
  locking only limits the child.
- Goals that matured before this change keep the extra interest they already earned (no clawback). From
  now on they earn 3%.

Rejected: auto-renewal (locks the kid's money without their choice), auto pay-out to the wallet (breaks
target goals), and 0% until the kid decides (feels like a penalty).

## Data model

Add one field to savings goal docs (`users/{uid}/savings/{id}`):

| Field | Type | Meaning |
|---|---|---|
| `maturedAt` | Timestamp, optional | Set to `maturityDate` when the goal is settled at maturity. Deleted on renew. |

- Keep `savingsType` as it was, so history still shows "6-month plan".
- At maturity, `interestRate` is overwritten with the flexible rate.
- Keep `maturityDate` as it is. `isGoalLocked` already returns false once it has passed.
- A goal is "matured" in the UI when `maturedAt` is set, or when `maturityDate <= now` (in case the
  server hasn't settled it yet).

## Settlement rule (the only fiddly part)

Write one shared server helper, e.g. `settleMaturity(goal, now)` in `functions/src/shared/` (or next to the
savings code if that fits better). It returns the interest owed at maturity and the goal updates. Callers
write the interest transaction and the updates inside their own Firestore transaction.

A goal **needs settling** when all of these hold:
- `maturityDate` is set,
- `maturityDate <= now`,
- `maturedAt` is not set.

Then:

1. **Unpaid interest before maturity** (`lastInterestAt` — or `createdAt` if missing — is before
   `maturityDate`): pay locked-rate interest pro-rata from `lastInterestAt` to `maturityDate`. Use the
   `proRataInterest` formula with `maturityDate` standing in for "now". Add it to `currentAmount` and
   `accruedInterest`, and write an `interest` transaction (`createdBy: 'system'`, `savingsId`, goal name
   as description).
2. **Legacy goals** (`lastInterestAt >= maturityDate`, because they already earned locked-rate interest
   past maturity): pay nothing. This is the no-clawback rule.
3. In both cases set:
   - `interestRate = SAVINGS_PLANS.flexible.annualRate` (server copy),
   - `maturedAt = maturityDate`,
   - `lastInterestAt = max(lastInterestAt, maturityDate)`.
4. Then run the normal interest logic on the **updated** goal data, so month boundaries after maturity
   pay the flexible rate.

Inside a transaction, merge the settlement updates with the caller's other updates into **one
`tx.update` per goal**. Remove `maturedAt` with `FieldValue.delete()`.

Call it everywhere interest is calculated, before the existing interest code:
- **`processChild`** (daily job + `syncWallet`): settle before `planInterest`. Settlement must count as
  work on its own; today the function returns early when there are no allowance or interest plans. Use
  the settled `currentAmount` in the `goalAmounts` map so `totalSavings` stays right.
- **`moveSavings`**: settle at the top for **every** direction (`in`, `deposit`, `out`), before any amount
  changes. Otherwise money deposited into a matured but unsettled goal would earn the locked rate.
- **`deleteSavingsGoal`**: settle before `proRataInterest`.
- **New `renewSavingsGoal`**: settle first (see below).

### Worked example

6-month goal at 12%, ₪100, `lastInterestAt` = Nov 1, `maturityDate` = Nov 15.

- First run on/after Nov 15:
  - Settlement pays 14 days at 12%: `100 × 0.12/12 × 14/30 ≈ ₪0.47`.
  - Then `lastInterestAt` = Nov 15, rate = 3%, `maturedAt` = Nov 15.
  - `planInterest` sees no month boundary since Nov 15, so pays nothing more.
- Dec 1 run:
  - `planInterest` sees one month boundary (Nov → Dec) and pays a full month at 3%.
  - Paying a full month for a half month is how `planInterest` already works (it counts calendar-month
    boundaries). That's existing behavior — **don't change it** in this PR.

## Renew: `renewSavingsGoal` Cloud Function

- **Input:** `{ userId, savingsId }`. Authorize with `authorizeForChild` (kid or parent).
- **Allowed only when:**
  - the goal's `savingsType` is a locked plan (`lockMonths > 0`), and
  - the goal has matured (`maturityDate <= now`).

  Otherwise throw `failed-precondition`.
- **In one Firestore transaction:**
  1. Settle maturity if needed (above).
  2. Pay flexible-rate interest owed since `lastInterestAt` (the `proRataInterest` path), so the switch
     back to the locked rate doesn't lose or double-pay anything.
  3. Update the goal:
     - `maturityDate = now + plan.lockMonths` (same month math as `createSavingsGoal`),
     - `interestRate = plan.annualRate`,
     - `lastInterestAt = now`,
     - delete `maturedAt`.
  4. Set `totalSavings` to the sum of the goals (`sumSavings` in `functions/src/shared/access.ts`).
     Interest changes the goal amount.
- Export it from `functions/src/index.ts`.
- Use the `SAVINGS_PLANS` server copy.

## Client

- `src/types/savings.ts`: add `maturedAt?: Date`. Parse it in `src/services/savings.service.ts` with
  `toDate()`.
- `src/utils/savings.ts`: add an `isGoalMatured(goal)` helper next to `isGoalLocked`.
- Service → store → component, per `CLAUDE.md`:
  - `renewSavingsGoal` in `savings.service.ts` via `httpsCallable`,
  - a `renewSavingsGoal` action in `wallet.store.ts` that refreshes the goals afterwards (same pattern as
    the other savings actions).
- **`KidSavings.tsx` and `ChildDetail.tsx`:**
  - on matured goals, show a "matured" badge and the current (flexible) rate;
  - show a Renew button that names the period and rate, e.g. "Lock again for 6 months at 12%";
  - ask for confirmation first (use the existing `Modal`).
- i18n: add matching keys to `he.json` and `en.json` (e.g. `savings.matured`, `savings.renew`,
  `savings.renewConfirm`, `savings.renewed`).
- SCSS rules in `CLAUDE.md` apply (rem/em only, logical properties, nesting, property order).

## Notifications

**Optional.** The settlement `interest` transaction is created with `createdBy: 'system'`, so
`onTransactionCreated` already sends the kid an interest push. A dedicated "your saving matured — renew?"
message is nice to have; add it only if it fits cleanly into `onTransactionCreated`.

## Out of scope

- Changing `planInterest`'s full-calendar-month behavior.
- Clawing back extra interest that legacy goals already earned.
- Firestore rules: settlement and renew run on the server, so no rule changes should be needed.
