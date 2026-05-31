import { useMemo, useState, type CSSProperties } from "react";
import { Icons } from "@/components/Icons";
import type { AppSettings } from "@/domain/app-settings";
import { bomRows, totalPathLength } from "@/domain/parts";
import {
  formatQuoteDate,
  generateQuotePdf,
  pdfBytesToBase64,
  type QuotePdfOptions
} from "@/domain/quote-pdf";
import type { DesignState } from "@/types";

const iconBtn: CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--text-mut)",
  background: "transparent",
  border: "1px solid transparent",
  cursor: "pointer",
  transition: "all .12s"
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-mono)" };

export type ExportPdfModalProps = {
  design: DesignState;
  settings: AppSettings;
  onClose: () => void;
  onError?: (message: string) => void;
};

export function ExportPdfModal({ design, settings, onClose, onError }: ExportPdfModalProps) {
  // One options object drives BOTH the on-screen preview and the generated PDF, so
  // they can't drift apart. Quote/customer info and tax come from global settings.
  const options: QuotePdfOptions = useMemo(() => {
    const projectLines = settings.quote.project.lines.length
      ? settings.quote.project.lines
      : [
          `Single-direction · ${totalPathLength(design).toFixed(1)}ft centerline`,
          `Designed in PTSBuilder · System file ${design.metadata.filename}`
        ];
    return {
      quoteNumber: settings.quote.quoteNumber,
      date: formatQuoteDate(),
      billTo: settings.quote.billTo,
      project: { name: settings.quote.project.name, lines: projectLines },
      notes: settings.quote.notes,
      taxRate: settings.taxRate
    };
  }, [settings, design]);

  const rows = bomRows(design);
  const subtotal = rows.reduce((a, r) => a + r.qty * r.unitPrice, 0);
  const tax = subtotal * (options.taxRate ?? 0);
  const total = subtotal + tax;
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const handleDownload = async () => {
    if (busy) return;
    const api = window.ptsbuilder;
    if (!api) {
      onError?.("Download is unavailable: file bridge not connected.");
      return;
    }
    setBusy("download");
    try {
      const bytes = await generateQuotePdf(design, options);
      const base64 = pdfBytesToBase64(bytes);
      const result = await api.exportQuote(base64);
      if (result.canceled) return;
      if (result.error) onError?.(`Export failed: ${result.error}`);
    } catch (err) {
      onError?.(`Export failed: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => {
    if (busy) return;
    // Browser-prints the on-screen preview. A true PDF-to-print pipeline
    // would require launching the system PDF viewer via Electron shell,
    // which is more work than its value here — the preview is already an
    // accurate render of the PDF layout.
    window.print();
  };
  return (
    <div
      className="nosel"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5,7,10,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(820px, 92%)",
          maxHeight: "88%",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          borderRadius: 10,
          border: "1px solid var(--line-2)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
            whiteSpace: "nowrap"
          }}
        >
          <Icons.Pdf size={16} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Export PDF quote</div>
          <div
            style={{
              ...monoStyle,
              fontSize: 11,
              color: "var(--text-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: "0 1 auto"
            }}
          >
            QUOTE_BUILDING_07_KEL2020.pdf
          </div>
          <div style={{ flex: 1 }} />
          <button className="topbtn" onClick={handlePrint} disabled={!!busy}>
            <Icons.Print size={12} /> Print
          </button>
          <button
            className="topbtn primary"
            onClick={handleDownload}
            disabled={!!busy}
          >
            <Icons.Download size={12} /> {busy === "download" ? "Saving…" : "Download"}
          </button>
          <button onClick={onClose} style={iconBtn}>
            <Icons.Close size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#0A0D12" }}>
          <div
            style={{
              background: "#F7F6F1",
              color: "#1B1E26",
              borderRadius: 4,
              padding: "38px 44px",
              fontFamily: "Geist, system-ui, sans-serif",
              boxShadow: "0 10px 32px rgba(0,0,0,0.4)",
              minHeight: 520
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Kelly Systems</div>
                <div style={{ fontSize: 11, color: "#5B6473", marginTop: 2 }}>
                  Pneumatic Tube Systems · Established 1972
                </div>
                <div style={{ fontSize: 11, color: "#5B6473", marginTop: 14 }}>
                  4520 Industrial Pkwy · Cleveland, OH 44135
                  <br />
                  (216) 555-0114 · sales@kellysystems.example
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 6, color: "#1B1E26" }}>QUOTE</div>
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    color: "#5B6473",
                    marginTop: 4
                  }}
                >
                  No. {options.quoteNumber}
                  <br />
                  Date {options.date}
                  <br />
                  Valid 60 days
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
                marginTop: 26,
                padding: "14px 0",
                borderTop: "1px solid #D7D2C5",
                borderBottom: "1px solid #D7D2C5"
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#7A8090",
                    letterSpacing: 0.5,
                    fontFamily: "var(--font-sans)"
                  }}
                >
                  BILL TO
                </div>
                <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>{options.billTo?.name}</div>
                <div style={{ fontSize: 11, color: "#5B6473", marginTop: 2 }}>
                  {options.billTo?.lines.map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#7A8090",
                    letterSpacing: 0.5,
                    fontFamily: "var(--font-sans)"
                  }}
                >
                  PROJECT
                </div>
                <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>
                  {options.project?.name}
                </div>
                <div style={{ fontSize: 11, color: "#5B6473", marginTop: 2 }}>
                  {options.project?.lines.map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18, fontSize: 12 }}>
              <thead>
                <tr
                  style={{
                    color: "#7A8090",
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    letterSpacing: 0.5
                  }}
                >
                  <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 500 }}>PART NUMBER</th>
                  <th style={{ textAlign: "left", padding: "8px 8px", fontWeight: 500 }}>DESCRIPTION</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 500 }}>QTY</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 500 }}>UNIT</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 500 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={{ borderTop: "1px solid #E5E1D5" }}>
                    <td style={{ padding: "10px 0", fontFamily: "var(--font-sans)", fontSize: 11.5 }}>
                      {r.partNo}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {r.name}
                      {r.note ? <div style={{ fontSize: 10, color: "#7A8090" }}>{r.note}</div> : null}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-sans)" }}>
                      {r.qty}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-sans)" }}>
                      ${r.unitPrice.toFixed(2)}
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "right", fontFamily: "var(--font-sans)" }}>
                      ${(r.qty * r.unitPrice).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <div style={{ width: 280 }}>
                <PdfRow l="Subtotal" v={`$${subtotal.toFixed(2)}`} />
                <PdfRow l={`Tax (${String(+((options.taxRate ?? 0) * 100).toFixed(4))}%)`} v={`$${tax.toFixed(2)}`} />
                <div style={{ borderTop: "2px solid #1B1E26", marginTop: 6, paddingTop: 8 }}>
                  <PdfRow l="Quote total" v={`$${total.toFixed(2)}`} bold />
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 28,
                padding: "14px 16px",
                background: "#EFECDF",
                borderRadius: 4
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#7A8090",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: 0.5
                }}
              >
                NOTES
              </div>
              <div style={{ fontSize: 11.5, color: "#1B1E26", marginTop: 4, lineHeight: 1.6 }}>
                {options.notes}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfRow({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "4px 0",
        fontSize: bold ? 14 : 12
      }}
    >
      <span style={{ color: bold ? "#1B1E26" : "#5B6473", fontWeight: bold ? 600 : 400 }}>{l}</span>
      <span style={{ fontFamily: "var(--font-sans)", fontWeight: bold ? 700 : 400 }}>{v}</span>
    </div>
  );
}
