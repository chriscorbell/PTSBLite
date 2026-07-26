# Working on PTSBuilder

Read [`CONTEXT.md`](CONTEXT.md) before changing anything under `src/domain/`. It defines the
vocabulary and, more importantly, says which numbers in this codebase are authoritative.

## Commands

```sh
bun install
bun run dev        # run the app
bun run check      # format:check + lint + typecheck + test, in CI's order
bun run format     # fix formatting
bun run package    # build installers into release/
```

Every PR must leave `bun run check` green. CI runs the same four gates.

**`bun run test`, not `bun test`.** Bun's own runner picks up the same files, ignores the Vitest
config, and reports failures that are not real. See [ADR-0008](docs/adr/0008-bun-as-package-manager.md),
which also records what moving off pnpm cost.

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
- Commit subjects are imperative and sentence case, with a body explaining *why*. Match the existing
  log; it is unusually good and worth keeping that way.
- `main` is protected and requires a green `verify` check, so all work goes through a PR.
- Don't add a dependency, abstraction, or test that isn't earned by a concrete need.
- Record a decision with lasting consequences as an ADR rather than a comment.

## Before inventing behaviour

This is a product being sold to a client whose requirements have not arrived yet.
[`docs/baked-in-assumptions.md`](docs/baked-in-assumptions.md) lists what the current model can and
cannot express, and [`docs/requirements/open-questions.md`](docs/requirements/open-questions.md)
holds the questions only the client can answer. If a task appears to need one of those answers,
record the question — do not guess an implementation.
