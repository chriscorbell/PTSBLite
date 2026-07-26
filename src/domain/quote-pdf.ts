import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { totalPathLength } from "@/domain/parts";
import type { ReadyQuote } from "@/domain/quote-readiness";
import type { DesignState } from "@/types";

/** The one field a quote does not get from settings. Defaults to today. */
export type QuotePdfOptions = {
  date?: string;
};

/** Long-form date for the quote header, e.g. "May 26, 2026". Defaults to today. */
export function formatQuoteDate(date = new Date()): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 56;
const MARGIN_TOP = 56;

const INK = rgb(0.106, 0.118, 0.149);
const DIM = rgb(0.357, 0.392, 0.451);
const MUT = rgb(0.478, 0.502, 0.564);
const HAIRLINE = rgb(0.843, 0.824, 0.773);
const NOTE_BG = rgb(0.937, 0.925, 0.875);

/**
 * Codepoints WinAnsi (CP1252) encodes above Latin-1's range — the curly quotes,
 * dashes, ellipsis and symbols that word processors produce and that therefore
 * arrive in pasted company and customer details.
 */
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178
]);

/** Characters WinAnsi cannot encode, mapped to something readable. */
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

/**
 * Coerce text into something the standard WinAnsi fonts can draw.
 *
 * The quote is typeset with `StandardFonts`, which pdf-lib encodes as WinAnsi;
 * an unencodable codepoint throws at draw time. This used to replace every
 * codepoint above 0x7e with "-", which mangled any accented name, currency
 * symbol, or smart quote — despite WinAnsi encoding all of those perfectly
 * well. Its comment claimed to allow Latin-1 while the code did not.
 *
 * Anything genuinely outside WinAnsi (CJK, Cyrillic, emoji) still degrades, but
 * to "?" rather than "-", so a substitution is legible as a substitution.
 * Embedding a Unicode font is the real fix if client text ever needs it —
 * ADR-0004 records why that is deferred.
 */
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

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

type Painter = {
  page: PDFPage;
  sans: PDFFont;
  sansBold: PDFFont;
  mono: PDFFont;
};

function drawText(
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

function drawRightText(
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

function wrapLines(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(sanitize(candidate), size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Render `quote` to PDF bytes.
 *
 * Takes a `ReadyQuote` rather than a bag of optional fields with fallbacks. The
 * fallbacks were the defect: every one of them turned a value the installer had
 * not entered into a plausible one the customer would read as authoritative.
 * There is now no argument that can express an incomplete quote (ADR-0003).
 */
export async function generateQuotePdf(
  design: DesignState,
  quote: ReadyQuote,
  options: QuotePdfOptions = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const p: Painter = { page, sans, sansBold, mono };

  const { company, billTo, quoteNumber, notes, taxRate, rows } = quote;
  // Project detail lines are derived from the design when the installer left
  // them blank — they describe the drawing, not the commercial terms.
  const project = {
    name: quote.project.name,
    lines: quote.project.lines.length
      ? quote.project.lines
      : [
          `Single-direction · ${totalPathLength(design).toFixed(1)}ft centerline`,
          `Designed in PTSBuilder · System file ${design.metadata.filename}`
        ]
  };
  const date = options.date ?? formatQuoteDate();
  const companyContact = [company.phone, company.email].filter(Boolean).join(" · ");

  // Letterhead
  let y = PAGE_HEIGHT - MARGIN_TOP;
  drawText(p, company.name, MARGIN_X, y, { size: 20, font: sansBold });
  drawRightText(p, "QUOTE", PAGE_WIDTH - MARGIN_X, y, {
    size: 20,
    font: sansBold,
    color: INK
  });

  y -= 14;
  if (company.tagline) drawText(p, company.tagline, MARGIN_X, y, { size: 9, color: DIM });
  drawRightText(p, `No. ${quoteNumber}`, PAGE_WIDTH - MARGIN_X, y, {
    size: 9,
    font: mono,
    color: DIM
  });

  y -= 18;
  if (company.address) drawText(p, company.address, MARGIN_X, y, { size: 9, color: DIM });
  drawRightText(p, `Date ${date}`, PAGE_WIDTH - MARGIN_X, y, {
    size: 9,
    font: mono,
    color: DIM
  });

  y -= 12;
  if (companyContact) drawText(p, companyContact, MARGIN_X, y, { size: 9, color: DIM });
  drawRightText(p, "Valid 60 days", PAGE_WIDTH - MARGIN_X, y, {
    size: 9,
    font: mono,
    color: DIM
  });

  // Bill-to / project block divider
  y -= 26;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.5,
    color: HAIRLINE
  });

  const blockTop = y - 16;
  const colWidth = (PAGE_WIDTH - MARGIN_X * 2) / 2;

  drawText(p, "BILL TO", MARGIN_X, blockTop, { size: 8, font: mono, color: MUT });
  drawText(p, billTo.name, MARGIN_X, blockTop - 14, { size: 11, font: sansBold });
  let billY = blockTop - 28;
  for (const line of billTo.lines) {
    drawText(p, line, MARGIN_X, billY, { size: 9, color: DIM });
    billY -= 11;
  }

  const projectX = MARGIN_X + colWidth;
  drawText(p, "PROJECT", projectX, blockTop, { size: 8, font: mono, color: MUT });
  drawText(p, project.name, projectX, blockTop - 14, { size: 11, font: sansBold });
  let projY = blockTop - 28;
  for (const line of project.lines) {
    drawText(p, line, projectX, projY, { size: 9, color: DIM });
    projY -= 11;
  }

  y = Math.min(billY, projY) - 8;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.5,
    color: HAIRLINE
  });

  // BOM table
  const tableTop = y - 18;
  const cols = {
    partNo: MARGIN_X,
    description: MARGIN_X + 110,
    qty: MARGIN_X + 320,
    unit: MARGIN_X + 380,
    total: PAGE_WIDTH - MARGIN_X
  };

  drawText(p, "PART NUMBER", cols.partNo, tableTop, { size: 8, font: mono, color: MUT });
  drawText(p, "DESCRIPTION", cols.description, tableTop, { size: 8, font: mono, color: MUT });
  drawRightText(p, "QTY", cols.qty + 30, tableTop, { size: 8, font: mono, color: MUT });
  drawRightText(p, "UNIT", cols.unit + 50, tableTop, { size: 8, font: mono, color: MUT });
  drawRightText(p, "TOTAL", cols.total, tableTop, { size: 8, font: mono, color: MUT });

  let rowY = tableTop - 8;
  page.drawLine({
    start: { x: MARGIN_X, y: rowY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: rowY },
    thickness: 0.5,
    color: HAIRLINE
  });
  rowY -= 14;

  let subtotal = 0;
  for (const row of rows) {
    const lineTotal = row.qty * row.unitPrice;
    subtotal += lineTotal;
    drawText(p, row.partNo, cols.partNo, rowY, { size: 9, font: mono });
    drawText(p, row.name, cols.description, rowY, { size: 10 });
    if (row.note) {
      drawText(p, row.note, cols.description, rowY - 10, { size: 8, color: MUT });
    }
    drawRightText(p, String(row.qty), cols.qty + 30, rowY, { size: 10, font: mono });
    drawRightText(p, money(row.unitPrice), cols.unit + 50, rowY, { size: 10, font: mono });
    drawRightText(p, money(lineTotal), cols.total, rowY, { size: 10, font: mono });
    const rowHeight = row.note ? 24 : 16;
    rowY -= rowHeight;
    page.drawLine({
      start: { x: MARGIN_X, y: rowY + 4 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: rowY + 4 },
      thickness: 0.25,
      color: HAIRLINE
    });
  }

  // Totals
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const totalsLabelX = PAGE_WIDTH - MARGIN_X - 180;
  const totalsValueX = PAGE_WIDTH - MARGIN_X;
  let totalsY = rowY - 6;

  drawText(p, "Subtotal", totalsLabelX, totalsY, { size: 10, color: DIM });
  drawRightText(p, money(subtotal), totalsValueX, totalsY, { size: 10, font: mono });
  totalsY -= 14;
  drawText(p, `Tax (${(taxRate * 100).toFixed(2)}%)`, totalsLabelX, totalsY, {
    size: 10,
    color: DIM
  });
  drawRightText(p, money(tax), totalsValueX, totalsY, { size: 10, font: mono });
  totalsY -= 10;
  page.drawLine({
    start: { x: totalsLabelX, y: totalsY },
    end: { x: totalsValueX, y: totalsY },
    thickness: 1.2,
    color: INK
  });
  totalsY -= 14;
  drawText(p, "Quote total", totalsLabelX, totalsY, { size: 12, font: sansBold });
  drawRightText(p, money(total), totalsValueX, totalsY, { size: 12, font: sansBold });

  // Notes
  const notesBoxTop = totalsY - 28;
  const notesBoxX = MARGIN_X;
  const notesBoxWidth = PAGE_WIDTH - MARGIN_X * 2;
  const notesLines = wrapLines(sans, 9.5, notes, notesBoxWidth - 24);
  const notesBoxHeight = 18 + notesLines.length * 12 + 12;
  page.drawRectangle({
    x: notesBoxX,
    y: notesBoxTop - notesBoxHeight,
    width: notesBoxWidth,
    height: notesBoxHeight,
    color: NOTE_BG
  });
  drawText(p, "NOTES", notesBoxX + 12, notesBoxTop - 16, {
    size: 8,
    font: mono,
    color: MUT
  });
  let noteY = notesBoxTop - 30;
  for (const line of notesLines) {
    drawText(p, line, notesBoxX + 12, noteY, { size: 9.5, color: INK });
    noteY -= 12;
  }

  return await doc.save({ useObjectStreams: false });
}

export function pdfBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}
