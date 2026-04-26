# Money calculations — Pocket Ledger

Single source of truth for every amount shown in the UI. **Always consult this file before touching a formula.** If you change a formula, update this file in the same commit.

## Primitive helpers (in `js/store.js`)

| Function | Formula | Notes |
|---|---|---|
| `totalIncome(txns?)` | `Σ t.amount where t.type === 'income'` | Defaults to `state.transactions`. |
| `totalExpense(txns?)` | `Σ t.amount where t.type === 'expense'` | Defaults to `state.transactions`. |
| `totalPaid(loan)` | `Σ loan.payments[i].amount` | Works for lending and borrowing. |
| `loanRemaining(loan)` | `max(0, loan.principal − totalPaid(loan))` | Never negative. |
| `totalAccountsBalance()` | `Σ account.balance` | Sum across all account types, including the system cash account. |
| `currentBalance()` | `totalAccountsBalance()` | Spendable money. Hero number on dashboard. Every entity is account-coupled, so this single sum is the full picture. |
| `totalReceivable()` | `Σ loanRemaining(l)` over lending | |
| `totalPayable()` | `Σ loanRemaining(b)` over borrowing | |
| `personOwedToUser(id)` | `Σ loanRemaining` over lending filtered by `personId` | Used on People page. |
| `personUserOwes(id)` | `Σ loanRemaining` over borrowing filtered by `personId` | |

## Status derivations

### `loanStatus(loan)` — priority top-to-bottom

1. `remaining ≤ 0` → **`'paid'`**
2. `dueDate < today` → **`'overdue'`**
3. `totalPaid > 0` → **`'partial'`**
4. else → **`'unpaid'`**

Paid wins over overdue (a fully-paid past-due loan shows `paid`). This is intentional.

### `savingsStatus(sav)` — priority top-to-bottom

1. `sav.status === 'withdrawn'` → **`'withdrawn'`** (stored flag, only set by `Store.withdrawSavings`)
2. `today ≥ maturityDate` → **`'matured'`**
3. else → **`'active'`**

The `status` field stored on a savings record is only load-bearing for `'withdrawn'`; every other value is recomputed on read.

## Savings interest (simple interest, projected at maturity)

```js
rate      = interestRate / 100                               // interestRate is %/year
termDays  = max(0, daysBetween(startDate, maturityDate))     // full locked term
interest  = round(principal × rate × termDays / 365)
```

- **Vietnamese term-deposit convention** — `Tiền lãi = Gốc × Lãi suất × Số ngày gửi / 365`, where "số ngày gửi" is the full locked term. Interest is the **projected amount paid at maturity**, not a daily-accrual figure. A 300M deposit at 7.95% over a 6-month (~182-day) term shows ~11.89M interest (not ~3M after 45 days).
- **Non-compounding** — simple interest, matches `tiết kiệm có kỳ hạn`.
- The value is constant for the life of an active/matured savings (principal, rate, and termDays are all fixed); it only changes when the user edits the deposit.
- Once withdrawn, `savingsInterestEarned` returns the **stored** `finalInterest` (locked in at withdrawal).
- Integer rounding happens only at the final step.

## Current balance

```js
currentBalance = totalAccountsBalance() = Σ account.balance
```

Single bucket: every entity (transaction, savings, transfer, loan, loan payment) is account-coupled. There is no free-floating cash separate from accounts — the system-managed `acc-cash` account holds physical cash like any other account. Mutations directly update `account.balance`; the live formula is just a sum.

`Store.seedCashAccount()` runs on every connect and creates `acc-cash` (id fixed, `balance: 0`) when missing. Idempotent — no-op once the account exists. Forms default to `Store.CASH_ACCOUNT_ID` whenever the user leaves the account field unset.

### Account ↔ entity coupling (mutations)

| Mutation | Side-effect on accounts |
|---|---|
| `addTransaction(data)` | `accounts[data.accountId].balance += (income? +amount : −amount)` |
| `updateTransaction(id, patch)` | Rollback prior delta on old account, apply new delta on new account. Handles `accountId` swaps, `amount` changes, `type` flips. |
| `deleteTransaction(id)` | Undo the txn's delta on its account. |
| `addLoan(kind, data)` | `accounts[data.accountId].balance += (kind==='lending' ? −principal : +principal)` |
| `updateLoan(kind, id, patch)` | Rollback prior principal delta on old account, apply new on new account. Handles `accountId` swaps and `principal` changes. |
| `deleteLoan(kind, id)` | Undo the principal delta (refund lending, repay borrowing) **and** unwind every payment's own delta. |
| `addLoanPayment(kind, loanId, p)` | `accounts[p.accountId].balance += (kind==='lending' ? +amount : −amount)` |
| `removeLoanPayment(kind, loanId, p)` | Undo the payment's delta on its account. |
| `addSavings(data)` | `accounts[data.accountId].balance −= principal` |
| `updateSavings(id, patch)` | Rollback prior principal on old account, deduct new on new account (only when status ≠ `withdrawn`). |
| `withdrawSavings(id)` | `accounts[sav.accountId].balance += principal + projectedInterest`. Stamps `finalInterest` / `finalAmount`. |
| `deleteSavings(id)` | Refund principal to source account if not yet withdrawn. |
| `addTransfer(data)` | `from.balance −= amount; to.balance += amount`. Same-source rejected by `Forms.transferForm`. |
| `deleteTransfer(id)` | Symmetric reverse of add. |
| `addAccount` / `updateAccount` | Plain CRUD on `account.balance`; no cross-entity effects. |
| `deleteAccount(id)` | Throws if `id === Store.CASH_ACCOUNT_ID`. Otherwise removes the account; linked records are left dangling (no cascade today). |

Helpers (`txnAccountDelta`, `loanAccountDelta`, `paymentAccountDelta`) return the signed delta a record contributes to its account, so the mutations stay symmetric.

## Net worth (dashboard / analytics)

```js
netWorth = currentBalance()                                        // Σ account.balance
         + Σ (principal + projectedInterest) over non-withdrawn savings
         + totalReceivable()
         − totalPayable();
```

- No double counting: the savings principal is subtracted from its source account when created (`addSavings` side-effect). Adding principal back via `Σ non-withdrawn savings.principal` correctly reclassifies it as "locked wealth" instead of "spendable balance".
- Loans are handled symmetrically: lending subtracts the principal from its source on create, borrowing adds it. `totalReceivable` / `totalPayable` then represent the IOU value on top of the already-adjusted `currentBalance`, so netWorth stays invariant across the full loan lifecycle (lend → receive payments → fully paid).
- Interest in `netWorth` is **projected at maturity** (same formula as the savings card / hero) — forward-looking wealth on the assumption the deposit is held to term.

## Transfers

A transfer moves `amount` between two accounts. Both sides are required and must be different.

```js
addTransfer:     fromAccount.balance −= amount;
                 toAccount.balance   += amount;
deleteTransfer:  symmetric reverse of the above
```

Guarded by `Forms.transferForm`:
- same-source rejected
- insufficient balance rejected (reads `fromAccount.balance`)
- form requires at least **two** accounts to open (cash account is always one of them after migration; the other is something the user has created)

Total wealth (`currentBalance`) is invariant across a transfer — money shifts between accounts but the sum is unchanged.

## Delta % (dashboard cards)

```js
pct = ((current − previous) / previous) × 100    // null when previous === 0
```

Tone polarity:
- **Income card**: negative delta → `'down'` icon (income dropped, bad).
- **Expense card**: negative delta → `'up'` icon (expense dropped, good).

Don't apply the income polarity to the expense card or vice versa.

## Date helpers (`js/formatters.js`)

- `Fmt.parseDate(s)` parses `'yyyy-mm-dd'` as **local** midnight — never `new Date(s)` directly.
- `Fmt.today()` returns today at local midnight.
- `Fmt.daysBetween(a, b)` = `round((startOfDay(b) − startOfDay(a)) / 86400000)`. Positive when `b > a`.
  - Uses `Math.round`, not `floor`; safe in Vietnam (no DST) but be careful if you ever port this.

## When you add a new money field

Do all three in one change:
1. Extend the entity schema in `data-model.md`.
2. Add / update the selector in `store.js` and list it here.
3. Wire it into at least one page, with locale keys in both `en.json` and `vi.json`.
