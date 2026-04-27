# Data model — Pocket Ledger

Authoritative schema of every entity, where it lives, which functions mutate it, and the invariants that must hold.

## Storage layout

All data lives under the user's Firestore root:

```
ledgers/{username}                           ← meta doc
ledgers/{username}/categories/{id}
ledgers/{username}/people/{id}
ledgers/{username}/transactions/{id}
ledgers/{username}/lending/{id}              ← payments = array field
ledgers/{username}/borrowing/{id}            ← payments = array field
ledgers/{username}/accounts/{id}
ledgers/{username}/savings/{id}
ledgers/{username}/transfers/{id}
```

Meta doc shape: `{ settings: { currency, defaultLanguage }, seededAt }`.

All collections are mirrored into `state.*` in `store.js` on load; mutations write both Firestore and the local cache, then `emit()`.

**`createdAt` invariant**: every transaction / transfer / loan / loan-payment carries a `createdAt` ISO timestamp stamped by the `add*` mutation. It's the canonical same-day tiebreaker used by list pages. On connect, `Store.backfillTimestamps()` runs after `fetchAll` and stamps any legacy record missing the field — deriving the value from the id's embedded base36 timestamp when possible, otherwise falling back to the record's `date` / `startDate` at local midnight. Idempotent.

**Account-coupling invariant**: every transaction / savings / transfer / loan / loan-payment has a non-null `accountId` (or `fromAccountId` / `toAccountId` for transfers) pointing at a real account. The system cash account `acc-cash` is seeded by `Store.seedCashAccount()` on connect (idempotent — no-op when it already exists) and acts as the default fallback whenever a form leaves the field unset. The store assumes every record is account-coupled; mutations call `applyAccountDelta(accountId, …)` directly without null-guards.

## Entity schemas

### `categories`
```json
{ "id": "food", "nameKey": "cat.food", "type": "expense", "icon": "bowl", "tone": "expense" }
```
- `type`: `'income' | 'expense'`
- `tone`: one of `income | expense | warning | info | primary | purple`
- `nameKey` must exist in **both** locale files
- Seeded from `defaults/categories.json` if empty on connect; required for the app to function

### `people`
```json
{ "id": "p-001", "name": "…", "phone": "", "note": "", "color": 1, "createdAt": "yyyy-mm-dd" }
```
- `color ∈ 1..6` — maps to `.avatar-p1`..`.avatar-p6`
- Defaults filled in `store.addPerson`

### `transactions`
```json
{ "id": "t-…", "type": "income", "amount": 25000000, "category": "salary",
  "date": "2026-04-01", "personId": null, "accountId": "acc-vcb", "note": "…",
  "createdAt": "2026-04-01T09:12:34.567Z" }
```
- `type`: `'income' | 'expense'`
- `amount`: positive integer (sign comes from `type`)
- `category`: must be an existing `categories[].id`
- `personId`: nullable
- `accountId`: **required**. Mutates `accounts[accountId].balance` (income `+=`, expense `−=`). Defaults to `Store.CASH_ACCOUNT_ID` (`acc-cash`) when the form leaves it unset.
- `createdAt`: ISO timestamp stamped by `addTransaction`. Used as the same-day
  tiebreaker when listing transactions so the most recently created appears
  first. Legacy records without this field get it backfilled on connect.
- **Invariants**:
  - `addTransaction` applies the account delta on create; `updateTransaction` rolls back
    the previous delta and applies the new one (handling `accountId` / `amount` / `type` changes);
    `deleteTransaction` rolls back the delta.

### `lending` / `borrowing`
```json
{
  "id": "l-…",
  "personId": "p-…",
  "principal": 5000000,
  "accountId": "acc-vcb",
  "startDate": "2026-02-15",
  "dueDate": "2026-05-15",
  "note": "…",
  "createdAt": "2026-02-15T09:12:34.567Z",
  "payments": [
    { "id": "lp-…", "date": "yyyy-mm-dd", "amount": 1000000, "accountId": "acc-vcb",
      "note": "…", "createdAt": "2026-03-01T10:00:00.000Z" }
  ],

  "installmentMonths": 5,
  "installmentDay": 15,
  "installments": [
    { "id": "ins-…", "dueDate": "2026-03-15", "expectedAmount": 1000000, "paymentId": "bp-…" },
    { "id": "ins-…", "dueDate": "2026-04-15", "expectedAmount": 1000000, "paymentId": null }
  ]
}
```
- `payments` is a Firestore array field, mutated via `FirebaseClient.arrayUnion` / `arrayRemove`.
- Payment id prefixes: `lp-` for lending, `bp-` for borrowing. Installment id prefix: `ins-`.
- Both the loan and each payment carry a `createdAt` ISO timestamp stamped at
  creation time. Used as the same-day tiebreaker in the payment-history list.
  Legacy records get the field backfilled on connect.
- The loan's `accountId` is the source of the principal: lending subtracts the
  principal from that account on create; borrowing adds it. **Required** — defaults to
  `acc-cash` when the form leaves it unset. Independent of each payment's own `accountId`.
- Each payment's `accountId` is **required** and mutates that account's `balance`
  (lending `+=`, borrowing `−=`). Defaults to `acc-cash` when unset.
- **Borrowing-only installment fields** (`installmentMonths`, `installmentDay`,
  `installments`) are optional. When `installmentMonths` and `installmentDay`
  are both set, `addLoan` auto-generates `installments[]` by dividing
  `principal` evenly over `months` (last slot absorbs the remainder so the sum
  equals `principal` exactly). Due dates step monthly on `installmentDay`
  starting in the month after `startDate`, capped to the last day of months
  that don't have that day (e.g. day=31 → Feb 28). Lending ignores these fields.
- Each installment slot has its own `id`, `dueDate`, `expectedAmount`, and
  `paymentId`. `paymentId` is `null` when unpaid, or the id of the fulfilling
  `payments[]` entry once paid. The actual payment amount may differ from
  `expectedAmount` (flexible payments — trả linh hoạt).
- **Invariants**:
  - `Σ payments.amount ≤ principal` is expected but not enforced; the math uses `max(0, principal − paid)` so overpayments won't produce negative remaining.
  - `addLoan` applies the principal delta on create (lending `−=`, borrowing
    `+=`). `updateLoan` rolls back the prior delta and applies the new one when
    `principal` or `accountId` changes. `deleteLoan` refunds/returns the
    principal and also unwinds every payment's delta.
  - `addLoanPayment(kind, loanId, payment, installmentId?)` applies the payment
    delta on create; when `installmentId` is supplied (borrowing-only), the
    matching schedule slot's `paymentId` is set so the row renders as paid.
    `removeLoanPayment` reverses the delta and clears any installment slot that
    pointed at the removed payment.
  - **Installment regeneration**: `updateLoan` regenerates `installments[]`
    (resetting all `paymentId` links to `null`) whenever `principal`,
    `installmentMonths`, `installmentDay`, or `startDate` changes. Existing
    `payments[]` entries remain untouched but become unlinked from the new
    schedule. Setting `installmentMonths` to `null`/`0` drops the schedule
    entirely. There is no UI to edit a single slot — wholesale regeneration
    is the only way to reshape the schedule.

### `accounts`
```json
{
  "id": "acc-cash", "name": "Cash",
  "type": "cash", "bankName": "", "accountNumber": "",
  "balance": 5000000, "icon": "wallet", "color": 1,
  "note": "", "createdAt": "yyyy-mm-dd"
}
```
- `type`: `'cash' | 'bank' | 'ewallet'`
- `balance` is the **current** balance and is mutated directly by transactions, savings (create / withdraw / delete / edit), transfers, loan principals, and loan payments.
- The system seeds an account with id `acc-cash` (locked from deletion via `Store.deleteAccount`; the UI hides its delete button) on first connect. Its `name` is localized from `account.type.cash` at seed time. After seeding, it behaves like any other account — user can rename, change icon/color, edit balance.
- **Invariant**: `balance` can go negative in the local cache if external mutations drift; the UI prevents most negative paths (transfer checks sufficient balance).

### `savings`
```json
{
  "id": "sav-001", "name": "…",
  "accountId": "acc-vcb", "principal": 50000000,
  "interestRate": 5.5, "termMonths": 6,
  "startDate": "2025-10-01", "maturityDate": "2026-04-01",
  "status": "active", "withdrawals": [],
  "note": "…", "createdAt": "yyyy-mm-dd",
  "withdrawnAt": "…", "finalAmount": 0, "finalInterest": 0
}
```
- `interestRate` is **%/year** (5.5 means 5.5%).
- `accountId` is **required**. All savings side-effects mutate that account's `balance`. Defaults to `acc-cash` when unset.
- `status` stored value is only load-bearing for `'withdrawn'`. Otherwise status is **dynamically computed** from `maturityDate` vs. today — see `store.savingsStatus`.
- `withdrawnAt`, `finalAmount`, `finalInterest` are set by `Store.withdrawSavings` and must not be edited elsewhere.
- **Invariants**:
  - Creating savings deducts `principal` from `accounts[savings.accountId].balance`.
  - Withdrawing returns `principal + projectedInterest` to the account (projected interest at maturity — see money-calculations.md).
  - Deleting an active/matured savings refunds `principal` to the account. Deleting a withdrawn one is a pure delete.
  - Editing `principal` or `accountId` on an active/matured savings rebalances
    the old and new source(s) via `Store.updateSavings` (refund old, deduct
    new). Withdrawn savings are frozen and skip the rebalance.

### `transfers`
```json
{ "id": "tf-…", "fromAccountId": "acc-vcb", "toAccountId": "acc-cash",
  "amount": 3000000, "date": "yyyy-mm-dd", "note": "…",
  "createdAt": "2026-04-23T09:12:34.567Z" }
```
- `fromAccountId` / `toAccountId` are **required** — both must be real account ids.
- **Invariant**: `fromAccountId !== toAccountId` (enforced in `Forms.transferForm`).
- `addTransfer` subtracts `amount` from `fromAccountId` and adds it to `toAccountId`. `deleteTransfer` reverses the mutation (symmetric with add).

## Cross-entity invariants (not enforced — respect them in new code)

1. **Account ↔ savings coupling.** Savings is always linked to an account. Breaking the link (e.g. deleting the account) orphans the savings — the UI tolerates it but the balance math goes slightly wrong. If you add a delete-account flow that touches savings, decide explicitly: cascade, block, or warn. Note: the cash account is locked from deletion to keep this invariant trivially safe for the default fallback.
2. **Account ↔ transaction coupling.** Every transaction is linked to an account. Mutations (`Store.addTransaction` / `updateTransaction` / `deleteTransaction`) keep the account balance consistent. If you add a delete-account flow, decide: cascade-delete linked transactions, reassign to cash, block the delete, or warn.
3. **Payments are embedded, not separate docs.** Don't split them out without a migration plan; the array-field strategy is fine for the scale of this app. Payments are linked to an account via `payment.accountId`; the same delete-account question applies.
4. **Categories are global per-user.** Deleting a category orphans any transaction using it (UI shows `—`). No delete-category flow exists yet; if you add one, warn or reassign.
5. **The cash account is system-managed.** `Store.deleteAccount` rejects `Store.CASH_ACCOUNT_ID`; the accounts page hides its delete button. Forms default to it whenever the account selector is left empty.

## Id generation

`store.genId(prefix)` → `"{prefix}-{base36 timestamp}-{5 random chars}"`. Keep using prefixes listed above so ids stay searchable / greppable.
