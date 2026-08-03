# Working on PTSBuilder

Read [`CONTEXT.md`](CONTEXT.md) before changing anything under `src/domain/`. It defines the
vocabulary and, more importantly, says which numbers in this codebase are authoritative.

## Commands

```sh
pnpm run check      # format:check + lint + typecheck + test, in CI's order
pnpm run format     # fix formatting

pnpm run dev:lite   # PTSBuilderLite in a browser — this is what ships
pnpm run build:lite # …into dist-lite/, which Cloudflare Pages serves

pnpm dev            # PTSBuilder, the Electron app
pnpm run package    # build installers into release/ (not published; see below)

pnpm run build && scripts/run-headless.sh   # screenshot the real Electron renderer
```

**Desktop artifact builds are paused.** `release.yml` only runs on manual dispatch, so a `v*` tag
publishes nothing. `ci.yml` still compiles the Electron target on every push, which is the only
thing keeping it from rotting — keep it green. The workflow header lists what decays while it sits
idle. See [ADR-0010](docs/adr/0010-one-codebase-two-products.md).

`scripts/run-headless.sh` is for machines with no desktop session to put a window on. Four flags
have to be right or the app starts and never shows anything — the reasons are at the top of the
script, and the one that wastes the most time is that Electron prefers Wayland and silently ignores
`DISPLAY`.

Every PR must leave `pnpm run check` green. CI runs the same four gates.

## The three things most likely to be got wrong

**1. Authoritative spec vs. placeholder data.** The engineering constants — 300 ft centerline cap,
6 ft tube stock, 90° bends at 3 ft radius, 1 cell = 1 ft, Terminal 1 flush against the blower — are
derived from the real PTS specification and may not be loosened, rounded, or re-derived without a
cited source ([ADR-0001](docs/adr/0001-engineering-constraints-are-authoritative.md)). They look
identical in source to invented data. Commercial values are the opposite: the catalog ships **no**
prices and the app **no** tax rate, both installer-entered, and a quote cannot be exported until
they are set ([ADR-0003](docs/adr/0003-quotes-require-installer-entered-pricing.md)). The registry
loader actively rejects a catalog entry carrying a price.

User-facing copy must interpolate these constants, never restate them.

**2. PTSBuilderLite must not be able to express money.** Not "must not display" — must not be able
to. `BomRow` carries no price, `bomRows` takes no pricing argument, and everything commercial lives
under a `commercial/` subdirectory that nothing on Lite's import graph may reach. A build flag
around a component does not help: a static import puts the module in the bundle whatever the
condition says. The Lite build fails and names the offender if any of it arrives
([ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md)). If a feature needs a price on
screen, it belongs to PTSBuilder.

**3. `parts`/`obstacles` must agree with `grid`.** `DesignState` carries a `SparseGrid` alongside
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
| `**/commercial/` | Anything to do with money. **PTSBuilderLite may not import it** |
| `src/platform/` | What differs about the host: files or a session, an updater or none |
| `src/products/` | One composition root per product, supplying `App` with what differs |
| `electron/` | Main process and preload bridge |
| `shared/` | Types and channel names shared by the Electron main process and the renderer |
| `docs/adr/` | Decisions with lasting consequences |
| `docs/deploying.md` | The Cloudflare Pages settings PTSBuilderLite is served from |

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
- `pnpm audit` is expected to be clean. It reported a high `brace-expansion` advisory for a long
  time; upstream backported the fix to the 1.x and 2.x lines and a lockfile refresh picked it up.
  An advisory reappearing is worth reading rather than assuming, since the last one was unreachable
  in this project — `pnpm-workspace.yaml` records why.
- Record a decision with lasting consequences as an ADR rather than a comment.

## Before inventing behaviour

This is a product being sold to a client whose requirements have not arrived yet.
[`docs/baked-in-assumptions.md`](docs/baked-in-assumptions.md) lists what the current model can and
cannot express. Questions only the client can answer are tracked as issues labelled `question`. If a
task appears to need one of those answers, open an issue — do not guess an implementation.

[`docs/client-questions.md`](docs/client-questions.md) is the same set written to be sent to the
client, who does not read code. Change one and change the other; the mapping is a comment at the top
of that file. Keep it free of jargon, issue numbers, and file paths.
