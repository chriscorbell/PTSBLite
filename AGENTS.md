# Working on PTSBLite

Read [`CONTEXT.md`](CONTEXT.md) before changing anything under `src/domain/`. It defines the
vocabulary and identifies which engineering constraints are authoritative.

PTSBLite is the repository's only product
([ADR-0014](docs/adr/0014-ptsblite-is-the-only-product.md)); the README says what it is.
Do not add Electron, desktop packaging, pricing, quotes, customer data, tax, or other commercial
functionality.

## Commands

```sh
pnpm run check  # format:check + lint + typecheck + test, in CI order
pnpm run format # fix formatting
pnpm dev        # browser development server
pnpm run build  # production build into dist/
pnpm preview    # serve the production build
pnpm run test:e2e # Playwright smoke suite against the production build (real Chromium)
```

happy-dom has no WebGL, downloads, or meaningful storage behavior. `pnpm run test:e2e` covers the
basics in a real browser — boot, render, place, autosave/restore, PDF export — and CI runs it after
the build. Still check the production build by hand when your change is visual or outside what the
smoke suite exercises.

Every PR must leave `pnpm run check` green.

## The three things most likely to be wrong

**1. Authoritative spec versus placeholder data.** The 300 ft centerline cap, 6 ft tube stock,
90° bends at 3 ft radius, and 1 cell = 1 ft come from the real PTS specification. Do not change them
without a cited source. Terminal 1 flush against the blower was on this list and should not have
been — the client withdrew it
([ADR-0019](docs/adr/0019-a-valid-system-has-a-blower-at-each-end.md)), which is the process working:
the rule was flagged, questioned, and sourced rather than quietly edited. Part names and numbers are
placeholders. See [ADR-0001](docs/adr/0001-engineering-constraints-are-authoritative.md).

User-facing copy must interpolate engineering constants rather than restating them.

**2. PTSBLite cannot express money.** `BomRow` has no price, the catalog loader rejects
`unitPrice`, and the UI tests assert no money reaches the screen. The application exports a BOM,
never a quote. See [ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md).

**3. `parts` and `obstacles` must agree with `grid`.** `reconstructDesign` is the checked path that
rebuilds all three together. Call `expectGridMatchesDesign` after operations that add or remove an
occupant. Parts are strict; impenetrable obstacles union, clip to the build area, and may overlap
a part so validation can report it. Penetrable obstacles claim no grid cells at all — that is what
lets tubes route through them (ADR-0016).

## Layout

The architecture table in [README.md](README.md#architecture) maps the directories;
[CONTEXT.md](CONTEXT.md) explains the layering in detail. Most tests live in `src/domain/`.

## Conventions

- Prettier and ESLint are authoritative.
- Component styling belongs in a colocated `Component.css`, never a `<style>` block. Use inline
  styles only for runtime values CSS cannot know. See [ADR-0009](docs/adr/0009-component-styling-lives-in-stylesheets.md).
- Commit subjects are imperative and sentence case, with a body explaining why.
- `main` is protected and requires the `verify` check. Work goes through a PR.
- Do not add a dependency, abstraction, or test without a concrete need.
- pnpm 11 reads settings from `pnpm-workspace.yaml`, not `package.json`.
- `pnpm audit` is expected to be clean.
- Record decisions with lasting consequences as ADRs.
- Work that touches a Trello card (shipping it, splitting client feedback, asking Nick a
  question) follows [docs/trello-workflow.md](docs/trello-workflow.md).

## Before inventing behavior

The supported browsers, absence of money, BOM export, and browser autosave are decided. Questions
such as station count, moving placed parts, and the real catalog remain open. Do not guess answers
that only Kelly Tube Systems can provide.

Keep [`docs/baked-in-assumptions.md`](docs/baked-in-assumptions.md) current: it records what the
current model cannot express. Scoped features are tracked with the client on a Trello board
([docs/trello-workflow.md](docs/trello-workflow.md)), not in this repository.
