import type { ReactNode } from "react";
import { Icons } from "@/components/Icons";
import { bomRows, totalPathLength } from "@/domain/parts";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState } from "@/types";
import "@/components/RightPanel.css";

export type RightPanelProps = {
  open: boolean;
  onClose: () => void;
  design: DesignState;
  /** What sits under the parts table. */
  footer: ReactNode;
};

export function RightPanel({ open, onClose, design, footer }: RightPanelProps) {
  if (!open) return null;
  const rows = bomRows(design);
  return (
    <div className="bom nosel">
      <div className="bom__header">
        <div className="bom__title">Bill of Materials</div>
        <div className="bom__spacer" />
        <button className="bom__close" onClick={onClose} title="Close BOM" aria-label="Close BOM">
          <Icons.Close size={12} />
        </button>
      </div>
      <div className="bom__meta">
        <div className="bom__meta-row">
          <span>System:</span>
          <span className="bom__meta-value">{design.metadata.filename}</span>
        </div>
        <div className="bom__meta-row">
          <span>Path length:</span>
          <span className="bom__meta-value">
            {totalPathLength(design).toFixed(1)}ft / {MAX_CENTERLINE_FEET}ft
          </span>
        </div>
      </div>

      <div className="bom__scroll">
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

      {footer}
    </div>
  );
}
