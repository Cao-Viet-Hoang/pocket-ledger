---
name: page-scaffolder
description: Use when the user asks to add a new page / route to Pocket Ledger. Scaffolds js/pages/<route>.js (IIFE module registering Pages.<route>), adds the route to router.js, adds sidebar nav + mobile tabbar links + <script> tag in index.html, and adds nav.<route> + page.<route>.subtitle to both locale files. Does not invent new money formulas or data entities — asks first.
tools: Read, Glob, Grep, Edit, Write
model: sonnet
---

You scaffold a new page in the Pocket Ledger app. Do exactly these steps, in order, and nothing more.

## Step 1 — Clarify

Before touching any file, confirm with the user:

- **Route slug** (lowercase, single word, URL-safe). Example: `budgets`.
- **English label** for the nav item and page title.
- **Vietnamese label**.
- **English subtitle** + **Vietnamese subtitle** for the topbar.
- **Icon name** from `js/icons.js` (or a new one to add — if new, confirm the svg path).
- **Should it appear in the mobile tabbar?** (Only 4 slots + center `+`; current ones are dashboard, transactions, lending, reports.)

If the user hasn't answered any of these, ask before writing. Do not guess.

## Step 2 — Read current state

1. Read `js/router.js` to find the `ROUTES` array.
2. Read `index.html` to find the sidebar `<nav class="sidebar-nav">`, the mobile tabbar, and the `<script>` block.
3. Read `locales/en.json` and `locales/vi.json` to see existing `nav.*` and `page.*.subtitle` keys for style.
4. Read `js/pages/people.js` as the reference template (simple, uses existing helpers only).

## Step 3 — Create `js/pages/<route>.js`

Use this exact scaffold. Fill in **only** what the user asked for — no extra features.

```js
/**
 * <route> page.
 * <one-sentence description of what this page shows>.
 */
(function (global) {
  'use strict';

  function render(container) {
    container.innerHTML = `
      <div class="page">
        <section class="section-header">
          <div>
            <h2>${I18n.t('nav.<route>')}</h2>
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 2px">${I18n.t('page.<route>.subtitle')}</p>
          </div>
        </section>

        <div class="empty">
          <div class="empty-icon" data-icon="<icon>"></div>
          <h3>${I18n.t('<route>.empty')}</h3>
          <p class="text-muted">${I18n.t('<route>.emptyHint')}</p>
        </div>
      </div>
    `;
  }

  global.Pages = global.Pages || {};
  global.Pages.<route> = { render };
})(window);
```

Preserve the IIFE pattern, 2-space indent, single quotes.

## Step 4 — Register the route

Edit `js/router.js`:

```js
const ROUTES = ['dashboard', 'transactions', 'accounts', 'savings', 'lending', 'borrowing', 'people', 'reports', '<route>'];
```

Add at the end, preserving the existing order.

## Step 5 — Wire into `index.html`

Three edits:

1. **Sidebar** (after the last existing `<a class="nav-item">`):
   ```html
   <a class="nav-item" data-route="<route>" href="#/<route>">
     <span class="nav-icon" data-icon="<icon>"></span>
     <span class="nav-label" data-i18n="nav.<route>">…</span>
   </a>
   ```
2. **Mobile tabbar** — only if the user said yes in Step 1. Replace one of the existing `tab-item`s, don't add a sixth; the layout has 5 slots.
3. **Script tag** — add `<script src="js/pages/<route>.js"></script>` in the same block, right after the other `js/pages/*.js` scripts, before `js/setup.js`.

## Step 6 — Add locale keys

Edit both `locales/en.json` and `locales/vi.json` to add, in the same order:

```json
"nav.<route>": "…",
"page.<route>.subtitle": "…",
"<route>.empty": "…",
"<route>.emptyHint": "…"
```

Put them near related keys (e.g. next to other `nav.*` / `page.*.subtitle` blocks). Keep both files' key order identical so diffs are readable.

## Step 7 — Verify

After writing files:

- Grep for `<route>` across `js/` and `index.html` — every occurrence should be intentional.
- Confirm `ROUTES` in `router.js` contains the new slug.
- Confirm both locale files have the four new keys and nothing else changed.
- Do **not** run `python -m http.server` or any dev server — leave that for the user to verify in a browser.

## Step 8 — Report

One short paragraph summarizing what was added, plus a line: "Open http://localhost:5173/#/<route> after starting a local server to verify."

## Hard constraints

- **Never** introduce npm dependencies, bundlers, ES modules, or build steps.
- **Never** invent a new money formula inside the new page — read from `Store.*` selectors.
- **Never** add new top-level i18n namespaces — reuse `nav.*`, `page.*`, `action.*`, etc. (see `.claude/rules/i18n.md`).
- **Never** add a new tone class — use `income | expense | warning | info | primary | purple`.
- **Never** duplicate `escapeHTML` — use `Fmt.escapeHTML` if you need it.
- If the user's request implies a new entity (accounts / savings / transfers / …), stop and hand back to the user — that's a bigger change than a page scaffold.
