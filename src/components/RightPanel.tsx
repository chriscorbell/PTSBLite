import { Icons } from "@/components/Icons";
import { isPricedRow, priceRows, type Pricing } from "@/domain/commercial/pricing";
import { bomRows, totalPathLength } from "@/domain/parts";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState } from "@/types";
import "@/components/RightPanel.css";

/** 0.0825 -> "8.25" (trailing-zero trimmed) for tax-rate labels. */
function formatPct(rate: number): string {
  return String(+(rate * 100).toFixed(4));
}

export type RightPanelProps = {
  open: boolean;
  onClose: () => void;
  design: DesignState;
  pricing: Pricing;
  taxRate: number | null;
  onExport: () => void;
};

export function RightPanel({ open, onClose, design, pricing, taxRate, onExport }: RightPanelProps) {
  if (!open) return null;
  const rows = priceRows(bomRows(design), pricing);
  // Totals cover the rows that have a price. Anything unpriced is shown as such
  // rather than counted as zero, so the subtotal never quietly understates the
  // job — the "prices missing" note below says how many are excluded.
  const unpriced = rows.filter((r) => !isPricedRow(r)).length;
  const subtotal = rows.reduce((a, r) => a + (isPricedRow(r) ? r.qty * r.unitPrice : 0), 0);
  const tax = taxRate === null ? null : subtotal * taxRate;
  const total = tax === null ? null : subtotal + tax;
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
              <th className="bom__num">EACH</th>
              <th className="bom__num">TOTAL</th>
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
                <td className="bom__num bom__each">
                  {isPricedRow(r) ? `$${r.unitPrice.toFixed(2)}` : "—"}
                </td>
                <td className="bom__num bom__line-total">
                  {isPricedRow(r) ? `$${(r.qty * r.unitPrice).toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bom__totals">
        <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
        <Row
          label={taxRate === null ? "Tax (not set)" : `Tax (${formatPct(taxRate)}%)`}
          value={tax === null ? "—" : `$${tax.toFixed(2)}`}
          dim
        />
        <div className="bom__gap" />
        <Row label="Quote total" value={total === null ? "—" : `$${total.toFixed(2)}`} bold />
        {(unpriced > 0 || taxRate === null) && (
          <div className="bom__incomplete">
            {unpriced > 0 && `${unpriced} part${unpriced === 1 ? "" : "s"} have no price. `}
            {taxRate === null && "Tax rate is not set. "}
            Totals are incomplete until these are entered in Settings.
          </div>
        )}
        <button className="bom__export" onClick={onExport}>
          <Icons.Pdf size={14} /> Export PDF quote
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  dim,
  bold
}: {
  label: string;
  value: string;
  dim?: boolean;
  bold?: boolean;
}) {
  const modifier = bold ? " bom__row--total" : dim ? " bom__row--dim" : "";
  return (
    <div className={`bom__row${modifier}`}>
      <span className="bom__row-label">{label}</span>
      <span className="bom__row-value">{value}</span>
    </div>
  );
}
