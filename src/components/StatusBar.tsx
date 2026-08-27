import { Icons } from "@/components/Icons";
import { ValidationSummary } from "@/components/ValidationSummary";
import { totalPathLength } from "@/domain/parts";
import { MAX_CENTERLINE_FEET } from "@/domain/validation";
import type { DesignState, Warning } from "@/types";
import "@/components/StatusBar.css";

export type StatusBarProps = {
  design: DesignState;
  warnings: Warning[];
  expanded: boolean;
  onToggle: () => void;
  /** Opens the Finalize dialog, which is where the bill of materials lives.
   * Anchored here rather than in the top bar, where Auto-Build now sits — the
   * client asked for the two to trade places. */
  onFinalize: () => void;
};

export function StatusBar({ design, warnings, expanded, onToggle, onFinalize }: StatusBarProps) {
  const errors = warnings.filter((w) => w.level === "error").length;
  const warns = warnings.filter((w) => w.level === "warn").length;
  const len = totalPathLength(design);
  const okState = warnings.length === 0 && design.parts.length > 0;
  const state = okState ? "ok" : errors ? "error" : warns ? "warn" : "none";
  return (
    <div className="status-bar nosel">
      {expanded && warnings.length > 0 && (
        <div className="status-bar__validation">
          <ValidationSummary warnings={warnings} />
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
        <button type="button" className="status-bar__finalize" onClick={onFinalize}>
          <Icons.Bom size={15} /> Finalize
        </button>
      </div>
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
