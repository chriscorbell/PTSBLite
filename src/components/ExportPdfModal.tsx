import { useMemo, useState, type CSSProperties } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import type { AppSettings } from "@/domain/app-settings";
import { totalPathLength } from "@/domain/parts";
import { formatQuoteDate, generateQuotePdf, pdfBytesToBase64 } from "@/domain/quote-pdf";
import {
  quoteReadiness,
  quoteSubtotal,
  type QuoteBlocker,
  type QuoteBlockerTab,
  type ReadyQuote
} from "@/domain/quote-readiness";
import type { SettingsTab } from "@/components/SettingsModal";
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
  /** Jump to the Settings screen that resolves a blocker. */
  onOpenSettings: (tab: SettingsTab) => void;
};

export function ExportPdfModal({
  design,
  settings,
  onClose,
  onError,
  onOpenSettings
}: ExportPdfModalProps) {
  const readiness = useMemo(() => quoteReadiness(design, settings), [design, settings]);

  if (!readiness.ready) {
    return (
      <QuoteBlockedDialog
        blockers={readiness.blockers}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  return (
    <QuotePreviewDialog
      design={design}
      quote={readiness.quote}
      onClose={onClose}
      onError={onError}
    />
  );
}

type QuotePreviewDialogProps = {
  design: DesignState;
  quote: ReadyQuote;
  onClose: () => void;
  onError?: (message: string) => void;
};

function QuotePreviewDialog({ design, quote, onClose, onError }: QuotePreviewDialogProps) {
  const date = useMemo(() => formatQuoteDate(), []);
  // Project detail lines fall back to a description of the drawing, matching
  // what generateQuotePdf does, so preview and PDF cannot drift.
  const project = {
    name: quote.project.name,
    lines: quote.project.lines.length
      ? quote.project.lines
      : [
          `Single-direction · ${totalPathLength(design).toFixed(1)}ft centerline`,
          `Designed in PTSBuilder · System file ${design.metadata.filename}`
        ]
  };

  const company = quote.company;
  // Decorative label in the modal header; the real export filename is chosen in
  // the save dialog. Derive it from the system name so it isn't a fixed literal.
  const previewFilename = useMemo(() => {
    const base = design.metadata.filename.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+/g, "_");
    return `QUOTE_${(base || "UNTITLED").toUpperCase()}.pdf`;
  }, [design.metadata.filename]);

  const contactLine = [company.phone, company.email].filter(Boolean).join(" · ");

  const rows = quote.rows;
  const subtotal = quoteSubtotal(rows);
  const tax = subtotal * quote.taxRate;
  const total = subtotal + tax;
  const [busy, setBusy] = useState<"download" | null>(null);

  const handleDownload = async () => {
    if (busy) return;
    const api = window.ptsbuilder;
    if (!api) {
      onError?.("Download is unavailable: file bridge not connected.");
      return;
    }
    setBusy("download");
    try {
      const bytes = await generateQuotePdf(design, quote, { date });
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

  return (
    <Modal
      label="Quote preview"
      onClose={onClose}
      width="min(820px, 92%)"
      panelStyle={{ maxHeight: "88%" }}
    >
      <>
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
            {previewFilename}
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="topbtn primary"
            onClick={() => void handleDownload()}
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
              fontFamily: "'Geist Variable', system-ui, sans-serif",
              boxShadow: "0 10px 32px rgba(0,0,0,0.4)",
              minHeight: 520
            }}
          >
            <div
              style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>
                  {company.name}
                </div>
                {company.tagline && (
                  <div style={{ fontSize: 11, color: "#5B6473", marginTop: 2 }}>
                    {company.tagline}
                  </div>
                )}
                {(company.address || contactLine) && (
                  <div style={{ fontSize: 11, color: "#5B6473", marginTop: 14 }}>
                    {company.address}
                    {company.address && contactLine && <br />}
                    {contactLine}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 6, color: "#1B1E26" }}>
                  QUOTE
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 11,
                    color: "#5B6473",
                    marginTop: 4
                  }}
                >
                  No. {quote.quoteNumber}
                  <br />
                  Date {date}
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
                <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>
                  {quote.billTo?.name}
                </div>
                <div style={{ fontSize: 11, color: "#5B6473", marginTop: 2 }}>
                  {quote.billTo?.lines.map((line, i) => (
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
                <div style={{ fontSize: 13, marginTop: 4, fontWeight: 600 }}>{project?.name}</div>
                <div style={{ fontSize: 11, color: "#5B6473", marginTop: 2 }}>
                  {project?.lines.map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <table
              style={{ width: "100%", borderCollapse: "collapse", marginTop: 18, fontSize: 12 }}
            >
              <thead>
                <tr
                  style={{
                    color: "#7A8090",
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    letterSpacing: 0.5
                  }}
                >
                  <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 500 }}>
                    PART NUMBER
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 8px", fontWeight: 500 }}>
                    DESCRIPTION
                  </th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 500 }}>QTY</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", fontWeight: 500 }}>UNIT</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontWeight: 500 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={{ borderTop: "1px solid #E5E1D5" }}>
                    <td
                      style={{ padding: "10px 0", fontFamily: "var(--font-sans)", fontSize: 11.5 }}
                    >
                      {r.partNo}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      {r.name}
                      {r.note ? (
                        <div style={{ fontSize: 10, color: "#7A8090" }}>{r.note}</div>
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: "10px 8px",
                        textAlign: "right",
                        fontFamily: "var(--font-sans)"
                      }}
                    >
                      {r.qty}
                    </td>
                    <td
                      style={{
                        padding: "10px 8px",
                        textAlign: "right",
                        fontFamily: "var(--font-sans)"
                      }}
                    >
                      ${r.unitPrice.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: "10px 0",
                        textAlign: "right",
                        fontFamily: "var(--font-sans)"
                      }}
                    >
                      ${(r.qty * r.unitPrice).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <div style={{ width: 280 }}>
                <PdfRow l="Subtotal" v={`$${subtotal.toFixed(2)}`} />
                <PdfRow
                  l={`Tax (${String(+(quote.taxRate * 100).toFixed(4))}%)`}
                  v={`$${tax.toFixed(2)}`}
                />
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
                {quote.notes}
              </div>
            </div>
          </div>
        </div>
      </>
    </Modal>
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

type QuoteBlockedDialogProps = {
  blockers: QuoteBlocker[];
  onClose: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
};

const BLOCKER_TAB_LABELS: Record<QuoteBlockerTab, string> = {
  company: "Company",
  quote: "Quote",
  pricing: "Pricing"
};

/**
 * Shown instead of the preview when the quote is not ready to export.
 *
 * Blocked rather than warned: a dismissible warning would mean the PDF
 * generator has to accept placeholder data, and then only a careful click
 * stands between invented numbers and a customer. See ADR-0003.
 */
function QuoteBlockedDialog({ blockers, onClose, onOpenSettings }: QuoteBlockedDialogProps) {
  const tabs = [...new Set(blockers.map((b) => b.tab))];

  return (
    <Modal label="Finish setup before quoting" onClose={onClose} width="min(460px, 92%)">
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)"
          }}
        >
          <Icons.Warn size={14} />
          <div style={{ fontWeight: 600 }}>Finish setup before quoting</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={iconBtn} aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>

        <div style={{ padding: "16px 18px", fontSize: 13, color: "var(--text-mut)" }}>
          <p style={{ margin: "0 0 14px" }}>
            A quote prints prices and company details straight onto a customer-facing document, so
            PTSBuilder ships none of its own. Fill these in and the quote is ready:
          </p>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}
          >
            {blockers.map((blocker) => (
              <li
                key={`${blocker.tab}:${blocker.label}`}
                style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--warn)",
                    flex: "none"
                  }}
                />
                {blocker.label}
                <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                  Settings › {BLOCKER_TAB_LABELS[blocker.tab]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "12px 18px",
            borderTop: "1px solid var(--line)"
          }}
        >
          <button className="topbtn" onClick={onClose}>
            Close
          </button>
          {tabs.map((tab) => (
            <button key={tab} className="topbtn primary" onClick={() => onOpenSettings(tab)}>
              Open {BLOCKER_TAB_LABELS[tab]} settings
            </button>
          ))}
        </div>
      </>
    </Modal>
  );
}
