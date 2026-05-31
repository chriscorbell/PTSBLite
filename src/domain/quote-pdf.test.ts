import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { emptyDesign } from "@/domain/design-state";
import { bomRows } from "@/domain/parts";
import { generateQuotePdf } from "@/domain/quote-pdf";
import type { DesignState, Part } from "@/types";

function designWith(parts: Part[]): DesignState {
  return { ...emptyDesign({ filename: "BUILDING_07.kel2020", revision: "0.1" }), parts };
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

function extractText(bytes: Uint8Array): string {
  // Parse raw PDF bytes: locate every `stream ... endstream` segment, try to
  // FlateDecode it if it looks compressed, then pull `(text) Tj` and
  // `<hex> Tj` payloads. Bypasses pdf-lib's load path so the test stays
  // independent of how the writer encoded streams.
  const buf = Buffer.from(bytes);
  const collected: string[] = [];
  let cursor = 0;
  while (cursor < buf.length) {
    const streamIdx = buf.indexOf("stream", cursor);
    if (streamIdx < 0) break;
    // stream keyword must be followed by \r\n or \n per PDF spec
    let dataStart = streamIdx + "stream".length;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    const endIdx = buf.indexOf("endstream", dataStart);
    if (endIdx < 0) break;
    let dataEnd = endIdx;
    if (buf[dataEnd - 1] === 0x0a) dataEnd--;
    if (buf[dataEnd - 1] === 0x0d) dataEnd--;
    const raw = buf.subarray(dataStart, dataEnd);
    cursor = endIdx + "endstream".length;
    let body = raw.toString("latin1");
    if (raw.length >= 2 && raw[0] === 0x78) {
      try {
        body = inflateSync(raw).toString("latin1");
      } catch {
        // not flate-encoded — keep raw body
      }
    }
    const literalRe = /\((.*?)\)\s*Tj/g;
    const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = literalRe.exec(body))) {
      collected.push(m[1].replace(/\\(.)/g, "$1"));
    }
    while ((m = hexRe.exec(body))) {
      const hex = m[1].replace(/\s+/g, "");
      let out = "";
      for (let i = 0; i + 1 < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      collected.push(out);
    }
  }
  return collected.join("\n");
}

describe("generateQuotePdf", () => {
  it("returns valid PDF bytes for an empty design", async () => {
    const bytes = await generateQuotePdf(emptyDesign());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });

  it("returns valid PDF bytes for a populated design", async () => {
    const bytes = await generateQuotePdf(designWith(sampleParts));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(0);
  });

  it("embeds the BOM table — part numbers and quantities match bomRows", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design);
    const text = extractText(bytes);
    const rows = bomRows(design);
    for (const row of rows) {
      if (row.qty === 0) continue;
      expect(text).toContain(row.partNo);
    }
  });

  it("embeds totals that match bomRows subtotal/tax/total", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design);
    const text = extractText(bytes);
    const rows = bomRows(design);
    const subtotal = rows.reduce((a, r) => a + r.qty * r.unitPrice, 0);
    const tax = subtotal * 0.0825;
    const total = subtotal + tax;
    expect(text).toContain(subtotal.toFixed(2));
    expect(text).toContain(tax.toFixed(2));
    expect(text).toContain(total.toFixed(2));
  });

  it("embeds letterhead, bill-to, project, and notes blocks", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design);
    const text = extractText(bytes);
    expect(text).toContain("Kelly Systems");
    expect(text).toContain("BILL TO");
    expect(text).toContain("PROJECT");
    expect(text).toContain("NOTES");
    expect(text).toContain("QUOTE");
  });

  it("includes the design filename and centerline length in the project block", async () => {
    const design = designWith(sampleParts);
    const bytes = await generateQuotePdf(design);
    const text = extractText(bytes);
    expect(text).toContain(design.metadata.filename);
  });
});
