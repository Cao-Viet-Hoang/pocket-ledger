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

## Savings interest (simple interest, daily accrual)

```js
rate      = interestRate / 100            // interestRate is %/year
end       = min(today, maturityDate)      // stops accruing at maturity
days      = max(0, daysBetween(startDate, end))
interest  = round(principal × rate × days / 365)
```

- **Non-compounding** — matches Vietnamese term-deposit convention.
- Once withdrawn, `savingsInterestEarned` returns the **stored** `finalInterest` (locked in at withdrawal).
- Integer rounding happens only at the final step.

## Current balance — **two modes**

```js
currentBalance = accounts.length > 0
  ? totalAccountsBalance()
  : openingBalance + totalIncome() − totalExpense();
```

- **If any accounts exist**, accounts are the authoritative cash position and transactions are ignored for balance purposes.
- **If no accounts**, we fall back to a journal-style balance using the opening balance from settings + income/expense.

### Why transactions don't touch accounts

This is a deliberate design choice, not a bug:

- Users in the early phase of the app often just want to log income/expense without modeling their accounts.
- Users who do set up accounts treat `balance` as the truth (they reconcile it to their real bank balance).
- Wiring transactions to accounts would require every transaction to have an `accountId`, plus migration + UI changes. When/if that happens, update this file and make the coupling enforceable (require `accountId` on transactions, mutate the account in `Store.addTransaction`).

If the user asks to link transactions to accounts: treat it as a feature, not a fix. Plan it.

## Net worth (dashboard / analytics)

```js
netWorth = totalAccountsBalance()
         + Σ (principal + accruedInterest) over non-withdrawn savings
         + totalReceivable()
         − totalPayable();
```

- No double counting: savings principal is already **subtracted** from the source account on create.
- Interest in `netWorth` is **accrued-to-date**, not final.

## Transfers

```js
addTransfer:     from.balance −= amount;   to.balance += amount;
deleteTransfer:  from.balance += amount;   to.balance −= amount;
```

Guarded by `Forms.transferForm`:
- same-account rejected
- insufficient balance rejected

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
