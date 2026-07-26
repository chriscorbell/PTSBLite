import { Icons } from "@/components/Icons";
import {
  obstaclePlacementDraftHasFootprint,
  type ObstaclePlacementDraft
} from "@/domain/obstacle-placement";
import { GROUND_PLANE_Y } from "@/domain/sparse-grid";
import type { BuildArea, Scene, ToolId } from "@/types";
import "@/components/ViewportHUD.css";

export type ViewportHUDProps = {
  scene: Scene;
  tool: ToolId;
  autoBuilding: boolean;
  errorFlash: string | null;
  obstacleDraft: ObstaclePlacementDraft | null;
  /** Bounds the base/height steppers, so they cannot offer a rejected value. */
  buildArea: BuildArea;
  onObstacleBaseYChange: (y: number) => void;
  onObstacleHeightChange: (height: number) => void;
  onObstacleConfirm: () => void;
  onObstacleCancel: () => void;
};

export function ViewportHUD({
  scene,
  errorFlash,
  obstacleDraft,
  buildArea,
  onObstacleBaseYChange,
  onObstacleHeightChange,
  onObstacleConfirm,
  onObstacleCancel
}: ViewportHUDProps) {
  const obstacleReady = obstaclePlacementDraftHasFootprint(obstacleDraft);
  // The domain clamps these too; disabling here is what stops the control
  // advertising a value it would then silently refuse.
  const atCeiling = obstacleReady && obstacleDraft.baseY + obstacleDraft.height >= buildArea.height;
  return (
    <div className="hud nosel">
      {obstacleReady && (
        <div className="hud__obstacle-controls">
          <Icons.Obstacle size={12} className="hud__obstacle-icon" />
          <ObstacleStepper
            label="Base"
            value={`Y=${obstacleDraft.baseY}ft`}
            onDecrement={() => onObstacleBaseYChange(obstacleDraft.baseY - 1)}
            onIncrement={() => onObstacleBaseYChange(obstacleDraft.baseY + 1)}
            disableDecrement={obstacleDraft.baseY <= GROUND_PLANE_Y}
            disableIncrement={atCeiling}
          />
          <ObstacleStepper
            label="Height"
            value={`${obstacleDraft.height}ft`}
            onDecrement={() => onObstacleHeightChange(obstacleDraft.height - 1)}
            onIncrement={() => onObstacleHeightChange(obstacleDraft.height + 1)}
            disableDecrement={obstacleDraft.height <= 1}
            disableIncrement={atCeiling}
          />
          <button type="button" className="hud__place" onClick={onObstacleConfirm}>
            Place
          </button>
          <button
            type="button"
            className="hud__cancel"
            aria-label="Cancel obstacle placement"
            onClick={onObstacleCancel}
          >
            <Icons.Close size={12} />
          </button>
        </div>
      )}

      {scene.hint && (
        <div className="hud__banner hud__banner--hint">
          <div className="hud__banner-title">{scene.hint.title}</div>
          <div className="hud__banner-body">{scene.hint.body}</div>
        </div>
      )}

      {scene.autoBuildJustRan && scene.autoBuildSummary && (
        <div className="hud__banner hud__banner--summary">
          <div className="hud__banner-title">
            Auto-build complete · {scene.autoBuildSummary.lengthFeet.toFixed(1)}ft ·{" "}
            {pluralize(scene.autoBuildSummary.bends, "bend")}
          </div>
          <div className="hud__banner-detail">
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

      {errorFlash && <div className="hud__banner hud__banner--error">{errorFlash}</div>}
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
  onIncrement,
  disableDecrement = false,
  disableIncrement = false
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disableDecrement?: boolean;
  disableIncrement?: boolean;
}) {
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <button
        type="button"
        className="stepper__button"
        aria-label={`Decrease obstacle ${label.toLowerCase()}`}
        disabled={disableDecrement}
        onClick={onDecrement}
      >
        −
      </button>
      <span className="stepper__value">{value}</span>
      <button
        type="button"
        className="stepper__button"
        aria-label={`Increase obstacle ${label.toLowerCase()}`}
        disabled={disableIncrement}
        onClick={onIncrement}
      >
        +
      </button>
    </div>
  );
}
