import { useEffect, useRef, useState } from "react";
import "@/components/TopBar.css";
import { Icons } from "@/components/Icons";
import { STANDARD_VIEWS, type CameraView } from "@/renderer/camera-views";

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
  /** Point the camera at one of the named angles, or back at the default. */
  onView: (view: CameraView | null) => void;
  /** Whether height markers are pinned on rather than following the tool. */
  markersOn: boolean;
  onToggleMarkers: () => void;
};

export function TopBar({
  onNew,
  productName,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAutoBuild,
  autoBuilding,
  onView,
  markersOn,
  onToggleMarkers
}: TopBarProps) {
  return (
    <div className="topbar nosel">
      <div className="topbar__brand">{productName}</div>
      {/* "New" rather than a File menu that only ever held it: a menu with one
          item is a click in front of the thing it contains. */}
      <button className="topbtn topbar-no-drag" onClick={onNew}>
        <Icons.New size={16} /> New
      </button>
      <ViewMenu onView={onView} markersOn={markersOn} onToggleMarkers={onToggleMarkers} />
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

/**
 * The View menu: the named angles to snap the camera to, and whether height
 * markers are showing. Both were asked for as "features as part of a View
 * menu". The markers item is a live readout that can also be driven: it is
 * ticked whenever markers are on the screen, including when the app turned them
 * on itself, and clicking it overrides that until the app next changes its mind.
 */
function ViewMenu({
  onView,
  markersOn,
  onToggleMarkers
}: {
  onView: (view: CameraView | null) => void;
  markersOn: boolean;
  onToggleMarkers: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="topbar-menu">
      <button
        className={"topbtn topbar-no-drag" + (open ? " active" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        View {open ? <Icons.ChevU size={13} /> : <Icons.ChevD size={13} />}
      </button>
      {open && (
        <div role="menu" className="topbar-menu__panel topbar-no-drag">
          <button
            role="menuitemcheckbox"
            aria-checked={markersOn}
            className="viewmenu-item"
            onClick={() => choose(onToggleMarkers)}
          >
            <span className="viewmenu-item__check">{markersOn && <Icons.Check size={12} />}</span>
            Height markers
          </button>
          <div className="topbar-menu__divider" />
          {STANDARD_VIEWS.map((view) => (
            <button
              key={view.id}
              role="menuitem"
              className="viewmenu-item"
              onClick={() => choose(() => onView(view))}
            >
              <span className="viewmenu-item__check" />
              {view.label}
            </button>
          ))}
          <div className="topbar-menu__divider" />
          <button
            role="menuitem"
            className="viewmenu-item"
            onClick={() => choose(() => onView(null))}
          >
            <span className="viewmenu-item__check" />
            Reset view
          </button>
        </div>
      )}
    </div>
  );
}
