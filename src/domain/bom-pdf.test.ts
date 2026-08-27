import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "@/test/pdf-text";
import { generateBomPdf } from "@/domain/bom-pdf";
import { emptyDesign } from "@/domain/design-state";
import { bomRows } from "@/domain/parts";
import type { DesignState, Part } from "@/types";

const sampleParts: Part[] = [
  { id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "t2", type: "terminal", cell: [9, 0, 0], axis: [1, 0, 0] },
  { id: "u1", type: "tube", from: [2, 0, 0], to: [8, 0, 0] },
  {
    id: "n1",
    type: "bend",
    entry: [3, 0, 0],
    exit: [6, 0, 3],
    center: [3, 0, 3],
    inDir: [1, 0, 0],
    outDir: [0, 0, 1]
  }
];

function designWith(parts: Part[]): DesignState {
  return { ...emptyDesign(), parts };
}

describe("generateBomPdf", () => {
  it("produces a readable PDF", async () => {
    const bytes = await generateBomPdf(designWith(sampleParts));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("lists every part number the BOM has a quantity for", async () => {
    const design = designWith(sampleParts);
    const text = extractText(await generateBomPdf(design));
    for (const row of bomRows(design)) {
      if (row.qty === 0) continue;
      expect(text).toContain(row.partNo);
    }
  });

  it("carries the design's own dimensions", async () => {
    // Designs have no name, so the room is what identifies one document from
    // another; it has to survive onto the page.
    const design = designWith(sampleParts);
    design.metadata = { ...design.metadata, room: { width: 44, depth: 22, height: 11 } };
    const text = extractText(await generateBomPdf(design));
    expect(text).toContain("44");
    expect(text).toContain("22");
    expect(text).toContain("11");
  });

  it("names the product that generated it", async () => {
    const text = extractText(
      await generateBomPdf(designWith(sampleParts), { productName: "PTSBLite" })
    );
    expect(text).toContain("PTSBLite");
  });

  it("prints no money of any kind", async () => {
    // The defining constraint of PTSBLite. A currency symbol, a decimal
    // amount, or any of the quote's money headings reaching this document means
    // the separation has failed somewhere upstream (ADR-0011).
    const text = extractText(await generateBomPdf(designWith(sampleParts)));
    const drawn = [...text.matchAll(/\((.*?)\)\s*Tj/g)].map((m) => m[1]).join(" ");
    expect(drawn).not.toContain("$");
    expect(drawn).not.toMatch(/\d+\.\d{2}\b/);
    for (const heading of ["Subtotal", "Tax", "Total", "QUOTE", "Bill To", "EACH"]) {
      expect(drawn).not.toContain(heading);
    }
  });

  it("says so rather than printing an empty table for a design with no parts", async () => {
    const text = extractText(await generateBomPdf(emptyDesign()));
    expect(text).toContain("no parts yet");
  });
});
