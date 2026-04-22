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

Meta doc shape: `{ settings: { currency, openingBalance, defaultLanguage }, seededAt }`.

All collections are mirrored into `state.*` in `store.js` on load; mutations write both Firestore and the local cache, then `emit()`.

## Entity schemas

### `categories`
```json
{ "id": "food", "nameKey": "cat.food", "type": "expense", "icon": "bowl", "tone": "expense" }
```
- `type`: `'income' | 'expense'`
- `tone`: one of `income | expense | warning | info | primary | purple`
- `nameKey` must exist in **both** locale files
- Seeded from `data/categories.json` if empty on connect; required for the app to function

### `people`
```json
{ "id": "p-001", "name": "…", "phone": "", "note": "", "color": 1, "createdAt": "yyyy-mm-dd" }
```
- `color ∈ 1..6` — maps to `.avatar-p1`..`.avatar-p6`
- Defaults filled in `store.addPerson`

### `transactions`
```json
{ "id": "t-001", "type": "income", "amount": 25000000, "category": "salary",
  "date": "2026-04-01", "personId": null, "accountId": "acc-vcb", "note": "…" }
```
- `type`: `'income' | 'expense'`
- `amount`: positive integer (sign comes from `type`)
- `category`: must be an existing `categories[].id`
- `personId`: nullable
- `accountId`: nullable. When set, the transaction mutates `accounts[accountId].balance`
  (income `+=`, expense `−=`). When `null`, the transaction is treated as free-floating
  cash and contributes to `cashBalance` instead — see money-calculations.md.
- **Invariants**:
  - `addTransaction` applies the account delta on create; `updateTransaction` rolls back
    the previous delta and applies the new one (handling `accountId` / `amount` / `type`
    changes and `null ↔ acc-*` transitions); `deleteTransaction` rolls back the delta.
  - A missing `accountId` field on stored records is treated as `null` (backward-compatible
    with pre-coupling data).

### `lending` / `borrowing`
```json
{
  "id": "l-001",
  "personId": "p-001",
  "principal": 5000000,
  "startDate": "2026-02-15",
  "dueDate": "2026-05-15",
  "note": "…",
  "payments": [
    { "id": "lp-001", "date": "yyyy-mm-dd", "amount": 1000000, "note": "…" }
  ]
}
```
- `payments` is a Firestore array field, mutated via `FirebaseClient.arrayUnion` / `arrayRemove`.
- Payment id prefixes: `lp-` for lending, `bp-` for borrowing.
- **Invariants**: `Σ payments.amount ≤ principal` is expected but not enforced; the math uses `max(0, principal − paid)` so overpayments won't produce negative remaining.

### `accounts`
```json
{
  "id": "acc-cash", "name": "Tiền mặt",
  "type": "cash", "bankName": "", "accountNumber": "",
  "balance": 5000000, "icon": "wallet", "color": 1,
  "note": "", "createdAt": "yyyy-mm-dd"
}
```
- `type`: `'cash' | 'bank' | 'ewallet'`
- `balance` is the **current** balance and is mutated directly by transactions (when `accountId` is set), savings (create / withdraw / delete / edit), and transfers.
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
- `accountId` is nullable. When set, savings side-effects mutate that account's
  `balance`. When `null`, the savings is funded from free-floating cash and is
  reflected in `cashBalance` instead — see money-calculations.md.
- `status` stored value is only load-bearing for `'withdrawn'`. Otherwise status is **dynamically computed** from `maturityDate` vs. today — see `store.savingsStatus`.
- `withdrawnAt`, `finalAmount`, `finalInterest` are set by `Store.withdrawSavings` and must not be edited elsewhere.
- **Invariants**:
  - Creating savings with `accountId` deducts `principal` from that account.
    Creating with `accountId=null` leaves accounts untouched and is counted as
    a `-principal` term inside `cashBalance`.
  - Withdrawing with `accountId` returns `principal + projectedInterest` to the
    account (projected interest at maturity — see money-calculations.md).
    Withdrawing a cash savings (`accountId=null`) unlocks the principal back to
    cash and credits `finalInterest` to `cashBalance`.
  - Deleting an active/matured savings refunds `principal` (to the account if
    set, otherwise to cash by removing the record from the `cashBalance` sum).
    Deleting a withdrawn one is a pure delete.
  - Editing `principal` or `accountId` on an active/matured savings rebalances
    the old and new source(s) via `Store.updateSavings` (refund old, deduct
    new). Withdrawn savings are frozen and skip the rebalance.

### `transfers`
```json
{ "id": "tf-001", "fromAccountId": "acc-vcb", "toAccountId": "acc-cash",
  "amount": 3000000, "date": "yyyy-mm-dd", "note": "…" }
```
- **Invariant**: `fromAccountId !== toAccountId` (enforced in `Forms.transferForm`).
- `addTransfer` subtracts from source, adds to destination.
- `deleteTransfer` reverses the mutation.

## Cross-entity invariants (not enforced — respect them in new code)

1. **Account ↔ savings coupling.** Savings is always linked to an account. Breaking the link (e.g. deleting the account) orphans the savings — the UI tolerates it but the balance math goes slightly wrong. If you add a delete-account flow that touches savings, decide explicitly: cascade, block, or warn.
2. **Account ↔ transaction coupling.** Transactions may be linked to an account via `accountId`. Tagged transactions mutate the account balance through `Store.addTransaction` / `updateTransaction` / `deleteTransaction`. Untagged (`accountId: null`) transactions are pure cash-journal entries and feed into `cashBalance`. If you add a delete-account flow, decide: cascade-delete tagged transactions, null them out (convert to cash), block the delete, or warn.
3. **Payments are embedded, not separate docs.** Don't split them out without a migration plan; the array-field strategy is fine for the scale of this app.
4. **Categories are global per-user.** Deleting a category orphans any transaction using it (UI shows `—`). No delete-category flow exists yet; if you add one, warn or reassign.

## Id generation

`store.genId(prefix)` → `"{prefix}-{base36 timestamp}-{5 random chars}"`. Keep using prefixes listed above so ids stay searchable / greppable.
