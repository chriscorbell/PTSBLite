import { useEffect, useRef, useState } from "react";
import "@/components/TopBar.css";
import { Icons } from "@/components/Icons";
import type { SettingsTab } from "@/components/SettingsModal";

export type TopBarProps = {
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  /** Shown beside the File menu; carries an asterisk when unsaved. */
  documentLabel?: string;
  onEdit?: (tab: SettingsTab) => void;
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
      <div className="topbar__brand">PTSBuilder</div>
      <FileMenu onNew={onNew} onOpen={onOpen} onSave={onSave} onSaveAs={onSaveAs} />
      {documentLabel && (
        <span className="topbar__document nosel" title={documentLabel}>
          {documentLabel}
        </span>
      )}
      <EditMenu onEdit={onEdit} />
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
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose(onNew)}
          >
            <Icons.New size={14} /> New
          </button>
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose(onOpen)}
          >
            <Icons.Open size={14} /> Open…
          </button>
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose(onSave)}
          >
            <Icons.Save size={14} /> Save
          </button>
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose(onSaveAs)}
          >
            <Icons.Save size={14} /> Save As…
          </button>
        </div>
      )}
    </div>
  );
}

function EditMenu({ onEdit }: { onEdit?: (tab: SettingsTab) => void }) {
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

  const choose = (tab: SettingsTab) => {
    setOpen(false);
    onEdit?.(tab);
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
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose("pricing")}
          >
            <Icons.Bom size={14} /> Parts Pricing…
          </button>
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose("quote")}
          >
            <Icons.Pdf size={14} /> Quote &amp; Tax…
          </button>
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose("company")}
          >
            <Icons.Info size={14} /> Company Info…
          </button>
          <button
            className="filemenu-item topbar-no-drag"
            role="menuitem"
            onClick={() => choose("system")}
          >
            <Icons.Layers size={14} /> System Details…
          </button>
        </div>
      )}
    </div>
  );
}
