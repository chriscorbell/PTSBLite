import { useCallback, useState } from "react";
import App from "@/App";
import { BomExportFooter } from "@/components/BomExportFooter";
import { DesignSettingsModal } from "@/components/DesignSettingsModal";
import { Icons } from "@/components/Icons";
import { generateBomPdf } from "@/domain/bom-pdf";
import type { Platform } from "@/platform/types";
import type { ProductSurfaces } from "@/products/types";
import type { DesignState } from "@/types";

export const LITE_PRODUCT_NAME = "PTSBuilderLite";

const SETTINGS_MENU = [
  { id: "system", label: "Design Settings…", icon: <Icons.Layers size={14} /> }
];

export type LiteProductProps = {
  platform: Platform;
};

/**
 * PTSBuilderLite, the public web product.
 *
 * Everything commercial is absent rather than hidden: no prices, no tax, no
 * seller identity, no quote. This module imports nothing from `commercial/`,
 * which is what keeps the quote renderer and the pricing model out of the
 * bundle served from a public URL. See ADR-0011.
 */
export function LiteProduct({ platform }: LiteProductProps) {
  const [error, setError] = useState<string | null>(null);

  const exportBom = useCallback(
    async (design: DesignState) => {
      try {
        const bytes = await generateBomPdf(design, { productName: LITE_PRODUCT_NAME });
        const result = await platform.savePdf(bytes, bomFilename(design));
        if (result.error) setError(`Export failed: ${result.error}`);
        else setError(null);
      } catch (err) {
        setError(`Export failed: ${String(err)}`);
      }
    },
    [platform]
  );

  const product: ProductSurfaces = {
    name: LITE_PRODUCT_NAME,
    settingsMenu: SETTINGS_MENU,
    error,

    renderSettings: ({ metadata, onMetadataChange, onClose }) => (
      <DesignSettingsModal
        metadata={metadata}
        onMetadataChange={onMetadataChange}
        onClose={onClose}
      />
    ),

    renderBomFooter: ({ design }) => <BomExportFooter onExport={() => exportBom(design)} />,

    renderOverlays: () => null
  };

  return <App platform={platform} product={product} />;
}

/** "BOM_MAIN_LOOP.pdf" from a system named "Main Loop". */
function bomFilename(design: DesignState): string {
  const base = design.metadata.filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
  return `BOM_${base || "UNTITLED"}.pdf`;
}
