# TASK_DECOMPOSITION.md: HW 3 High-Concurrency Flash-Sale E-Commerce Engine

Work Breakdown Structure. One row = one atomic subtask = one AI prompt = one
verified commit. Tick a task only after I have verified it. Minimum 8
commits (Conventional Commits) are mandatory for this homework.

**Level:** Core = must master and implement myself; Awareness = understand
for debugging/lookup (Lab 02 3-tier taxonomy). **Commit** messages are used
verbatim.

| Task | Level | Scope | Constraint | Commit | Deliverables |
|---|---|---|---|---|---|
| - [x] 0.1 Scaffold project | Awareness | build | Vite + TypeScript, strict mode; no extra deps | `build(setup): scaffold vite typescript project` | project config, `index.html`, `.gitignore` (`evidence/`, `node_modules/`, `dist/`) |
| - [x] 1.1 Define domain contract | Core | contract | `Product`, inventory state union, inventory events; prices in VND integers | `feat(contract): define product and inventory types` | `src/types.ts`, mock catalog `src/data.ts` |
| - [x] 1.2 Anti-drift timer | Core | timer | `targetTime - Date.now()` + `requestAnimationFrame`; no `setInterval` countdown; returns cleanup | `feat(timer): implement anti-drift countdown` | `src/anti-drift-timer.ts` |
| - [x] 1.3 Countdown display | Core | ui | `hh:mm:ss.ms` formatting as a pure function; `aria-live="off"` to avoid screen reader spam | `feat(ui): render sale countdown` | `src/format-time.ts`, countdown view |
| - [x] 1.4 Inventory state machine | Core | inventory | Pure `transition(state, event)`; invalid transitions rejected; stock never < 0 | `feat(inventory): implement inventory state machine` | `src/inventory-machine.ts` |
| - [ ] 1.5 Mock sale server | Core | api | Simulated latency and random rejection; returns promises; deterministic seed for tests | `feat(api): add mock flash sale server` | `src/mock-server.ts` |
| - [ ] 1.6 Optimistic lock and rollback | Core | inventory | Reserve locally first; roll back on server rejection | `feat(inventory): add optimistic lock with rollback` | reservation flow |
| - [ ] 1.7 Lock expiry | Core | inventory | Expiry uses anti-drift timer; expired lock releases stock; timer cleaned up | `feat(inventory): expire reservation locks` | expiry logic |
| - [ ] 1.8 Product and checkout UI | Core | ui | Semantic markup; stable product ids as keys; delegated events; prices via `Intl.NumberFormat('vi-VN')` | `feat(ui): assemble flash sale product and checkout ui` | `src/main.ts`, `src/styles.css` |
| - [ ] 1.9 AI failure audit | Core | docs | >= 3 entries with DevTools proof and manual fix | `docs(audit): document ai failure modes` | `docs/AI_FAILURE_AUDIT.md` (screenshots stay in local git-ignored `evidence/`) |
| - [ ] 1.10 README | Awareness | docs | How to run, state diagram, timer design | `docs(readme): document usage and state machine` | `README.md` |
