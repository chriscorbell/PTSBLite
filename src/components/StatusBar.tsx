import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icons } from "@/components/Icons";
import { totalPathLength } from "@/domain/parts";
import type { OptimizationMode } from "@/domain/pathfinder";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState, Warning } from "@/types";

const monoStyle: CSSProperties = { fontFamily: "var(--font-mono)" };

const OPTIMIZATION_OPTIONS: Array<{ value: OptimizationMode; label: string; title: string }> = [
  { value: "shortest", label: "Shortest path", title: "Minimize total centerline length" },
  { value: "fewest-bends", label: "Fewest bends", title: "Penalize direction changes" }
];

export type StatusBarProps = {
  design: DesignState;
  warnings: Warning[];
  expanded: boolean;
  onToggle: () => void;
  onAutoBuild: () => void;
  autoBuilding: boolean;
  optimizationMode: OptimizationMode;
  onOptimizationModeChange: (mode: OptimizationMode) => void;
  onZoom: (delta: number) => void;
  onResetView: () => void;
};

export function StatusBar({
  design,
  warnings,
  expanded,
  onToggle,
  onAutoBuild,
  autoBuilding,
  optimizationMode,
  onOptimizationModeChange,
  onZoom,
  onResetView
}: StatusBarProps) {
  const errors = warnings.filter((w) => w.level === "error").length;
  const warns = warnings.filter((w) => w.level === "warn").length;
  const len = totalPathLength(design);
  const okState = warnings.length === 0 && design.parts.length > 0;
  return (
    <div
      className="nosel"
      style={{
        flexShrink: 0,
        background: "var(--panel)",
        borderTop: "1px solid var(--line)",
        position: "relative",
        zIndex: 5
      }}
    >
      {expanded && warnings.length > 0 && (
        <div style={{ padding: "8px 14px 12px", borderBottom: "1px solid var(--line)" }}>
          <div
            style={{
              ...monoStyle,
              fontSize: 10,
              color: "var(--text-dim)",
              letterSpacing: 0.6,
              marginBottom: 6
            }}
          >
            VALIDATION
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {warnings.map((w) => (
              <div
                key={w.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  background: "var(--ink-2)"
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: w.level === "error" ? "var(--danger)" : "var(--warn)",
                    background:
                      w.level === "error"
                        ? "color-mix(in oklab, var(--danger) 18%, transparent)"
                        : "color-mix(in oklab, var(--warn) 18%, transparent)"
                  }}
                >
                  <Icons.Warn size={11} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                    {w.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-mut)", marginTop: 2 }}>
                    {w.detail}
                  </div>
                </div>
                <button
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0
                  }}
                >
                  Locate ›
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          height: 32,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          fontSize: 11,
          whiteSpace: "nowrap"
        }}
      >
        <button
          onClick={onToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 22,
            padding: "0 8px",
            borderRadius: 4,
            background: "transparent",
            border: "1px solid var(--line)",
            color: "var(--text-mut)",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "var(--font-sans)",
            whiteSpace: "nowrap",
            flexShrink: 0
          }}
        >
          {okState ? (
            <>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)" }} />
              <span style={{ color: "var(--ok)" }}>All checks pass</span>
            </>
          ) : (
            <>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: errors ? "var(--danger)" : warns ? "var(--warn)" : "var(--text-dim)"
                }}
              />
              <span
                style={{
                  color: errors ? "var(--danger)" : warns ? "var(--warn)" : "var(--text-mut)"
                }}
              >
                {warnings.length === 0
                  ? "No system yet"
                  : `${warnings.length} issue${warnings.length === 1 ? "" : "s"}`}
              </span>
            </>
          )}
          {warnings.length > 0 &&
            (expanded ? <Icons.ChevD size={11} /> : <Icons.ChevU size={11} />)}
        </button>

        <Sep />
        <Meta
          label="LENGTH"
          value={`${len.toFixed(1)}ft`}
          hint={`/ ${MAX_CENTERLINE_FEET}`}
          pct={Math.min(1, len / MAX_CENTERLINE_FEET)}
        />
        <Sep />
        <Meta label="PARTS" value={`${design.parts.length}`} />

        <div style={{ flex: 1 }} />
        <ViewControls onZoom={onZoom} onResetView={onResetView} />
        <Sep />
        <AutoBuildControl
          onAutoBuild={onAutoBuild}
          autoBuilding={autoBuilding}
          mode={optimizationMode}
          onModeChange={onOptimizationModeChange}
        />
      </div>
    </div>
  );
}

function ViewControls({
  onZoom,
  onResetView
}: {
  onZoom: (delta: number) => void;
  onResetView: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <ViewButton title="Zoom out" onClick={() => onZoom(0.25)}>
        <Icons.ZoomOut size={13} />
      </ViewButton>
      <ViewButton title="Zoom in" onClick={() => onZoom(-0.2)}>
        <Icons.ZoomIn size={13} />
      </ViewButton>
      <ViewButton title="Reset view" onClick={onResetView}>
        Reset view
      </ViewButton>
    </div>
  );
}

function ViewButton({
  title,
  onClick,
  children
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const iconOnly = typeof children !== "string";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      aria-label={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 24,
        width: iconOnly ? 26 : undefined,
        padding: iconOnly ? 0 : "0 10px",
        borderRadius: 5,
        background: hover ? "var(--panel-2)" : "transparent",
        border: "1px solid var(--line)",
        color: hover ? "var(--text)" : "var(--text-mut)",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </button>
  );
}

function AutoBuildControl({
  onAutoBuild,
  autoBuilding,
  mode,
  onModeChange
}: {
  onAutoBuild: () => void;
  autoBuilding: boolean;
  mode: OptimizationMode;
  onModeChange: (next: OptimizationMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeLabel =
    OPTIMIZATION_OPTIONS.find((opt) => opt.value === mode)?.label ?? "Shortest path";
  // The menu is closed while a build runs. Deriving that beats an effect that
  // calls setOpen, which cost an extra render pass to reach the same state.
  const expanded = open && !autoBuilding;

  useEffect(() => {
    if (!expanded) return;
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
  }, [expanded]);

  return (
    <div
      ref={rootRef}
      style={{
        display: "flex",
        alignItems: "center",
        position: "relative",
        flexShrink: 0
      }}
    >
      {expanded && (
        <div
          role="radiogroup"
          aria-label="Auto-build optimization mode"
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 8px)",
            width: 196,
            padding: 6,
            borderRadius: 6,
            border: "1px solid var(--line-2)",
            background: "color-mix(in oklab, var(--panel) 92%, #000)",
            boxShadow: "0 16px 36px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            zIndex: 20
          }}
        >
          {OPTIMIZATION_OPTIONS.map((opt) => {
            const active = opt.value === mode;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                title={opt.title}
                onClick={() => {
                  onModeChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  height: 28,
                  padding: "0 8px",
                  borderRadius: 4,
                  border: `1px solid ${active ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "transparent"}`,
                  background: active
                    ? "color-mix(in oklab, var(--accent) 14%, var(--panel-2))"
                    : "transparent",
                  color: active ? "var(--accent)" : "var(--text-mut)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                <span>{opt.label}</span>
                {active && <Icons.Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onAutoBuild();
        }}
        disabled={autoBuilding}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 24,
          padding: "0 10px 0 12px",
          borderRadius: "5px 0 0 5px",
          background: autoBuilding
            ? "var(--panel-2)"
            : "color-mix(in oklab, var(--accent) 18%, transparent)",
          color: "var(--accent)",
          border: "1px solid color-mix(in oklab, var(--accent) 35%, transparent)",
          borderRight: "none",
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: 500,
          cursor: autoBuilding ? "default" : "pointer",
          whiteSpace: "nowrap"
        }}
      >
        <Icons.Auto size={13} /> {autoBuilding ? "Routing…" : "Auto-build"}
      </button>
      <button
        type="button"
        aria-label="Choose Auto-build routing mode"
        aria-haspopup="true"
        aria-expanded={expanded}
        disabled={autoBuilding}
        onClick={() => setOpen((next) => !next)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 24,
          padding: "0 8px",
          borderRadius: "0 5px 5px 0",
          background: expanded
            ? "color-mix(in oklab, var(--accent) 22%, var(--panel-2))"
            : "var(--panel-2)",
          color: expanded ? "var(--accent)" : "var(--text-mut)",
          border: `1px solid ${
            expanded
              ? "color-mix(in oklab, var(--accent) 45%, transparent)"
              : "color-mix(in oklab, var(--accent) 35%, transparent)"
          }`,
          borderLeft: "1px solid color-mix(in oklab, var(--accent) 25%, transparent)",
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: 500,
          cursor: autoBuilding ? "default" : "pointer",
          whiteSpace: "nowrap"
        }}
      >
        <span>{activeLabel}</span>
        {expanded ? <Icons.ChevD size={11} /> : <Icons.ChevU size={11} />}
      </button>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: "var(--line)" }} />;
}

function Meta({
  label,
  value,
  hint,
  pct
}: {
  label: string;
  value: string;
  hint?: string;
  pct?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 5,
        whiteSpace: "nowrap",
        flexShrink: 0
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.6,
          color: "var(--text-dim)"
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--text)" }}>
        {value}
      </span>
      {hint && (
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--text-dim)" }}>
          {hint}
        </span>
      )}
      {pct !== undefined && (
        <div
          style={{
            width: 44,
            height: 4,
            background: "var(--line)",
            borderRadius: 2,
            overflow: "hidden",
            marginLeft: 2
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: "100%",
              background: pct > 0.9 ? "var(--danger)" : pct > 0.7 ? "var(--warn)" : "var(--accent)",
              transition: "width .3s"
            }}
          />
        </div>
      )}
    </div>
  );
}
