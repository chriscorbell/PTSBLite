import { useCallback, useEffect, useState } from "react";
import App from "@/App";
import { Icons } from "@/components/Icons";
import { ExportPdfModal } from "@/components/commercial/ExportPdfModal";
import { QuoteTotals } from "@/components/commercial/QuoteTotals";
import { SettingsModal, type SettingsTab } from "@/components/commercial/SettingsModal";
import { UpdateNotification } from "@/components/commercial/UpdateNotification";
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from "@/domain/app-settings";
import type { Platform } from "@/platform/types";
import type { ProductSurfaces } from "@/products/types";

const SETTINGS_MENU = [
  { id: "pricing", label: "Parts Pricing…", icon: <Icons.Bom size={14} /> },
  { id: "quote", label: "Quote & Tax…", icon: <Icons.Pdf size={14} /> },
  { id: "company", label: "Company Info…", icon: <Icons.Info size={14} /> },
  { id: "system", label: "System Details…", icon: <Icons.Layers size={14} /> }
];

export type DesktopProductProps = {
  platform: Platform;
};

/**
 * PTSBuilder, the internal desktop product.
 *
 * Owns everything commercial: the installer's prices and tax rate, the quote
 * preview and its export, the seller's company details, and the updater. `App`
 * holds only the editor, and receives these as slots — which is what keeps them
 * out of PTSBuilderLite's bundle rather than merely off its screen.
 */
export function DesktopProduct({ platform }: DesktopProductProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState<string | null>(null);

  // Load persisted global settings once on startup so the BOM and quote reflect
  // the installer's saved prices.
  useEffect(() => {
    const store = platform.settings;
    if (!store) return;
    let active = true;
    void (async () => {
      const loaded = await store.load();
      if (!active) return;
      setSettings(mergeSettings(DEFAULT_SETTINGS, loaded.data ?? null));
      // A missing file on first run reports no error and no data. An actual
      // read failure looks identical from `data` alone, and silently showing
      // defaults would invite an installer to re-enter prices that are still on
      // disk, unreadable.
      if (loaded.error) setSettingsError(`Could not read saved settings: ${loaded.error}`);
    })();
    return () => {
      active = false;
    };
  }, [platform.settings]);

  // The on-brand "update ready" prompt. Listen for the live push and also query
  // for an update that finished downloading before this listener attached.
  useEffect(() => {
    const updates = platform.updates;
    if (!updates) return;
    const unsubscribe = updates.onDownloaded((info) => setUpdateReady(info.version));
    let active = true;
    void (async () => {
      const pending = await updates.getPending();
      if (active && pending) setUpdateReady(pending.version);
    })();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform.updates]);

  const updateSettings = useCallback(
    (next: AppSettings) => {
      // Applied on screen either way — the installer's typing should not vanish
      // because the disk refused it — but a failed write has to be said out
      // loud. Settings hold the only copy of part prices and the tax rate
      // (ADR-0003), so silently losing them means the next launch blocks quote
      // export again with no explanation (issue #73).
      setSettings(next);
      const store = platform.settings;
      if (!store) return;
      void (async () => {
        const result = await store.save(JSON.stringify(next, null, 2));
        if (!result.ok) setSettingsError(`Settings not saved: ${result.error ?? "unknown error"}`);
      })();
    },
    [platform.settings]
  );

  const product: ProductSurfaces = {
    name: "PTSBuilder",
    settingsMenu: SETTINGS_MENU,
    error: settingsError,

    renderSettings: ({ tab, metadata, onMetadataChange, onClose }) => (
      <SettingsModal
        tab={tab as SettingsTab}
        settings={settings}
        onSettingsChange={updateSettings}
        metadata={metadata}
        onMetadataChange={onMetadataChange}
        onClose={onClose}
      />
    ),

    renderBomFooter: ({ design }) => (
      <QuoteTotals
        design={design}
        pricing={settings.pricing}
        taxRate={settings.taxRate}
        onExport={() => setExportOpen(true)}
      />
    ),

    renderOverlays: ({ design, openSettings }) => (
      <>
        {exportOpen && (
          <ExportPdfModal
            design={design}
            savePdf={platform.savePdf}
            settings={settings}
            onClose={() => setExportOpen(false)}
            onError={setSettingsError}
            onOpenSettings={(tab) => {
              setExportOpen(false);
              openSettings(tab);
            }}
          />
        )}
        {updateReady && platform.updates && (
          <UpdateNotification
            version={updateReady}
            updates={platform.updates}
            onDismiss={() => setUpdateReady(null)}
          />
        )}
      </>
    )
  };

  return <App platform={platform} product={product} />;
}
