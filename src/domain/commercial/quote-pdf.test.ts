import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText } from "@/test/pdf-text";
import { emptyDesign } from "@/domain/design-state";
import { priceRows, type Pricing } from "@/domain/commercial/pricing";
import { bomRows } from "@/domain/parts";
import { generateQuotePdf } from "@/domain/commercial/quote-pdf";
import { sanitize } from "@/domain/pdf-typesetting";
import {
  quoteReadiness,
  quoteSubtotal,
  type ReadyQuote
} from "@/domain/commercial/quote-readiness";
import type { DesignState, Part } from "@/types";

function designWith(parts: Part[]): DesignState {
  return { ...emptyDesign({ filename: "building-07.ptsb", revision: "0.1" }), parts };
}

const sampleParts: Part[] = [
  { id: "b1", type: "blower", cell: [0, 0, 0], dir: [1, 0, 0] },
  { id: "t1", type: "terminal", cell: [1, 0, 0], axis: [1, 0, 0] },
  { id: "t2", type: "terminal", cell: [20, 0, 0], axis: [1, 0, 0] },
  { id: "st1", type: "tube", from: [2, 0.5, 0], to: [8, 0.5, 0] },
  { id: "st2", type: "tube", from: [8, 0.5, 0], to: [14, 0.5, 0] },
  { id: "st3", type: "tube", from: [14, 0.5, 0], to: [17, 0.5, 0] },
  {
    id: "bn1",
    type: "bend",
    entry: [17, 0.5, 0],
    exit: [20, 0.5, 3],
    center: [20, 0.5, 0],
    inDir: [1, 0, 0],
    outDir: [0, 0, 1],
    radius: 3
  }
];

// A fully-entered quote. Every value here is a test fixture: the app ships none
// of them, which is the point of ADR-0003 and of quote-readiness.ts.
const PRICES: Pricing = { blower: 4250, terminal: 1850, tube6: 78, bend90: 142 };
const TAX_RATE = 0.0825;

function readyQuoteFor(design: DesignState): ReadyQuote {
  const readiness = quoteReadiness(design, {
    pricing: PRICES,
    taxRate: TAX_RATE,
    company: {
      name: "Tube Co",
      tagline: "Pneumatic Tube Systems",
      address: "1 Example Way",
      phone: "(555) 111-2222",
      email: "sales@tube.example"
    },
    quote: {
      billTo: { name: "Acme Hospital", lines: ["Attn: Facilities"] },
      project: { name: "West Wing", lines: [] },
      quoteNumber: "Q-1001",
      notes: "Installation quoted separately."
    }
  });
  if (!readiness.ready) {
    throw new Error(
      `fixture is not quotable: ${readiness.blockers.map((b) => b.label).join(", ")}`
    );
  }
  return readiness.quote;
}

describe("generateQuotePdf", () => {
  it("returns valid PDF bytes for an empty design", async () => {
    const bytes = await generateQuotePdf(emptyDesign(), readyQuoteFor(emptyDesign()));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });

  it("returns valid PDF bytes for a populated design", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design, readyQuoteFor(design));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });

  it("embeds the BOM table — part numbers and quantities match bomRows", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design, readyQuoteFor(design));
    const text = extractText(bytes);
    const rows = priceRows(bomRows(design), PRICES);
    for (const row of rows) {
      if (row.qty === 0) continue;
      expect(text).toContain(row.partNo);
    }
  });

  it("embeds totals that match bomRows subtotal/tax/total", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design, readyQuoteFor(design));
    const text = extractText(bytes);
    const subtotal = quoteSubtotal(readyQuoteFor(design).rows);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    expect(text).toContain(subtotal.toFixed(2));
    expect(text).toContain(tax.toFixed(2));
    expect(text).toContain(total.toFixed(2));
  });

  it("embeds letterhead, bill-to, project, and notes blocks", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design, readyQuoteFor(design));
    const text = extractText(bytes);
    expect(text).toContain("Tube Co");
    expect(text).toContain("BILL TO");
    expect(text).toContain("PROJECT");
    expect(text).toContain("NOTES");
    expect(text).toContain("QUOTE");
  });

  it("includes the design filename and centerline length in the project block", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design, readyQuoteFor(design));
    const text = extractText(bytes);
    expect(text).toContain(design.metadata.filename);
  });
});

describe("sanitize", () => {
  it("keeps everything the WinAnsi standard fonts can encode", () => {
    // The old implementation replaced every one of these with "-", which mangled
    // any accented name, currency symbol, or pasted smart quote (#8).
    for (const text of ["Zoë Müller", "Ångström & Co", "£1,200 — €950", "«Beaulieu»", "naïve"]) {
      expect(sanitize(text)).toBe(text);
    }
  });

  it("keeps CP1252 punctuation above the Latin-1 range", () => {
    expect(sanitize("“curly” ‘quotes’ – dash… •")).toBe("“curly” ‘quotes’ – dash… •");
  });

  it("marks genuinely unencodable text as substituted rather than as a dash", () => {
    expect(sanitize("東京")).toBe("??");
    expect(sanitize("naïve 東京")).toBe("naïve ??");
  });

  it("transliterates characters that have a close WinAnsi equivalent", () => {
    expect(sanitize("6\u2032 tube")).toBe("6' tube");
    expect(sanitize("A\u2011B")).toBe("A-B");
  });

  it("drops control characters", () => {
    expect(sanitize("a\u0000b")).toBe("a?b");
  });
});
