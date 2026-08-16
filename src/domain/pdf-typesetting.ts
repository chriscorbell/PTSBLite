import { rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Typesetting primitives for the bill-of-materials PDF. */

/** Long-form document date, e.g. "May 26, 2026". Defaults to today. */
export function formatDocumentDate(date = new Date()): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN_X = 56;
export const MARGIN_TOP = 56;

export const INK = rgb(0.106, 0.118, 0.149);
export const DIM = rgb(0.357, 0.392, 0.451);
export const MUT = rgb(0.478, 0.502, 0.564);
export const HAIRLINE = rgb(0.843, 0.824, 0.773);

const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178
]);

/**
 * Codepoints WinAnsi (CP1252) encodes above Latin-1's range — the curly quotes,
 * dashes, ellipsis and symbols that word processors produce.
 */
const TRANSLITERATIONS: Record<string, string> = {
  "‑": "-", // non-breaking hyphen
  "‒": "-", // figure dash
  "―": "-", // horizontal bar
  "′": "'", // prime
  "″": '"', // double prime
  " ": " ", // no-break space (encodable, but a plain space lays out better)
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " "
};

export function sanitize(s: string): string {
  let out = "";
  for (const ch of s) {
    const replacement = TRANSLITERATIONS[ch];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    const encodable =
      (code >= 0x20 && code <= 0x7e) || // ASCII printable
      (code >= 0xa0 && code <= 0xff) || // Latin-1 supplement
      CP1252_EXTRAS.has(code);
    out += encodable ? ch : "?";
  }
  return out;
}

export type Painter = {
  page: PDFPage;
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
};

export function drawText(
  p: Painter,
  text: string,
  x: number,
  y: number,
  opts: { size: number; font?: PDFFont; color?: ReturnType<typeof rgb> }
): void {
  p.page.drawText(sanitize(text), {
    x,
    y,
    size: opts.size,
    font: opts.font ?? p.sans,
    color: opts.color ?? INK
  });
}

export function drawRightText(
  p: Painter,
  text: string,
  rightX: number,
  y: number,
  opts: { size: number; font?: PDFFont; color?: ReturnType<typeof rgb> }
): void {
  const font = opts.font ?? p.sans;
  const safe = sanitize(text);
  const width = font.widthOfTextAtSize(safe, opts.size);
  p.page.drawText(safe, {
    x: rightX - width,
    y,
    size: opts.size,
    font,
    color: opts.color ?? INK
  });
}
