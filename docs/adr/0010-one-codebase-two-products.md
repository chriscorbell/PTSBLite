# ADR-0010: One codebase, two products

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

The client's requirements split the product in two.

**PTSBuilderLite** is the near-term focus: the app reached by navigating to a URL in a desktop
browser, deployed publicly so the company's customers and potential customers can use it
themselves. It is free, feature-limited, and shows no prices.

**PTSBuilder** is the full internal product — an Electron desktop app, possibly also hosted later,
with substantially more functionality. Work on it will not start for a long time.

The two share almost everything that matters: the file format, the authoritative engineering
constants of [ADR-0001](0001-engineering-constraints-are-authoritative.md), the geometry, the
placement rules, the router, validation, and most of the UI. What differs is commercial — prices,
quotes, seller identity — plus the host each runs inside.

The obvious structures were a second repository, or a pnpm workspace splitting `domain`, `web` and
`desktop` into packages.

## Decision

**One repository, one package, two build targets.**

- `electron.vite.config.ts` builds PTSBuilder, entry `src/main.tsx`.
- `vite.config.ts` builds PTSBuilderLite, entry `src/main-lite.tsx`, output `dist-lite/`.
- `src/App.tsx` is the shell both products mount. It holds the editor and nothing commercial.
- `src/products/` holds one composition root per product, which supplies what differs.
- `src/platform/` holds what differs about the host — see the capability table in
  `src/platform/types.ts`.

**Only PTSBuilderLite ships at present.** Desktop artifact builds are paused: `release.yml` is
manual-dispatch only, and `ci.yml` compiles the Electron target on every push, which is the only
thing keeping it from rotting. See the header of `release.yml` for what decays while it is dormant.

## Consequences

A change to the domain reaches both products at once, and cannot drift between them. A fix made
while working on Lite is already in PTSBuilder when that work resumes.

`App.tsx` may not import anything commercial, and this is enforced rather than remembered —
[ADR-0011](0011-lite-has-no-commercial-data-path.md) covers how.

The two ship on different cadences and are versioned differently. `package.json`'s version only
moves when a desktop release tag is cut, so Lite reports the commit it was built from instead;
`vite.config.ts` explains why.

A workspace was rejected because the boundary it would formalise already exists and is already
enforced: `src/domain/` is pure logic by rule, with tests that would fail if it were not. Package
manifests, dependency boundaries and separate release decisions are cost without isolation the
products need today. The repository can become a workspace later without moving anything between
repositories.

Two repositories were rejected because the shared half would drift while full PTSBuilder sat
untouched for months, and reconciling it would mean copying fixes across by hand.

## When to revisit

Splitting becomes the right answer when **the domain models genuinely diverge** — not when the UIs
do. If PTSBuilder grows a branching topology or a routing model that Lite's cannot express, and
`src/domain/` starts carrying two incompatible sets of rules behind conditionals, that is the
signal. Divergence in what is *shown* is what `ProductSurfaces` exists to absorb and is not a
reason to split anything.

A second, softer signal: if the count of product-shaped conditionals inside shared components grows
past a handful, the seam is in the wrong place. Move the seam before splitting the repository.
