---
description: Start a local static web server so the app can load JSON via fetch. Runs in the background; returns the URL to open.
argument-hint: "[port, default 5173]"
allowed-tools: Bash(python -m http.server:*), Bash(npx serve:*)
---

Start a local static HTTP server at the project root so the app can `fetch` its JSON.

$ARGUMENTS

Port defaults to `5173` if the user didn't pass one.

Prefer `python -m http.server <port>` because it's always available. If that isn't on PATH, fall back to `npx serve -l <port> .`.

Run the server in the background so it keeps serving. Then print:

```
Open http://localhost:<port> — Pocket Ledger is served from the project root.
```

**Hard constraints**
- Do not open the browser for the user.
- Do not edit any files.
- Do not install anything new (no `pip install`, no `npm install`).
- If the port is already in use, try `port+1` up to three times, then give up and report.
