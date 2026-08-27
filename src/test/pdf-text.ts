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
    cursor = endIdx + "endstream".length;
    // `endstream` is preceded by an EOL that is not part of the data — but a
    // Flate stream can itself end in 0x0A or 0x0D, and trimming those blindly
    // corrupts it. inflate then throws, the body falls back to compressed
    // bytes, no `Tj` matches, and this returns "" for a page full of text:
    // exactly the silent emptiness the note above warns about. So try the
    // longest slice first and give back only as many bytes as inflate needs.
    const body = decodeStream(buf, dataStart, endIdx);
    if (body === null) continue;
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

/**
 * The text operators inside one `stream ... endstream`, inflated when the
 * stream is compressed. Null when nothing decodes, so a caller can skip the
 * segment rather than scan compressed bytes for text that cannot be there.
 */
function decodeStream(buf: Buffer, start: number, end: number): string | null {
  for (const trim of [0, 1, 2]) {
    const candidate = buf.subarray(start, end - trim);
    if (candidate.length < 2) break;
    if (candidate[0] !== 0x78) return candidate.toString("latin1");
    try {
      return inflateSync(candidate).toString("latin1");
    } catch {
      // Trailing EOL confused the decoder; step back a byte and retry.
    }
  }
  return null;
}
