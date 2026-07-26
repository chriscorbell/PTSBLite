# Working on PTSBuilder

Read [`CONTEXT.md`](CONTEXT.md) before changing anything under `src/domain/`. It defines the
vocabulary and, more importantly, says which numbers in this codebase are authoritative.

## Commands

```sh
pnpm dev            # run the app
pnpm run check      # format:check + lint + typecheck + test, in CI's order
pnpm run format     # fix formatting
pnpm run package    # build installers into release/

pnpm run build && scripts/run-headless.sh   # screenshot the real renderer
```

`scripts/run-headless.sh` is for machines with no desktop session to put a window on. Four flags
have to be right or the app starts and never shows anything — the reasons are at the top of the
script, and the one that wastes the most time is that Electron prefers Wayland and silently ignores
`DISPLAY`.

Every PR must leave `pnpm run check` green. CI runs the same four gates.

## The two things most likely to be got wrong

**1. Authoritative spec vs. placeholder data.** The engineering constants — 300 ft centerline cap,
6 ft tube stock, 90° bends at 3 ft radius, 1 cell = 1 ft, Terminal 1 flush against the blower — are
derived from the real PTS specification and may not be loosened, rounded, or re-derived without a
cited source ([ADR-0001](docs/adr/0001-engineering-constraints-are-authoritative.md)). They look
identical in source to invented data. Commercial values are the opposite: the catalog ships **no**
prices and the app **no** tax rate, both installer-entered, and a quote cannot be exported until
they are set ([ADR-0003](docs/adr/0003-quotes-require-installer-entered-pricing.md)). The registry
loader actively rejects a catalog entry carrying a price.

User-facing copy must interpolate these constants, never restate them.

**2. `parts`/`obstacles` must agree with `grid`.** `DesignState` carries a `SparseGrid` alongside
its occupant lists. A part present in one but not the other renders and gets priced yet cannot be
erased or collided with. `reconstructDesign` is the single checked path that rebuilds all three
together; `expectGridMatchesDesign` (in `src/test/design-invariants.ts`) asserts the invariant and
should be called after any operation that adds or removes an occupant.

Parts are strict — out of bounds or overlapping another part is rejected. Obstacles are lenient —
they are volumes, so they union with each other, clip to the build area, and may sit over a part,
which `validation.ts` flags rather than forbids.

## Layout

| Path | Contains |
|---|---|
| `src/domain/` | Pure logic. No React, no Three.js. Most tests live here |
| `src/renderer/` | The Three.js viewport, split into meshes, scene affordances, pure interaction helpers, and the React lifecycle |
| `src/components/` | React UI |
| `electron/` | Main process and preload bridge |
| `shared/` | Types and channel names shared by the Electron main process and the renderer |
| `docs/adr/` | Decisions with lasting consequences |

## Conventions

- Prettier and ESLint are authoritative; don't hand-format. `build/entitlements.mac.plist` is
  prettier-ignored on purpose — `codesign` parses it with a parser that rejects valid XML.
- Component styling goes in a colocated `Component.css` with component-prefixed class names, never
  in a `style={{…}}` prop or a `<style>` block. `style=` is for values only known at runtime, and
  the permitted exceptions are listed exhaustively in
  [ADR-0009](docs/adr/0009-component-styling-lives-in-stylesheets.md).
- Commit subjects are imperative and sentence case, with a body explaining *why*. Match the existing
  log; it is unusually good and worth keeping that way.
- `main` is protected and requires a green `verify` check, so all work goes through a PR.
- Don't add a dependency, abstraction, or test that isn't earned by a concrete need.
- pnpm 11 reads its settings from `pnpm-workspace.yaml`, **not** `package.json`. A `pnpm.overrides`
  key in `package.json` is ignored with only a warning, so a dependency override put there looks
  applied and isn't — check the resolved version, not the config.
- `pnpm audit` is expected to report one high `brace-expansion` advisory, and a clean run would mean
  something changed. `pnpm-workspace.yaml` says why it stays.
- Record a decision with lasting consequences as an ADR rather than a comment.

## Before inventing behaviour

This is a product being sold to a client whose requirements have not arrived yet.
[`docs/baked-in-assumptions.md`](docs/baked-in-assumptions.md) lists what the current model can and
cannot express. Questions only the client can answer are tracked as issues labelled `question`. If a
task appears to need one of those answers, open an issue — do not guess an implementation.

[`docs/client-questions.md`](docs/client-questions.md) is the same set written to be sent to the
client, who does not read code. Change one and change the other; the mapping is a comment at the top
of that file. Keep it free of jargon, issue numbers, and file paths.
