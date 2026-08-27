import { deserializeDesign } from "@/domain/design-file";
import { DEFAULT_ROOM } from "@/domain/sparse-grid";
import { DEFAULT_COMPANY_NAME, DEFAULT_SYSTEM_NAME } from "@/domain/design-state";
import type { DesignState } from "@/types";

/**
 * Rules for the session a browser build autosaves. See ADR-0012.
 *
 * Pure, so the decisions can be tested by reading a return value. The storage
 * itself is a platform capability (`documents.kind === "session"`), and the
 * timing belongs to the component that owns the design.
 */

/**
 * Whether `design` represents work worth keeping.
 *
 * Not just "has parts". A visitor who sets the build area to 80 x 40 x 14 and
 * names the system before placing anything has done real work, and losing it
 * because no part had been placed yet would be its own small betrayal. What
 * this excludes is the untouched design every visit starts from: autosaving
 * that would offer to restore nothing, and overwrite a real session with a
 * blank one on any visit the reader abandoned immediately.
 */
export function isWorthKeeping(design: DesignState): boolean {
  if (design.parts.length > 0 || design.obstacles.length > 0) return true;
  const { companyName, systemName, room, multiFloor, plenumHeightFeet } = design.metadata;
  return (
    companyName !== DEFAULT_COMPANY_NAME ||
    systemName !== DEFAULT_SYSTEM_NAME ||
    multiFloor ||
    plenumHeightFeet !== null ||
    room.width !== DEFAULT_ROOM.width ||
    room.depth !== DEFAULT_ROOM.depth ||
    room.height !== DEFAULT_ROOM.height
  );
}

export type StoredSession =
  /** A design this build can open, and which is worth offering. */
  | { status: "restorable"; design: DesignState }
  /** Nothing stored, or nothing worth restoring. */
  | { status: "absent" }
  /** Something is stored that this build cannot read. */
  | { status: "unreadable"; reason: string };

/**
 * Interpret what was found in storage.
 *
 * Parsing goes through `deserializeDesign`, which checks the schema version,
 * validates every occupant and rebuilds the grid through `reconstructDesign` —
 * so a restored design cannot arrive with `parts` and `grid` disagreeing, and
 * this module needs no validation of its own.
 */
export function readStoredSession(payload: string | null): StoredSession {
  if (payload === null) return { status: "absent" };
  const parsed = deserializeDesign(payload);
  if (!parsed.ok) return { status: "unreadable", reason: parsed.message };
  if (!isWorthKeeping(parsed.design)) return { status: "absent" };
  return { status: "restorable", design: parsed.design };
}

/**
 * What to tell a visitor whose stored design could not be read.
 *
 * Deliberately says nothing about schema versions or JSON. The failure means an
 * older or newer build wrote it, and a member of the public evaluating a tube
 * system can do nothing with that; the detail goes to the console, where the
 * person who can act on it will look.
 */
export const UNREADABLE_SESSION_MESSAGE = "Your previous design could not be reopened.";
