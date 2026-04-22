# .claude/ — Pocket Ledger assistant configuration

Configuration for future Claude Code sessions working on this repo. The top-level `CLAUDE.md` is loaded on every conversation; everything in here is pulled in on demand.

## Layout

```
.claude/
├── README.md                      ← you are here
├── rules/                         ← the style bible, loaded on demand
│   ├── coding-style.md            ← JS/CSS/HTML hard rules (IIFE, 2-space, etc.)
│   ├── data-model.md              ← entity schemas + invariants
│   ├── money-calculations.md      ← every money formula in one place
│   ├── i18n.md                    ← translation key conventions
│   └── ui-patterns.md             ← reusable page/layout/form scaffolds
├── agents/                        ← task-specific subagents
│   ├── consistency-checker.md     ← read-only audit of routes/locales/icons/formulas
│   ├── page-scaffolder.md         ← scaffold a new page + route + locale keys
│   └── locale-syncer.md           ← keep en.json / vi.json in lockstep
├── commands/                      ← slash commands
│   ├── check-consistency.md       ← /check-consistency [area]
│   ├── add-page.md                ← /add-page <slug> [icon]
│   └── serve.md                   ← /serve [port]
└── skills/                        ← skills invoked automatically on trigger
    ├── money-formulas/SKILL.md    ← triggered when changing calculations
    └── style-guard/SKILL.md       ← triggered before writing/editing code
```

## How these fit together

- **CLAUDE.md** — always-on project overview. Points at the rules.
- **rules/** — the detailed style bible. Referenced from CLAUDE.md and from each agent/command. Read these when you're unsure why the codebase does something a particular way.
- **agents/** — invoked explicitly (e.g. "run the consistency-checker") or implicitly by their `description` matching the task.
- **commands/** — slash commands. Start with `/` in the Claude Code CLI.
- **skills/** — auto-loaded based on their `description`. `money-formulas` triggers when the conversation touches calculations; `style-guard` triggers before writing code.

## Keeping this folder honest

If you change a rule in code, update the matching file in `rules/` in the **same commit** — otherwise a future session will rely on a stale rule. Same goes for `money-formulas` SKILL.md when `store.js` math changes.

If you add a new top-level folder (e.g. `.claude/hooks/`), document it here.

## What is *not* in here (on purpose)

- **No `settings.json`.** Permissions stay at the user's global level unless the repo has a concrete reason to override them.
- **No `.env` / secrets.** Firebase credentials are entered at runtime in the Setup modal and persisted to the browser's `localStorage` — never committed.
- **No hooks.** The project doesn't need automated behavior wired into Stop / PreToolUse / etc. If that changes, add `hooks` to `settings.json` and document in this README.
