# ADR-0004: Quote PDF text stays on WinAnsi standard fonts

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

`sanitize` in `src/domain/quote-pdf.ts` replaces every codepoint above `0x7e` with a hyphen, so
"Müller GmbH" prints as "M-ller GmbH" and "Café Bertrand" as "Caf- Bertrand". These are values the
installer types into their own company settings, so the app corrupts their identity on the document
they send to customers (issue #8).

The cutoff is stricter than the encoding requires. The PDF uses `StandardFonts` (Helvetica, Courier),
which pdf-lib encodes as WinAnsi/CP1252 — that covers all of Latin-1 plus the CP1252 punctuation
block. The em-dash is already special-cased precisely because it is representable.

The alternative was embedding a TrueType font via `@pdf-lib/fontkit`, which would additionally cover
Central and Eastern European names and let the quote use the product typeface instead of Helvetica.

## Decision

Widen `sanitize` to permit **everything WinAnsi can encode**, and keep the standard fonts. Do not add
`@pdf-lib/fontkit` or embed a font at this time.

## Consequences

- Fixes Western European company, customer, and project names — the realistic near-term customer base.
- No new dependency, no ~300 KB font in the bundle, no subsetting concerns.
- Characters outside CP1252 (Polish `ł`, Czech `ř`, Cyrillic, CJK) remain substituted. This is a known,
  accepted limitation, not an oversight — revisit if a customer needs it, at which point fontkit plus
  an embedded font is the answer and this ADR gets superseded.
- The quote stays visually on Helvetica rather than the app's Geist. Accepted for now; it is the same
  decision that keeps the bundle small.
- Substitution must remain lossy-but-safe: never throw on unencodable input, since the text comes
  straight from user settings.
