import { useState } from "react";
import { Icons } from "@/components/Icons";

export type BomExportFooterProps = {
  onExport: () => Promise<void>;
};

/**
 * PTSBuilderLite's BOM panel footer: an export, and nothing else.
 *
 * Its counterpart is `commercial/QuoteTotals`, which adds subtotal, tax and a
 * quote total. This product has no prices, so there is nothing to total.
 */
export function BomExportFooter({ onExport }: BomExportFooterProps) {
  const [busy, setBusy] = useState(false);

  const handleExport = () => {
    if (busy) return;
    setBusy(true);
    void onExport().finally(() => setBusy(false));
  };

  return (
    <div className="bom__footer">
      <button className="bom__export" onClick={handleExport} disabled={busy}>
        <Icons.Pdf size={14} /> {busy ? "Preparing…" : "Export BOM PDF"}
      </button>
    </div>
  );
}
