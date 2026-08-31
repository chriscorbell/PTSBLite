import { vAdd, vEq, vNeg } from "@/domain/vec3";
import type { TerminalPart, Vec3 } from "@/types";

/**
 * How tall a terminal stands.
 *
 * The client's correction, 2026-08-30: "I actually need the terminal height to
 * be 2 grid units (2 ft) tall. So 1'x1'x2'", clarified the same day as "the
 * terminal will still only take up a 1 ft foot print, but just be 2 ft tall".
 * A part fact from Kelly Tube Systems rather than a modelling convenience, so
 * it is sourced and authoritative in the sense of ADR-0001 — and recorded in
 * ADR-0021, which also says why the body claims the cell above it.
 *
 * The scale it is measured in is untouched: 1 cell is still 1 ft, so a 2 ft
 * body is two cells end to end — stacked while the unit stands up, side by side
 * once it is turned onto its side (ADR-0027).
 */
export const TERMINAL_HEIGHT_CELLS = 2;

/** Straight up: the way a terminal runs until its ports are turned off vertical. */
const UP: Vec3 = [0, 1, 0];

/**
 * Which way a terminal's body runs from the cell it was placed in.
 *
 * A 2 ft unit on a 1 ft grid always claims a second cell; this says which one.
 * The body lies along its own port axis, so turning the ports turns the whole
 * unit — the client's correction on 2026-08-31, recorded in ADR-0027. A
 * terminal standing up runs into the cell above; one turned sideways lies down
 * and runs into the cell beside it.
 *
 * The direction is normalized to the positive one, so a terminal and the same
 * terminal turned end for end occupy the same two cells. They are the same box
 * on the floor, and only differ in which end the run leaves from — which is
 * `terminalPortAnchor`'s business, not the body's. That is also what keeps a
 * downward-facing terminal standing in the cell above it, exactly as it did
 * before this change.
 *
 * An axis that is not a single grid direction stands the unit up. Nothing the
 * app places produces one, but a stored design's axis is only checked for three
 * numbers, and a body with no direction to run in would claim its own cell
 * twice.
 */
export function terminalBodyDir(axis: Vec3): Vec3 {
  const along = axis.filter((component) => component !== 0);
  if (along.length !== 1 || Math.abs(along[0]) !== 1) return UP;
  return along[0] < 0 ? vNeg(axis) : axis;
}

/**
 * The cells a terminal's body occupies: the cell it was placed in and the next
 * one along {@link terminalBodyDir}.
 *
 * It claims both for the reason the pedestal's mast claims its column — the
 * body is solid, and a cell the app draws something in but leaves unclaimed is
 * a cell Auto-Build will route a tube straight through. That is the
 * parts-agree-with-grid split CONTEXT.md names as the invariant that matters
 * most, so the second foot of a terminal is registered like the first.
 *
 * A terminal standing up takes one square of floor and two of height. Lying
 * down it takes two squares of floor and one of height: the same 1 x 1 x 2 unit,
 * turned. It is the axis that decides, so every caller has to hand one over.
 */
export function terminalCells(cell: Vec3, axis: Vec3): Vec3[] {
  return [cell, vAdd(cell, terminalBodyDir(axis))];
}

/**
 * The body cell a port facing `dir` leaves from: the far end of the body for
 * the port that points that way, the placed cell for the one facing back.
 *
 * A terminal's two ports sit on opposite ends of its axis, and the body is 2 ft
 * long, so each port leaves from its own end. Anchoring the far one to the
 * second cell is what keeps the port *outside* the terminal: measured from the
 * placed cell, it would land in the terminal's own second foot, so a tube
 * connected to it would be drawn through the middle of the unit and could never
 * be placed at all.
 */
export function terminalPortAnchor(cell: Vec3, dir: Vec3, axis: Vec3): Vec3 {
  const body = terminalBodyDir(axis);
  return vEq(dir, body) ? vAdd(cell, body) : cell;
}

/**
 * Whether a terminal stands upright rather than lying on its side, which is how
 * its body is drawn and which pair of cells it claims.
 *
 * Read off the body direction rather than the axis, so the one axis the grid
 * refuses to lie down — a malformed one — is the one the renderer stands up too.
 */
export function terminalAxisIsVertical(part: Pick<TerminalPart, "axis">): boolean {
  return terminalBodyDir(part.axis)[1] !== 0;
}
