import { Topology } from "@/domain/topology";
import type { DesignState, Part, Vec3 } from "@/types";
import { cellCenter, dirOf, cellAt, vAdd, vNeg, vScale, vSub } from "@/domain/vec3";

/**
 * Split sleeves: the bolted collars that join one piece of tube to the next.
 *
 * Nobody places one. A sleeve exists because two pieces meet, or because a run
 * of tube is longer than the stock it is cut from, so the set of them is a pure
 * function of the parts — derived on demand like the topology, never stored and
 * never in the Build drawer. See ADR-0022.
 *
 * The client's rule, 2026-08-26: "1 between blower/terminal, 1 immediately
 * after (or before) terminal, then every 6 feet. 1 on each end of a bend", with
 * one hard constraint — "it just has to show no more than 6 ft between
 * couplings" — and explicit permission to reach it any simpler way. Two rules
 * cover every case he listed:
 *
 * 1. **A sleeve at every joint.** Wherever two ports are mated there is a
 *    sleeve on the face between them. That is the one between a blower and a
 *    terminal, the one where a terminal meets its first tube, and the one at
 *    each end of a bend, without any of them being special-cased.
 * 2. **A sleeve every 6 ft inside a tube.** Stock is 6 ft (`parts.json`), so a
 *    longer straight is several lengths sleeved together.
 *
 * Those two give the 6 ft guarantee outright: within a tube the gap is 6 ft by
 * construction, and a bend measures 5.71 ft end to end (0.5 + 4.71 + 0.5), so
 * no pair of neighbouring sleeves on a connected run can be further apart.
 * `split-sleeve.test.ts` asserts that rather than trusting the arithmetic here.
 *
 * A remainder falls at the far end, which the client called for by name: seven
 * feet of tube gets sleeves at 0, 6 and 7 ft, so "one end look[s] normal and
 * the other end just has two couplings 1 grid unit (foot) apart. This wouldn't
 * happen in real life but I knew this question might come up."
 */

/** Stock tube length, and so the furthest two sleeves may sit apart. */
export const SPLIT_SLEEVE_SPACING_FEET = 6;

/** The catalog key the BOM counts sleeves under. */
export const SPLIT_SLEEVE_KEY = "splitSleeve";

export type SplitSleeve = {
  /** Where the sleeve sits, in world coordinates — always a cell face. */
  readonly at: Vec3;
  /**
   * The axis of the tube it wraps, normalized to the positive direction: a
   * sleeve is a collar, so it looks the same from either side of the joint.
   */
  readonly along: Vec3;
};

function isDesignState(input: readonly Part[] | DesignState): input is DesignState {
  return !Array.isArray(input);
}

/** Sleeve positions land on cell faces — multiples of 0.5, so exact as keys. */
function sleeveKey(at: Vec3): string {
  return `${at[0]},${at[1]},${at[2]}`;
}

/**
 * Both ports of a joint face each other, so the same sleeve arrives twice with
 * opposite directions. Flipping to the positive one makes the pair agree, and
 * keeps the output independent of the order the parts happen to be in.
 */
function positiveAxis(dir: Vec3): Vec3 {
  return dir[0] < 0 || dir[1] < 0 || dir[2] < 0 ? vNeg(dir) : dir;
}

/**
 * Every split sleeve a design needs, in no particular order but deterministic
 * for a given parts list.
 *
 * Only *mated* ports get a joint sleeve. An open end has nothing to couple to,
 * and a valid system has none: both blowers and both terminals are joined, so
 * every end the client named is covered.
 */
export function splitSleeves(input: readonly Part[] | DesignState): SplitSleeve[] {
  const parts = isDesignState(input) ? input.parts : input;
  const topology = new Topology(parts);
  const sleeves = new Map<string, SplitSleeve>();

  const add = (at: Vec3, along: Vec3): void => {
    const key = sleeveKey(at);
    if (!sleeves.has(key)) sleeves.set(key, { at, along: positiveAxis(along) });
  };

  for (const port of topology.ports()) {
    if (!topology.isConnected(port)) continue;
    // The face the two mated ports share: half a foot out of the port's own
    // cell, toward the cell it connects into. Both sides of a joint compute the
    // same point, which is what makes one sleeve out of two ports.
    add(vAdd(cellCenter(port.from), vScale(port.dir, 0.5)), port.dir);
  }

  for (const part of parts) {
    if (part.type !== "tube") continue;
    const dir = dirOf(cellAt(part.from), cellAt(part.to));
    const length = tubeSpanFeet(part.from, part.to);
    // The tube's own geometry starts half a foot back from its first cell
    // centre — the face of that cell, where its end sleeve sits.
    const start = vSub(part.from, vScale(dir, 0.5));
    for (
      let along = SPLIT_SLEEVE_SPACING_FEET;
      along < length - 1e-6;
      along += SPLIT_SLEEVE_SPACING_FEET
    ) {
      add(vAdd(start, vScale(dir, along)), dir);
    }
  }

  return [...sleeves.values()];
}

/** How many sleeves the BOM counts. */
export function splitSleeveCount(input: readonly Part[] | DesignState): number {
  return splitSleeves(input).length;
}

function tubeSpanFeet(from: Vec3, to: Vec3): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
