# project-rules.md

My working contract with AI for Lab 02 HW 3. The AI must read and follow this file in full before starting any task. Sections 1-4 are my standing way of working with AI (copied from the master rules); section 5 holds the Lab 02 global rules; section 6 holds the rules specific to this homework.

---

## 1. Mandatory Workflow Contract

### Pipeline: who owns which stage

1. **Functional Slicing** (me): break requirements into small, isolated subtasks in `TASK_DECOMPOSITION.md`.
2. **Contract-First** (me): define interfaces, types, or JSDoc before asking AI to generate code.
3. **Atomic Generation** (AI): generate exactly one function or module for exactly one subtask.
4. **Independent Verification** (me): verify the output with tests, debugging tools, and `git diff`.

### Before generating

- Read `project-rules.md` first. Work only on the subtask named in the prompt; never pick up other subtasks.
- If the task is ambiguous or conflicts with these rules, stop and ask. Do not guess.
- Never change a contract I have provided.

### While generating

- Return only the requested function or module. No extra files, features, dependencies, optimizations, or refactors outside the scope.
- Do not modify code from earlier verified subtasks unless I ask.
- Follow the Code Conventions and Banned Patterns below.
- Never invent APIs. If unsure an API exists, say so explicitly.

### After generating

- Never claim the code is "tested" or "verified". Only I decide a subtask is done.
- No commit until verification is complete.
- If the output is wrong, I log it in `AI_FAILURE_AUDIT.md` first. Then the AI fixes only that subtask, based on the failure evidence I provide.

---

## 2. Roles

### AI

- Primary code generator. Follows my rules and assigned tasks strictly, with no overstepping.
- Joins project planning and documentation/specification discussions only when I ask.

### Me

- Author of the technical contracts that control AI behavior.
- Verifier and tester of everything the AI produces.
- Owner of the ideas and direction of the project: I lead, control, and confirm.

---

## 3. Code Conventions (stack-specific, adjust per project)

Current stack: TypeScript + Vite, following the Google JS/TS Style Guide.

| Item | Rule |
|---|---|
| Variables, functions, methods, properties | `camelCase` |
| Classes, interfaces, types, enums | `PascalCase` |
| Module/global constants | `UPPER_SNAKE_CASE` |
| Files, directories | `kebab-case` |
| Private fields | `private` (TS) |
| Indentation | 2 spaces, no tabs |
| Line length | 80 characters max |
| Semicolons | Required |
| Strings | Single quotes `'...'`; template literals only for interpolation |
| Variable declarations | `const` by default, `let` only when reassigning |
| TS types | Avoid `any`; use `unknown` or a specific interface/type |
| DOM | Use `textContent` or `createElement()`; never assign strings to `innerHTML` |

### Banned patterns

| Banned | Use instead |
|---|---|
| `var`, implicit globals | `const`, `let` |
| `keypress`, `e.keyCode` | `keydown`, `e.key` / `e.code` |
| Raw `innerHTML` injection | DOM APIs or text nodes |
| Inline event handlers (`onclick=...`) | Centralized event delegation |

---

## 4. Git Commit Convention

### Format

```
<type>(<scope>): <description>

[optional body: explain why]
```

### Types

| Type | Use when |
|---|---|
| `feat` | Adding a new feature or function |
| `fix` | Fixing a bug |
| `refactor` | Restructuring code without changing behavior |
| `test` | Adding or changing tests or assertions |
| `docs` | Documentation-only changes |
| `style` | Formatting only, no logic change |
| `perf` | Performance improvement |
| `chore` | Maintenance tasks (config, cleanup) |
| `build` | Build system or dependency changes |
| `revert` | Reverting a previous commit |

### Scope

The module or feature area the change touches (for example `auth`, `api`, `ui`). Keep a consistent set per project. Use `docs` for documentation files.

### Writing rules

- Subject line in imperative mood ("implement", not "implemented" or "implements").
- Lowercase, no trailing period, 72 characters max (aim for under 50).
- One subtask per commit, and only after it is verified.
- Never bundle unrelated changes into one commit.
- If a project or course mandates exact commit messages, use them verbatim.
- Write commits in English.

---

## 5. Lab 02 Global Rules (apply to every Lab 02 homework)

Source: Lab 02 slides (Modern React Architecture, Virtual DOM & State
Machines).

### Tooling

- Use a modern bundler (Vite / ESBuild) with the automatic JSX transform when
  JSX is used. Outdated Babel standalone builds are banned.
- Mandatory artifacts in `docs/`: `project-rules.md`,
  `TASK_DECOMPOSITION.md` (WBS), `AI_FAILURE_AUDIT.md`.
- Never prompt the AI with more than one subtask at a time.

### Markup and DOM

- Semantic HTML only (`<main>`, `<header>`, `<section>`, `<nav>`,
  `<button>`, ...). Div-soup is banned. Exactly one `<main>` per page.
- User-provided text is rendered through `textContent` / text nodes only
  (XSS prevention).
- Avoid layout thrashing: never interleave DOM reads (`offsetWidth`, ...) and
  DOM writes inside the same loop.

### State and rendering

- List items use a stable, unique entity id as `key`. `key={index}` and
  `key={Math.random()}` are banned.
- If React-style hooks are used: call hooks only at the top level, never
  inside conditions, loops, or nested functions.
- Props are immutable; data flows one way, parent to child.
- Async UI uses an explicit finite state machine
  (`'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'` or a stricter domain-specific
  variant). No ad-hoc boolean flag combinations.
- Optimize only after profiling (DevTools Performance / React Profiler).
  No premature `memo` / `useMemo`.

### Memory safety

- Every listener, timer, `requestAnimationFrame` loop, and subscription has a
  matching cleanup. Prefer event delegation over per-element listeners.

### Evaluation (keep the repo defensible at all times)

- Live defense (25% of the lab grade): the instructor mutates code in this
  repo, and I must diagnose, refactor, and verify in DevTools within
  1-3 minutes. Code I cannot explain or verify scores zero.
- AI failure audit (15% of the lab grade): every AI defect found is logged
  in `docs/AI_FAILURE_AUDIT.md` with DevTools proof and the manual fix.

---

## 6. HW 3 Rules: High-Concurrency Flash-Sale E-Commerce Engine

Deadline window: 1 week.

### Scope

- Vietnam mega-sale simulation (Shopee / Lazada 11.11, midnight flash sale):
  zero-drift countdown timer plus an inventory state machine.
- Starting contract from the slides:

```ts
export function createAntiDriftTimer(
  durationMs: number,
  onTick: (remaining: number) => void,
): () => void;
```

### Hard constraints

- Zero-drift timer: remaining time is always computed as
  `targetTime - Date.now()`, scheduled with `requestAnimationFrame`.
  Counting down by decrementing inside `setInterval` / `setTimeout` is
  banned. The timer returns a cleanup function that is always called.
- Optimistic inventory lock as a finite state machine covering reservation,
  lock expiry, checkout, and sold-out. Transitions are a pure function;
  invalid transitions are rejected, never silently applied.
- Optimistic updates roll back when the simulated server rejects them.
  Stock must never go below zero.
- Prices are formatted in VND with `Intl.NumberFormat('vi-VN')`.
- `docs/AI_FAILURE_AUDIT.md` must document at least 3 AI flaws (mandatory).
- At least 8 discrete commits following Conventional Commits.
