import { useState } from "react";
import { Icons, type IconProps } from "@/components/Icons";
import { elevationKeysApply, rotationKeysApply } from "@/domain/placement-session";
import type { ComponentType, ReactNode } from "react";
import type { ToolId } from "@/types";
import "@/components/ControlsLegend.css";

type Control = {
  icon: ComponentType<IconProps>;
  /** What you do. `ReactNode` so the keyboard rows can show real key caps. */
  input: ReactNode;
  action: string;
  /**
   * Which tools this row applies to. Absent means every tool — the legend
   * describes the app, and only a row whose keys are dead for the armed tool
   * earns being taken away.
   */
  applies?: (tool: ToolId) => boolean;
};

/**
 * Every control the viewport has, in the order you meet them: the two clicks
 * that build, the three camera moves, then the keys that adjust what is about
 * to be placed.
 *
 * The client asked for exactly this list, with two entries — drag to change a
 * part's orientation, and drag to move a placed part — that the app has no
 * bindings for and that would both need the left drag the camera orbit already
 * owns. Those are still with him; this legend describes what is actually here,
 * which is the only thing a legend may do.
 */
const CONTROLS: Control[] = [
  { icon: Icons.MouseLeft, input: "Left click", action: "Place" },
  { icon: Icons.MouseRight, input: "Right click", action: "Erase" },
  { icon: Icons.Orbit, input: "Left click drag", action: "Orbit" },
  { icon: Icons.Pan, input: "Right click drag", action: "Pan" },
  { icon: Icons.Scroll, input: "Scroll", action: "Zoom" },
  {
    icon: Icons.Keys,
    input: (
      <>
        <kbd>R</kbd>
        <span className="legend__or">/</span>
        <kbd>⇧R</kbd>
      </>
    ),
    action: "Rotate",
    applies: rotationKeysApply
  },
  {
    icon: Icons.Keys,
    input: (
      <>
        <kbd>[</kbd>
        <span className="legend__or">/</span>
        <kbd>]</kbd>
      </>
    ),
    action: "Elevation",
    applies: elevationKeysApply
  }
];

/**
 * The controls legend, anchored bottom-left of the viewport.
 *
 * Always on screen rather than behind a help button: the client's goal for it
 * was "making it easier and easier so any dummy can do it", which a panel you
 * have to know to open does not do. It collapses to its own title for anyone
 * who has learned the controls.
 */
export function ControlsLegend({ tool }: { tool: ToolId }) {
  const [open, setOpen] = useState(true);
  const controls = CONTROLS.filter((control) => control.applies?.(tool) ?? true);
  return (
    <div className="legend nosel">
      <button
        className="legend__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="controls-legend-list"
      >
        <span className="legend__title">Controls</span>
        {open ? <Icons.ChevD size={13} /> : <Icons.ChevU size={13} />}
      </button>
      <dl className="legend__list" id="controls-legend-list" hidden={!open}>
        {controls.map((control, i) => {
          const Glyph = control.icon;
          return (
            <div className="legend__row" key={i}>
              <dt className="legend__input">
                <Glyph size={17} className="legend__icon" />
                <span>{control.input}</span>
              </dt>
              <dd className="legend__action">{control.action}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
