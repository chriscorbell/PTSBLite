# ADR-0003: Quotes require installer-entered pricing

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

`src/data/parts.json` ships plausible-looking but entirely invented prices — a $4,250.00 blower, a
$1,850.00 terminal, $78.00 tube sections. `unitPriceFor` falls back to them whenever the installer has
not set an override, silently and without any signal.

The consequence: an installer who never opens Settings → Parts Pricing can lay out a system, export a
PDF, and hand a customer a professionally typeset quote containing fabricated money. Nothing in the
document or the UI distinguishes it from a real one. For a product sold into the trade, that is a
liability, not a rough edge.

The settings load is also asynchronous (`src/App.tsx:244-256`), so even a correctly configured
installation renders its first frame with catalog prices.

## Decision

**A quote cannot be exported until prices have been entered by the installer.**

- The shipped catalog carries **no** prices. `unitPrice` becomes absent rather than placeholder.
- Missing prices are a first-class state, surfaced in the BOM panel, not silently coerced to `0`.
- PDF export is gated: blocked, or hard-warned, while any part in the BOM lacks a price.

## Consequences

- `unitPriceFor(partKey, fallback)` loses its meaning; pricing becomes explicitly absent-or-set. This
  interacts with issue #17 (pricing currently flows through a mutable module global) — do them
  together, since both change the same call path.
- `PartCatalogEntry.unitPrice` becomes optional, which the registry loader currently rejects outright
  (`loadPartRegistry` throws on a non-numeric `unitPrice`). That check needs to change meaning.
- The BOM, quote preview, and PDF all need an unpriced presentation. `bomRows` currently multiplies
  `qty * unitPrice` unconditionally in three places.
- Existing `settings.json` files keep working — overrides already live there and are unaffected.
- Demoing the app now requires entering prices first. Accepted deliberately: a demo that prints fake
  money is worse than one that asks for setup.
- Tests that rely on catalog prices (`bom.test.ts`, `quote-pdf.test.ts`) will need explicit price
  fixtures — an improvement, since they currently assert against invented constants.
