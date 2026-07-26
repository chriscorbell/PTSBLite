# PTSBuilder pre-requirements hardening plan

- **Status:** In progress — PRs 1–3 of the sequence below are merged or open.
- **Written:** 2026-07-25
- **Baseline:** `main` at `2afea1c` (`v0.1.3`)
- **Supersedes:** `docs/plans/o5/README.md` (Claude Opus 5) and `docs/plans/g5-6/README.md`
  (GPT-5.6-Sol), written independently and then reconciled across two rounds of review. Those two
  remain only as a record of the disagreements; this file is the plan of record.

Where the source plans conflicted, the merged position and its reasoning are stated inline rather
than hedged — see §2 (file lifecycle), §5.2 and §8 (performance), §6 (tool dispatch), §7.2
(formatter). Every code claim below was verified against the working tree at `2afea1c`.

## Purpose

The client has seen the demo and intends to buy. Their requirements are weeks or months out. This
plan covers what to do with that window: make the product safer and cheaper to change, without
guessing at the requirements and without turning a healthy prototype into a framework.

**Guiding principle: change the shape, not the surface.** The requirements will be about *what the
app does*. Anything polished now at the level of behaviour may be discarded. Anything fixed at the
level of structure, invariants, and file format survives regardless of what they ask for.

The test for inclusion: *would this still have been worth doing if the client asks for something
completely different than expected?* Data-loss bugs, split-brain state, and fake prices reaching a
customer pass that test. Elevation UX does not.

Line count, test count, and dependency freshness are not goals.

## Baseline

This is a healthy codebase, not a rescue project.

| Area | Audited state |
|---|---|
| Application code | 42 non-test TS/TSX files, ~9,340 lines |
| Tests | 24 files, ~3,613 lines, 234 passing |
| Type safety | TypeScript `strict`; type-aware ESLint plus React Hooks rules as errors |
| Local gates | `lint`, `typecheck`, `test`, `build` all pass |
| CI/CD | PR and `main` green; tags build and publish on three operating systems |
| Architecture | Pure domain modules, React UI, Three.js renderer, isolated Electron main/preload |
| Product knowledge | Strong glossary in `CONTEXT.md`; five useful ADRs |
| Security | Sandbox, context isolation, CSP, navigation denial, web-only external URLs |
| Backlog | 21 open issues, most with concrete evidence and suggested fixes |

The risk is concentrated in five places:

- `src/App.tsx` (~900 lines) owns document lifecycle, editor interaction, placement, keyboard
  commands, settings, updates, auto-build, and all top-level presentation state.
- `src/renderer/Viewport.tsx` (~1,230 lines) mixes mesh factories, GPU resource ownership, pointer
  and camera interaction, scene setup, and React synchronization.
- `DesignState.parts` and `DesignState.grid` can disagree when rebuilt from invalid input — the
  invariant `CONTEXT.md` itself names as the most important in the codebase.
- Pricing is hidden mutable module state, despite being customer-facing output.
- The file lifecycle models no current path, no Save As, no New, and no close-with-unsaved-work.

Everything else should change only as the work below requires.

## Working rules

1. **One focused issue or tightly related cluster per PR.** Keep behaviour changes separate from
   mechanical moves where practical.
2. **Preserve the domain layer.** No React, no Three.js. Validate external data at entry; do not
   scatter defensive re-checks over already-valid domain state.
3. **Prefer deep modules.** Extract when a module can hide a coherent workflow behind a small
   interface. Do not split a file merely to make it shorter.
4. **Keep explicit domain differences explicit.** Blower, terminal, tube, bend, and obstacle
   placement have materially different rules. Do not force them through a generic tool interface
   full of optional arguments and casts.
5. **Test observable behaviour at the owning interface.** Do not preserve tests of internals once a
   deeper interface covers the same behaviour.
6. **Finish every PR green** — lint, typecheck, test, build. Add a real desktop smoke test when a PR
   touches Electron, Three.js lifecycle, native dialogs, or packaging.
7. **Do not mix feature guesses into hardening.** Unknown commercial and engineering rules become
   recorded questions, not invented implementation.

---

## Phase 0 — Decisions only the owner can make

No code. These are business-sensitive and must be settled before client delivery; they do not block
Phases 1–7.

1. **Repository visibility and licence.** GitHub currently reports the repo as **public under
   GPL-3.0** (verified). That is a poor fit for selling the software to a client, and GPL-3.0 in
   particular obliges you to license derivative distribution under the same terms. Confirm this is
   intended. If proprietary delivery, dual licensing, or transfer of ownership is intended, get
   legal advice and confirm ownership of all contributions **before** changing anything — do not
   rewrite public history or flip visibility as a casual cleanup step.
2. ~~**Code signing.**~~ **Decided 2026-07-26: ship unsigned, buy no certificates** — see
   ADR-0006. The buyer is a single small business on Windows, where the cost is one SmartScreen
   prompt at first install and in-app updates never re-warn. macOS builds continue but have no
   self-update. Revisit if the software is sold beyond one customer or a customer's IT policy blocks
   unsigned executables.
3. **Repository settings.** `main` is currently unprotected, and GitHub vulnerability alerts and
   automated security fixes are disabled. See §§7.3–7.4.
4. **Requirements ledger.** Create `docs/requirements/open-questions.md` and seed it with the
   questions this codebase already knows it has (§9).

**Done when:** every commercially sensitive decision is explicit, and no engineer has to infer a
business rule from prototype behaviour.

---

## Phase 1 — Make invalid design state impossible to accept silently

### 1.1 Metadata drift and dead configuration — issues #5, #18

Small, mechanical, and it clears noise from every file the later phases touch.

- **Fix the saved version stamp.** `src/domain/design-file.ts:17` hardcodes `APP_VERSION = "0.1.0"`
  while `package.json` is at `0.1.3`; every file ever saved is mis-attributed. Pass the version into
  serialization as a typed input rather than reaching for the ambient `__APP_VERSION__` bundler
  global — the domain layer should not depend on a build define.
- **Remove the duplicated defaults.** `src/App.tsx:87-88` defines `FILE_NAME`/`FILE_REVISION`,
  duplicating `DEFAULT_FILENAME`/`DEFAULT_REVISION` at `src/domain/design-state.ts:11-12`. Import
  the domain constants.
- **Delete the unreachable placement fallback at `src/App.tsx:555-560`.** Every branch in `onPlace`
  returns before it. If it ever became reachable it would append to `parts` without touching the
  grid — precisely the split-brain bug of §1.2. It is dead code that encodes the wrong invariant.
- **Confirmed dead code to remove:** the nine unread fields of `Scene` (`src/types.ts:96-111` —
  `label`, `step`, `tool`, `ghost`, `bomOpen`, `statusOpen`, `export`, `connected`, `camera`);
  `bendRenderSpan` (`Viewport.tsx:221`, referenced only by its own test); `getPriceOverrides`;
  `PARTS` (`parts.ts:13`, exported and never imported); and the `autoBuildPulse` prop
  (`Viewport.tsx:769`, declared and passed by `App` but never destructured or used — only asserted
  in a test).
- **Make differing defaults deliberate.** One auto-build default, one camera framing default (the
  app starts at distance 38 but reset goes to 32 — issue #10).
- **ADR-0001 compliance.** User-facing copy must interpolate engineering constants, not restate
  them. Still violated at `StatusBar.tsx:177`, `RightPanel.tsx:97`, the warning strings in
  `validation.ts:19-20`, and the `6ft` literal in `App.tsx:110`.

### 1.2 One checked reconstruction interface — issue #11

Today `deserializeDesign` hands parts to `designFromScene`, and `buildGrid`
(`src/domain/design-state.ts:26-56`) degrades in two different, equally undesirable ways:

- **Silent split-brain.** Out-of-bounds cells, and already-occupied cells for tubes, bends, and
  obstacles, are skipped by a `withinBounds`/`!query` guard. The part still renders and still gets
  priced — it just cannot be erased or collided with.
- **An uncaught throw.** Blower and terminal cells are registered with a bare
  `grid.place(cell, p.id)` and *no* occupancy guard, and `SparseGrid.place` throws on an occupied
  cell. So a file containing two overlapping terminals does not degrade — it crashes the load.

One seam should decide, deliberately, which of accept / reject / repair applies. Neither current
behaviour was chosen.

Create **one** design-reconstruction module that owns these facts:

- every part and obstacle footprint lies inside the configured build area;
- no two occupants claim the same cell;
- `parts`, `obstacles`, and `grid` are rebuilt together;
- failure identifies the offending item and the reason.

`deserializeDesign` returns a typed failure for invalid geometry rather than quietly degrading.
Known-valid internal rebuilds may share the implementation, but **there must not be a second,
permissive path**.

Tests: out-of-bounds part, overlapping parts, out-of-bounds obstacle, obstacle/part overlap, and a
valid round trip. Add a reusable `expectGridMatchesDesign(design)` assertion — it must check
`parts`, `obstacles`, **and** `grid` agree, not parts alone, since obstacles occupy cells too — and
apply it across the placement, erase, and obstacle-placement suites. This converts a hand-held
invariant into one the suite refuses to let you break.

Do not add a schema-validation dependency. The existing hand-written parsers are small and readable;
extend them at the geometry seam.

### 1.3 Derive editing bounds from the design — issues #3, #4, #12

The **valid coordinate range is a bug; the control design is UX.** Fix the former now, defer the
latter (§8).

- Clamp obstacle base and height in the domain helpers against the design's build area. The HUD must
  display the same limits — it currently advertises a hardcoded 150 ft the domain will reject.
- Clamp active placement elevation to `[GROUND_PLANE_Y, buildArea.height - 1]`. It currently clamps
  to a hardcoded ±20 and permits below-ground values, contradicting the build-area model.
- Re-clamp active elevation and any in-progress obstacle draft after a build-area change.
- **Preflight build-area shrink** (`App.tsx:316-332`): show how many parts and obstacles would be
  removed, require confirmation through the existing `ConfirmDialog`, and commit resize plus removal
  as one undoable action. Cancel must leave the design untouched.

**Done when:** no file load, area resize, or placement control can leave domain objects and grid
occupancy disagreeing, and tests fail if that regresses.

---

## Phase 2 — Give the design document a real lifecycle — issues #6, #7

*This was the sharpest disagreement between the two source plans and it resolved in favour of doing
it now.* Unconfirmed loss of dirty work is a data-loss bug, not a UX preference, and the shape of the
fix is stable under the storage models a client might ask for: multi-document makes the session
per-document; a project folder changes where it saves, not the need for a saved checkpoint, guarded
replacement, Save As, and close coordination. Build it **deliberately single-document** and add no
speculative project or recent-files abstraction.

Deepen the current design-history reducer and loose `dirty` boolean into one document-session module
exposing: current design/history, current path and display filename, clean/dirty state, and
`new` / `open` / `save` / `saveAs` / `undo` / `redo` / guarded-replace / guarded-close.

1. History, current path, and saved checkpoint move together. **Derive** dirty from the checkpoint
   rather than toggling a boolean across a dozen unrelated callbacks.
2. Canonical extension `.ptsb` — the domain and UI already use it, while the Electron dialogs filter
   on `json`. Keep accepting `.json` on Open for prototype files already in the wild.
3. Save overwrites the known path; Save As and first Save prompt. Opening or saving updates the
   displayed filename from the chosen path without creating a surprising undo step.
4. Add File → New and File → Save As. Every destructive replacement uses the app-native
   `ConfirmDialog` — `App.tsx:603` currently uses raw `window.confirm`.
5. Guard window close/quit through a typed renderer↔main handshake, with one explicit allow-close
   path so a confirmed close cannot loop back into the prompt.
6. **Define IPC channel names and result types once**, in an Electron-neutral module consumed by
   main, preload, renderer, and the existing in-memory test adapter. Scope is **all** IPC — design,
   settings, quote, update, and the new close handshake — not just the file channels; a contract
   covering half the surface leaves the same drift it was meant to prevent. This is a real seam,
   not speculative indirection.
7. Surface read/write/settings errors to the user. `setSettings` failures are currently swallowed.

Tests: first Save, subsequent Save, Save As, cancel, Open when clean and when dirty, New, filename
sync, history reset, close confirmation. Native dialogs and close behaviour need a manual desktop
check — the DOM test environment cannot prove them.

**Done when:** the file commands behave conventionally and no unconfirmed path discards dirty work.

---

## Phase 3 — Make every commercial output explicit and trustworthy

The highest-consequence phase: this is the only part of the app whose output leaves the building, and
it is currently capable of putting invented numbers in front of a paying customer **while the client
is evaluating the product**.

### 3.1 Remove ambient pricing — issues #17, #25 (do together; same path)

- Delete the mutable module-level overrides at `src/domain/app-settings.ts:126-141`. Make
  `bomRows(design, pricing)` a pure function of explicit inputs.
- **Remove the invented prices from the shipped catalog.** Represent an unset price as an explicit
  state — not zero, and not a plausible-looking fallback. ADR-0003 already decided this; implement
  the decision rather than gating a catalog that still contains fiction.
- Hold settings in a loading state until the persisted result is known, so no placeholder price is
  ever rendered during startup.
- BOM, quote preview, and PDF generator consume one shared priced/unpriced row model.
- Mark missing prices clearly in the BOM; disable quote export until every required row has an
  installer-entered price, and link the disabled state to the pricing settings screen.
- Give tests explicit price fixtures so they cannot depend on shipped values.

**Scope decided during implementation, wider than "prices":** the tax rate had the identical defect
and is worse — `DEFAULT_SETTINGS.taxRate` was an invented `0.0825` that `generateQuotePdf` silently
fell back to, printing a computed `Tax (8.25%)` line into the customer's total. A blank company name
is visibly unfinished; a plausible tax rate is invisibly wrong. Every customer-visible field
therefore ships empty and gates export: company block, bill-to, project name, quote number, notes,
tax rate, and all four prices. The notes paragraph is offered in Settings behind an explicit "use
suggested wording" action rather than pre-filled. ADR-0003 is amended to record this.

Make an unpriced quote **hard to express** in the type system: `quoteReadiness()` returns either a
`ReadyQuote` or a list of blockers, and `generateQuotePdf` accepts only the former. A
`pricesAreValid` boolean would be an aspiration that can drift from the rows it claims to describe;
this is checked by the compiler. Export is **blocked**, not warned — a dismissible warning would
require the generator to accept placeholder data, which is the thing being prevented.

### 3.2 Correct quote text handling — issue #8

`sanitize` in `src/domain/quote-pdf.ts:41-53` replaces almost every non-ASCII character with `-`;
only the em dash survives. Any real company name, address, or customer name will eventually trip
this. Note the function's own comment claims it falls back "for anything outside latin-1", but the
code drops everything above `0x7e` — so `é`, `ü`, and `£` are all latin-1 and all become `-`. Fix
the code and the comment together.

Support the full character set the selected WinAnsi standard font can encode. Test accented Latin
text and CP1252 punctuation. Keep an explicit substitution policy for genuinely unsupported scripts.
Do not embed a Unicode font until actual client text requires it — ADR-0004 records that trade-off.

### 3.3 Remove the broken Print path — issue #9

Print currently prints the entire dark app window. Remove the button; Save PDF already produces the
customer artifact. Do not maintain a separate HTML print layout without a confirmed requirement. If
direct printing is required later, open the generated PDF through the OS so preview, saved output,
and printed output share one renderer.

### 3.4 Do not guess the tube purchasing rule — issue #48

Leave it open; it is a **requirements question, not a bug**. Put the exact question in the ledger
(§9). Once answered, record it in an ADR with client-supplied examples before touching `bomRows`.

**Done when:** the same explicit inputs drive every total, fake prices cannot reach a PDF, and the
stock-tube ambiguity is visibly blocked on the buyer rather than encoded by guesswork.

---

## Phase 4 — Make the current UI keyboard- and screen-reader-safe

Worth doing now: an IT or procurement review on the client's side is a plausible step in a purchase,
and these are exactly what an automated scan reports.

### 4.1 The left rail — issues #33, #47

- Give every icon-only action an accessible name from its existing label or tooltip text. Note the
  issue title overstates the defect: the rail uses real `<button>` elements, so they *are*
  focusable, and `v`/`o`/`x` shortcuts exist. The genuine problem is that an icon-only control
  carrying only a `title` announces poorly or not at all depending on the assistive technology —
  fix it with explicit `aria-label`s rather than relying on the tooltip.
- Unmount the closed drawer's contents or mark the region `inert`. Focusable descendants inside
  `aria-hidden` content is an actual violation, not a preference.
- Make focus move predictably on drawer open/close, and do not let a hover-only tooltip be the sole
  description of a control.
- Add role/name tests for the primary tools and the destructive actions.

### 4.2 One modal shell — issue #23

Build on the bundled Chromium's native `<dialog>` behind one small shared shell owning modal
semantics, initial focus, focus containment, Escape policy, backdrop policy, and focus restoration.
Four hand-rolled dialogs (`AboutModal`, `ConfirmDialog`, `ExportPdfModal`, `SettingsModal`) is
enough real duplication to justify it — an identical 32×32 `iconBtn` style object is currently
copy-pasted verbatim across several of them. No UI framework dependency.

**Leave `UpdateNotification` out of the shell.** It is deliberately a non-blocking
`role="status"` toast, not a modal; giving it dialog semantics and a focus trap would be a
regression.

Dialogs holding uncommitted form state (Settings, quote) must not discard it on a stray backdrop
click. Test roles, names, Escape, tab containment, and focus restoration once at the shared
interface; test only modal-specific behaviour in each caller.

**No wholesale CSS migration.** Promote genuinely repeated dialog/button styles into `app.css`
alongside the existing `.topbtn` while you are touching them; leave one-off layout styles inline.
There are ~225 inline style objects and chasing all of them is churn.

**Done when:** every core action has an accessible name, hidden UI cannot receive focus, and all
modals follow one verified focus/close policy.

---

## Phase 5 — Simplify the renderer at its real seams

Do the behavioural changes **before** moving code, so each diff stays reviewable.

### 5.1 Replace the global camera event bus — issues #19, #10

`StatusBar.tsx:200-212` drives the 3D camera by dispatching `ptsb-zoom` / `ptsb-reset-view` on
`window`; `Viewport.tsx:1040` listens. An untyped global side channel between two components that
are already siblings under `App` — invisible to TypeScript and to the test suite.

Expose a typed imperative viewport handle (`zoom`, `reset`). `App` holds the ref and passes ordinary
callbacks to `StatusBar`. Reset and initial framing use one source of truth and account for the
current build area (fixes #10). Remove the `CustomEvent` channel entirely.

### 5.2 The one performance fix worth making now — part of issue #13

`bendLandingCells` recomputes topology it already has, making bend landing discovery quadratic in
open ports. Pass the computed topology through internally. No cache, no invalidation semantics.

**Application-level topology memoization and on-demand rendering (#14) are deferred** — see §8.

### 5.3 Split `Viewport.tsx` by responsibility

Once the behavioural work is green, extract:

- `design-meshes.ts` — blower, terminal, tube, bend, obstacle;
- `scene-affordances.ts` — ground and grid, landing highlights, port glows, label sprites;
- a small shared Three.js utility module for disposal and material helpers;
- the React lifecycle and synchronization stays in `Viewport.tsx`.

That boundary follows the distinct scene groups and their different update lifecycles. **Not** one
file per part type, and not one 600-line `meshes.ts`. Internal seams are fine where tests need
deterministic geometry, but `Viewport` remains the small external interface the app uses — do not
export every helper publicly just to reach it from a test.

**Done when:** camera commands are typed, bend landing discovery is not quadratic, and each renderer
concern has one obvious home.

---

## Phase 6 — Let the earlier phases reduce `App.tsx`

Avoid an isolated "break up App" rewrite. Phases 1–5 remove document lifecycle, IPC details, modal
mechanics, and camera transport from it. Then reassess what is left.

- **Do not build a generic tool descriptor table.** The tools are genuinely not uniform — `placeTube`
  takes a `sourcePartId`, bend takes a `rotationIndex`, obstacle is a two-click draft machine,
  blower and terminal write back orientation memory. A `Record<ToolId, {...}>` would hide that
  branching behind closures and optional fields, which is worse than the branches.
- **Do unify the identical tail.** Every branch of `onPlace` ends with the same six lines: on
  failure flash the message, on success `commitDesign` and clear the auto-build flag. Extract one
  small result handler that returns the successful result, so the terminal and blower branches can
  still perform their extra state updates. Keeps the exhaustive branches; removes the copy-paste.
- If `tool`, `hoverCell`, `ghostRotation`, `freePlacementMemory`, `freePlacementRotation`, and
  `obstacleDraft` still have transitions that must happen together (they are already cleared
  together by `selectTool`), move those transitions into one editor-interaction reducer with
  explicit actions — the pattern `designHistoryReducer` already established. Leave the independent
  modal booleans as `useState`.
- Placement rules stay in their domain modules. A reducer coordinates interaction state; it does not
  duplicate domain logic.
- Extract JSX only where it is a reusable view or hides a coherent workflow — the 65-line inline tool
  HUD pill at `App.tsx:785-850` qualifies. Do not chase a line count.

**Done when:** `App` reads primarily as composition and workflow wiring, and a new requirement has
one obvious owning module rather than a new cross-cutting abstraction.

---

## Phase 7 — Make the repository safe to leave and easy to resume

### 7.1 Development documentation — issue #24

The README has a logo, a paragraph, and a tech-stack list. It does not say how to install, run,
test, or package. Add briefly: Node 24 / pnpm 11 prerequisites; the install/dev/lint/typecheck/test/
build/package commands; the four-layer architecture with pointers to `CONTEXT.md` and the ADRs;
keyboard shortcuts that are not discoverable in the UI; tag-driven release steps; and the platform
update/signing caveats. Add a Node `engines` declaration aligned with Electron and CI.

Refresh stale docs while here: `CONTEXT.md` cites a test count ("194 of them") that is now 234 —
**remove the number rather than maintain it**; ADR-0001 cites `src/App.tsx:644` and issue #26 as
open, but #26 is closed and the line has moved. Prefer symbol and file references over line numbers.

### 7.2 Add Prettier

Formatting is consistent today only because one person wrote all of it. The next phase is explicitly
multi-session AI-assisted work, which is a concrete source of drift, and formatting noise in diffs
directly costs review attention on the client's feature work. Keep it minimal: one config matching
the current style, `format` and `format:check` scripts, and a CI check. No ESLint integration, no
further formatting ecosystem.

### 7.3 Dependency and security maintenance

- Weekly grouped Dependabot updates: patch/minor batched into one PR, majors separate.
- Document the intentional holds so a future session does not "fix" them (each verified against the
  current lockfile):
  - `@types/node` 24 and CI Node 24 track the Node 24.18 runtime bundled by Electron 43.2.
  - **TypeScript 7 is blocked** — `typescript-eslint` 8.65 supports TypeScript `<6.1`.
  - **Vite 8 is blocked** — stable `electron-vite` 5 supports Vite only through 7. (`electron-vite`
    6 beta supports Vite 8, but stable support has not landed.)
  - `@vitejs/plugin-react` 6 requires Vite 8, so it is blocked transitively.
- **Enable GitHub vulnerability alerts and automated security fixes** — both currently disabled.
- Do not upgrade merely because `pnpm outdated` lists an incompatible major.

### 7.4 Protect the known-green branch

Once workflow names are stable, enable branch protection on `main`: require the CI verification
check, block force pushes and deletion, require PRs if that suits a solo workflow, and keep the
release workflow's write permission scoped to release duties. This is a repository setting applied
deliberately, not a code change.

### 7.5 Commit `AGENTS.md`

`.gitignore` currently excludes both `AGENTS.md` and `CLAUDE.md`. Given the next phase is
AI-assisted feature work against a client spec, that guidance is project knowledge and belongs in
the repo beside `CONTEXT.md` and the ADRs. Commit a concise, repository-specific `AGENTS.md`:
commands, the parts↔grid invariant, the authoritative-versus-placeholder rule, and pointers to
`CONTEXT.md` and the ADRs. Keep `CLAUDE.md` and personal/global instructions ignored.

### 7.6 Write `docs/baked-in-assumptions.md`

The highest-value new document: a map of the blast radius, so an incoming requirement can be sized in
an afternoon rather than a week. **Classify each entry** rather than listing them flat — the
distinction is the whole point, because the five categories have wildly different costs:

| Category | Meaning | Examples |
|---|---|---|
| **Schema limitation** | The data model genuinely cannot express it | 1 ft integer grid; axis-aligned routing; single 3 ft bend radius; one build area per design; **flat per-part pricing** — no quantity breaks, labour lines, discounts, or arbitrary quote lines |
| **Workflow limitation** | The state could hold it; the UI and workflows assume otherwise | Multiple blowers/terminals — `DesignState.parts` accepts them, only validation and placement assume the counts; single-direction system |
| **Provisional product rule** | A deliberate v1 fence, already documented | Exactly two terminals (ADR-0002) |
| **Commercial placeholder** | Invented data, never authoritative | Catalog prices, part numbers, names (ADR-0003) |
| **Absent capability** | Simply not built | **No selection or move** — the `cursor` tool is inert; the only way to change a placed part is erase and re-place. The gap most likely to appear in the client's list, and substantial work |

Link to the existing ADRs and `CONTEXT.md` rather than restating their reasoning. Note what is
*authoritative spec* (ADR-0001) and therefore not negotiable without a cited source.

**Intake rule:** when a client requirement overturns one of these entries, it produces a new ADR
*and* an update to `CONTEXT.md` in the same commit. The ADR habit is already established; this keeps
the glossary and the decision record from diverging once requirements start landing.

### 7.7 Final baseline

Run a manual smoke matrix on the packaged app for the supported client platform(s): launch, WebGL
viewport, New/Open/Save/Save As, settings persistence, PDF export, close guard, update behaviour.
Then cut a clearly named pre-requirements baseline tag — but only after the Phase 0 visibility,
licensing, and distribution decisions are resolved.

**Do not** add Playwright, a state-management library, a CSS framework, telemetry, a database, or a
plug-in system for completeness. Revisit only against a concrete recurring cost or a real
requirement.

**Done when:** a new contributor can clone and verify from the README, maintenance surfaces while the
repo waits, and `main` cannot silently bypass its green gate.

---

## Recommended PR sequence

PR order deliberately differs from phase order — the phases group work by *concern*, this table
orders it by *dependency and exposure*.

| # | Work package | Phase | Issues | Risk |
|---:|---|---|---|---|
| 1 | Prettier, README, Dependabot, repo settings | 7 | #24 + untracked tooling work | Low |
| 2 | Version stamp, duplicated defaults, dead code, ADR-0001 copy | 1.1 | #5, part of #18 | Low |
| 3 | **Explicit pricing and export gate** | 3.1 | #17, #25 | **High** |
| 4 | Checked design reconstruction + design invariant assertion | 1.2 | #11 | **High** |
| 5 | Build-area / elevation / obstacle bounds and shrink preflight | 1.3 | #3, #4, #12 | Medium |
| 6 | Document session and typed IPC contract | 2 | #6, #7 | **High** |
| 7 | Quote character support; remove broken Print | 3.2, 3.3 | #8, #9 | Medium |
| 8 | Left rail and modal accessibility | 4 | #23, #33, #47 | Medium |
| 9 | Typed camera control and shared framing | 5.1 | #10, #19 | Low |
| 10 | Bend landing topology reuse | 5.2 | part of #13 | Low |
| 11 | Renderer split and `App` locality pass | 5.3, 6 | remainder of #18 | Medium |
| 12 | `AGENTS.md`, `baked-in-assumptions.md`, doc refresh | 7.5, 7.6 | — | Low |

Three sequencing decisions worth stating:

- **Tooling first**, so everything after it is formatted and gated consistently.
- **Pricing at 3, ahead of both other High-risk packages.** It is the only work with live commercial
  exposure while the client is actively evaluating, and it depends on neither reconstruction nor the
  document session — it touches pricing, the BOM, the PDF, and settings, all of which already have a
  typed interface. **If another demo or quote export might happen before these land, make it PR 1.**
- **Document session after reconstruction** (6 after 4), because Open should route through the
  checked boundary rather than being retrofitted onto it.
- **Renderer split last of the code work:** largest diff, purely mechanical, easiest to verify once
  everything under it has settled. Give it a dedicated branch and a visual check against the running
  app.

Issue #48 never enters an implementation PR — it is blocked on the client.

## Verification policy

Every work package passes:

```sh
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Add only tests that protect the behaviour being changed: domain tests for integrity, geometry,
pricing, serialization, and derived topology; App-level tests for document and editor state
transitions; shared modal and left-rail tests for semantics and focus; renderer helper tests for
deterministic geometry, interaction, and disposal; manual Electron checks for native dialogs,
close/quit, WebGL, packaging, and updates.

No coverage threshold. The suite already covers the valuable pure logic; new tests should defend
newly clarified interfaces and failure modes.

---

## Explicitly deferred

Open issues that should **stay** open, with the reason. Each is behaviour the requirements are
likely to redefine, or a risk not worth taking before them.

| Item | Why deferred |
|---|---|
| Elevation stepper / on-screen control (UI half of #4) | The clamp is a bug and is fixed in §1.3; the *control design* is UX the client may redefine. Don't design it twice |
| On-demand rendering (#14) | The perpetual RAF loop currently **masks** missed invalidations: every state change repaints within 16 ms whether or not the code asked for it. Switching to `requestRender()` turns any forgotten call into a stale-frame bug — and would introduce that risk immediately before feature work adds new scene-group updates. Do it after those paths settle, with before/after measurement |
| Application-level topology memoization (rest of #13) | No evidence of a problem at current design sizes. The one narrow quadratic case is fixed in §5.2 without cache semantics |
| BOM stock-tube offcut rule (#48) | A requirements question, not a bug |
| Selection / move / copy / multi-select | Large, and almost certainly in the client's list. Don't guess |
| New part types, or a generic tool plug-in system | Rule 4. Wait for real uniformity before abstracting over it |
| Multi-document, cloud storage, collaboration, accounts, telemetry | Not asked for |
| New routing algorithms or optimization modes | Not asked for |
| Visual redesign | The design language is coherent; leave it |
| Changing authoritative two-terminal, bend, path-length, or grid rules | ADR-0001: not without a cited source |
| Broad type relocation, CSS conversion, dependency churn, refactors justified only by file size | Rule 3 |

## Send the client these questions now

Costs nothing, and the answers shape architecture. From the existing backlog and ADRs:

1. **Tube offcuts (#48):** are offcuts reusable across cuts, and what stock-tube purchasing rule is
   authoritative? The current `ceil(total ft / 6)` contradicts the disclaimer printed on the quote.
2. **Two-terminal limit (ADR-0002):** is a single blower with exactly two terminals the real product,
   or a demo fence? This is the single largest determinant of routing and validation work.
3. **Selection and move:** must an installer be able to reposition a placed part, or is
   erase-and-replace acceptable? Currently only the latter exists.
4. **Catalog:** who owns the real part list and prices, and in what format will they arrive?
5. **Platforms:** which OSes must be supported, and does the deployment require signed installers?

## Definition of done

- All gates and the packaged smoke check pass.
- Invalid external geometry cannot produce a split-brain `DesignState`.
- New/Open/Save/Save As/Close behave conventionally; no unconfirmed path discards dirty work.
- All BOM and PDF pricing is explicit; fake catalog prices cannot escape.
- The open tube-purchasing rule is documented as a client decision, not implemented as a guess.
- Core controls and dialogs are keyboard- and screen-reader-safe.
- Camera and analysis interfaces are typed; no component talks to another through `window`.
- `App` and `Viewport` each have clear responsibilities without speculative framework code.
- The README, `AGENTS.md`, `baked-in-assumptions.md`, and the requirements ledger let work resume
  without reconstructing context.
- The owner has deliberately decided licensing, visibility, signing, security-alert, and
  branch-protection posture.
- **Nothing was built that the requirements might not want.**
