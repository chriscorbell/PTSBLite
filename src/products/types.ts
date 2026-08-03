import type { ReactNode } from "react";
import type { DesignMetadata, DesignState } from "@/types";

/**
 * The parts of the app that differ between PTSBuilder and PTSBuilderLite.
 *
 * `App` holds the editor — the document, undo/redo, placement, tools, the
 * viewport — because that is identical in both products. Everything commercial
 * is supplied from outside as a slot, which is what keeps prices, quotes and
 * seller identity out of the Lite build's module graph entirely. A conditional
 * would not: a static import puts a module in the bundle whatever the condition
 * around it says.
 *
 * See ADR-0011.
 */
export type ProductSurfaces = {
  /** "PTSBuilder" or "PTSBuilderLite". Shown in the UI and in exported files. */
  name: string;

  /**
   * The Settings screens this product offers, in menu order. An empty list
   * hides the Settings menu rather than showing one that opens nothing.
   */
  settingsMenu: SettingsMenuItem[];

  /**
   * A message for the app's error area, or null.
   *
   * Rendered directly rather than copied into the shell's own flash state: the
   * shell's flashes are transient and self-clearing, while a product failure
   * like "settings not saved" should stay up until the product decides it is
   * resolved. Whichever of the two is set is what shows.
   */
  error: string | null;

  /** Render the settings screen for `tab`. */
  renderSettings: (args: SettingsSlotArgs) => ReactNode;

  /**
   * What sits under the BOM panel's parts table. Quote totals and a quote
   * export in PTSBuilder; a BOM export in PTSBuilderLite.
   */
  renderBomFooter: (args: SlotArgs) => ReactNode;

  /**
   * Anything the product mounts at the top level — the quote preview, the
   * update prompt. Rendered above the shell, below the confirm dialog.
   */
  renderOverlays: (args: SlotArgs) => ReactNode;
};

export type SlotArgs = {
  design: DesignState;
  /**
   * Open one of this product's settings screens. `App` owns which one is open,
   * because the Edit menu that usually opens them is part of the shell.
   */
  openSettings: (tab: string) => void;
};

export type SettingsMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
};

export type SettingsSlotArgs = {
  /** Which screen to open on, from `settingsMenu`. */
  tab: string;
  /**
   * Per-design values — system name, revision, build area. These belong to the
   * document rather than to the product, so `App` owns them and both products'
   * settings screens edit them through here.
   */
  metadata: DesignMetadata;
  onMetadataChange: (next: DesignMetadata) => void;
  onClose: () => void;
};
