import { inflateSync } from "node:zlib";

/**
 * The text a PDF actually draws.
 *
 * Parses raw bytes rather than going through pdf-lib's load path, so the
 * assertions stay independent of how the writer encoded its streams: find every
 * `stream ... endstream`, inflate it if it looks compressed, then collect the
 * `(literal) Tj` and `<hex> Tj` payloads.
 *
 * The BOM suite asserts on what is absent — that no currency amount reaches the
 * page — and an extractor that quietly returned nothing would make that pass
 * for the wrong reason.
 */
export function extractText(bytes: Uint8Array): string {
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
