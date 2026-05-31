import type React from "react";
import { Icons } from "@/components/Icons";
import {
  obstaclePlacementDraftHasFootprint,
  type ObstaclePlacementDraft
} from "@/domain/obstacle-placement";
import type { Scene, ToolId } from "@/types";

export type ViewportHUDProps = {
  scene: Scene;
  tool: ToolId;
  autoBuilding: boolean;
  errorFlash: string | null;
  obstacleDraft: ObstaclePlacementDraft | null;
  onObstacleBaseYChange: (y: number) => void;
  onObstacleHeightChange: (height: number) => void;
  onObstacleConfirm: () => void;
  onObstacleCancel: () => void;
};

const ELEVATION_BUTTON_STYLE: React.CSSProperties = {
  width: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 3,
  border: "1px solid var(--line-2)",
  background: "var(--panel-2)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 11,
  lineHeight: 1,
  padding: 0
};

export function ViewportHUD({
  scene,
  errorFlash,
  obstacleDraft,
  onObstacleBaseYChange,
  onObstacleHeightChange,
  onObstacleConfirm,
  onObstacleCancel
}: ViewportHUDProps) {
  const obstacleReady = obstaclePlacementDraftHasFootprint(obstacleDraft);
  return (
    <div className="nosel" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {obstacleReady && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(11,14,19,0.82)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "7px 8px",
            fontSize: 11.5,
            pointerEvents: "auto",
            boxShadow: "0 10px 28px rgba(0,0,0,0.35)"
          }}
        >
          <Icons.Obstacle size={12} style={{ color: "var(--danger)" }} />
          <ObstacleStepper
            label="Base"
            value={`Y=${obstacleDraft.baseY}ft`}
            onDecrement={() => onObstacleBaseYChange(Math.max(0, obstacleDraft.baseY - 1))}
            onIncrement={() => onObstacleBaseYChange(Math.min(150 - obstacleDraft.height, obstacleDraft.baseY + 1))}
          />
          <ObstacleStepper
            label="Height"
            value={`${obstacleDraft.height}ft`}
            onDecrement={() => onObstacleHeightChange(Math.max(1, obstacleDraft.height - 1))}
            onIncrement={() => onObstacleHeightChange(Math.min(150 - obstacleDraft.baseY, obstacleDraft.height + 1))}
          />
          <button
            type="button"
            onClick={onObstacleConfirm}
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 4,
              border: "1px solid color-mix(in oklab, var(--accent) 42%, transparent)",
              background: "color-mix(in oklab, var(--accent) 17%, var(--panel-2))",
              color: "var(--accent)",
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Place
          </button>
          <button
            type="button"
            aria-label="Cancel obstacle placement"
            onClick={onObstacleCancel}
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "1px solid var(--line-2)",
              background: "var(--panel-2)",
              color: "var(--text-mut)",
              cursor: "pointer",
              padding: 0
            }}
          >
            <Icons.Close size={12} />
          </button>
        </div>
      )}

      {scene.hint && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "color-mix(in oklab, var(--accent) 14%, var(--ink))",
            border: "1px solid color-mix(in oklab, var(--accent) 35%, transparent)",
            padding: "10px 14px",
            borderRadius: 8,
            maxWidth: 420,
            pointerEvents: "auto"
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{scene.hint.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-mut)", marginTop: 3, lineHeight: 1.45 }}>
            {scene.hint.body}
          </div>
        </div>
      )}

      {scene.autoBuildJustRan && scene.autoBuildSummary && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "color-mix(in oklab, var(--accent) 14%, var(--ink))",
            border: "1px solid color-mix(in oklab, var(--accent) 35%, transparent)",
            padding: "10px 14px",
            borderRadius: 8,
            whiteSpace: "nowrap"
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
            Auto-build complete · {scene.autoBuildSummary.lengthFeet.toFixed(1)}ft ·{" "}
            {pluralize(scene.autoBuildSummary.bends, "bend")}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-mut)", marginTop: 3 }}>
            {scene.autoBuildSummary.obstacles > 0
              ? `Routed around ${pluralize(scene.autoBuildSummary.obstacles, "obstacle")} · `
              : ""}
            {scene.autoBuildSummary.modeLabel.toLowerCase()}
            {scene.autoBuildSummary.unrouted > 0
              ? ` · ${pluralize(scene.autoBuildSummary.unrouted, "pair")} unrouted`
              : ""}
          </div>
        </div>
      )}

      {errorFlash && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "color-mix(in oklab, var(--danger) 22%, var(--ink))",
            border: "1px solid color-mix(in oklab, var(--danger) 45%, transparent)",
            padding: "8px 12px",
            borderRadius: 6,
            color: "var(--danger)",
            fontSize: 12,
            animation: "flashIn .25s"
          }}
        >
          {errorFlash}
        </div>
      )}
    </div>
  );
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function ObstacleStepper({
  label,
  value,
  onDecrement,
  onIncrement
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ color: "var(--text-mut)", fontSize: 11 }}>{label}</span>
      <button
        type="button"
        aria-label={`Decrease obstacle ${label.toLowerCase()}`}
        style={ELEVATION_BUTTON_STYLE}
        onClick={onDecrement}
      >
        −
      </button>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--accent)",
          minWidth: 46,
          textAlign: "center"
        }}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase obstacle ${label.toLowerCase()}`}
        style={ELEVATION_BUTTON_STYLE}
        onClick={onIncrement}
      >
        +
      </button>
    </div>
  );
}

