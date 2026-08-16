# ADR-0011: PTSBuilderLite has no commercial data path

- **Status:** Accepted
- **Date:** 2026-08-03
- **Amended:** 2026-08-16 — the separate commercial product was removed by ADR-0014.

PTSBuilderLite is Kelly Tube Systems' public marketing tool. The requirement remains absolute: no
prices, costs, taxes, quotes, customer details, seller details, or dollar amounts of any kind.
Commercial information is absent rather than hidden.

The absence is enforced at several boundaries:

- `BomRow` is `{ key, name, partNo, qty, note? }`; it has no price field and `bomRows` takes no
  pricing input.
- `loadPartRegistry` rejects any catalog entry containing `unitPrice`.
- The repository contains no pricing model, quote renderer, commercial settings, or commercial
  product composition.
- The production build fails if a module under `commercial/` reaches the bundle.
- The application and BOM PDF tests assert that money headings and amounts never reach a visitor.

`generateBomPdf` accepts a design and derives `BomRow[]`; it cannot express a priced document.
Adding money is a product-scope change, not an ordinary feature hidden behind a flag.

The module-graph check cannot detect a currency symbol typed directly into copy, so code review and
rendered-output tests remain necessary.
