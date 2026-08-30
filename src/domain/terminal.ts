import { vAdd } from "@/domain/vec3";
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
 * body is two cells of one column.
 */
export const TERMINAL_HEIGHT_CELLS = 2;

/** Straight up. The body stands upright however its ports are turned. */
const UP: Vec3 = [0, 1, 0];

/**
 * The cells a terminal's body occupies: the cell it was placed in and the one
 * directly above it.
 *
 * It claims both for the reason the pedestal's mast claims its column — the
 * body is solid, and a cell the app draws something in but leaves unclaimed is
 * a cell Auto-Build will route a tube straight through. That is the
 * parts-agree-with-grid split CONTEXT.md names as the invariant that matters
 * most, so the second foot of a terminal is registered like the first.
 *
 * The footprint on the floor is still one square: a terminal grows upward, not
 * outward, whichever way its ports face.
 */
export function terminalCells(cell: Vec3): Vec3[] {
  return [cell, vAdd(cell, UP)];
}

/**
 * The body cell a port facing `dir` leaves from: the top of the body for a port
 * pointing up, the bottom for anything else.
 *
 * A terminal's two ports sit on opposite ends of its axis, and on a 2 ft body
 * the upward one now leaves a foot higher than it used to. Anchoring it to the
 * top cell is what keeps the port *outside* the terminal: measured from the
 * base, an upward port would land in the terminal's own second foot, so a tube
 * connected to it would be drawn through the middle of the unit and could never
 * be placed at all.
 *
 * Horizontal ports stay on the base cell. Nothing about a taller body moves
 * them, and leaving them where they are is what lets a design built before this
 * change keep its connections.
 */
export function terminalPortAnchor(cell: Vec3, dir: Vec3): Vec3 {
  return dir[1] > 0 ? vAdd(cell, UP) : cell;
}

/** Whether a terminal's ports run vertically, which is how it is drawn. */
export function terminalAxisIsVertical(part: Pick<TerminalPart, "axis">): boolean {
  return part.axis[1] !== 0;
}
