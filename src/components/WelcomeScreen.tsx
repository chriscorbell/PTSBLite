import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { clampRoom, FLOOR_SEPARATOR_FEET, maxRoomHeightFeet } from "@/domain/floors";
import { BUILD_AREA, DEFAULT_ROOM, ROOM_LIMITS } from "@/domain/sparse-grid";
import type { BuildArea, DesignState } from "@/types";
import "@/components/WelcomeScreen.css";

/**
 * Room axes in the words a visitor measuring one would use. The domain keeps
 * calling the Z axis `depth`; only the label says "Length". `hint` carries what
 * the dismissed warning box used to say about that axis, next to the field it
 * actually constrains rather than in a paragraph below the whole form.
 */
const ROOM_AXES: { key: keyof BuildArea; label: string; hint?: string }[] = [
  { key: "width", label: "Width" },
  { key: "depth", label: "Length" },
  { key: "height", label: "Height", hint: "Floor to ceiling, including plenum" }
];

/**
 * Which screen the visitor is on: the continue-or-start-over choice, the
 * confirmation guarding the saved design, then the setup form. A visit with
 * nothing stored starts at the form and never sees the first two.
 */
type Stage = "choice" | "confirm-new" | "setup";

/** What the setup form collects before a design exists. */
export type DesignSetup = {
  room: BuildArea;
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
  const [room, setRoom] = useState<BuildArea>({ ...DEFAULT_ROOM });
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
          <RoomFields value={room} multiFloor={multiFloor} onChange={setRoom} />
          <label className="welcome__toggle">
            <input
              type="checkbox"
              checked={multiFloor}
              onChange={(e) => setMultiFloor(e.target.checked)}
            />
            <span>
              Add 2nd floor. Structural ceiling/floor between them is {FLOOR_SEPARATOR_FEET} ft
              thick.
            </span>
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
            <label className="welcome__plenum" htmlFor="plenum-height">
              <span className="welcome__label">Approximate plenum height</span>
              <NumberInput
                id="plenum-height"
                className="welcome__input welcome__input--narrow"
                value={plenumHeightFeet}
                min={1}
                onChange={setPlenumHeightFeet}
              />
            </label>
          )}
          <p className="welcome__callout">
            <span className="welcome__callout-icon">
              <Icons.Info size={15} />
            </span>
            <span>
              Maximum build area is {BUILD_AREA.width} × {BUILD_AREA.depth} × {BUILD_AREA.height}{" "}
              ft. For systems that exceed this size, please contact Kelly Tube Systems for
              large-scale system sales.
            </span>
          </p>
        </div>
        <div className="welcome__footer">
          <button
            className="topbtn primary"
            disabled={hasPlenum && !plenumHeightValid}
            onClick={() =>
              onCreate({
                room: clampRoom(room, multiFloor),
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

/**
 * A number input that lets the visitor finish typing.
 *
 * It holds the raw text while it has focus and reports a number only once that
 * text parses, so a half-typed value is never rewritten under the cursor.
 * `onCommit` fires on blur, which is where range limits belong: clamping per
 * keystroke turned the "1" of an intended "12" into the 4 ft minimum, appended
 * a digit to 60 and got the width maximum, and left the field impossible to
 * clear because an empty string reads as zero.
 */
function NumberInput({
  id,
  describedBy,
  value,
  min,
  max,
  className,
  onChange,
  onCommit
}: {
  /** Ties the field to its label explicitly; the unit suffix sits between the
   * two in the DOM, so implicit nesting no longer associates them. */
  id: string;
  /** Id of the hint that explains this field, if it has one. */
  describedBy?: string;
  value: number;
  min: number;
  max?: number;
  className: string;
  onChange: (next: number) => void;
  /** Apply the limits. Omitted where the field has none to apply. */
  onCommit?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      id={id}
      aria-describedby={describedBy}
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = Number(text);
        // Blank or mid-edit garbage leaves the last good number in place, so
        // committing without a valid entry restores it rather than inventing one.
        if (text.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        setDraft(null);
        onCommit?.();
      }}
      className={className}
    />
  );
}

/**
 * The three room dimensions. Limits apply when a field is left, not per
 * keystroke, and a two-floor room's height cap is tighter — both floors and
 * the separator have to fit inside the build area.
 */
function RoomFields({
  value,
  multiFloor,
  onChange
}: {
  value: BuildArea;
  multiFloor: boolean;
  onChange: (next: BuildArea) => void;
}) {
  return (
    <div>
      <span className="field-heading">Building or room size</span>
      <p className="welcome__note">
        Create additional rooms with the Obstacle tool once you are in the builder.
      </p>
      <div className="welcome__axes">
        {ROOM_AXES.map(({ key, label, hint }) => (
          // The hint sits outside the <label> and is wired with
          // aria-describedby: inside it, "Floor to ceiling, including plenum"
          // would join the field's accessible name instead of describing it.
          <div key={key} className="welcome__axis">
            <label className="welcome__label" htmlFor={`room-${key}`}>
              {label}
            </label>
            <span className="welcome__unit-field">
              <NumberInput
                id={`room-${key}`}
                describedBy={hint ? `room-${key}-hint` : undefined}
                className="welcome__input welcome__input--unit"
                value={value[key]}
                min={ROOM_LIMITS[key].min}
                max={key === "height" ? maxRoomHeightFeet(multiFloor) : ROOM_LIMITS[key].max}
                onChange={(next) => onChange({ ...value, [key]: next })}
                onCommit={() => onChange(clampRoom(value, multiFloor))}
              />
            </span>
            {hint && (
              <span className="welcome__hint" id={`room-${key}-hint`}>
                {hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
