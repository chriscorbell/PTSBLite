import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icons } from "@/components/Icons";
import { totalPathLength } from "@/domain/parts";
import type { OptimizationMode } from "@/domain/pathfinder";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState, Warning } from "@/types";
import "@/components/StatusBar.css";

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
  const state = okState ? "ok" : errors ? "error" : warns ? "warn" : "none";
  return (
    <div className="status-bar nosel">
      {expanded && warnings.length > 0 && (
        <div className="status-bar__validation">
          <div className="status-bar__validation-heading">VALIDATION</div>
          <div className="status-bar__warnings">
            {warnings.map((w) => (
              <div
                key={w.id}
                className={`status-bar__warning${
                  w.level === "error" ? " status-bar__warning--error" : ""
                }`}
              >
                <div className="status-bar__warning-badge">
                  <Icons.Warn size={11} />
                </div>
                <div className="status-bar__warning-text">
                  <div className="status-bar__warning-title">{w.title}</div>
                  <div className="status-bar__warning-detail">{w.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="status-bar__row">
        <button className="status-bar__toggle" data-state={state} onClick={onToggle}>
          <span className="status-bar__dot" />
          <span className="status-bar__state-label">
            {okState
              ? "All checks pass"
              : warnings.length === 0
                ? "No system yet"
                : `${warnings.length} issue${warnings.length === 1 ? "" : "s"}`}
          </span>
          {warnings.length > 0 &&
            (expanded ? <Icons.ChevD size={11} /> : <Icons.ChevU size={11} />)}
        </button>

        <Sep />
        <Meta
          label="LENGTH"
          value={`${len.toFixed(1)}ft`}
          hint={`/ ${MAX_CENTERLINE_FEET}`}
          used={len}
          capacity={MAX_CENTERLINE_FEET}
        />
        <Sep />
        <Meta label="PARTS" value={`${design.parts.length}`} />

        <div className="status-bar__spacer" />
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
    <div className="view-controls">
      <ViewButton title="Zoom out" onClick={() => onZoom(0.25)} iconOnly>
        <Icons.ZoomOut size={13} />
      </ViewButton>
      <ViewButton title="Zoom in" onClick={() => onZoom(-0.2)} iconOnly>
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
  iconOnly = false,
  children
}: {
  title: string;
  onClick: () => void;
  iconOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`view-controls__button${iconOnly ? " view-controls__button--icon" : ""}`}
      onClick={onClick}
      title={title}
      aria-label={title}
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
    <div ref={rootRef} className="auto-build">
      {expanded && (
        <div
          className="auto-build__menu"
          role="radiogroup"
          aria-label="Auto-build optimization mode"
        >
          {OPTIMIZATION_OPTIONS.map((opt) => {
            const active = opt.value === mode;
            return (
              <button
                key={opt.value}
                type="button"
                className="auto-build__option"
                role="radio"
                aria-checked={active}
                title={opt.title}
                onClick={() => {
                  onModeChange(opt.value);
                  setOpen(false);
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
        className="auto-build__run"
        onClick={() => {
          setOpen(false);
          onAutoBuild();
        }}
        disabled={autoBuilding}
      >
        <Icons.Auto size={13} /> {autoBuilding ? "Routing…" : "Auto-build"}
      </button>
      <button
        type="button"
        className="auto-build__mode"
        aria-label="Choose Auto-build routing mode"
        aria-haspopup="true"
        aria-expanded={expanded}
        disabled={autoBuilding}
        onClick={() => setOpen((next) => !next)}
      >
        <span>{activeLabel}</span>
        {expanded ? <Icons.ChevD size={11} /> : <Icons.ChevU size={11} />}
      </button>
    </div>
  );
}

function Sep() {
  return <div className="status-bar__sep" />;
}

function Meta({
  label,
  value,
  hint,
  used,
  capacity
}: {
  label: string;
  value: string;
  hint?: string;
  used?: number;
  capacity?: number;
}) {
  const load =
    used !== undefined && capacity !== undefined
      ? used / capacity > 0.9
        ? "over"
        : used / capacity > 0.7
          ? "warn"
          : "ok"
      : null;
  return (
    <div className="status-bar__meta">
      <span className="status-bar__meta-label">{label}</span>
      <span className="status-bar__meta-value">{value}</span>
      {hint && <span className="status-bar__meta-hint">{hint}</span>}
      {used !== undefined && capacity !== undefined && (
        <progress
          className="status-bar__meta-meter"
          data-load={load}
          value={Math.min(used, capacity)}
          max={capacity}
          aria-label={`${label.toLowerCase()} used`}
        />
      )}
    </div>
  );
}
