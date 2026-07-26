# Pre-requirements hardening plan

**Written:** 2026-07-25
**Context:** the client has seen the demo and intends to buy, but their requirements list is weeks or
months out. This plan covers what to do with that window: get the codebase into the state where
arbitrary feature work lands cleanly, without guessing at features.

---

## 1. Baseline — where the repo actually stands

Worth stating plainly, because it changes what this plan should be. The repo is already in good
shape:

| | |
|---|---|
| Source | ~13k lines TS/TSX across `src/domain`, `src/renderer`, `src/components`, `electron/` |
| Tests | 234 passing across 24 files; domain logic is genuinely well covered |
| Lint | ESLint with type-aware rules **and** React Hooks rules as errors; clean |
| Types | `strict`, no `any` escapes found; clean typecheck |
| CI/CD | PR + main verification, tag-triggered multi-platform release with asset pruning |
| Security | CSP, sandbox on, contextIsolation, navigation denied, external URLs scheme-filtered |
| Docs | `CONTEXT.md` (domain glossary + authoritative-vs-placeholder table) and 5 ADRs |
| Issues | 31 filed, 21 open, accurately triaged and labelled |

This is not a rescue job. The remaining work is a **structural** problem, not a quality problem: the
code is clean but shaped around the demo it was built for, and a few load-bearing seams will bend
badly under the first round of client requirements.

So the plan is deliberately narrow. It does three things and refuses a fourth:

1. Fix the places where **adding a feature means editing five files in lockstep**.
2. Fix the bugs that **corrupt or misrepresent data**, because those get more expensive per week.
3. Improve the **documentation and repo hygiene** that keeps the project from rotting while it waits.
4. **Not** polish behaviour the client may redefine. See §8.

---

## 2. Guiding principle

> Change the shape, not the surface.

The client's requirements will be about *what the app does*. Anything you polish now at the level of
behaviour — elevation controls, obstacle stepper limits, camera defaults — is work that may be
discarded. Anything you fix at the level of *structure, invariants, and file format* is work that
survives regardless of what they ask for.

The test for whether something belongs in this window: **would this change still have been worth
doing if the client asks for something completely different than expected?**

---

## 3. Phase 1 — Data integrity and the invariants (do first)

These are correctness problems in the model layer. They get harder to fix as more design files exist
in the wild and more code assumes the current behaviour.

### 3.1 Enforce the parts↔grid invariant mechanically — issue #11

`CONTEXT.md` names this as the codebase's most important invariant: `DesignState.grid` and
`DesignState.parts` must agree, or you get parts that render and get priced but cannot be erased or
collided with.

Right now that agreement is held by hand in every placement module. Two things:

- **`src/App.tsx:555-560` is unreachable dead code that violates the invariant.** Every branch in
  `onPlace` returns before it; if it were ever reached it would append a part to `design.parts`
  without touching the grid — precisely bug class #11. Delete it.
- Add one shared test helper — `expectGridMatchesParts(design)` — and assert it at the end of the
  existing tests in `tube-placement.test.ts`, `bend-placement.test.ts`, `terminal-placement.test.ts`,
  `free-placement.test.ts`, `erase-placement.test.ts`, `obstacle-placement.test.ts`, and
  `design-file.test.ts`. Small change, and it converts a hand-held invariant into a thing the suite
  refuses to let you break.
- Make `deserializeDesign` **report** dropped parts instead of silently discarding them
  (`designFromScene` currently swallows out-of-bounds and overlapping parts). Return the count so the
  UI can say "3 parts outside the build area were not loaded" rather than opening a quietly wrong
  design.

### 3.2 Stop shrinking the build area from silently deleting parts — issue #12

`src/App.tsx:316-332` (`updateMetadata`) drops every part outside the new bounds with no prompt.
It is undoable, which is something, but the user is not told. Route it through the existing
`ConfirmDialog` with the count. Cheap, and it stops the app from destroying work.

### 3.3 Fix the saved-file version stamp — issue #5

`src/domain/design-file.ts:17` hardcodes `APP_VERSION = "0.1.0"` while `package.json` is at `0.1.3`.
Every file ever saved is mis-attributed. Use the build-time `__APP_VERSION__` define that already
exists (`electron.vite.config.ts` injects it, `vitest.config.ts` mirrors it). Do this before the
client generates files you may later need to interpret.

### 3.4 Gate quote export behind entered pricing — issue #25, ADR-0003

The highest-consequence item in the repo. `src/data/parts.json` prices are invented placeholders;
`ExportPdfModal` will happily render them into a PDF that goes in front of a paying customer.
ADR-0003 already decided this should not be possible. Implement the decision: refuse export (or
watermark unmistakably) until the installer has entered prices in Settings.

This is worth doing now specifically because the client is evaluating the product — a quote PDF with
fictional prices escaping during their evaluation is a commercial problem, not a code problem.

### 3.5 Fix the customer-facing quote output — issues #8, #9

- **#8:** the quote PDF replaces every non-ASCII character with `-`. The company name, address, or
  customer name in a real quote will contain a character that trips this. ADR-0004 documents the
  WinAnsi constraint; the fix is to encode WinAnsi properly rather than fall back to a hyphen.
- **#9:** "Print" in the quote modal prints the entire dark app window. Currently unusable.

Both are in the one part of the app whose output leaves the building.

---

## 4. Phase 2 — Structural refactors (the core of this window)

This is where the leverage is. Each item is scored by **what it costs you when requirements arrive**.

### 4.1 Break up `src/renderer/Viewport.tsx` (1,231 lines)

The single largest maintainability blocker. It currently holds three unrelated concerns in one file:

| Concern | Roughly | Should be |
|---|---|---|
| Three.js mesh factories (`buildBlowerMesh`, `buildTerminalMesh`, `buildTubeMesh`, `buildBendMesh`, `buildObstacleMesh`, `buildGround`, `buildLabelSprite`, `buildPortGlow`, `buildLandingCellHighlight`) | lines 37–660 | `src/renderer/meshes/*.ts` — one file per part type |
| Pure interaction/geometry helpers, exported *only* so tests can reach them (`createViewportDragState`, `moveViewportDrag`, `isViewportClick`, `cellFromWorldPoint`, `clickCellForTool`, `tubeRenderSpan`, `bendRenderPath`, `disposeObject`) | scattered | `src/renderer/interaction.ts` + `src/renderer/geometry.ts` |
| The React component: scene setup, event wiring, the eight sync effects | lines 809–1231 | `Viewport.tsx`, ~300 lines |

Nothing changes behaviourally. The payoff: when the client asks for a new part type (highly likely —
the catalog is explicitly described as a placeholder that will grow), the mesh work is one new file
instead of an insertion into the middle of a 1,200-line module.

Note `bendRenderSpan` (`Viewport.tsx:221`) is only referenced by its own test — it is dead. Delete it
rather than relocate it.

### 4.2 Replace the `window` CustomEvent camera channel — issue #19

`StatusBar.tsx:200-212` drives the 3D camera by dispatching `ptsb-zoom` / `ptsb-reset-view` on
`window`; `Viewport.tsx:1040` listens. This is an untyped global side channel between two
components that are already siblings under `App`. It is invisible to TypeScript, invisible to the
test suite, and will break silently the first time either end is touched.

Replace with a `useImperativeHandle` ref on `Viewport` exposing `{ zoomBy, resetView }`, held by
`App` and passed to `StatusBar` as callbacks. Straightforward, ~30 lines, removes an entire category
of future bug.

While in there: issue #10 (reset view returns to distance 32 while the app starts at 38) is a
two-line fix in the same code — take it.

### 4.3 Make adding a part type a one-place change — `src/App.tsx`

Today, introducing a part type means editing at minimum: `types.ts` (`ToolId`, `Part`, `Ghost`), a
new `*-placement.ts` domain module, `App.tsx#ghostState`, `App.tsx#onPlace`, `App.tsx#landingCells`,
`App.tsx#toolLabelShort`, `LeftRail.tsx`, `PartThumbnail.tsx`, `Icons.tsx`, and `Viewport.tsx`'s two
mesh switches. Ten sites, held consistent by hand.

Collapse the three `App.tsx` switches into one **tool descriptor table** — a `Record<ToolId, {...}>`
mapping each tool to its `ghost`, `landingCells`, and `place` functions. The domain modules already
share a compatible result shape (`{ ok: true, design } | { ok: false, message }`), so `onPlace`
becomes:

```ts
const result = TOOLS[tool].place(design, { id: newPartId(), cell, ... });
if (!result.ok) return setErrorFlash(result.message);
commitDesign(result.design);
setAutoBuildJustRan(false);
```

replacing ~110 lines of near-identical branches. This is the change that most directly buys down the
cost of the client's feature list.

Two smaller items in the same file:

- **Group the transient placement state.** `App` holds 22 `useState` hooks. Roughly six of them
  (`tool`, `ghostRotation`, `freePlacementMemory`, `freePlacementRotation`, `obstacleDraft`,
  `hoverCell`) are one state machine — "what is the user currently placing" — and are already
  cleared together by `selectTool`. Fold them into a reducer, following the pattern
  `designHistoryReducer` already established. Leave the modal/UI booleans as `useState`; they are
  genuinely independent.
- **Extract the inline tool HUD pill** (`App.tsx:785-850`, 65 lines of nested JSX and inline styles
  inside the render) into `components/ToolHintBar.tsx`.

### 4.4 Remove the mutable pricing global — issue #17

`src/domain/app-settings.ts:126-141` holds `let priceOverrides` at module scope; `bomRows` reads it
transitively through `parts.ts#pricedEntry`. Consequences: pricing is not a function of its inputs,
the BOM cannot be tested without global setup, and test order can leak state.

Thread the effective prices through explicitly — `bomRows(design, prices)` — and let `App` pass
`settings.pricing`. This is a precondition for #25 (§3.4) being reliably enforceable, so sequence it
before that if convenient. `getPriceOverrides` is used only by its own test and can go.

The same singleton pattern in `part-registry.ts` is more defensible (the catalog genuinely is
static), but if the client's requirements include a mutable or multi-catalog part list, revisit it
then — not now.

### 4.5 Retire the `Scene` grab-bag type — issue #18

`src/types.ts:96-111` defines `Scene` with 12 fields. Nine of them — `label`, `step`, `tool`,
`ghost`, `bomOpen`, `statusOpen`, `export`, `connected`, `camera` — are never read by anything. It is
a leftover mock-prop shape from the prototype, and it is currently the prop interface for both
`Viewport` and `ViewportHUD`, which means those components advertise a dependency on state they do
not use.

Delete the dead fields and pass the four live ones (`parts`, `obstacles`, `hint`, the auto-build
summary pair) as explicit props.

### 4.6 Dead-code sweep — issue #18

One pass, then done. Confirmed dead so far: `Scene`'s nine unused fields, `bendRenderSpan`,
`getPriceOverrides`, `PARTS` (`parts.ts:13` — exported, never imported), `App.tsx:555-560`. Sweep for
the rest by hand; don't add a tool for it.

Also in scope (ADR-0001 compliance): user-facing copy must interpolate `MAX_CENTERLINE_FEET`, not
restate `300`. Still violated at `StatusBar.tsx:177`, `RightPanel.tsx:97`, and inside the warning
strings in `validation.ts:19-20`. Same for the `6ft` literal in `App.tsx:110`.

---

## 5. Phase 3 — UI layer consistency and accessibility

### 5.1 Give the UI a styling convention

There are ~225 inline `style={{...}}` objects across the components and a 110-line stylesheet that
holds only design tokens and four utility classes. The result is systematic duplication: an identical
32×32 `iconBtn` object is copy-pasted verbatim into `AboutModal`, `ConfirmDialog`, and others; every
modal hand-rolls its own overlay, panel, header, and close button.

**Recommendation: do not add a CSS framework or CSS-in-JS.** The token layer in `app.css` is good and
the design is coherent. Two targeted changes get most of the benefit:

1. Extract a single `components/Modal.tsx` shell (overlay, panel, header, close button, backdrop
   click) and adopt it in `AboutModal`, `ConfirmDialog`, `ExportPdfModal`, `SettingsModal`,
   `UpdateNotification`. Five hand-rolled dialogs become one.
2. Promote the genuinely repeated inline objects (`iconBtn`, the `kbd` chip style, panel/field
   shells) into classes in `app.css`, alongside the existing `.topbtn`. Leave one-off layout styles
   inline — chasing every one of them is churn.

### 5.2 Accessibility — issues #23, #33, #47

Worth doing now, and cheaper after §5.1 because the fixes land in one shared component:

- **#33** — the left rail tool buttons have no accessible names. The entire tool palette is
  unreachable without a mouse. This is the most serious of the three and is a handful of `aria-label`
  attributes.
- **#23** — modals lack `role="dialog"`, focus trapping, and focus restoration. Fix once in `Modal`.
- **#47** — the closed parts drawer keeps focusable buttons inside an `aria-hidden` container, which
  is an actual violation (focusable content inside `aria-hidden` is invalid, not merely suboptimal).

A procurement or IT review on the client's side is a plausible thing to hit during a purchase, and
these are the items that show up in an automated scan.

---

## 6. Phase 4 — Repo hygiene and documentation

### 6.1 Keep the repo from rotting while it waits

The dependency set was just brought current (Electron 43, TS 6, Vite 7, three 0.185). In a
months-long pause, it will drift back. Add `.github/dependabot.yml` — weekly, grouped into a single
PR for minor/patch, separate PRs for majors. Ten lines; means you return to a repo that is one review
away from current rather than six upgrades behind.

### 6.2 Add a formatter

There is no Prettier config. Formatting is currently consistent because one person wrote it all. The
moment the client's work brings a second contributor — or a different AI session — it drifts, and
diffs fill with noise. Add Prettier with a config matching the existing style (2-space, double
quotes, no semicolon changes, ~100 col), a `format` script, and a `--check` step in CI. One-time
cost, permanent.

### 6.3 Commit the agent guidance file

`.gitignore` currently excludes `AGENTS.md` and `CLAUDE.md`. Given that the next phase of this
project is explicitly AI-assisted feature work against a client spec, that guidance is
project knowledge, not personal scratch — it belongs in the repo next to `CONTEXT.md` and the ADRs.

**Decision needed from you.** If you'd rather keep personal notes out of git, the compromise is:
commit `AGENTS.md` (project conventions, pointers to `CONTEXT.md` + ADRs, the authoritative-vs-
placeholder rule, the parts↔grid invariant), keep `CLAUDE.md` ignored for personal preferences.

### 6.4 README — issue #24

The README has a logo, a one-paragraph description, and a tech-stack list. It does not say how to
install, run, test, or package. Add a short Development section (`pnpm install`, `pnpm dev`,
`pnpm test`, `pnpm lint`, `pnpm package`) and a one-line pointer to `CONTEXT.md` for domain
terminology. Keep it brief.

### 6.5 Refresh `CONTEXT.md` and the ADRs

`CONTEXT.md` is the best artifact in the repo and should stay accurate:

- The test count ("194 of them") is stale — it is 234. **Remove the number** rather than maintain it.
- ADR-0001 cites `src/App.tsx:644` and issue #26 as open; #26 is now closed and the line has moved.
  Reference symbols, not line numbers.
- The bend-footprint discrepancy note ("not the 5 cells the catalog currently claims — see #26") is
  resolved by commit `2afea1c`. Update it.

### 6.6 Write the "hard to change later" document — **new, and the highest-value doc item**

Create `docs/baked-in-assumptions.md`: a short, honest list of what the current model cannot express
without meaningful rework. Not a roadmap — a map of the blast radius, so that when the requirements
land you can size them in an afternoon instead of a week.

Candidates observed in the code:

- Exactly one blower; exactly two terminals (ADR-0002 — already flagged as a provisional v1 fence)
- Terminal 1 must be flush against the blower outlet (ADR-0001 — spec, not a fence)
- 1 cell = 1 ft, integers only; nothing off-grid or below `Y = 0`
- Axis-aligned routing only; 90° bends at a single 3 ft radius
- Single-direction system (the quote notes say so explicitly)
- One design per window; no multi-document, no recent-files
- **No selection or move.** The `cursor` tool is inert — the only way to change a placed part is to
  erase and re-place it. This is the gap most likely to appear in a client requirements list, and it
  is a substantial piece of work.
- Single build area per design, no rooms/floors/zones
- Prices are flat per-part; no quantity breaks, no labour lines, no discounts

### 6.7 Prepare the requirements intake

Create `docs/requirements/` with a stub. When the client's list arrives, the workflow is already
obvious: requirements land there, decisions that contradict a current constraint become new ADRs,
and `CONTEXT.md` gets updated in the same commit. The ADR habit is already established — this just
gives the incoming spec somewhere to live.

---

## 7. Suggested sequencing

Each phase ends green (`pnpm lint && pnpm typecheck && pnpm test`), and each numbered item is a
commit. Order matters only where noted.

| Order | Work | Rough size | Why here |
|---|---|---|---|
| 1 | §6.1 dependabot, §6.2 Prettier, §6.4 README | small | Do the tooling first so everything after is formatted and gated consistently |
| 2 | §4.6 dead-code sweep, §4.5 `Scene` type | small | Clears noise before the bigger refactors touch the same files |
| 3 | §3.1–§3.3 invariants, build area, version stamp | medium | Data integrity; the grid invariant test protects every later refactor |
| 4 | §4.4 pricing global | small | Precondition for §3.4 |
| 5 | §3.4 pricing gate, §3.5 quote PDF fixes | medium | Customer-facing output correct before any further client demo |
| 6 | §4.2 camera channel, §4.3 tool table + App state | medium | The two refactors that most reduce future feature cost |
| 7 | §4.1 Viewport split | large | Do last of the refactors — largest diff, purely mechanical, easiest to verify once the rest is stable |
| 8 | §5.1 Modal shell, §5.2 accessibility | medium | Benefits from a settled component layer |
| 9 | §6.3 AGENTS.md, §6.5 doc refresh, §6.6 assumptions, §6.7 intake | small | Write the docs last so they describe the code as it ends up |

Phase 7 (`Viewport` split) is the one item worth a dedicated branch and a careful visual check
against the running app; everything else is covered by the existing suite.

---

## 8. Explicitly deferred — do **not** do these now

These are open issues, and they should stay open. Each one is behaviour the client's requirements are
likely to redefine, so doing the work now risks throwing it away:

| Issue | Why deferred |
|---|---|
| #4 elevation shortcuts clamp to ±20, no on-screen control | The whole elevation UX may change; don't design it twice |
| #3 obstacle steppers clamp to 150 ft | Same — depends on what build areas they actually use |
| #6 unsaved-work guards, New action | Touches the file/document model, which multi-document requirements would rewrite. *(If they ask for nothing here, it's a quick fix later.)* |
| #7 save re-prompts, filename mismatch | Same file-model reason |
| #48 BOM stock-tube offcut assumption | An open question about their actual purchasing practice — this is a **requirements question, not a bug**. Add it to the list you send the client |
| #13, #14 performance (topology rebuilds, always-on RAF loop) | Real, but no user is complaining at current design sizes. Revisit if requirements bring larger systems. Note §4.3's tool table makes #13 easier when you do |
| Selection / move tooling | Big, and almost certainly in scope for the client's list. Don't guess at it |

One thing **to do** rather than defer: send the client the questions this codebase already knows it
has — #48 (offcut reuse), the two-terminal fence (ADR-0002), and whether they need selection/move.
Those answers shape the architecture, and asking early costs nothing.

---

## 9. Definition of done

The window is well spent if, when the requirements arrive:

- `pnpm lint && pnpm typecheck && pnpm test` is green, plus a formatter check
- Adding a part type touches the tool descriptor table, one domain module, and one mesh file
- The parts↔grid invariant is asserted by tests, not by discipline
- No component talks to another through `window`
- No customer-facing artifact can be produced from placeholder data
- `docs/baked-in-assumptions.md` lets you size any requirement against the current model in an
  afternoon
- Nothing was built that the requirements might not want
