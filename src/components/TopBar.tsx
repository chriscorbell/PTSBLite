import { useEffect, useRef, useState } from "react";
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
    <div
      className="topbar nosel"
      style={{
        height: 46,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 var(--topbar-right-padding) 0 var(--topbar-left-padding)",
        background: "linear-gradient(180deg, #181C25, #14181F)",
        borderBottom: "1px solid var(--line)",
        position: "relative",
        zIndex: 10,
        whiteSpace: "nowrap"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>PTSBuilder</div>
      </div>
      <FileMenu onNew={onNew} onOpen={onOpen} onSave={onSave} onSaveAs={onSaveAs} />
      {documentLabel && (
        <span
          className="nosel"
          title={documentLabel}
          style={{
            fontSize: 11.5,
            color: "var(--text-dim)",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
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
      <div style={{ flex: 1 }} />
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
      <style>{`
        .topbtn {
          display: inline-flex; align-items: center; gap: 6px;
          height: 28px; padding: 0 10px; border-radius: 6px;
          background: transparent; color: var(--text-mut);
          border: 1px solid var(--line);
          font-family: var(--font-sans); font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all .12s; white-space: nowrap;
          flex-shrink: 0;
        }
        .topbtn.icon { width: 28px; padding: 0; justify-content: center; }
        .topbtn:hover { color: var(--text); border-color: var(--line-2); background: var(--panel-2); }
        .topbtn:disabled {
          opacity: 0.4; cursor: default; color: var(--text-mut);
          border-color: var(--line); background: transparent;
        }
        .topbtn.active {
          background: color-mix(in oklab, var(--accent) 18%, transparent);
          color: var(--accent); border-color: color-mix(in oklab, var(--accent) 35%, transparent);
        }
        .topbtn.active:hover { background: color-mix(in oklab, var(--accent) 26%, transparent); color: #fff; }
        .filemenu-item {
          display: flex; align-items: center; gap: 8px;
          width: 100%; height: 30px; padding: 0 10px; border-radius: 5px;
          background: transparent; color: var(--text-mut); border: none;
          font-family: var(--font-sans); font-size: 12px; font-weight: 500;
          cursor: pointer; text-align: left; white-space: nowrap;
        }
        .filemenu-item:hover { background: var(--panel-2); color: var(--text); }
      `}</style>
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
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        className={"topbtn topbar-no-drag" + (open ? " active" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        File {open ? <Icons.ChevU size={12} /> : <Icons.ChevD size={12} />}
      </button>
      {open && (
        <div
          role="menu"
          className="topbar-no-drag"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 150,
            padding: 5,
            borderRadius: 8,
            border: "1px solid var(--line-2)",
            background: "color-mix(in oklab, var(--panel) 96%, #000)",
            boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            zIndex: 20
          }}
        >
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
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        className={"topbtn topbar-no-drag" + (open ? " active" : "")}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Edit {open ? <Icons.ChevU size={12} /> : <Icons.ChevD size={12} />}
      </button>
      {open && (
        <div
          role="menu"
          className="topbar-no-drag"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 168,
            padding: 5,
            borderRadius: 8,
            border: "1px solid var(--line-2)",
            background: "color-mix(in oklab, var(--panel) 96%, #000)",
            boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            zIndex: 20
          }}
        >
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
