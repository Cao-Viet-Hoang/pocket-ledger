# Coding style — Pocket Ledger

Hard rules. Apply to every file you touch. Apply to every new file. If a rule clashes with a pattern already in the codebase, **fix the codebase** — do not invent a new style.

## JavaScript

### Module pattern
Every JS file is a self-contained IIFE attached to `window`:

```js
/**
 * One-paragraph description of what this module does.
 * List public API if non-obvious.
 */
(function (global) {
  'use strict';

  // private helpers here

  global.MyModule = { publicFn };
})(window);
```

- No ES modules, no `import`, no `export`. No CommonJS.
- No classes. Plain functions + namespaced objects.
- No TypeScript, no JSX, no Babel.
- No npm dependencies, no `package.json`, no build step.

### Formatting
- **2-space indent.** Never tabs.
- **Single quotes** for strings. Template literals for multi-line or interpolated.
- **Semicolons** at every statement end.
- Trailing commas are fine in multi-line arrays/objects but not required.
- Keep lines under ~110 chars. Soft wrap long template literals.

### Naming
- `camelCase` for variables, functions, object keys.
- `UPPER_SNAKE` only for module-level constants (`const LS_CONFIG = 'pl.fb.config';`).
- Global namespaces: `PascalCase` singular nouns (`Store`, `Forms`, `LoanView`).
- Entity id prefixes: `t-` transaction, `p-` person, `l-` lending, `b-` borrowing, `lp-`/`bp-` payments, `acc-` account, `sav-` savings, `tf-` transfer. Preserved by `genId(prefix)` in `store.js`.

### Async / errors
- Mutations in `store.js` are `async` and `await` Firestore calls, then mutate the local cache, then `emit()`.
- User-facing error handling: `try { … } catch (err) { console.error(err); Toast.show(err?.message || 'Error'); }` — the existing forms do this.
- `console.error` on caught errors is fine. **No leftover `console.log`.**

### Comments
- Every file starts with a **short JSDoc block** explaining purpose.
- Inline comments explain *why*, not *what*. If the code is self-explanatory, no comment.
- No giant banner comments, no TODO without a date + reason.

## HTML in JS

- Build markup as template literals, return a string, assign to `container.innerHTML`. Pages re-render fully; don't try to patch the DOM incrementally.
- After setting `innerHTML`, call `Icons.render(scope)` and `I18n.applyTranslations(scope)` if you injected `data-icon` / `data-i18n` attributes dynamically. (The router does this automatically for top-level page render.)
- Escape user-provided strings with `Fmt.escapeHTML(str)`. **Don't redefine `escapeHTML` locally** — fix the page if it already does.
- Use existing component classes (`.card`, `.stat-card`, `.loan-card`, `.badge`, `.chip`, `.toolbar`, `.grid.grid-*`) instead of ad-hoc inline layouts. Reach for inline `style=` only for one-off tweaks.

## CSS

- Tokens live in `css/variables.css` — always prefer `var(--color-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--fs-*)` over hardcoded values.
- Tone classes: `income`, `expense`, `warning`, `info`, `primary`, `purple`. Don't invent new tone names; extend existing ones if needed.
- Avatar colors go `avatar-p1` through `avatar-p6`. Keep this range.
- New page-specific styles go in `css/pages.css`; reusable UI in `css/components.css`.

## Dates, money, i18n

- Dates are stored as `'yyyy-mm-dd'` strings. Parse with `Fmt.parseDate(s)` — **never `new Date(s)` directly** (timezone traps).
- Money is integer VND. Display via `Fmt.formatAmount(n)`; pass `{ absolute: true }` when you're prefixing your own sign.
- Compact display (`12.3M`, `1.2B`) via `Fmt.formatCompact(n)`.
- Every visible string comes from a locale key. New keys go in **both** `locales/en.json` and `locales/vi.json` in the same change. See [i18n.md](./i18n.md).

## Don'ts

- ❌ Introduce a bundler, transpiler, or npm package.
- ❌ Add `console.log`, `debugger`, or commented-out code.
- ❌ Hardcode user-visible strings — always `I18n.t(key)`.
- ❌ Duplicate helpers that already exist in `Fmt`, `Icons`, `Modal`, `Toast`.
- ❌ Mutate `state.*` arrays from outside `store.js`.
- ❌ Call Firestore from a page or form — always go through `Store.*` so the cache + `emit()` stay consistent.
- ❌ Ship emojis in UI strings / code / commits unless the user explicitly asks.
