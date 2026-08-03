# ADR-0011: PTSBuilderLite has no commercial data path

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

PTSBuilderLite is public and free, and the client's requirement is absolute: **no prices, no costs,
no dollar amounts of any kind.** It keeps a BOM export; it has no quote.

[ADR-0003](0003-quotes-require-installer-entered-pricing.md) already argued that a
plausible-looking invented number is worse than an obviously missing one, and made a quote
containing one unrepresentable rather than merely discouraged. The same argument applies here with
more force, because the audience is the public rather than an installer who knows what they entered.

The obvious implementation was conditional rendering behind a build flag. It does not work. A
static import puts a module in the bundle whatever condition sits around the thing that renders it,
so the quote renderer, the pricing model and the installer's prices would all ship to a public URL
and be one wrong condition away from the screen.

The model made this worse: `BomRow` carried `unitPrice: number | null`, so **every** consumer of a
bill of materials held a price field whether or not it had any business showing one.

## Decision

Prices are not hidden in PTSBuilderLite. They are absent, at four levels.

**1. The shared model cannot hold one.** `BomRow` is `{ key, name, partNo, qty, note? }`, and
`bomRows(design)` takes no pricing argument. `priceRows` in `src/domain/commercial/` decorates rows
on the way to a quote. A price is a decoration, not a property of a bill of materials.

**2. Commercial code lives behind a name.** `src/domain/commercial/` holds pricing, quote readiness
and the quote PDF; `src/components/commercial/` holds the quote preview, the quote totals and the
pricing, quote and company settings panes. Within the existing layers, not beside them —
`CONTEXT.md` separates layers by kind, and a top-level `src/commercial/` would have been the first
directory to mix pure logic with React components.

**3. Nothing shared imports it.** `App.tsx` holds the editor and takes `ProductSurfaces`
(`src/products/types.ts`) for what differs. `DesktopProduct` fills those slots with prices, the
quote gate and the updater; `LiteProduct` fills them with a BOM export and the design's own
settings.

**4. The build fails if any of it arrives.** `noCommercialCode` in `vite.config.ts` reads the module
graph Rollup emitted and errors if anything under `commercial/` or `platform/electron` is in it,
naming what got pulled in.

The separate BOM renderer follows from the same reasoning. `generateBomPdf` takes `BomRow[]`;
`generateQuotePdf` takes a `ReadyQuote`, which *requires* prices, tax, seller identity and customer
details. A `showMoney: false` option threaded through the quote renderer would have put that type
in the Lite bundle and left one conditional between a public download and an invented number.

## Consequences

Adding a price to something shared is a type error. Importing commercial code from the Lite graph
is a build failure that names the module. Neither depends on anyone remembering this document.

A string search of the built bundle was considered and rejected. The minified Lite output contains
935 dollar signs from unrelated dependency code and no module names at all — noise in one direction
and blind in the other, and a computed currency string would evade it regardless.

One price-shaped thing legitimately survives into Lite: `part-registry`'s refusal of a catalog entry
carrying a `unitPrice`. That is ADR-0003's guard, and it belongs in a product that must never show
one.

The quote lives on unchanged in PTSBuilder. ADR-0003 is not weakened by this; it is the reason for
it.

## What this does not cover

Nothing here stops someone typing a currency symbol into shared UI copy. The module-graph check
cannot see that, and no check short of reviewing the words would. `LiteProduct.test.tsx` asserts
against the rendered page for the amounts and headings that would matter, which is a backstop
rather than a guarantee.
