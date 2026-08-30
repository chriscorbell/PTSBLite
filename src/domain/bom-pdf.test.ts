import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "@/test/pdf-text";
import { generateBomPdf } from "@/domain/bom-pdf";
import { designFromScene, emptyDesign } from "@/domain/design-state";
import { bomRows } from "@/domain/parts";
import type { DesignMetadata, DesignState, Part } from "@/types";

const sampleParts: Part[] = [
  { id: "b", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "t2", type: "terminal", cell: [9, 0, 0], axis: [1, 0, 0] },
  { id: "u1", type: "tube", from: [2, 0, 0], to: [8, 0, 0] },
  {
    id: "n1",
    type: "bend",
    entry: [20.5, 0.5, 0.5],
    exit: [23.5, 0.5, 3.5],
    center: [20.5, 0.5, 3.5],
    inDir: [1, 0, 0],
    outDir: [0, 0, 1]
  }
];

function designWith(parts: Part[], metadata?: Partial<DesignMetadata>): DesignState {
  return designFromScene({ parts, obstacles: [] }, metadata);
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
    const design = designWith(sampleParts, { room: { width: 44, depth: 22, height: 11 } });
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

describe("the views appended to a BOM", () => {
  /**
   * A 1x1 JPEG. Small enough to inline, and real enough that `embedJpg` parses
   * it — the point of the test is that a view reaches the document at all.
   */
  const TINY_JPEG =
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

  function shot(label: string) {
    return { label, jpeg: Uint8Array.from(atob(TINY_JPEG), (c) => c.charCodeAt(0)) };
  }

  it("adds a page for every two views, after the parts list", async () => {
    const design = designWith(sampleParts);
    const plain = await PDFDocument.load(await generateBomPdf(design));
    const withViews = await PDFDocument.load(
      await generateBomPdf(design, {
        views: [shot("North-west"), shot("North-east"), shot("Top-down")]
      })
    );
    expect(plain.getPageCount()).toBe(1);
    expect(withViews.getPageCount()).toBe(3);
  });

  it("captions each view with the angle it was taken from", async () => {
    const bytes = await generateBomPdf(designWith(sampleParts), {
      views: [shot("North-west"), shot("Top-down")]
    });
    const text = extractText(Buffer.from(bytes));
    expect(text).toContain("North-west");
    expect(text).toContain("Top-down");
  });
});
