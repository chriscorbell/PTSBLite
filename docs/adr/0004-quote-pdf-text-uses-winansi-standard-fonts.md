# ADR-0004: BOM PDF text uses WinAnsi standard fonts

- **Status:** Accepted, amended
- **Date:** 2026-07-25
- **Amended:** 2026-08-16 — the quote renderer was removed by ADR-0014.

The BOM PDF uses pdf-lib's standard Helvetica and Courier fonts, which encode WinAnsi/CP1252.
`sanitize` permits every character that encoding supports and safely substitutes unsupported
characters rather than allowing PDF generation to fail.

Embedding a TrueType font with `@pdf-lib/fontkit` would support more writing systems and could use
the product typeface, but it would add a dependency, font data, and subsetting work. Keep the
standard fonts until a concrete visitor or catalog requirement needs characters outside CP1252.

Western European text and CP1252 punctuation render correctly. Characters outside CP1252, such as
Polish `ł`, Cyrillic, and CJK, remain substituted. Part names and visitor-entered design metadata
must degrade safely rather than preventing a BOM download.
