import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { bomRows, totalPathLength } from "@/domain/parts";
import type { DesignState } from "@/types";

export type QuotePdfOptions = {
  quoteNumber?: string;
  date?: string;
  billTo?: { name: string; lines: string[] };
  project?: { name: string; lines: string[] };
  notes?: string;
  taxRate?: number;
};

const DEFAULT_BILL_TO = {
  name: "Mercy Regional Hospital",
  lines: ["Attn: David Choi, Facilities", "1212 Sherman Way, Akron OH 44303"]
};

const DEFAULT_PROJECT_NAME = "Building 07 Lab Wing — KEL2020";

const DEFAULT_NOTES =
  "Pricing reflects KEL2020 single-direction system. Installation, electrical, and " +
  "site preparation quoted separately. Stock tube count includes 6ft sections that " +
  "will be cut on-site to required lengths; offcuts are not warranted.";

const DEFAULT_QUOTE_NUMBER = "Q-2026-0184";
const DEFAULT_TAX_RATE = 0.0825;

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

function sanitize(s: string): string {
  // pdf-lib's WinAnsi encoding rejects many unicode codepoints. The em-dash is
  // the only non-ASCII char we intentionally emit (—); fall back to "-"
  // for anything outside latin-1, since fonts are StandardFonts (WinAnsi).
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x2014) out += "—";
    else if (code < 0x20 || code > 0x7e) out += "-";
    else out += ch;
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

export async function generateQuotePdf(
  design: DesignState,
  options: QuotePdfOptions = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const p: Painter = { page, sans, sansBold, mono };

  const billTo = options.billTo ?? DEFAULT_BILL_TO;
  const project = options.project ?? {
    name: DEFAULT_PROJECT_NAME,
    lines: [
      `Single-direction · ${totalPathLength(design).toFixed(1)}ft centerline`,
      `Designed in PTSBuilder · System file ${design.metadata.filename}`
    ]
  };
  const quoteNumber = options.quoteNumber ?? DEFAULT_QUOTE_NUMBER;
  const date = options.date ?? formatQuoteDate();
  const notes = options.notes ?? DEFAULT_NOTES;
  const taxRate = options.taxRate ?? DEFAULT_TAX_RATE;

  // Letterhead
  let y = PAGE_HEIGHT - MARGIN_TOP;
  drawText(p, "Kelly Systems", MARGIN_X, y, { size: 20, font: sansBold });
  drawRightText(p, "QUOTE", PAGE_WIDTH - MARGIN_X, y, {
    size: 20,
    font: sansBold,
    color: INK
  });

  y -= 14;
  drawText(p, "Pneumatic Tube Systems · Established 1972", MARGIN_X, y, {
    size: 9,
    color: DIM
  });
  drawRightText(p, `No. ${quoteNumber}`, PAGE_WIDTH - MARGIN_X, y, {
    size: 9,
    font: mono,
    color: DIM
  });

  y -= 18;
  drawText(p, "4520 Industrial Pkwy · Cleveland, OH 44135", MARGIN_X, y, {
    size: 9,
    color: DIM
  });
  drawRightText(p, `Date ${date}`, PAGE_WIDTH - MARGIN_X, y, {
    size: 9,
    font: mono,
    color: DIM
  });

  y -= 12;
  drawText(p, "(216) 555-0114 · sales@kellysystems.example", MARGIN_X, y, {
    size: 9,
    color: DIM
  });
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
  const rows = bomRows(design);
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
