import { useState } from "react";
import { Icons, type IconProps } from "@/components/Icons";
import type { ComponentType } from "react";
import "@/components/QuickStartGuide.css";

type Step = {
  /** What to do, in the order you would do it. */
  text: string;
  /** The controls this step sends you to, left to right as the UI nests them. */
  icons: ComponentType<IconProps>[];
  /** An alternative to the step above rather than the next thing to do. */
  alternative?: boolean;
};

/**
 * The route through a first system, in the client's words.
 *
 * It replaces a single "Start by placing a blower" banner that only appeared on
 * an empty design and said nothing about what came after it. The icons are the
 * ones on the controls the step means — the Build drawer and the part inside
 * it, the Obstacle tool, Auto-Build, Finalize — so a step can be followed by
 * matching glyphs rather than by hunting for a name.
 */
const STEPS: Step[] = [
  { text: "Start by placing blower 1", icons: [Icons.Hammer, Icons.Blower] },
  { text: "Place terminal 1 after blower 1", icons: [Icons.Hammer, Icons.Terminal] },
  { text: "Place your tubing and bends", icons: [Icons.Hammer, Icons.Tube, Icons.Bend] },
  {
    text: "Complete your system by connecting terminal 2 and blower 2",
    icons: [Icons.Terminal, Icons.Blower]
  },
  { text: "OR simply hit Auto-Build", icons: [Icons.Auto], alternative: true },
  { text: "Add obstacles with the obstacle tool", icons: [Icons.Obstacle] },
  { text: "Click Finalize to validate your system and generate a BOM", icons: [Icons.Bom] }
];

/**
 * The quick start guide, anchored bottom-left of the viewport where the
 * controls legend used to sit. Collapsible, like the legend, so it can be got
 * out of the way once the route is known.
 */
export function QuickStartGuide() {
  const [open, setOpen] = useState(true);
  return (
    <div className="quickstart nosel">
      <button
        className="quickstart__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="quick-start-steps"
      >
        <span className="quickstart__title">Quick Start Guide</span>
        {open ? <Icons.ChevD size={13} /> : <Icons.ChevU size={13} />}
      </button>
      <ol className="quickstart__list" id="quick-start-steps" hidden={!open}>
        {STEPS.map((step) => (
          <li
            className={`quickstart__step${step.alternative ? " quickstart__step--alt" : ""}`}
            key={step.text}
          >
            <span className="quickstart__text">{step.text}</span>
            <span className="quickstart__icons" aria-hidden="true">
              {step.icons.map((Glyph, i) => (
                <Glyph size={15} className="quickstart__icon" key={i} />
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
