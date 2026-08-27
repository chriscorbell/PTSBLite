import { useState } from "react";
import { Icons, type IconProps } from "@/components/Icons";
import type { ComponentType, ReactNode } from "react";
import "@/components/ControlsLegend.css";

type Control = {
  icon: ComponentType<IconProps>;
  /** What you do. `ReactNode` so the keyboard rows can show real key caps. */
  input: ReactNode;
  action: string;
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
  { icon: Icons.Orbit, input: "Drag", action: "Orbit" },
  { icon: Icons.Pan, input: "Right drag", action: "Pan" },
  { icon: Icons.Scroll, input: "Scroll", action: "Zoom" },
  {
    icon: Icons.Keys,
    input: (
      <>
        <kbd>R</kbd> <kbd>⇧R</kbd>
      </>
    ),
    action: "Rotate"
  },
  {
    icon: Icons.Keys,
    input: (
      <>
        <kbd>[</kbd> <kbd>]</kbd>
      </>
    ),
    action: "Elevation"
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
export function ControlsLegend() {
  const [open, setOpen] = useState(true);
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
        {CONTROLS.map((control, i) => {
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
