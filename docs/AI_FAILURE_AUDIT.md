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

## AI Failure 02: countdown freezes after back/forward cache restore

- **AI Prompt:** Task 1.3 Countdown display: `hh:mm:ss.ms` formatting as a
  pure function, `aria-live="off"`, countdown view; the timer must be cleaned
  up.
- **AI Generated Code:** `src/main.ts` registers
  `window.addEventListener('pagehide', stopCountdown, {once: true})` and
  nothing for `pageshow`. `pagehide` also fires when the page enters the
  back/forward cache, but the page is later restored with its JS state intact
  and no code restarts the timer, so the cleanup is not paired with a restart.
- **Risk:** A shopper who navigates away and presses Back sees a stale,
  frozen sale countdown that never reaches zero, on a page whose whole
  purpose is an accurate countdown. The sale would look open forever.
- **Detection Method / DevTools Proof:** Chrome with back/forward cache
  enabled (Playwright `ignoreDefaultArgs: ['--disable-back-forward-cache']`),
  `localhost:5103` -> `about:blank` -> Back. A `pageshow` listener recorded
  `persisted: true` and the countdown text stayed `00:14:59.443` after
  1.5 s while it should have advanced. The original failing run was
  recorded from the test script output; its screenshots were overwritten by
  the post-fix re-run, so the screenshots show the corrected behavior. The
  original failing output is kept in `evidence/1.3-summary-before-fix.txt`.
- **Engineering Refactor / Manual Fix:** `src/main.ts` fixes the sale end
  once (`saleEnd`), stops the timer on every `pagehide`, and on `pageshow`
  with `persisted` remounts the countdown for `saleEnd - Date.now()`. The HMR
  dispose removes both listeners. `index.html` also got a `00:15:00.000`
  placeholder so the countdown is never empty before the script runs.
- **Verification Evidence:** Same real back/forward navigation in Chrome
  (page -> `about:blank`, wait 3 s, Back): `pageshow` fired with
  `persisted: true`, the countdown went `00:14:56.047` -> `00:14:54.484`
  and matched 15 min minus the time since load within 19 ms, so the end
  time was neither frozen nor reset. Console clean; Lighthouse accessibility
  and best practices 100. See `evidence/1.3-after-back-nav-t1.png`,
  `1.3-after-back-nav-t2.png`, `1.3-summary.txt`.

## AI Failure 03: optimistic stock is derived from stale local stock

- **AI Prompt:** Task 1.8 Product and checkout UI: semantic markup, stable
  product ids as keys, delegated events, prices via
  `Intl.NumberFormat('vi-VN')`; stock must never read below zero or jump.
- **AI Generated Code:** `describeProduct()` in `src/product-view.ts` shows
  the server stock for every state except RESERVING, where it shows
  `state.stock`. The controller's local stock is never synced with rival
  purchases, so it is `initialStock` while the server has fewer units, and
  the optimistic number is wrong.
- **Risk:** The shopper clicks Reserve and the "Còn lại" figure goes up
  instead of down for the 300 to 900 ms the server takes to answer, then
  drops: a flickering, untrustworthy stock count on a page whose job is
  accurate stock.
- **Detection Method / DevTools Proof:** Chrome on `vite dev` with the real
  rivals running; a MutationObserver-style read of `.stock` around the click
  (`hw3/task-1.8c.mjs`): `sp-002` (initial 3) showed `1`, right after the
  click (status "Đang giữ hàng…") it showed `2`, after the server answered it
  showed `0`. Evidence (local, git-ignored):
  `evidence/1.8-stock-optimistic-before-fix.txt`,
  `evidence/1.8-stock-during-reserving-before-fix.png`,
  `evidence/1.8-defects-before-fix.png`.
- **Engineering Refactor / Manual Fix:** In `describeProduct()` the RESERVING
  display is now `Math.max(0, Math.min(state.stock, syncedStock - 1))`, so it is
  clamped to the server stock minus the unit being reserved and can never be
  above what was shown before the click. Unit tests cover a stale local stock.
- **Verification Evidence:** Same real-rivals repro (`task-1.8c.mjs`):
  `sp-002` showed `1` before the click, `0` while RESERVING, `0` after the
  server answered (no rise). Main 1.8 run: before 7, while RESERVING 6, after
  confirm 6. See `evidence/1.8-stock-optimistic-after-fix.txt` and
  `evidence/1.8-stock-during-reserving-after-fix.png`.

## AI Failure 04: rival messages overwrite the shopper's own notice

- **AI Prompt:** Task 1.8 Product and checkout UI, with `aria-live` status
  announcements for reservation, rollback, expiry and purchase.
- **AI Generated Code:** `refresh()` and `endSale()` in `src/main.ts` assign
  `noticeEl.textContent` for every status change of any card, including
  changes caused by rival buyers ("... đã hết hàng."). The single polite live
  region keeps only the latest message.
- **Risk:** WCAG 4.1.3 status messages are lost: the shopper's "Đã mua ..."
  confirmation, a failed-checkout warning or even "Đợt flash sale đã kết thúc."
  can be replaced within a few hundred milliseconds by an unrelated rival
  message, so screen reader users may never hear the result of their own
  action, and sighted users see it flash by.
- **Detection Method / DevTools Proof:** MutationObserver on `#notice` in the
  real Chrome run (`hw3/task-1.8.mjs`): `Đã mua Tai nghe Bluetooth.` at
  2282 ms was replaced at 2629 ms (347 ms later) by `Đèn bàn LED đã hết hàng.`
  from a rival. In the bfcache run (`hw3/task-1.8b.mjs`) a lock expiry in the
  same frame as the sale end left `Hết thời gian giữ ...` as the final
  message and the sale-end message was gone. Evidence (local, git-ignored):
  `evidence/1.8-notice-overwrite-before-fix.txt`,
  `evidence/1.8-bfcache-run1.txt`, `evidence/1.8-defects-before-fix.png`.
- **Engineering Refactor / Manual Fix:** `#notice` is now a `role="log"` with
  `aria-live="polite"` and `aria-relevant="additions"`; `notify()` appends a
  `<p>` per message (via `textContent`) and keeps the newest 5. New
  `src/announcements.ts` announces only the shopper's own FSM transitions
  (plus the sale end), so rival-caused sell-outs are no longer read out.
  DOM-free unit tests cover the filter.
- **Verification Evidence:** Real Chrome run: 9 notices, 0 rival-caused
  "đã hết hàng" messages, `Đã mua ...` still in the log 2.5 s later, log capped
  at 5. In the bfcache run the sale-end message and the lock-expiry message
  now both survive in the log. See
  `evidence/1.8-functional-results-after-fix.json` (noticeLog),
  `evidence/1.8-bfcache-after-fix.txt`, `evidence/1.8-purchased-after-fix.png`.
