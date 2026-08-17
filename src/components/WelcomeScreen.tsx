import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { BuildAreaFields } from "@/components/SystemDetailsFields";
import { DEFAULT_BUILD_AREA } from "@/domain/sparse-grid";
import type { BuildArea, DesignState } from "@/types";
import "@/components/WelcomeScreen.css";

/** What the setup form collects before a design exists. */
export type DesignSetup = {
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
  /** Remove the stored design from the browser immediately. */
  onDeleteStored: () => void;
  onCreate: (setup: DesignSetup) => void;
};

/**
 * The screen every visit starts on. With a design in storage it asks whether to
 * continue, start over, or delete it; otherwise (and after choosing to start
 * over) it collects the details a new design needs. It cannot be dismissed —
 * there is nothing to fall back to until one of its answers is given.
 *
 * "New design" does not delete the stored design; that happens when the new one
 * is actually created, so closing the tab mid-setup loses nothing. The explicit
 * delete button is the immediate one.
 */
export function WelcomeScreen({
  stored,
  greeting,
  onContinue,
  onDeleteStored,
  onCreate
}: WelcomeScreenProps) {
  const [stage, setStage] = useState<"choice" | "setup">(stored ? "choice" : "setup");
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
            <button
              className="topbtn danger"
              onClick={() => {
                onDeleteStored();
                setStage("setup");
              }}
            >
              Delete saved design
            </button>
            <div className="modal__spacer" />
            <button className="topbtn" onClick={() => setStage("setup")}>
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

  const title = greeting && !stored ? "Welcome to PTSBuilderLite" : "New design";
  const plenumHeightValid = Number.isFinite(plenumHeightFeet) && plenumHeightFeet > 0;

  return (
    <Modal label={title} onClose={() => undefined} dismissOnBackdrop={false} size="md">
      <>
        <div className="modal__header">
          <Icons.Layers size={16} />
          <div className="modal__title">{title}</div>
        </div>
        <div className="welcome__body">
          <p className="settings__note">A few details about the space this system is built in.</p>
          <BuildAreaFields value={buildArea} onChange={setBuildArea} />
          <label className="welcome__toggle">
            <input
              type="checkbox"
              checked={multiFloor}
              onChange={(e) => setMultiFloor(e.target.checked)}
            />
            <span>Multi-floor project</span>
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
              <span className="settings__label">Approximate plenum height (feet)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={plenumHeightFeet}
                onChange={(e) => setPlenumHeightFeet(Number(e.target.value))}
                className="settings__input settings__input--narrow"
              />
            </label>
          )}
        </div>
        <div className="settings__footer">
          <button
            className="topbtn primary"
            disabled={hasPlenum && !plenumHeightValid}
            onClick={() =>
              onCreate({
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
