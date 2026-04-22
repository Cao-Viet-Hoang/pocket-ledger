---
description: Audit the Pocket Ledger repo for consistency gaps (routes, locales, icons, tones, Store coupling, money formulas, escapeHTML duplication, script load order) and report a punch list. Read-only — never edits files.
argument-hint: "[optional area: routes | locales | icons | formulas | all]"
allowed-tools: Read, Glob, Grep, Bash(git status:*), Bash(git diff:*)
---

Run the `consistency-checker` subagent over the Pocket Ledger repository and report back.

$ARGUMENTS

If no argument is given, run every check:

1. **Routes** — `ROUTES` in `js/router.js` ↔ `js/pages/<route>.js` ↔ sidebar `<a data-route>` in `index.html` ↔ script tag ↔ `nav.<route>` + `page.<route>.subtitle` in both locale files.
2. **Locales** — `locales/en.json` vs `locales/vi.json`: same key set, same `{placeholder}` tokens.
3. **Icons** — every `data-icon="…"` and `icon: '…'` reference resolves to an entry in `js/icons.js`.
4. **Tones** — only `income | expense | warning | info | primary | purple` appear as `circle-icon <tone>`, `badge-<tone>`, or `tone` values in `data/*.json`.
5. **Store coupling** — no page calls `FirebaseClient.*` directly; every `Store.foo(...)` call has a matching export in the facade at the bottom of `js/store.js`.
6. **Money formulas** — the functions documented in [.claude/rules/money-calculations.md](../rules/money-calculations.md) exist in `js/store.js` with matching semantics.
7. **escapeHTML duplication** — count local `function escapeHTML` definitions (Fmt.escapeHTML is canonical).
8. **Script load order** in `index.html`: icons → formatters → i18n → firebase-client → store → modal → forms → charts → loan-view → pages/* → setup → router → app.

If the user passed an area name, run only that one.

Output format: one section per check, each bullet ≤ one line, plus a one-sentence summary at the end ("All consistent" / "N gaps found — …").

**Hard constraints**
- Do not edit files. This is an audit only.
- Do not run any dev server or network call.
- Do not guess; if something is ambiguous, report it as a gap.
