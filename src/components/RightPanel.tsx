import type { CSSProperties } from "react";
import { Icons } from "@/components/Icons";
import { bomRows, totalPathLength } from "@/domain/parts";
import type { DesignState } from "@/types";

const monoStyle: CSSProperties = { fontFamily: "var(--font-mono)" };

/** 0.0825 -> "8.25" (trailing-zero trimmed) for tax-rate labels. */
function formatPct(rate: number): string {
  return String(+(rate * 100).toFixed(4));
}
const th: CSSProperties = { textAlign: "left", padding: "6px 8px", fontWeight: 500, fontFamily: "var(--font-mono)" };
const td: CSSProperties = { padding: "8px 8px", verticalAlign: "top" };

export type RightPanelProps = {
  open: boolean;
  onClose: () => void;
  design: DesignState;
  taxRate: number;
  onExport: () => void;
};

export function RightPanel({ open, onClose, design, taxRate, onExport }: RightPanelProps) {
  if (!open) return null;
  const rows = bomRows(design);
  const subtotal = rows.reduce((a, r) => a + r.qty * r.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  return (
    <div
      className="nosel"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 336,
        maxHeight: "calc(100% - 24px)",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 6,
        pointerEvents: "auto"
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          whiteSpace: "nowrap"
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
          Bill of Materials
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Close BOM"
          aria-label="Close BOM"
          style={{
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
            background: "transparent",
            border: "1px solid var(--line)",
            color: "var(--text-mut)",
            cursor: "pointer"
          }}
        >
          <Icons.Close size={12} />
        </button>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-mut)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
          <span>System:</span>
          <span style={{ fontFamily: "var(--font-sans)", color: "var(--text)" }}>{design.metadata.filename}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            marginTop: 2,
            whiteSpace: "nowrap"
          }}
        >
          <span>Path length:</span>
          <span style={{ fontFamily: "var(--font-sans)", color: "var(--text)" }}>
            {totalPathLength(design).toFixed(1)}ft / 300ft
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px", minHeight: 60 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--text-dim)", fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: 0.6 }}>
              <th style={th}>PART</th>
              <th style={{ ...th, textAlign: "right" }}>QTY</th>
              <th style={{ ...th, textAlign: "right" }}>EACH</th>
              <th style={{ ...th, textAlign: "right" }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={td}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "var(--text)" }}>{r.name}</span>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--text-dim)" }}>{r.partNo}</span>
                    {r.note && (
                      <span style={{ fontSize: 10, color: "var(--accent)", marginTop: 2 }}>{r.note}</span>
                    )}
                  </div>
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: "right",
                    fontFamily: "var(--font-sans)",
                    color: r.qty ? "var(--text)" : "var(--text-dim)"
                  }}
                >
                  {r.qty}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-sans)", color: "var(--text-mut)" }}>
                  ${r.unitPrice.toFixed(2)}
                </td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
                  ${(r.qty * r.unitPrice).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--line)",
          background: "var(--ink-2)"
        }}
      >
        <Row label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
        <Row label={`Tax (${formatPct(taxRate)}%)`} value={`$${tax.toFixed(2)}`} dim />
        <div style={{ height: 8 }} />
        <Row label="Quote total" value={`$${total.toFixed(2)}`} bold />
        <button
          onClick={onExport}
          style={{
            marginTop: 14,
            width: "100%",
            height: 36,
            borderRadius: 6,
            background: "color-mix(in oklab, var(--accent) 18%, transparent)",
            color: "var(--accent)",
            border: "1px solid color-mix(in oklab, var(--accent) 35%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap"
          }}
        >
          <Icons.Pdf size={14} /> Export PDF quote
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, dim, bold }: { label: string; value: string; dim?: boolean; bold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "2px 0",
        whiteSpace: "nowrap"
      }}
    >
      <span style={{ fontSize: 12, color: dim ? "var(--text-dim)" : "var(--text-mut)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: bold ? 16 : 13,
          color: bold ? "var(--text)" : dim ? "var(--text-mut)" : "var(--text)",
          fontWeight: bold ? 600 : 400
        }}
      >
        {value}
      </span>
    </div>
  );
}
