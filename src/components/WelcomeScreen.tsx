import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { NameFields } from "@/components/NameFields";
import { DEFAULT_SYSTEM_NAME } from "@/domain/design-state";
import { FLOOR_SEPARATOR_FEET } from "@/domain/floors";
import { BUILD_AREA_LIMITS, clampBuildArea, DEFAULT_BUILD_AREA } from "@/domain/sparse-grid";
import type { BuildArea, DesignState } from "@/types";
import "@/components/WelcomeScreen.css";

// Build-area axes in the words a visitor measuring a room would use. The
// domain keeps calling the Z axis `depth`; only the label says "Length".
const BUILD_AREA_AXES: { key: keyof BuildArea; label: string }[] = [
  { key: "width", label: "Width" },
  { key: "depth", label: "Length" },
  { key: "height", label: "Height" }
];

/**
 * Which screen the visitor is on: the continue-or-start-over choice, the
 * confirmation guarding the saved design, then the setup form. A visit with
 * nothing stored starts at the form and never sees the first two.
 */
type Stage = "choice" | "confirm-new" | "setup";

/** What the setup form collects before a design exists. */
export type DesignSetup = {
  companyName: string;
  systemName: string;
  buildArea: BuildArea;
  multiFloor: boolean;
  plenumHeightFeet: number | null;
};

export type WelcomeScreenProps = {
  /** The design found in this browser's storage, or null when there is none. */
  stored: DesignState | null;
  /** True when this is the visit's opening screen, which greets; false when it
   * was reopened mid-session via "New", which does not. */
  greeting: boolean;
  onContinue: (design: DesignState) => void;
  onCreate: (setup: DesignSetup) => void;
};

/**
 * The screen every visit starts on. With a design in storage it asks whether to
 * continue it or start a new one; otherwise (and after choosing to start over)
 * it collects the details a new design needs. It cannot be dismissed — there is
 * nothing to fall back to until one of its answers is given.
 *
 * Choosing "New design" asks for confirmation first, and even then discards
 * nothing: the stored design is replaced when the new one is actually created,
 * so abandoning the setup form — by closing the tab, or reloading — leaves it
 * exactly where it was.
 */
export function WelcomeScreen({ stored, greeting, onContinue, onCreate }: WelcomeScreenProps) {
  const [stage, setStage] = useState<Stage>(stored ? "choice" : "setup");
  // Both start empty and fall back to their defaults on create, so neither
  // needs validation and neither field has to be cleared before it is typed in.
  const [companyName, setCompanyName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [buildArea, setBuildArea] = useState<BuildArea>({ ...DEFAULT_BUILD_AREA });
  const [multiFloor, setMultiFloor] = useState(false);
  const [hasPlenum, setHasPlenum] = useState(false);
  const [plenumHeightFeet, setPlenumHeightFeet] = useState(3);

  if (stage === "choice" && stored) {
    return (
      <Modal label="Welcome back" onClose={() => undefined} dismissOnBackdrop={false} size="md">
        <>
          <div className="modal__header">
            <Icons.Layers size={16} />
            <div className="modal__title">Welcome back</div>
          </div>
          <div className="welcome__message">
            This browser has a saved design. Continue working on it, or start a new one. Only one
            design is kept at a time, so creating a new design replaces the saved one.
          </div>
          <div className="modal__actions">
            <button className="topbtn" onClick={() => setStage("confirm-new")}>
              New design
            </button>
            <button className="topbtn primary" autoFocus onClick={() => onContinue(stored)}>
              Continue design
            </button>
          </div>
        </>
      </Modal>
    );
  }

  if (stage === "confirm-new" && stored) {
    return (
      <Modal
        label="Start a new design?"
        onClose={() => setStage("choice")}
        dismissOnBackdrop={false}
        size="sm"
      >
        <>
          <div className="modal__header">
            <span className="welcome__warn">
              <Icons.Warn size={15} />
            </span>
            <div className="modal__title">Start a new design?</div>
          </div>
          <div className="welcome__message">
            The design saved in this browser will be replaced once the new one is created. There is
            no way to get it back.
          </div>
          <div className="modal__actions">
            <button className="topbtn" autoFocus onClick={() => setStage("choice")}>
              Keep saved design
            </button>
            <button className="topbtn danger" onClick={() => setStage("setup")}>
              Start new design
            </button>
          </div>
        </>
      </Modal>
    );
  }

  const title = greeting && !stored ? "Welcome to PTSBLite" : "New design";
  const plenumHeightValid = Number.isFinite(plenumHeightFeet) && plenumHeightFeet > 0;

  return (
    <Modal label={title} onClose={() => undefined} dismissOnBackdrop={false} size="md">
      <>
        <div className="modal__header">
          <Icons.Layers size={16} />
          <div className="modal__title">{title}</div>
        </div>
        <div className="welcome__body">
          <NameFields
            companyName={companyName}
            systemName={systemName}
            onCompanyName={setCompanyName}
            onSystemName={setSystemName}
          />
          <p className="welcome__note">
            Provide details about the area this system will be built in.
          </p>
          <BuildAreaFields value={buildArea} onChange={setBuildArea} />
          <label className="welcome__toggle">
            <input
              type="checkbox"
              checked={multiFloor}
              onChange={(e) => setMultiFloor(e.target.checked)}
            />
            <span>Add 2nd floor</span>
          </label>
          <label className="welcome__toggle">
            <input
              type="checkbox"
              checked={hasPlenum}
              onChange={(e) => setHasPlenum(e.target.checked)}
            />
            <span>Plenum (drop ceiling)</span>
          </label>
          {hasPlenum && (
            <label className="welcome__plenum">
              <span className="welcome__label">Approximate plenum height (feet)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={plenumHeightFeet}
                onChange={(e) => setPlenumHeightFeet(Number(e.target.value))}
                className="welcome__input welcome__input--narrow"
              />
            </label>
          )}
          <p className="welcome__note">
            1 grid cell = 1 ft. Build area height is per-floor, including plenum. Structural
            ceiling/floors for multi-floor systems are {FLOOR_SEPARATOR_FEET} ft thick.
          </p>
        </div>
        <div className="welcome__footer">
          <button
            className="topbtn primary"
            disabled={hasPlenum && !plenumHeightValid}
            onClick={() =>
              onCreate({
                companyName: companyName.trim(),
                systemName: systemName.trim() || DEFAULT_SYSTEM_NAME,
                buildArea,
                multiFloor,
                plenumHeightFeet: hasPlenum ? plenumHeightFeet : null
              })
            }
          >
            <Icons.Check size={12} /> Create design
          </button>
        </div>
      </>
    </Modal>
  );
}

/** The three build-area dimensions. Clamps to `BUILD_AREA_LIMITS` on every change. */
function BuildAreaFields({
  value,
  onChange
}: {
  value: BuildArea;
  onChange: (next: BuildArea) => void;
}) {
  const setAxis = (patch: Partial<BuildArea>) => onChange(clampBuildArea({ ...value, ...patch }));

  return (
    <div>
      <span className="welcome__label">Build area (feet)</span>
      <div className="welcome__axes">
        {BUILD_AREA_AXES.map(({ key, label }) => (
          <label key={key} className="welcome__axis">
            <span className="welcome__label">{label}</span>
            <input
              type="number"
              min={BUILD_AREA_LIMITS[key].min}
              max={BUILD_AREA_LIMITS[key].max}
              step={1}
              value={value[key]}
              onChange={(e) => setAxis({ [key]: Number(e.target.value) })}
              className="welcome__input"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
