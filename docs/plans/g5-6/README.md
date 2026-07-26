# PTSBuilder pre-requirements hardening plan

- **Status:** Proposed
- **Written:** 2026-07-25
- **Audit baseline:** `main` at `2afea1c` (`v0.1.3`)
- **Purpose:** Make the existing product safer and easier to change before client requirements
  arrive, without guessing at those requirements or turning the prototype into a framework.

## Desired outcome

When the client's requirements arrive, PTSBuilder should have:

- no known path that silently corrupts a design, loses unsaved work, or produces a quote from
  placeholder commercial data;
- domain rules expressed once and protected at their real interfaces;
- a small, typed Electron interface for file, settings, update, and quote operations;
- an `App` module that coordinates workflows instead of implementing all of them;
- a renderer whose scene construction, interaction, and React lifecycle are locally understandable;
- accessible core controls and modal behavior;
- a documented, reproducible development and release workflow; and
- a short list of client decisions that the code must not guess.

Line count, test count, abstraction count, and use of the newest package versions are not goals.
The goal is lower change risk with the least code that remains clear.

## Current baseline

This is already a healthy codebase, not a rescue project.

| Area | Audited state |
|---|---|
| Application code | 42 non-test TypeScript/TSX files, about 9,340 lines |
| Automated tests | 24 files, about 3,613 lines, 234 passing tests |
| Type safety | TypeScript `strict`; type-aware ESLint rules |
| Local gates | `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` all pass |
| CI/CD | Latest `main` and PR runs are green; tags build and publish on three operating systems |
| Architecture | Pure domain modules, React UI, Three.js renderer, isolated Electron main/preload processes |
| Product knowledge | Strong glossary in `CONTEXT.md`; five useful ADRs |
| Security | Sandbox, context isolation, CSP, navigation denial, and web-only external URL handling |
| Remote backlog | 21 open issues; most already contain concrete evidence and suggested fixes |

The clearest risks are concentrated in a few places:

- `src/App.tsx` is about 900 lines and owns document lifecycle, editor interaction, placement,
  keyboard commands, settings, updates, auto-build, and all top-level presentation state.
- `src/renderer/Viewport.tsx` is about 1,230 lines and mixes mesh factories, GPU resource ownership,
  pointer/camera interaction, scene setup, and React synchronization.
- `DesignState.parts` and `DesignState.grid` can disagree when rebuilding from invalid input.
- pricing is hidden mutable module state, despite being customer-facing output.
- the file lifecycle does not model current path, Save As, New, or close-with-unsaved-work.

These are the seams to improve. The rest of the project should be changed only as required by the
work below.

## Working rules

1. **One focused issue or tightly related issue cluster per PR.** Keep behavior changes separate
   from mechanical moves where practical.
2. **Preserve the domain layer.** It should remain free of React and Three.js. External data is
   validated at entry; valid domain state should not need repeated defensive checks everywhere.
3. **Prefer deep modules.** Extract a module when it can hide a coherent workflow behind a small
   interface. Do not split files merely to make them shorter.
4. **Keep explicit domain differences explicit.** Blower, terminal, tube, bend, and obstacle
   placement have materially different rules. Do not force them through a generic tool plug-in
   interface full of optional arguments and casts.
5. **Test observable behavior at the owning interface.** Do not preserve tests of internals after a
   deeper interface covers the same behavior.
6. **Finish every PR green.** Run lint, typecheck, tests, and the production build. Perform a real
   desktop smoke test when a PR changes Electron, Three.js lifecycle, native dialogs, or packaging.
7. **Do not mix client feature guesses into hardening.** Unknown commercial and engineering rules
   become recorded questions, not invented implementation.

## Execution plan

### Phase 0 — Record the commercial and repository decisions

This does not block local code cleanup, but it must be resolved before client delivery.

1. Confirm that a **public GPL-3.0 repository** matches the intended sale and support arrangement.
   GitHub currently reports the repository as public and GPL-3.0. Public history should not be
   rewritten or visibility changed as a casual cleanup step. If proprietary delivery, dual
   licensing, or transfer is intended, obtain appropriate legal guidance and confirm ownership of
   all contributions first.
2. Decide whether release binaries need Windows signing and macOS signing/notarization. The current
   unsigned/manual-update trade-offs are documented and reasonable for a prototype, but may not be
   acceptable for client deployment.
3. Create `docs/requirements/open-questions.md` and put unresolved buyer questions there. Start with
   issue #48: whether tube offcuts are reusable and what stock-tube purchasing rule is authoritative.
4. Record the current product constraints that the client may overturn: the two-terminal v1 fence,
   grid resolution, allowed bend geometry, catalog source, and whether selection/move is required.
   Link to existing ADRs rather than duplicating their reasoning.

**Done when:** the business-sensitive decisions are visible and no engineer needs to infer a
commercial rule from prototype behavior.

### Phase 1 — Make invalid design state impossible to accept silently

#### 1.1 Fix metadata drift and dead configuration first — issues #5 and #18

- Stop hardcoding saved `appVersion` as `0.1.0`. Pass the build/package version into serialization
  through a typed input so the pure domain module does not depend on an ambient bundler global.
- Use `DEFAULT_FILENAME` and `DEFAULT_REVISION` from `design-state.ts`; remove their copies in
  `App.tsx`.
- Remove confirmed dead fields/exports, including the unused `Scene` fields, `PARTS`, obsolete build
  volume constants, unused pricing accessors, and the unused `autoBuildPulse` prop if no behavior is
  attached to it.
- Delete the unreachable generic placement fallback in `App.tsx`. It appends to `parts` without
  updating the grid and would violate the most important domain invariant if it became reachable.
- Make differing defaults deliberate: use one auto-build default, one camera/reset default, and
  interpolate engineering constants into user-facing copy instead of repeating literals.

#### 1.2 Put reconstruction behind one checked interface — issue #11

Create one design-reconstruction module with a small interface that owns these facts:

- every part and obstacle footprint is inside the configured build area;
- no two occupants claim the same cell;
- `parts`, `obstacles`, and `grid` are rebuilt together; and
- failure identifies the offending item and reason.

`deserializeDesign` must return a typed failure for invalid geometry rather than silently keeping a
rendered/priced part while omitting its cells. Known-valid internal rebuilds may use the same
implementation, but there should not be a second permissive path.

Add focused tests for out-of-bounds parts, overlapping parts, out-of-bounds obstacles, overlapping
obstacles/parts, and a valid round trip. Add a reusable test assertion for the parts/obstacles/grid
agreement and apply it to placement and erase tests where it protects meaningful behavior.

Do not add a general validation framework or schema dependency. The current explicit parsers are
small and readable; extend them at the geometry seam.

#### 1.3 Derive editing bounds from the design — issues #3, #4, and #12

- Clamp obstacle base and height in the domain helpers using the design build area's bounds. The HUD
  should display the same limits; it must not advertise values the domain will reject.
- Clamp placement elevation to `[GROUND_PLANE_Y, buildArea.height - 1]` and show the current value
  with a small stepper/key hint. This fixes an invalid invariant now without committing to a larger
  future elevation UX.
- Preflight build-area shrink. Show the number of parts and obstacles that would be removed, require
  confirmation, and commit the resize/removal as one undoable action. Cancel must preserve the
  design exactly.
- Re-clamp active elevation and any in-progress obstacle draft after a build-area change.

**Done when:** no file load, area resize, or placement control can leave visible domain objects and
grid occupancy disagreeing, and the corresponding tests fail if that guarantee regresses.

### Phase 2 — Give the design document a real lifecycle — issues #6 and #7

The app currently has a design history and a separate `dirty` boolean, but no current file path or
coherent New/Open/Save/Save As/Close workflow. Deepen this into one document-session module.

Its interface should expose commands and state that callers actually need:

- current design/history;
- current path and display filename;
- clean/dirty state;
- `new`, `open`, `save`, `saveAs`, `undo`, `redo`, and guarded replacement/close actions.

Implementation details:

1. Extend the reducer (or add one adjacent reducer) so design history, current path, and saved
   checkpoint move together. Derive dirty state from the saved checkpoint where practical instead
   of toggling a boolean across unrelated callbacks.
2. Choose `.ptsb` as the canonical extension because the domain and existing UI already use it.
   Continue accepting `.json` in Open for backward compatibility with released prototypes.
3. Save overwrites the known path; Save As and the first Save prompt. Opening or saving updates the
   displayed filename from the chosen path without creating a surprising undo step.
4. Add File > New and File > Save As. All destructive replacement flows use the same app-native
   confirmation behavior.
5. Guard window close/quit through a typed renderer/main handshake. Keep one explicit allow-close
   path so a confirmed close cannot loop back into the prompt.
6. Define IPC result types and channel names once in a shared contract used by main, preload, and
   renderer. Keep Electron as the production adapter and use the existing in-memory test adapter;
   this is a real seam, not speculative indirection.
7. Surface write/read/settings errors to the user. Do not silently ignore `setSettings` failures.

Tests should cover first Save, subsequent Save, Save As, cancel, Open with clean/dirty state, New,
filename synchronization, history reset, and close confirmation. A manual desktop check must cover
native dialogs and close behavior because the DOM test environment cannot prove those integrations.

**Done when:** normal file commands have conventional behavior and there is no unconfirmed path that
discards dirty work.

### Phase 3 — Make every commercial output explicit and trustworthy

#### 3.1 Remove ambient pricing — issues #17 and #25

Implement these together because they change the same path.

- Delete mutable module-level price overrides. Make `bomRows(design, pricing)` a pure function of
  explicit inputs.
- Remove invented prices from the shipped catalog. Represent an unset price as an explicit state,
  not zero and not a plausible fallback.
- Keep settings in a loading state until the persisted result is known; do not briefly render
  placeholder prices during startup.
- Have the BOM, quote preview, and PDF generator consume the same priced/unpriced row model.
- Clearly mark missing prices in the BOM and disable quote export until every required row has an
  installer-entered price. Link the disabled state to the pricing settings screen.
- Give tests explicit price fixtures so they cannot accidentally depend on shipped fake values.

The interface should make an unpriced quote hard to express. Avoid a boolean such as
`pricesAreValid` that can drift from the rows it describes.

#### 3.2 Correct quote text handling — issue #8

Support the complete character set that `pdf-lib`'s selected WinAnsi standard font can encode, with
tests for accented Latin text and CP1252 punctuation. Preserve a clear substitution policy for
unsupported scripts. Do not add and embed a Unicode font until actual client text requires it;
ADR-0004 already records that trade-off.

#### 3.3 Remove the broken secondary print path — issue #9

The simplest reliable behavior today is to remove the Print button and keep Save PDF, which already
produces the customer artifact. Do not maintain a separate HTML print layout without a confirmed
requirement. If direct printing is required later, open the generated PDF through the OS so preview,
saved output, and printed output share one renderer.

#### 3.4 Do not guess tube purchasing rules — issue #48

Leave the issue open and put the exact question in the client requirements ledger. Once answered,
record the rule in an ADR and add examples supplied by the client before changing `bomRows`.

**Done when:** the same explicit price inputs drive all totals, fake prices cannot reach a PDF, and
the remaining stock-tube ambiguity is visibly blocked on the buyer rather than encoded by guesswork.

### Phase 4 — Make the current UI keyboard- and screen-reader-safe

#### 4.1 Fix the left rail together — issues #33 and #47

- Give every icon-only action an accessible name using its existing label/tooltip text.
- Unmount the closed drawer contents or make the closed region `inert`; do not leave focusable
  descendants inside `aria-hidden` content.
- Ensure focus moves predictably when opening/closing the drawer and that hover-only tooltips are not
  the sole description.
- Add role/name tests for the primary tools and destructive actions.

#### 4.2 Consolidate modal behavior — issue #23

Use the bundled Chromium's native `<dialog>` behavior behind one small shared modal shell. It should
own modal semantics, initial focus, focus containment, Escape policy, backdrop policy, and focus
restoration. The four existing dialogs are enough real reuse to justify this module; no UI framework
dependency is needed.

Settings and quote dialogs with uncommitted form state should not discard it through an accidental
backdrop click. Test roles, accessible names, Escape, tab containment, and focus restoration at the
shared interface, plus only modal-specific behavior in each caller.

Do not perform a wholesale CSS migration. Promote genuinely repeated dialog/button styles while
touching them and leave one-off layout styles alone.

**Done when:** all core actions have accessible names, hidden UI cannot receive focus, and every
modal follows one verified focus/close policy.

### Phase 5 — Simplify and idle the renderer at its real seams

Do behavioral renderer changes before moving code so review remains possible.

#### 5.1 Replace the global camera event bus — issues #19 and #10

Expose a typed imperative viewport interface with `zoom` and `reset` operations. `App` holds the ref
and passes ordinary callbacks to `StatusBar`. Reset and initial framing must use one source of truth
and account for the current build area. Remove the global `CustomEvent` channel.

#### 5.2 Compute topology once per design revision — issue #13

- Memoize `Topology` at the application/domain orchestration level for the current immutable design.
- Let validation, landing-cell calculation, port markers, and placement previews accept that derived
  value rather than rebuilding it.
- At minimum, pass the existing topology through bend orientation checks so bend landing discovery
  is not quadratic in open ports.
- Keep topology derived rather than serialized. A loaded file should never trust cached analysis.

Do not attach a general cache framework to `DesignState`. One memoized derived value with explicit
inputs is sufficient.

#### 5.3 Render on demand — issue #14

Replace the perpetual animation loop with a coalescing `requestRender()` that schedules at most one
frame. Request a frame after camera input, resize, and each scene-group update. If a future feature
actually animates, it can enable continuous frames only for the animation's lifetime.

Measure idle renderer activity and interaction latency before and after on a representative larger
design. Record the simple test fixture and observations in the PR; do not add a benchmark framework.

#### 5.4 Split `Viewport.tsx` by responsibility, not by part count

After the behavioral work is green, create a few cohesive internal modules:

- scene-object construction and GPU disposal;
- pure geometry/pointer interaction helpers; and
- the React viewport lifecycle and synchronization interface.

Do not create one shallow file per mesh or expose every helper publicly for tests. Internal seams are
acceptable where tests need deterministic geometry or interaction, but `Viewport` should remain the
small external interface used by the app.

**Done when:** an idle viewport schedules no continuous frames, topology is derived once per design
revision, camera commands are typed, and each renderer concern has one obvious home.

### Phase 6 — Let the earlier work naturally reduce `App.tsx`

Avoid an isolated "break up App" rewrite. Phases 1–5 should remove document lifecycle, IPC details,
modal mechanics, and camera transport from it. Then reassess what remains.

- Keep top-level composition and independent modal-open booleans in `App`.
- If tool, hover, rotation, free-placement memory, and obstacle draft still have transitions that must
  occur together, put those transitions in one editor-interaction reducer with explicit actions.
- Keep placement rules in their existing domain modules. A reducer may coordinate interaction state;
  it should not duplicate domain placement logic.
- Retain an explicit exhaustive branch for the small set of tools. A generic descriptor registry is
  only justified if client requirements actually introduce many uniform tool types.
- Extract JSX only when it is a reusable view or hides a coherent workflow. Do not chase a target
  line count.

**Done when:** `App` reads primarily as composition and workflow wiring, and adding a requirement has
one obvious owning module rather than a new cross-cutting abstraction.

### Phase 7 — Make the repository safe to leave and easy to resume

#### 7.1 Development documentation — issue #24

Expand the README briefly with:

- Node 24 and pnpm 11 prerequisites;
- install, dev, lint, typecheck, test, build, and package commands;
- the four-layer architecture and pointers to `CONTEXT.md`/ADRs;
- keyboard shortcuts that are not fully discoverable in the UI;
- tag-driven release steps; and
- platform update/signing caveats.

Add a Node `engines` declaration aligned with Electron/CI. Add one `check` script that runs the local
quality gates in the same order as CI if it improves daily use; do not duplicate build logic.

Refresh stale documentation while here: remove hardcoded test counts and resolved issue notes from
`CONTEXT.md`, and prefer symbol/file references over line numbers that immediately rot.

#### 7.2 Dependency and security maintenance

- Add weekly, grouped Dependabot updates for patch/minor changes, with majors kept separate.
- Document the intentional current holds: Node types follow Electron's Node runtime; TypeScript 7
  waits for `typescript-eslint`; Vite 8/plugin React 6 wait for `electron-vite` support.
- Enable GitHub vulnerability alerts. They are currently disabled; automated security fixes are also
  disabled.
- Do not upgrade merely because `pnpm outdated` lists a newer incompatible major.

#### 7.3 Protect the known-green branch

Enable branch protection/rulesets on `main` after the workflow names are stable:

- require the CI verification check before merge;
- block force pushes and deletion;
- require branches/PRs for changes if that matches the owner's solo workflow; and
- keep the tag-release workflow's write permission scoped only to release duties.

The branch is currently unprotected. This is a repository setting, not a code change, and should be
applied deliberately rather than inferred from this plan.

#### 7.4 Final maintenance baseline

Run a manual smoke matrix for the packaged app on the supported client platform(s): launch, viewport
WebGL, New/Open/Save/Save As, settings persistence, PDF export, close guard, and update behavior.
Then cut a clearly named pre-requirements baseline only after the visibility/licensing and release
distribution decisions in Phase 0 are resolved.

Do not add Playwright, a formatter, a state-management library, a CSS framework, telemetry, a
database, or a plug-in system solely for completeness. Revisit those only when a concrete recurring
cost or client requirement justifies them.

**Done when:** a new contributor can clone and verify the app from the README, dependency/security
maintenance will surface while the repo waits, and `main` cannot silently bypass its green gate.

## Recommended PR sequence

| Order | Work package | Issues | Risk |
|---:|---|---|---|
| 1 | Version/default/dead-code cleanup | #5, part of #18 | Low |
| 2 | Checked design reconstruction and grid invariant | #11 | High |
| 3 | Build-area/elevation/obstacle bounds | #3, #4, #12 | Medium |
| 4 | Document session and typed file IPC | #6, #7 | High |
| 5 | Explicit pricing and export gate | #17, #25 | High |
| 6 | Quote character support; remove broken Print | #8, #9 | Medium |
| 7 | Left rail and modal accessibility | #23, #33, #47 | Medium |
| 8 | Typed camera control and shared framing | #10, #19 | Low |
| 9 | Topology reuse and on-demand rendering | #13, #14 | Medium |
| 10 | Renderer/App locality pass | remainder of #18 | Medium |
| 11 | README, maintenance automation, repository settings | #24 | Low |

Issue #48 remains blocked on an authoritative client answer and should not be placed in an
implementation PR.

## Verification policy

Every work package must pass:

```sh
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Add only tests that protect the behavior being changed:

- domain tests for design integrity, geometry, pricing, serialization, and derived topology;
- App-level tests for document and editor state transitions;
- shared modal/left-rail tests for semantic and focus behavior;
- renderer helper tests for deterministic geometry, interaction, and resource disposal; and
- manual Electron checks for native dialogs, close/quit, WebGL, packaging, and updates.

Do not set an arbitrary coverage threshold. The current suite already covers the valuable pure
logic; new tests should defend newly clarified interfaces and failure modes.

## Explicit non-goals until requirements arrive

- selection, moving, copying, or multi-select;
- new part types or a generic part/tool plug-in system;
- multi-document windows, cloud storage, collaboration, accounts, or telemetry;
- new routing algorithms or speculative optimization modes;
- redesigning the visual language;
- changing the authoritative two-terminal, bend, path-length, or grid rules without a cited source;
- deciding the tube offcut/purchasing formula;
- broad type relocation, CSS conversion, dependency churn, or refactors justified only by file size.

## Final definition of done

This hardening effort is complete when:

- all quality gates and the packaged smoke check pass;
- invalid external geometry cannot become a split-brain `DesignState`;
- New/Open/Save/Save As/Close behave conventionally and preserve unsaved work;
- all BOM/PDF pricing is explicit and fake catalog prices cannot escape;
- the open tube-purchasing rule is documented as a client decision;
- core controls and dialogs are keyboard- and screen-reader-safe;
- the renderer is idle when unchanged and its camera/analysis interfaces are typed;
- `App` and `Viewport` each have clear, high-leverage responsibilities without speculative
  framework code;
- the README and requirements ledger let work resume without reconstructing context; and
- the owner has deliberately decided the repository's commercial licensing, visibility, signing,
  security-alert, and branch-protection posture.
