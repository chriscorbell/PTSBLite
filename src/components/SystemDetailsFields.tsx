import type { ReactNode } from "react";
import { BUILD_AREA_LIMITS, clampBuildArea } from "@/domain/sparse-grid";
import type { BuildArea, DesignMetadata } from "@/types";
import "@/components/SettingsFields.css";

// Build-area axes, labeled with their world-space axis.
const BUILD_AREA_AXES: { key: keyof BuildArea; label: string }[] = [
  { key: "width", label: "Width (X)" },
  { key: "depth", label: "Depth (Z)" },
  { key: "height", label: "Height (Y)" }
];

export type SystemDetailsFieldsProps = {
  value: DesignMetadata;
  onChange: (next: DesignMetadata) => void;
};

/**
 * System name, revision and build area.
 *
 * Shared because these belong to the design rather than to a product: they are
 * saved into the file and both PTSBuilder and PTSBuilderLite let you edit them.
 * Everything else on PTSBuilder's Settings screen — prices, tax, seller
 * identity, quote defaults — exists only to produce a quote, so Lite has none
 * of it and reuses just this.
 */
export function SystemDetailsFields({ value, onChange }: SystemDetailsFieldsProps) {
  const setBuildArea = (patch: Partial<BuildArea>) =>
    onChange({ ...value, buildArea: clampBuildArea({ ...value.buildArea, ...patch }) });

  return (
    <div className="settings__fields">
      <p className="settings__note">These belong to the current design and are saved with it.</p>
      <Field label="System name">
        <input
          value={value.filename}
          onChange={(e) => onChange({ ...value, filename: e.target.value })}
          className="settings__input"
        />
      </Field>
      <Field label="Revision">
        <input
          value={value.revision}
          onChange={(e) => onChange({ ...value, revision: e.target.value })}
          className="settings__input settings__input--narrow"
        />
      </Field>

      <div>
        <span className="settings__label">Build area (feet)</span>
        <div className="settings__axes">
          {BUILD_AREA_AXES.map(({ key, label }) => (
            <label key={key} className="settings__axis">
              <span className="settings__label">{label}</span>
              <input
                type="number"
                min={BUILD_AREA_LIMITS[key].min}
                max={BUILD_AREA_LIMITS[key].max}
                step={1}
                value={value.buildArea[key]}
                onChange={(e) => setBuildArea({ [key]: Number(e.target.value) })}
                className="settings__input"
              />
            </label>
          ))}
        </div>
        <p className="settings__note settings__note--build-area">
          The buildable volume and the ground-plane grid (1 ft = 1 cell). The footprint is centered
          on the origin; height rises from the floor.
        </p>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="settings__field">
      <span className="settings__label">{label}</span>
      {children}
    </label>
  );
}
