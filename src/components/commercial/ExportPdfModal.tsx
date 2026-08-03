import { useMemo, useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import type { AppSettings } from "@/domain/app-settings";
import { totalPathLength } from "@/domain/parts";
import { generateQuotePdf } from "@/domain/commercial/quote-pdf";
import { formatQuoteDate } from "@/domain/pdf-typesetting";
import {
  quoteReadiness,
  quoteSubtotal,
  type QuoteBlocker,
  type QuoteBlockerTab,
  type ReadyQuote
} from "@/domain/commercial/quote-readiness";
import type { SettingsTab } from "@/components/commercial/SettingsModal";
import type { Platform } from "@/platform/types";
import type { DesignState } from "@/types";
import "@/components/commercial/ExportPdfModal.css";

export type ExportPdfModalProps = {
  design: DesignState;
  settings: AppSettings;
  /** Where the generated PDF goes. Supplied by the host; see `Platform`. */
  savePdf: Platform["savePdf"];
  onClose: () => void;
  onError?: (message: string) => void;
  /** Jump to the Settings screen that resolves a blocker. */
  onOpenSettings: (tab: SettingsTab) => void;
};

export function ExportPdfModal({
  design,
  settings,
  savePdf,
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
      savePdf={savePdf}
      onClose={onClose}
      onError={onError}
    />
  );
}

type QuotePreviewDialogProps = {
  design: DesignState;
  quote: ReadyQuote;
  savePdf: Platform["savePdf"];
  onClose: () => void;
  onError?: (message: string) => void;
};

function QuotePreviewDialog({ design, quote, savePdf, onClose, onError }: QuotePreviewDialogProps) {
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
    setBusy("download");
    try {
      const bytes = await generateQuotePdf(design, quote, { date });
      const result = await savePdf(bytes, previewFilename);
      if (result.canceled) return;
      if (result.error) onError?.(`Export failed: ${result.error}`);
    } catch (err) {
      onError?.(`Export failed: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal label="Quote preview" onClose={onClose} size="xl">
      <>
        <div className="modal__header quote__header">
          <Icons.Pdf size={16} />
          <div className="modal__title">Export PDF quote</div>
          <div className="quote__filename">{previewFilename}</div>
          <div className="modal__spacer" />
          <button
            className="topbtn primary"
            onClick={() => void handleDownload()}
            disabled={!!busy}
          >
            <Icons.Download size={12} /> {busy === "download" ? "Saving…" : "Download"}
          </button>
          <button onClick={onClose} className="icon-btn" aria-label="Close quote preview">
            <Icons.Close size={14} />
          </button>
        </div>

        <div className="quote__scroll">
          <div className="quote-paper">
            <div className="quote-paper__masthead">
              <div>
                <div className="quote-paper__company">{company.name}</div>
                {company.tagline && <div className="quote-paper__tagline">{company.tagline}</div>}
                {(company.address || contactLine) && (
                  <div className="quote-paper__contact">
                    {company.address}
                    {company.address && contactLine && <br />}
                    {contactLine}
                  </div>
                )}
              </div>
              <div className="quote-paper__meta">
                <div className="quote-paper__wordmark">QUOTE</div>
                <div className="quote-paper__reference">
                  No. {quote.quoteNumber}
                  <br />
                  Date {date}
                  <br />
                  Valid 60 days
                </div>
              </div>
            </div>

            <div className="quote-paper__parties">
              <div>
                <div className="quote-paper__caption">BILL TO</div>
                <div className="quote-paper__party-name">{quote.billTo?.name}</div>
                <div className="quote-paper__party-lines">
                  {quote.billTo?.lines.map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="quote-paper__caption">PROJECT</div>
                <div className="quote-paper__party-name">{project?.name}</div>
                <div className="quote-paper__party-lines">
                  {project?.lines.map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <table className="quote-paper__table">
              <thead>
                <tr>
                  <th>PART NUMBER</th>
                  <th>DESCRIPTION</th>
                  <th className="quote-paper__num">QTY</th>
                  <th className="quote-paper__num">UNIT</th>
                  <th className="quote-paper__num">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="quote-paper__part-no">{r.partNo}</td>
                    <td>
                      {r.name}
                      {r.note ? <div className="quote-paper__row-note">{r.note}</div> : null}
                    </td>
                    <td className="quote-paper__num">{r.qty}</td>
                    <td className="quote-paper__num">${r.unitPrice.toFixed(2)}</td>
                    <td className="quote-paper__num">${(r.qty * r.unitPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="quote-paper__totals">
              <div className="quote-paper__totals-inner">
                <PdfRow l="Subtotal" v={`$${subtotal.toFixed(2)}`} />
                <PdfRow
                  l={`Tax (${String(+(quote.taxRate * 100).toFixed(4))}%)`}
                  v={`$${tax.toFixed(2)}`}
                />
                <div className="quote-paper__grand">
                  <PdfRow l="Quote total" v={`$${total.toFixed(2)}`} bold />
                </div>
              </div>
            </div>

            <div className="quote-paper__notes">
              <div className="quote-paper__caption">NOTES</div>
              <div className="quote-paper__notes-body">{quote.notes}</div>
            </div>
          </div>
        </div>
      </>
    </Modal>
  );
}

function PdfRow({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return (
    <div className={`quote-paper__total-row${bold ? " quote-paper__total-row--bold" : ""}`}>
      <span className="quote-paper__total-label">{l}</span>
      <span className="quote-paper__total-value">{v}</span>
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
    <Modal label="Finish setup before quoting" onClose={onClose} size="md">
      <>
        <div className="modal__header">
          <Icons.Warn size={14} />
          <div className="modal__title">Finish setup before quoting</div>
          <div className="modal__spacer" />
          <button onClick={onClose} className="icon-btn" aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>

        <div className="quote-blocked__body">
          <p className="quote-blocked__lede">
            A quote prints prices and company details straight onto a customer-facing document, so
            PTSBuilder ships none of its own. Fill these in and the quote is ready:
          </p>
          <ul className="quote-blocked__list">
            {blockers.map((blocker) => (
              <li key={`${blocker.tab}:${blocker.label}`} className="quote-blocked__item">
                <span aria-hidden className="quote-blocked__dot" />
                {blocker.label}
                <span className="quote-blocked__where">
                  Settings › {BLOCKER_TAB_LABELS[blocker.tab]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="quote-blocked__footer">
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
