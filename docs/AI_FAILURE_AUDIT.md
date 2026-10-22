# AI Failure Audit

This report records failures observed while implementing and verifying this
homework. Each entry is logged before the AI is asked to fix the subtask.
Screenshots listed as verification evidence show the corrected UI; they are
not presented as screenshots of the original failure.

<!--
Copy this template for each failure (number entries 01, 02, 03, ...):

## AI Failure NN: <short title>

- **AI Prompt:** <the prompt / subtask given to the AI>
- **AI Generated Code:** <what the AI produced and why it is wrong>
- **Risk:** <impact if shipped: crash, XSS, leak, a11y, wrong state, ...>
- **Detection Method / DevTools Proof:** <console error, panel, snapshot,
  test, or git diff that exposed it>
- **Engineering Refactor / Manual Fix:** <the fix applied>
- **Verification Evidence:** <how the fix was verified; evidence/*.png>
-->

## AI Failure 01: scaffold page logs a 404 console error on every load

- **AI Prompt:** Task 0.1 Scaffold project: Vite + TypeScript, strict mode;
  no extra deps; deliverables are project config, `index.html`, `.gitignore`.
- **AI Generated Code:** `index.html` has a `<title>` and a `<main>` but no
  `<link rel="icon">`. Chrome therefore requests `/favicon.ico`, which the
  server does not have, so the app that is meant to be a clean baseline
  already emits a console error.
- **Risk:** The console is no longer clean from the first commit, so real
  errors added by later tasks are harder to spot, and the Lighthouse Best
  Practices audit "Browser errors were logged to the console" fails.
- **Detection Method / DevTools Proof:** Loaded the built app (`vite preview`,
  port 5103) in Chrome via Playwright and captured console output:
  `[console.error] Failed to load resource: the server responded with a
  status of 404 (Not Found)`. A CDP `Network.responseReceived` listener
  showed the failing URL is `http://localhost:5103/favicon.ico`. Evidence
  (local, git-ignored): `evidence/0.1-console-ax.png`, `0.1-console-ax.txt`.
- **Engineering Refactor / Manual Fix:** Added `<link rel="icon" href="data:," />`
  to the `<head>` of `index.html`, so the browser no longer requests
  `/favicon.ico`. No new file and no dependency.
- **Verification Evidence:** Rebuilt and reloaded in Chrome on port 5103: the
  console has 0 messages and a CDP network probe reports no 4xx/5xx
  response. See `evidence/0.1-console-ax-after-fix.png` and
  `evidence/0.1-scaffold-after-fix.png`.
