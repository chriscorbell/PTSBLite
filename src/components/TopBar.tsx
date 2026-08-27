import "@/components/TopBar.css";
import { Icons } from "@/components/Icons";

export type TopBarProps = {
  onNew: () => void;
  /** The product name shown in the brand slot. */
  productName: string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Routes the open ports. Anchored here rather than in the status bar,
   * where the BOM now sits — the client asked for the two to trade places. */
  onAutoBuild: () => void;
  autoBuilding: boolean;
};

export function TopBar({
  onNew,
  productName,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAutoBuild,
  autoBuilding
}: TopBarProps) {
  return (
    <div className="topbar nosel">
      <div className="topbar__brand">{productName}</div>
      {/* "New" rather than a File menu that only ever held it: a menu with one
          item is a click in front of the thing it contains. */}
      <button className="topbtn topbar-no-drag" onClick={onNew}>
        <Icons.New size={16} /> New
      </button>
      <button
        className="topbtn icon topbar-no-drag"
        title="Undo (⌘Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <Icons.Undo size={18} />
      </button>
      <button
        className="topbtn icon topbar-no-drag"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <Icons.Redo size={18} />
      </button>
      <div className="topbar__spacer" />
      <button
        type="button"
        className="topbtn accent topbar-no-drag"
        onClick={onAutoBuild}
        disabled={autoBuilding}
      >
        <Icons.Auto size={16} /> {autoBuilding ? "Routing…" : "Auto-Build"}
      </button>
    </div>
  );
}
