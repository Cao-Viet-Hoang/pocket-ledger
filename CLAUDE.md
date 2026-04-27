# CLAUDE.md — Pocket Ledger

Personal finance web app. **Vanilla HTML / CSS / JavaScript.** No frameworks, no bundler, no build step. Data is stored in the user's own Firestore under `ledgers/{username}/*`.

## Quick start

```bash
python -m http.server 5173   # or `npx serve .`
```

Open <http://localhost:5173>. Opening `index.html` with `file://` does **not** work — the app `fetch`es JSON.

## Directory map

```
index.html          App shell (sidebar + topbar + content + mobile tabbar)
css/
  variables.css     Design tokens (colors, spacing, radius, type)
  base.css          Reset + utilities
  layout.css        Sidebar / topbar / responsive grid
  components.css    Buttons, cards, badges, forms, modal, toast, table
  pages.css         Page-specific styles (hero, loan card, charts)
js/
  app.js            Bootstrap
  router.js         Hash router (`#/route`)
  i18n.js           Translation loader (locales/*.json)
  icons.js          SVG icon registry
  formatters.js     Fmt.* helpers (amount / date / relative / daysBetween)
  firebase-client.js  Firestore wrapper
  store.js          Data facade + selectors + mutations (emits change events)
  setup.js          First-run Firebase connect modal
  components/
    modal.js        Modal + Toast
    forms.js        Create/edit forms for every entity
    charts.js       Vanilla SVG bar / donut / line charts
    loan-view.js    Shared render for Lending + Borrowing
  pages/
    dashboard.js transactions.js accounts.js savings.js
    lending.js borrowing.js people.js reports.js
defaults/           Built-in defaults seeded to Firestore on first connect (categories + settings only)
locales/            en.json + vi.json
```

## Runtime architecture

- `Store` keeps auto-connect credentials separate from the last successful setup values, so `disconnect()` stops auto-login but still prefills the setup modal with the previous username/config.

- **Global namespaces** (set on `window`): `Fmt`, `Icons`, `I18n`, `Store`, `FirebaseClient`, `Modal`, `Toast`, `Forms`, `Charts`, `LoanView`, `Pages`, `Router`, `Setup`.
- **Script order in `index.html` matters** — don't reorder without checking dependencies. Typical order: `icons → formatters → i18n → firebase-client → store → modal → forms → charts → loan-view → pages/* → setup → router → app`.
- **Reactive flow**: mutation → `Store.*` updates Firestore + local cache → `emit()` → `Store.onChange` listeners re-render (usually `Router.renderCurrent()`).
- **All pages register** as `global.Pages.<route> = { render(container) }`.

## Data model (essentials)

Stored per user at `ledgers/{username}/<collection>/{id}`:

- `categories` — `{ id, nameKey, type: 'income'|'expense', icon, tone }`
- `people` — `{ id, name, phone, note, color: 1..6, createdAt }`
- `transactions` — `{ id, type, amount, category, date, personId, accountId, note, createdAt }` (`accountId` is required — every transaction mutates that account's balance: income `+=`, expense `−=`)
- `lending` / `borrowing` — `{ id, personId, principal, accountId, startDate, dueDate, note, createdAt, payments: [{ id, date, amount, accountId, note, createdAt }] }` (the loan's `accountId` is the source/destination for the principal; each payment's `accountId` is independent and required). Borrowing-only optional fields: `installmentMonths`, `installmentDay`, `installments: [{ id, dueDate, expectedAmount, paymentId }]` — auto-generated schedule for monthly trả góp; `paymentId` links a slot to the fulfilling payment (null when unpaid).
- `accounts` — `{ id, name, type: 'cash'|'bank'|'ewallet', bankName, accountNumber, balance, icon, color, note, createdAt }`. The system seeds an account with id `acc-cash` (locked from deletion) on first connect; it is the default for any form that doesn't specify one.
- `savings` — `{ id, name, accountId, principal, interestRate, termMonths, startDate, maturityDate, status, withdrawals, note, createdAt, withdrawnAt?, finalAmount?, finalInterest? }`
- `transfers` — `{ id, fromAccountId, toAccountId, amount, date, note, createdAt }`
- User-meta doc — `{ settings: { currency, defaultLanguage }, seededAt }`

Dates (`date`, `startDate`, `dueDate`, `maturityDate`) are **`yyyy-mm-dd` strings** parsed as local time via `Fmt.parseDate`. `createdAt` is a full ISO timestamp (`new Date().toISOString()`) stamped by the `add*` mutations — used as the same-day tiebreaker in lists. `Store.backfillTimestamps()` runs on connect to stamp legacy records that predate this field. `Store.seedCashAccount()` also runs on connect: idempotent, creates `acc-cash` with `balance: 0` if missing. Money is stored as **integers** (VND has 0 decimals).

## Money formulas (see `.claude/rules/money-calculations.md` for full derivations)

| What | How |
|---|---|
| `totalAccountsBalance` | `Σ account.balance` |
| `currentBalance` | `totalAccountsBalance` — every entity is account-coupled, so the sum of account balances is the full picture |
| `savingsInterestEarned` | `principal × rate × termDays / 365` — projected interest at maturity for the full locked term (Vietnamese term-deposit convention). Once withdrawn, uses stored `finalInterest`. |
| `totalSavingsPrincipal` / `totalSavingsInterest` | excludes `status === 'withdrawn'` |
| `netWorth` | `currentBalance + activeSavings(principal + projectedInterest) + receivables − payables` |
| `loanRemaining` | `max(0, principal − Σ payments.amount)` |
| `loanStatus` | `paid` (remaining≤0) > `overdue` (due<today) > `partial` (paid>0) > `unpaid` |
| `totalReceivable` / `totalPayable` | `Σ loanRemaining` over lending / borrowing |

**Side-effects wired through `Store.*`** (every entity is account-coupled — there is no free-floating cash bucket; "cash" is just the seeded `acc-cash` account):
- `addSavings` deducts `principal` from `accounts[savings.accountId].balance`.
- `withdrawSavings` returns `principal + interest` to the source account, stamps `finalInterest` / `finalAmount`.
- `deleteSavings` refunds principal to the source account if not yet withdrawn.
- `updateSavings` rebalances when `principal` or `accountId` changes on a non-withdrawn savings (refund old, deduct new). Withdrawn savings are frozen.
- `addTransfer` / `deleteTransfer` mutate both account balances (`fromAccountId` `−=`, `toAccountId` `+=`). Same-source rejected by `Forms.transferForm`.
- `addTransaction` / `updateTransaction` / `deleteTransaction` mutate `accounts[accountId].balance` (income `+=`, expense `−=`). `updateTransaction` rolls back the previous effect before applying the new one.
- `addLoan` mutates `accounts[loan.accountId].balance` (lending `−=` principal, borrowing `+=` principal). `updateLoan` rolls back the prior delta and applies the new one when `principal` or `accountId` changes. `deleteLoan` refunds/returns the principal and unwinds every payment. For borrowing, `addLoan` also auto-generates `installments[]` when `installmentMonths` and `installmentDay` are set; `updateLoan` regenerates the schedule (resetting all `paymentId` links) when `principal` / `installmentMonths` / `installmentDay` / `startDate` change.
- `addLoanPayment(kind, loanId, payment, installmentId?)` mutates `accounts[payment.accountId].balance` (lending `+=` amount, borrowing `−=` amount). When `installmentId` is supplied (borrowing-only), the matching schedule slot's `paymentId` is set so the row renders as paid. `removeLoanPayment` reverses both the account delta and the installment link.
- `deleteAccount` rejects the cash account (`Store.CASH_ACCOUNT_ID`); the UI also hides its delete button.

## Style rules (non-negotiable)

The full rulebook lives in [.claude/rules/](.claude/rules/). The enforceable highlights:

- **IIFE module pattern**: every JS file is `(function (global) { 'use strict'; ... global.Name = {...}; })(window);`. No ES modules, no `import`/`export`.
- **2-space indent. Single quotes. Semicolons.** Template literals for HTML.
- Every module starts with a **top-of-file JSDoc block** describing its purpose.
- Use `Fmt.formatAmount`, `Fmt.parseDate`, `Fmt.daysBetween`, `Fmt.escapeHTML` — **do not reimplement locally**. (Some existing pages duplicate `escapeHTML` — if you touch that file, swap in `Fmt.escapeHTML`.)
- Render icons with `<span data-icon="name"></span>` + `Icons.render(scope)`. All user-facing strings go through `I18n.t('key')` or `data-i18n="key"`.
- Tone classes used everywhere: `income`, `expense`, `warning`, `info`, `primary`, `purple`. Stick to these — don't invent new tone names.
- Any new i18n key **must** be added to **both** `locales/en.json` and `locales/vi.json`. Namespace: `nav.*`, `page.{route}.subtitle`, `action.*`, `action.add.*`, `action.edit.*`, `action.delete.*`, `form.*`, `toast.*`, `confirm.*`, `dash.*`, `txn.*`, `cat.*`, `loan.*`, `people.*`, `reports.*`, `setup.*`, `app.*`, `time.*`, `account.*`, `savings.*`, `transfer.*`, `brand.*`.
- Router knows `['dashboard', 'transactions', 'accounts', 'savings', 'lending', 'borrowing', 'people', 'reports']` — add new routes here **and** the sidebar nav in `index.html` **and** register `Pages.<route>`.
- When adding money fields to any entity, extend `store.js` selectors + the relevant page + both locale files in the same change.
- No `console.log` left behind. `console.error` on caught errors only.
- No emojis in code/commits/UI unless the user asks.

## Doing work here

1. **Run the app locally** before calling a UI change done. Type checking doesn't exist here — verify in a browser.
2. **Edit in place.** Don't create new modules unless the task genuinely needs one. Prefer extending `store.js` / `forms.js` / `loan-view.js`.
3. **Preserve the IIFE pattern** even for small helper files.
4. **Don't introduce a build step, bundler, npm dependency, or framework.** This is intentional.
5. **When in doubt about a money formula**, read `store.js` first — don't reinvent it in a page.
6. **All code must be written in English** — variable names, function names, comments, JSDoc blocks, inline strings (except locale values in `locales/*.json`). No Vietnamese in source code.
7. **Keep docs in sync.** Whenever you add a route, entity, money formula, style rule, data field, or module, update `CLAUDE.md` and the relevant file(s) under `.claude/rules/` in the same change so they always reflect the actual codebase.

See [.claude/rules/](.claude/rules/) for the deep-dive rules and [.claude/agents/](.claude/agents/) for task-specific subagents.
