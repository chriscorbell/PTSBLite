import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { ValidationSummary } from "@/components/ValidationSummary";
import { bomRows, totalPathLength } from "@/domain/parts";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState, Warning } from "@/types";
import "@/components/FinalizeModal.css";

export type FinalizeModalProps = {
  design: DesignState;
  warnings: Warning[];
  onClose: () => void;
  onExport: () => Promise<void>;
};

/**
 * What "Finalize" opens: the design's validation state, then its bill of
 * materials, then the PDF.
 *
 * A dialog rather than the docked panel it replaces. The client asked for the
 * BOM to arrive as a screen of its own — finishing a design is a moment, not a
 * side panel you leave open while you work, and the validation summary belongs
 * at the top of it where it is read before the parts list rather than beside
 * it.
 *
 * `BomRow` cannot carry a price, so nothing here can become a quote. See
 * ADR-0011.
 */
export function FinalizeModal({ design, warnings, onClose, onExport }: FinalizeModalProps) {
  const [busy, setBusy] = useState(false);
  const rows = bomRows(design);

  const handleExport = () => {
    if (busy) return;
    setBusy(true);
    void onExport().finally(() => setBusy(false));
  };

  return (
    <Modal label="Finalize" onClose={onClose} size="xl">
      <>
        <div className="modal__header">
          <Icons.Check size={16} />
          <div className="modal__title">Finalize</div>
          <div className="modal__spacer" />
          <button onClick={onClose} className="icon-btn" aria-label="Close">
            <Icons.Close size={14} />
          </button>
        </div>

        <div className="finalize__scroll">
          <ValidationSummary warnings={warnings} />

          <div className="finalize__meta">
            <div className="finalize__meta-row">
              <span>Room:</span>
              <span className="finalize__meta-value">
                {design.metadata.room.width} × {design.metadata.room.depth} ×{" "}
                {design.metadata.room.height} ft
              </span>
            </div>
            <div className="finalize__meta-row">
              <span>Path length:</span>
              <span className="finalize__meta-value">
                {totalPathLength(design).toFixed(1)}ft / {MAX_CENTERLINE_FEET}ft
              </span>
            </div>
          </div>

          <table className="bom__table">
            <thead>
              <tr>
                <th>PART</th>
                <th className="bom__num">QTY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <div className="bom__part">
                      <span className="bom__part-name">{r.name}</span>
                      <span className="bom__part-no">{r.partNo}</span>
                      {r.note && <span className="bom__part-note">{r.note}</span>}
                    </div>
                  </td>
                  <td className={`bom__num bom__qty${r.qty ? "" : " bom__qty--zero"}`}>{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal__actions">
          <button className="topbtn" onClick={onClose}>
            Keep building
          </button>
          <button className="topbtn primary" onClick={handleExport} disabled={busy}>
            <Icons.Pdf size={14} /> {busy ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </>
    </Modal>
  );
}
