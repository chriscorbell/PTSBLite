import { PDFDocument, StandardFonts } from "pdf-lib";
import { bomRows, totalPathLength } from "@/domain/parts";
import {
  DIM,
  drawRightText,
  drawText,
  formatQuoteDate,
  HAIRLINE,
  MARGIN_TOP,
  MARGIN_X,
  MUT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type Painter
} from "@/domain/pdf-typesetting";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState } from "@/types";

export type BomPdfOptions = {
  /** Defaults to today. */
  date?: string;
  /** Named on the document, so a reader knows which tool produced it. */
  productName?: string;
};

/**
 * Render a design's bill of materials to PDF bytes.
 *
 * A separate renderer rather than the quote with its money hidden. Threading a
 * flag through `generateQuotePdf` would have meant a document built around
 * `ReadyQuote` — a type that requires prices, a tax rate, seller identity and
 * customer details — and one wrong condition away from printing them. This
 * takes `BomRow[]`, which cannot carry a price at all. See ADR-0011.
 *
 * What it deliberately omits: unit prices, line totals, subtotal, tax, quote
 * total, seller letterhead, customer block, quote number and terms.
 */
export async function generateBomPdf(
  design: DesignState,
  options: BomPdfOptions = {}
): Promise<Uint8Array> {
  const date = options.date ?? formatQuoteDate();
  const productName = options.productName ?? "PTSBuilder";
  const rows = bomRows(design).filter((row) => row.qty > 0);

  const doc = await PDFDocument.create();
  // Standard fonts, encoded WinAnsi — see ADR-0004 and `sanitize`.
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const p: Painter = { page, sans, sansBold, mono };

  const right = PAGE_WIDTH - MARGIN_X;
  let y = PAGE_HEIGHT - MARGIN_TOP;

  drawText(p, "Bill of Materials", MARGIN_X, y, { size: 20, font: sansBold });
  drawRightText(p, date, right, y, { size: 9, color: DIM });
  y -= 26;

  drawText(p, design.metadata.filename, MARGIN_X, y, { size: 11 });
  drawRightText(p, `Revision ${design.metadata.revision}`, right, y, { size: 9, color: DIM });
  y -= 16;

  const { width, depth, height } = design.metadata.buildArea;
  drawText(p, `Build area ${width} x ${depth} x ${height} ft`, MARGIN_X, y, {
    size: 9,
    color: DIM
  });
  drawRightText(
    p,
    `Centerline ${totalPathLength(design).toFixed(1)} ft of ${MAX_CENTERLINE_FEET} ft`,
    right,
    y,
    { size: 9, color: DIM }
  );
  y -= 22;

  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: right, y },
    thickness: 1,
    color: HAIRLINE
  });
  y -= 18;

  const qtyRight = right;
  const partNoX = MARGIN_X + 250;
  drawText(p, "DESCRIPTION", MARGIN_X, y, { size: 8, color: MUT });
  drawText(p, "PART NO.", partNoX, y, { size: 8, color: MUT });
  drawRightText(p, "QTY", qtyRight, y, { size: 8, color: MUT });
  y -= 14;

  for (const row of rows) {
    drawText(p, row.name, MARGIN_X, y, { size: 10 });
    drawText(p, row.partNo, partNoX, y, { size: 9, font: mono, color: DIM });
    drawRightText(p, String(row.qty), qtyRight, y, { size: 10, font: mono });
    y -= 13;
    if (row.note) {
      drawText(p, row.note, MARGIN_X, y, { size: 8, color: MUT });
      y -= 12;
    }
    y -= 3;
  }

  if (rows.length === 0) {
    drawText(p, "This design has no parts yet.", MARGIN_X, y, { size: 10, color: MUT });
    y -= 16;
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: right, y },
    thickness: 1,
    color: HAIRLINE
  });

  drawText(p, `Generated with ${productName}`, MARGIN_X, MARGIN_TOP - 20, {
    size: 8,
    color: MUT
  });

  return await doc.save({ useObjectStreams: false });
}
