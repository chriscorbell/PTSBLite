# ADR-0003: Quotes require installer-entered pricing

- **Status:** Accepted
- **Date:** 2026-07-25
- **Amended:** 2026-07-25 — extended from prices to the tax rate and every other
  customer-visible field; export is blocked rather than warned. See "Amendment" below.

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

## Amendment — the same argument covers more than prices

Implementing this surfaced two things the original decision did not cover.

**The tax rate has the identical defect, and is worse.** `DEFAULT_SETTINGS.taxRate` was `0.0825` — an
invented, jurisdiction-specific number — and `generateQuotePdf` silently fell back to it
(`options.taxRate ?? DEFAULT_TAX_RATE`), printing a computed `Tax (8.25%)` line into the customer's
total. A quote reading "Your Company / 123 Example St" is *visibly* unfinished and self-corrects the
moment anyone looks at it. "Tax (8.25%)", computed to the cent, is invisibly wrong: it reads as
authoritative precisely because it looks like every other correct number on the page.

**Every other placeholder followed.** Company details, bill-to, project name, quote number, and the
notes paragraph all shipped pre-filled, and the export dialog has no per-quote fields — they are all
global settings. So `taxRate` is now `number | null`, and every text field ships empty.

The notes paragraph was genuinely useful boilerplate rather than a placeholder, so it is offered in
Settings behind an explicit "use suggested wording" action. Nothing arrives pre-filled: copy that
arrives written is copy nobody reads before sending.

**Blocked, not warned.** The original wording allowed "blocked, or hard-warned". Blocked, because it
is the only option the compiler can enforce. `quoteReadiness()` returns either a `ReadyQuote` or a
list of blockers, and `generateQuotePdf` accepts only the former — so an incomplete quote is not
something the code can express. A dismissible warning would require the PDF generator to accept
placeholder data, leaving one careless click between invented numbers and a customer.

The registry guard inverted with it. `loadPartRegistry` used to *require* a numeric `unitPrice`; it
now *rejects* one, so the placeholders cannot return by way of a catalog edit.

Consequence accepted, as before but more so: a fresh install cannot produce a quote until the
installer has filled in the company block, the customer block, the tax rate, and four prices. That is
setup work, done once. It is the right trade against handing a customer fabricated money.
