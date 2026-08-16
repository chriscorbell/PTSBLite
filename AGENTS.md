# Working on PTSBuilderLite

Read [`CONTEXT.md`](CONTEXT.md) before changing anything under `src/domain/`. It defines the
vocabulary and identifies which engineering constraints are authoritative.

PTSBuilderLite is the repository's only product. It is Kelly Tube Systems' public,
consumer-facing browser app and marketing tool. Do not add Electron, desktop packaging, pricing,
quotes, customer data, tax, or other commercial functionality. See
[ADR-0014](docs/adr/0014-ptsbuilderlite-is-the-only-product.md).

## Commands

```sh
pnpm run check  # format:check + lint + typecheck + test, in CI order
pnpm run format # fix formatting
pnpm dev        # browser development server
pnpm run build  # production build into dist-lite/
pnpm preview    # serve the production build
```

Cloudflare Pages currently uses `pnpm run build:lite`, which aliases `pnpm run build`.

Check the production build in a real browser before calling browser-facing work done. happy-dom has
no WebGL, downloads, or meaningful storage behavior.

Every PR must leave `pnpm run check` green.

## The three things most likely to be wrong

**1. Authoritative spec versus placeholder data.** The 300 ft centerline cap, 6 ft tube stock,
90° bends at 3 ft radius, 1 cell = 1 ft, and Terminal 1 flush against the blower come from the real
PTS specification. Do not change them without a cited source. Part names and numbers are
placeholders. See [ADR-0001](docs/adr/0001-engineering-constraints-are-authoritative.md).

User-facing copy must interpolate engineering constants rather than restating them.

**2. PTSBuilderLite cannot express money.** `BomRow` has no price, the catalog loader rejects
`unitPrice`, and the production build rejects modules under `commercial/`. The application exports
a BOM, never a quote. See [ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md).

**3. `parts` and `obstacles` must agree with `grid`.** `reconstructDesign` is the checked path that
rebuilds all three together. Call `expectGridMatchesDesign` after operations that add or remove an
occupant. Parts are strict; obstacles union, clip to the build area, and may overlap a part so
validation can report it.

## Layout

| Path | Contains |
|---|---|
| `src/domain/` | Pure logic; most tests live here |
| `src/renderer/` | Three.js viewport and interaction helpers |
| `src/components/` | React UI with colocated component stylesheets |
| `src/platform/` | Browser storage, downloads, and external links |
| `web-public/` | Production CSP and cache headers |
| `docs/adr/` | Lasting decisions |

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

## Before inventing behavior

The supported browsers, absence of money, BOM export, and browser autosave are decided. Questions
such as station count, moving placed parts, and the real catalog remain open. Do not guess answers
that only Kelly Tube Systems can provide.

Keep [`docs/baked-in-assumptions.md`](docs/baked-in-assumptions.md) and
[`docs/client-questions.md`](docs/client-questions.md) synchronized with the related question issues.
