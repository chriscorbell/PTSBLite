import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { bomRows, totalPathLength } from "@/domain/parts";
import {
  DIM,
  drawRightText,
  drawText,
  formatDocumentDate,
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

/** One rendered view of the design, as JPEG bytes, with the angle it was taken from. */
export type BomPdfView = { label: string; jpeg: Uint8Array };

export type BomPdfOptions = {
  /** Defaults to today. */
  date?: string;
  /** Named on the document, so a reader knows which tool produced it. */
  productName?: string;
  /**
   * Pictures of the system to append after the parts list. The client asked
   * for these so the document says what was built and not only what it is made
   * of. Empty, and the document is the parts list alone.
   */
  views?: BomPdfView[];
};

/** How wide a view is drawn, centred, with room for two on a page. */
const VIEW_WIDTH = 460;
const VIEW_GAP = 26;
const VIEW_LABEL_GAP = 22;
const VIEWS_PER_PAGE = 2;

/**
 * Render a design's bill of materials to PDF bytes.
 *
 * `BomRow` cannot carry prices, so this document cannot expose commercial
 * information. See ADR-0011.
 */
export async function generateBomPdf(
  design: DesignState,
  options: BomPdfOptions = {}
): Promise<Uint8Array> {
  const date = options.date ?? formatDocumentDate();
  const productName = options.productName ?? "PTSBLite";
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

  const { width, depth, height } = design.metadata.room;
  const floors = design.metadata.multiFloor ? " · 2 floors" : "";
  drawText(p, `Room ${width} x ${depth} x ${height} ft${floors}`, MARGIN_X, y, {
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

  await drawViewPages(doc, p, options.views ?? []);

  return await doc.save({ useObjectStreams: false });
}

/**
 * The pictures of the system, two to a page after the parts list.
 *
 * Each is captioned with the angle it was taken from, which is what makes a
 * page of five near-identical shaded boxes navigable — and the captions match
 * the View menu, so a reader can put the model on screen in the same pose.
 */
async function drawViewPages(doc: PDFDocument, p: Painter, views: BomPdfView[]): Promise<void> {
  const x = (PAGE_WIDTH - VIEW_WIDTH) / 2;
  for (let i = 0; i < views.length; i += VIEWS_PER_PAGE) {
    const page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const painter: Painter = { ...p, page };
    let y = PAGE_HEIGHT - MARGIN_TOP;
    for (const view of views.slice(i, i + VIEWS_PER_PAGE)) {
      const image = await doc.embedJpg(view.jpeg);
      const height = (image.height / image.width) * VIEW_WIDTH;
      drawText(painter, view.label, x, y - 9, { size: 9, color: MUT });
      y -= VIEW_LABEL_GAP;
      page.drawImage(image, { x, y: y - height, width: VIEW_WIDTH, height });
      y -= height + VIEW_GAP;
    }
  }
}
