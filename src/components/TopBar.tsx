import { useEffect, useRef, useState, type ReactNode } from "react";
import "@/components/TopBar.css";
import { Icons } from "@/components/Icons";

export type TopBarProps = {
  onNew: () => void;
  /** Shown beside the File menu. */
  documentLabel?: string;
  /** The product name shown in the brand slot. */
  productName: string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  bomOpen: boolean;
  onToggleBom: () => void;
};

export function TopBar({
  onNew,
  documentLabel,
  productName,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  bomOpen,
  onToggleBom
}: TopBarProps) {
  return (
    <div className="topbar nosel">
      <div className="topbar__brand">{productName}</div>
      <FileMenu onNew={onNew} />
      {documentLabel && (
        <span className="topbar__document nosel" title={documentLabel}>
          {documentLabel}
        </span>
      )}
      <button
        className="topbtn icon topbar-no-drag"
        title="Undo (⌘Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <Icons.Undo size={15} />
      </button>
      <button
        className="topbtn icon topbar-no-drag"
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <Icons.Redo size={15} />
      </button>
      <div className="topbar__spacer" />
      <button
        className={"topbtn topbar-no-drag" + (bomOpen ? " active" : "")}
        title={bomOpen ? "Hide BOM" : "Show BOM"}
        onClick={onToggleBom}
        aria-pressed={bomOpen}
      >
        <Icons.Bom size={14} /> BOM
      </button>
    </div>
  );
}

function FileMenu({ onNew }: { onNew: () => void }) {
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
        File {open ? <Icons.ChevU size={12} /> : <Icons.ChevD size={12} />}
      </button>
      {open && (
        <div role="menu" className="topbar-menu__panel topbar-menu__panel--file topbar-no-drag">
          <MenuItem onSelect={() => choose(onNew)} icon={<Icons.New size={14} />} label="New" />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onSelect,
  icon,
  label
}: {
  onSelect: () => void;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <button className="filemenu-item topbar-no-drag" role="menuitem" onClick={onSelect}>
      {icon}
      {label}
    </button>
  );
}
