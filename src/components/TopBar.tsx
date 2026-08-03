import { useEffect, useRef, useState, type ReactNode } from "react";
import "@/components/TopBar.css";
import { Icons } from "@/components/Icons";
import type { SettingsMenuItem } from "@/products/types";

export type TopBarProps = {
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  /** Shown beside the File menu; carries an asterisk when unsaved. */
  documentLabel?: string;
  /**
   * The Settings screens this product offers. Empty hides the Edit menu — a
   * menu that opens nothing is worse than no menu.
   */
  /** The product name shown in the brand slot. */
  productName: string;
  settingsMenu: SettingsMenuItem[];
  onEdit: (tab: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  bomOpen: boolean;
  onToggleBom: () => void;
  showLabels: boolean;
  onShowLabelsChange: (next: boolean) => void;
  onAbout: () => void;
};

export function TopBar({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  documentLabel,
  productName,
  settingsMenu,
  onEdit,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  bomOpen,
  onToggleBom,
  showLabels,
  onShowLabelsChange,
  onAbout
}: TopBarProps) {
  return (
    <div className="topbar nosel">
      <div className="topbar__brand">{productName}</div>
      <FileMenu onNew={onNew} onOpen={onOpen} onSave={onSave} onSaveAs={onSaveAs} />
      {documentLabel && (
        <span className="topbar__document nosel" title={documentLabel}>
          {documentLabel}
        </span>
      )}
      <EditMenu items={settingsMenu} onEdit={onEdit} />
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
        className={"topbtn topbar-no-drag" + (showLabels ? " active" : "")}
        title={showLabels ? "Hide part labels" : "Show part labels"}
        onClick={() => onShowLabelsChange(!showLabels)}
        aria-pressed={showLabels}
      >
        <Icons.Tag size={14} /> {showLabels ? "Hide Labels" : "Show Labels"}
      </button>
      <button
        className={"topbtn topbar-no-drag" + (bomOpen ? " active" : "")}
        title={bomOpen ? "Hide BOM" : "Show BOM"}
        onClick={onToggleBom}
        aria-pressed={bomOpen}
      >
        <Icons.Bom size={14} /> BOM
      </button>
      <button
        className="topbtn icon topbar-no-drag"
        title="About"
        aria-label="About"
        onClick={onAbout}
      >
        <Icons.Info size={15} />
      </button>
    </div>
  );
}

function FileMenu({
  onNew,
  onOpen,
  onSave,
  onSaveAs
}: {
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
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

  const choose = (fn?: () => void) => {
    setOpen(false);
    fn?.();
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
          {onNew && (
            <MenuItem onSelect={() => choose(onNew)} icon={<Icons.New size={14} />} label="New" />
          )}
          {onOpen && (
            <MenuItem
              onSelect={() => choose(onOpen)}
              icon={<Icons.Open size={14} />}
              label="Open…"
            />
          )}
          {onSave && (
            <MenuItem
              onSelect={() => choose(onSave)}
              icon={<Icons.Save size={14} />}
              label="Save"
            />
          )}
          {onSaveAs && (
            <MenuItem
              onSelect={() => choose(onSaveAs)}
              icon={<Icons.Save size={14} />}
              label="Save As…"
            />
          )}
        </div>
      )}
    </div>
  );
}

function EditMenu({ items, onEdit }: { items: SettingsMenuItem[]; onEdit: (tab: string) => void }) {
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

  if (items.length === 0) return null;

  const choose = (tab: string) => {
    setOpen(false);
    onEdit(tab);
  };

  return (
    <div ref={rootRef} className="topbar-menu">
      <button
        className={"topbtn topbar-no-drag" + (open ? " active" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Edit {open ? <Icons.ChevU size={12} /> : <Icons.ChevD size={12} />}
      </button>
      {open && (
        <div role="menu" className="topbar-menu__panel topbar-menu__panel--edit topbar-no-drag">
          {items.map((item) => (
            <MenuItem
              key={item.id}
              onSelect={() => choose(item.id)}
              icon={item.icon}
              label={item.label}
            />
          ))}
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
