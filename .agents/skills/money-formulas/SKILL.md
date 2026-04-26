---
name: money-formulas
description: Authoritative reference for every money / date formula used in Pocket Ledger. Invoke whenever the user asks to change a calculation (interest, loan remaining, net worth, current balance, transfers, dashboard deltas) or asks "how is X computed". Reading this skill first prevents re-inventing formulas that already live in js/store.js.
---

# Money-formulas skill

Pocket Ledger has **one** source of truth for money math: `js/store.js`. Read that file first. This skill summarizes what's there so you know where to look before guessing.

## Quick lookup

| Concept | Function in store.js | Formula |
|---|---|---|
| Monthly income | `totalIncome(txns)` | `Σ t.amount` where `type='income'` |
| Monthly expense | `totalExpense(txns)` | `Σ t.amount` where `type='expense'` |
| Current balance | `currentBalance()` | If any accounts: `Σ account.balance`. Else: `opening + income − expense`. |
| Net worth | `netWorth()` | `currentBalance + Σ(principal + projectedInterest over active/matured savings) + receivables − payables` |
| Account total | `totalAccountsBalance()` | `Σ account.balance` |
| Savings interest | `savingsInterestEarned(sav)` | Simple, projected at maturity (Vietnamese term-deposit convention): `principal × (rate/100) × termDays / 365`. `termDays = daysBetween(startDate, maturityDate)`. Once withdrawn, uses stored `finalInterest`. |
| Savings status | `savingsStatus(sav)` | `withdrawn` (stored flag) > `matured` (today≥maturity) > `active` |
| Total principal | `totalSavingsPrincipal()` | `Σ principal` over non-withdrawn savings |
| Total interest | `totalSavingsInterest()` | `Σ savingsInterestEarned` over non-withdrawn savings |
| Loan paid | `totalPaid(loan)` | `Σ payment.amount` |
| Loan remaining | `loanRemaining(loan)` | `max(0, principal − totalPaid)` |
| Loan status | `loanStatus(loan)` | `paid` (rem≤0) > `overdue` (due<today) > `partial` (paid>0) > `unpaid` |
| Receivable | `totalReceivable()` | `Σ loanRemaining` over lending |
| Payable | `totalPayable()` | `Σ loanRemaining` over borrowing |
| Upcoming due | `upcomingDueLoans(n)` | active loans with `daysBetween(today, due) ≤ n`, sorted by diff asc |

## Invariants that must hold

1. **Savings principal moves with the savings record**, not with transactions:
   - `addSavings` → account.balance −= principal
   - `withdrawSavings` → account.balance += principal + projectedInterest
   - `deleteSavings (not withdrawn)` → account.balance += principal
2. **Transfers keep total account balance constant.** Delete reverses.
3. **Transactions mutate the linked account's balance** when `accountId` is set (income `+=`, expense `−=`); untagged transactions feed `cashBalance` instead. See money-calculations.md.
4. **Savings interest is a fixed projection for the full locked term** — not daily-accrued. A deposit's interest only changes when the user edits principal / rate / dates.
5. **Loan remaining never goes negative** — `max(0, …)`.
6. **Once withdrawn, savings interest is frozen** — use `finalInterest`, not a recomputation.

## Why `addTransaction` doesn't mutate accounts

Deliberate design. When the user has no accounts, balance = `opening + income − expense`. When the user has accounts, the accounts are the authoritative cash position (reconciled against real banks), and transactions become a reporting layer. Wiring transactions to accounts would require `accountId` on every transaction, plus migration. Treat that as a feature request, not a bug fix.

## Dashboard delta polarity

- Income card: negative delta (income dropped) → `deltaTone = 'down'` (red arrow).
- Expense card: negative delta (expense dropped) → `deltaTone = 'up'` (green arrow).

Don't cross-apply these — the semantics are opposite.

## When the user asks to change a formula

1. Read the current implementation in `js/store.js`.
2. Read [.Codex/rules/money-calculations.md](../../rules/money-calculations.md) for the derivation.
3. Propose the change, describe which UI surfaces it affects (hero balance, stat cards, reports, loan cards, dashboard savings row).
4. Make the change in `js/store.js` **and** update `.Codex/rules/money-calculations.md` in the same commit.
5. Bump any data seed files in `data/` only if the schema changed.

## When the user asks "how is X computed"

Point at the specific function in `js/store.js:<line>` and paste the formula row from the table above. No need to re-derive it.

## Do not

- Do not re-implement any of these inside a page file. Always call `Store.*`.
- Do not introduce a new day-count convention (stay on 365).
- Do not change simple interest to compound unless the user explicitly asks — Vietnamese term deposits are typically simple interest, matching the current model.
- Do not add a new balance formula that mixes accounts and transactions — that's the combinatorial explosion we're avoiding.
