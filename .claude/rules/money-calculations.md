# Money calculations — Pocket Ledger

Single source of truth for every amount shown in the UI. **Always consult this file before touching a formula.** If you change a formula, update this file in the same commit.

## Primitive helpers (in `js/store.js`)

| Function | Formula | Notes |
|---|---|---|
| `totalIncome(txns?)` | `Σ t.amount where t.type === 'income'` | Defaults to `state.transactions`. |
| `totalExpense(txns?)` | `Σ t.amount where t.type === 'expense'` | Defaults to `state.transactions`. |
| `totalPaid(loan)` | `Σ loan.payments[i].amount` | Works for lending and borrowing. |
| `loanRemaining(loan)` | `max(0, loan.principal − totalPaid(loan))` | Never negative. |
| `totalAccountsBalance()` | `Σ account.balance` | Sum across all account types. |
| `cashBalance()` | `openingBalance + Σ income(accountId==null) − Σ expense(accountId==null) + cashSavingsAdjustment + cashTransferAdjustment + cashLoanPaymentAdjustment` | Free-floating cash. Includes savings, transfer, and loan-payment adjustments — see below. |
| `currentBalance()` | `totalAccountsBalance() + cashBalance()` | Spendable money (accounts + cash). Hero number on dashboard. |
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

## Current balance — unified formula

```js
cashSavingsAdjustment = Σ savings.finalInterest  (accountId==null AND status==='withdrawn')
                      − Σ savings.principal      (accountId==null AND status!=='withdrawn');

cashTransferAdjustment = Σ amount  (fromAccountId!=null AND toAccountId==null)   // account → cash
                       − Σ amount  (fromAccountId==null AND toAccountId!=null);  // cash → account

cashLoanPaymentAdjustment = Σ payment.amount  (loan in lending  AND payment.accountId==null)   // received in cash
                          − Σ payment.amount  (loan in borrowing AND payment.accountId==null); // paid in cash

cashBalance    = openingBalance
               + Σ income(accountId==null) − Σ expense(accountId==null)
               + cashSavingsAdjustment
               + cashTransferAdjustment
               + cashLoanPaymentAdjustment;

currentBalance = totalAccountsBalance() + cashBalance;
```

Two disjoint buckets feed the hero:

- **Accounts** — money inside tracked accounts. Mutated by `addTransaction` /
  `updateTransaction` / `deleteTransaction` whenever `accountId` is set, by
  transfers (when both sides are accounts, or on the account side of an
  account↔cash transfer), by savings side-effects (when savings has an
  `accountId`), and by loan payments (when `payment.accountId` is set — lending
  `+=`, borrowing `−=`).
- **Cash** — money outside any tracked account. Seeded by `openingBalance`,
  adjusted by every transaction whose `accountId` is `null`, adjusted by
  cash-funded savings (active/matured principal locks out of cash; withdrawn
  deposits credit their `finalInterest` back), adjusted by transfers that
  cross the account ↔ cash boundary (account→cash adds, cash→account subtracts),
  and adjusted by cash-settled loan payments (lending payment adds, borrowing
  payment subtracts).

A stored transaction / savings / transfer / loan-payment without an
`accountId` field (or where the transfer side is `null`) is treated as cash so
pre-coupling data keeps working without migration.

### Transaction ↔ account coupling

| Mutation | Side-effect on accounts |
|---|---|
| `addTransaction(data)` | If `data.accountId`, `account.balance += (income? +amount : −amount)` |
| `updateTransaction(id, patch)` | Rollback prior delta on old account, apply new delta on new account. Handles `accountId` swaps, `amount` changes, `type` flips, and `null ↔ acc-*` transitions. |
| `deleteTransaction(id)` | If the record had `accountId`, undo its delta. |

Helper: `txnAccountDelta(txn)` returns the signed amount a txn contributes to its
linked account (`0` when unlinked), so the mutations stay symmetric.

### Loan payment ↔ account coupling

| Mutation | Side-effect on accounts |
|---|---|
| `addLoanPayment(kind, loanId, p)` | If `p.accountId`, `account.balance += (kind==='lending' ? +amount : −amount)` |
| `removeLoanPayment(kind, loanId, p)` | If `p.accountId`, undo its delta. |
| `deleteLoan(kind, id)` | Unwind every payment's delta on its linked account before deleting the loan. |

Helper: `paymentAccountDelta(kind, payment)` returns the signed amount a payment
contributes to its linked account (`0` when unlinked); lending adds, borrowing
subtracts.

## Net worth (dashboard / analytics)

```js
netWorth = currentBalance()                                        // accounts + cash
         + Σ (principal + projectedInterest) over non-withdrawn savings
         + totalReceivable()
         − totalPayable();
```

- No double counting: the savings principal is subtracted from its source when
  created — the source account (`addSavings` side-effect) for account-funded
  savings, or the `cashBalance` sum for cash-funded ones. Adding principal back
  via `Σ non-withdrawn savings.principal` then correctly reclassifies it as
  "locked wealth" instead of "spendable balance".
- Interest in `netWorth` is **projected at maturity** (same formula as the savings card / hero) — forward-looking wealth on the assumption the deposit is held to term.
- Cash portion of `currentBalance` is included so untagged transactions and
  cash-funded savings still count.

## Transfers

A transfer moves `amount` between two buckets. Each side is either a tracked
account (`accountId`) or `null` (the free-floating cash bucket).

```js
// When the side is an account, mutate account.balance directly.
// When the side is null (cash), the effect lives in cashBalance's
// transferAdjustment term — no direct mutation needed.
addTransfer:     if (fromAccount) fromAccount.balance −= amount;
                 if (toAccount)   toAccount.balance   += amount;
deleteTransfer:  symmetric reverse of the above
```

Allowed shapes: account → account, account → cash, cash → account.
Cash ↔ cash is impossible (same-source check rejects it).

Guarded by `Forms.transferForm`:
- same-source (including cash ↔ cash) rejected
- insufficient balance rejected (reads `account.balance` or `cashBalance()` per side)
- form requires at least one tracked account to open

Total wealth (`currentBalance`) is invariant across a transfer regardless of
shape — money shifts between `totalAccountsBalance` and `cashBalance`, but
their sum is unchanged.

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
