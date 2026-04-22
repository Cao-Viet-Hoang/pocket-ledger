---
name: style-guard
description: Enforces the Pocket Ledger style bible when writing or editing JS/CSS/HTML/JSON in this repo. Invoke before producing new code or making non-trivial edits so patterns stay uniform (IIFE modules, Fmt/I18n/Icons helpers, 2-space indent, single quotes, tone classes, locale parity, no build step).
---

# Style-guard skill

Before you write or edit code in Pocket Ledger, tick through this checklist. It encodes the decisions in [.claude/rules/coding-style.md](../../rules/coding-style.md), [.claude/rules/ui-patterns.md](../../rules/ui-patterns.md), and [.claude/rules/i18n.md](../../rules/i18n.md).

## For every JS file

- [ ] Wrapped in `(function (global) { 'use strict'; … })(window);`.
- [ ] Top-of-file JSDoc block explains purpose in 1–3 sentences.
- [ ] No `import`, `export`, `require`, `class`, or npm dependency.
- [ ] 2-space indent. Single quotes. Semicolons. Template literals for HTML.
- [ ] Public API attached as `global.Name = { … }`.
- [ ] Pages: `global.Pages = global.Pages || {}; global.Pages.<route> = { render };`.
- [ ] No leftover `console.log` / `debugger`. `console.error` on caught errors only.

## For every HTML rendering

- [ ] User-visible text goes through `I18n.t('key')` or `data-i18n="key"`.
- [ ] Icons via `<span data-icon="name"></span>`, never inlined SVG.
- [ ] User-provided strings passed through `Fmt.escapeHTML(str)`.
- [ ] Amounts via `Fmt.formatAmount(n, { absolute: true })` when you're prefixing your own sign, `Fmt.formatAmount(n)` otherwise.
- [ ] Dates via `Fmt.formatDate`, `Fmt.formatDateShort`, `Fmt.formatRelative`, or `Fmt.formatDueHint` — never `new Date(s).toLocaleDateString()`.
- [ ] Tone class is one of: `income`, `expense`, `warning`, `info`, `primary`, `purple`.
- [ ] Grid class is one of the existing ones: `grid grid-2`, `grid grid-3`, `grid grid-4`, `grid grid-2-1`.
- [ ] Reuse existing components: `.card`, `.stat-card`, `.loan-card`, `.hero-balance`, `.badge`, `.chip`, `.toolbar`, `.section-header`, `.empty`.

## For every new user-facing string

- [ ] Added to **both** `locales/en.json` and `locales/vi.json` in the same change.
- [ ] Placed under an existing namespace (see [.claude/rules/i18n.md](../../rules/i18n.md)) — no new top-levels without asking.
- [ ] `{placeholder}` names match exactly across locales.

## For every mutation

- [ ] Goes through `Store.*` — never call `FirebaseClient.*` from a page or form.
- [ ] Errors handled as `try { … } catch (err) { console.error(err); Toast.show(err?.message || 'Error'); }`.
- [ ] Success confirms with `Toast.show(I18n.t('toast.saved'))` or `toast.deleted`.

## For every new route

- [ ] Added to `ROUTES` in `js/router.js`.
- [ ] Sidebar `<a data-route>` added to `index.html`.
- [ ] `<script src="js/pages/<route>.js"></script>` added in the correct order (after other pages, before `js/setup.js`).
- [ ] `nav.<route>` and `page.<route>.subtitle` in both locale files.

## For every new data field

- [ ] Updated `data-model.md` schema.
- [ ] Updated at least one seed file in `data/` if relevant.
- [ ] Updated `Store` selectors / mutations.
- [ ] Updated the page that displays it.
- [ ] Added new locale keys if a new label appears.

## Anti-patterns to reject immediately

If you're about to write one of these, **stop**:

- ❌ `import … from …`
- ❌ `export default …`
- ❌ `class Page extends …`
- ❌ `fetch('https://…')` other than relative paths (`locales/…`, `data/…`) — Firebase calls go through `FirebaseClient`
- ❌ Adding `package.json`, `tsconfig.json`, `vite.config.js`, or any build artefact
- ❌ `function escapeHTML(…)` in a page — use `Fmt.escapeHTML`
- ❌ `new Date('2026-04-01')` — use `Fmt.parseDate`
- ❌ Inline English / Vietnamese strings visible to the user
- ❌ `style="color: #…"` with a hex literal instead of `var(--color-…)`
- ❌ Emojis in UI / code / commit messages (unless the user asks)

## When you deviate

Deviation is acceptable only when the user explicitly asks and accepts the trade-off. In that case, leave a one-line comment explaining *why* the deviation exists so a future reader doesn't silently "fix" it back.
