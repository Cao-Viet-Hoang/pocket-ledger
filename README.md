# Pocket Ledger

A personal finance web app built with vanilla **HTML / CSS / JavaScript** — no frameworks, no build step.

Pocket Ledger helps you keep track of:

- the real amount of cash you currently have
- your income and expenses
- money people owe you (lending)
- money you owe to other people (borrowing)
- the people involved in your finances
- insights, trends and category breakdowns

## Features

1. **Dashboard** — balance, monthly income/expense, receivables/payables, recent transactions and upcoming due loans.
2. **Transactions** — full history with search, type / category / date-range filters and sort.
3. **Lending** — money others owe you, with status (unpaid / partial / paid / overdue), payment history and progress.
4. **Borrowing** — money you owe, mirrored view with its own status and payment history.
5. **People** — directory of contacts with per-person receivable / payable balances and transaction count.
6. **Reports** — income-vs-expense bar chart, net cashflow line chart, spending-by-category donut and top categories breakdown.
7. **Languages** — switch between **English** and **Vietnamese** from the sidebar (persisted in `localStorage`).
8. **Responsive** — desktop sidebar, collapsed icon rail for tablets, bottom tab bar on mobile.

## Current status — UI preview

This commit contains the **full UI** wired up against mock data in `data/*.json`. All pages, charts, filters, modals, responsive states and both languages are functional visually so the UX can be reviewed before the logic (persistence / mutations) is implemented.

## Project structure

```
pocket-ledger/
├── index.html                  # App shell (sidebar + topbar + content + mobile tabbar)
├── css/
│   ├── variables.css           # Design tokens (colors, spacing, radius, shadows, type)
│   ├── base.css                # Reset, typography, utilities
│   ├── layout.css              # Sidebar, topbar, responsive grid
│   ├── components.css          # Buttons, cards, badges, forms, modal, toast, table
│   └── pages.css               # Page-specific styles (hero, loan card, charts, lists)
├── js/
│   ├── app.js                  # Bootstrap: data + i18n load, event wiring, quick-add
│   ├── router.js               # Hash router
│   ├── i18n.js                 # Translations (loads locales/*.json)
│   ├── icons.js                # SVG icon registry
│   ├── formatters.js           # Amount / date / relative-time helpers
│   ├── store.js                # Data facade + selectors (read-only for now)
│   ├── components/
│   │   ├── modal.js            # Modal + toast
│   │   ├── charts.js           # Bar / donut / line SVG charts
│   │   └── loan-view.js        # Shared UI for Lending & Borrowing pages
│   └── pages/
│       ├── dashboard.js
│       ├── transactions.js
│       ├── lending.js
│       ├── borrowing.js
│       ├── people.js
│       └── reports.js
├── data/                       # Mock data (easy to swap with real persistence later)
│   ├── categories.json
│   ├── people.json
│   ├── transactions.json
│   ├── lending.json
│   ├── borrowing.json
│   └── settings.json
└── locales/
    ├── en.json
    └── vi.json
```

## Running locally

Because the app loads JSON via `fetch`, it must be served over HTTP (opening `index.html` with `file://` will not work).

Any static server will do. For example:

```bash
# Python 3
python -m http.server 5173

# Node (if you have it)
npx serve .

# VS Code — use the "Live Server" extension
```

Then open <http://localhost:5173>.

## Next phase

Once the UI is approved, the next phase will plug in:

- Create / update / delete for transactions, loans, debts and people
- Recording payments on loans/debts (with history)
- Client-side persistence (`localStorage`) or an API of your choice
- Form validation and proper error states

All of this will drop straight into `js/store.js` and the existing page modules — the rendering layer is ready for it.
