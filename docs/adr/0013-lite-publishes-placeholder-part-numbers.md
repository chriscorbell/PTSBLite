# ADR-0013: PTSBuilderLite publishes placeholder part numbers

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

`src/data/parts.json` ships invented names and part numbers. `CONTEXT.md` has always said so, and
`BL-2020-A`, `TM-2020-S`, `ST-06-4OD` and `BN-90-3R` look exactly as authoritative as real ones
would. Replacing them is issue #94, still open.

Until PTSBuilderLite, that data never left the installer's machine.

Now it does. Lite is public, and its BOM export is a PDF a prospect downloads and keeps —
potentially forwards to a supplier, or quotes back at the company. This is
[ADR-0003](0003-quotes-require-installer-entered-pricing.md)'s argument applied to `partNo` rather
than to price: a plausible-looking invented number is worse than an obviously missing one, and the
audience here is the public rather than someone who knows what they entered.

Three options were put to the owner: wait for the real catalog before launching; ship a visible
notice on the BOM PDF saying the numbers are provisional and not for ordering; or publish the
placeholders deliberately.

## Decision

**Publish the placeholders for now.** The owner's call, made explicitly.

No notice is added to the PDF. Adding one was offered and not taken.

## Consequences

A bill of materials downloaded from PTSBuilderLite today contains part numbers that identify
nothing. Anyone acting on one — ordering against it, or pricing it — is acting on invented data,
and nothing in the document says so.

This is the one place in the codebase where invented data reaches a customer-facing artifact by
decision rather than by accident. ADR-0001 and ADR-0003 both exist to prevent exactly that, so it
is recorded here to keep the exception visible rather than tacit.

The catalog loader still refuses an entry carrying a `unitPrice` (ADR-0003). Prices are not part of
this decision and remain absent from Lite entirely — see
[ADR-0011](0011-lite-has-no-commercial-data-path.md).

## When to revisit

When issue #94 delivers the real catalog. At that point this ADR is superseded rather than amended:
`parts.json` is replaced, `CONTEXT.md`'s "Placeholder" row for part numbers becomes obsolete, and
the risk this records disappears.

If the real catalog turns out to be further away than expected, the notice on the PDF is the cheap
middle option and remains available. It is roughly one line of `bom-pdf.ts`.
