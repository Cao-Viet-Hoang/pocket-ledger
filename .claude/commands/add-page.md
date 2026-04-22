---
description: Scaffold a new page / route in Pocket Ledger. Creates js/pages/<route>.js, registers the route in router.js, adds sidebar + mobile tabbar entries + script tag in index.html, and adds nav.<route> + page.<route>.subtitle to both locale files.
argument-hint: "<route-slug> [icon-name]"
allowed-tools: Read, Glob, Grep, Edit, Write
---

Delegate to the `page-scaffolder` subagent to add a new page.

$ARGUMENTS

Before doing anything, confirm with the user:
- Route slug (lowercase, URL-safe).
- English + Vietnamese nav label.
- English + Vietnamese topbar subtitle.
- Icon name (must exist in `js/icons.js`, or get the svg path for a new one).
- Should it appear in the mobile tabbar? (Tabbar has 5 slots; adding a new one displaces an existing link.)

If the slug conflicts with an existing route (`dashboard`, `transactions`, `accounts`, `savings`, `lending`, `borrowing`, `people`, `reports`), stop and tell the user.

Follow the scaffolding steps in [.claude/agents/page-scaffolder.md](../agents/page-scaffolder.md). Do not invent money formulas, entities, or new tone classes.

End with a one-line summary: "Open http://localhost:5173/#/<route> after starting a local server to verify."
