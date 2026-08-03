import { Icons } from "@/components/Icons";
import { isPricedRow, priceRows, type Pricing } from "@/domain/commercial/pricing";
import { bomRows } from "@/domain/parts";
import type { DesignState } from "@/types";
import "@/components/commercial/QuoteTotals.css";

/** 0.0825 -> "8.25" (trailing-zero trimmed) for tax-rate labels. */
function formatPct(rate: number): string {
  return String(+(rate * 100).toFixed(4));
}

export type QuoteTotalsProps = {
  design: DesignState;
  pricing: Pricing;
  taxRate: number | null;
  onExport: () => void;
};

/**
 * The money under the BOM panel's parts table: subtotal, tax, quote total, and
 * the quote export.
 *
 * The only component that renders a currency amount on screen. It lives under
 * `commercial/` so that a product forbidden to show prices does not import it,
 * rather than rendering it behind a condition someone can get wrong.
 */
export function QuoteTotals({ design, pricing, taxRate, onExport }: QuoteTotalsProps) {
  const rows = priceRows(bomRows(design), pricing);
  // Totals cover the rows that have a price. Anything unpriced is shown as such
  // rather than counted as zero, so the subtotal never quietly understates the
  // job — the "prices missing" note below says how many are excluded.
  const unpriced = rows.filter((r) => !isPricedRow(r)).length;
  const subtotal = rows.reduce((a, r) => a + (isPricedRow(r) ? r.qty * r.unitPrice : 0), 0);
  const tax = taxRate === null ? null : subtotal * taxRate;
  const total = tax === null ? null : subtotal + tax;

  return (
    <div className="bom__footer">
      <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
      <Row
        label={taxRate === null ? "Tax (not set)" : `Tax (${formatPct(taxRate)}%)`}
        value={tax === null ? "—" : `$${tax.toFixed(2)}`}
        dim
      />
      <div className="quote-totals__gap" />
      <Row label="Quote total" value={total === null ? "—" : `$${total.toFixed(2)}`} bold />
      {(unpriced > 0 || taxRate === null) && (
        <div className="quote-totals__incomplete">
          {unpriced > 0 && `${unpriced} part${unpriced === 1 ? "" : "s"} have no price. `}
          {taxRate === null && "Tax rate is not set. "}
          Totals are incomplete until these are entered in Settings.
        </div>
      )}
      <button className="bom__export" onClick={onExport}>
        <Icons.Pdf size={14} /> Export PDF quote
      </button>
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
  const modifier = bold ? " quote-totals__row--total" : dim ? " quote-totals__row--dim" : "";
  return (
    <div className={`quote-totals__row${modifier}`}>
      <span className="quote-totals__label">{label}</span>
      <span className="quote-totals__value">{value}</span>
    </div>
  );
}
