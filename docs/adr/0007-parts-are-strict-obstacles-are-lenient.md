# ADR-0007: Parts are strict, obstacles are lenient

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

`DesignState` carries a `SparseGrid` of cell occupancy alongside its `parts` and `obstacles`. The two
must agree: an occupant present in one but not the other renders and appears in the BOM yet cannot
be erased or collided with. `CONTEXT.md` names this as the invariant that matters most in the
codebase.

Rebuilding a design from a scene — restoring a session, clearing parts, applying a build-area change —
used to degrade in two different ways, neither of them chosen:

- Out-of-bounds cells, and already-occupied cells belonging to tubes, bends and obstacles, were
  skipped by a `withinBounds`/`!query` guard, producing exactly that split-brain state.
- Blower and terminal cells took a different path with no occupancy guard at all, and
  `SparseGrid.place` throws on an occupied cell — so stored data holding two overlapping terminals
  did not degrade quietly; it crashed restoration with an unhandled exception.

Issue #11 asked for one checked path. What it did not settle is whether that path should reject or
repair, and the answer turns out to differ by occupant.

## Decision

One reconstruction module (`design-reconstruction.ts`), with **different strictness for parts and
obstacles**, because they are different kinds of thing.

**Parts are objects, and are strict.** A part whose footprint falls outside the build area, or lands
on another part, is rejected and the load fails with the part and cell named. Neither state is
  reachable by using the app — every placement path already refuses both — so stored data containing
  one is corrupt. Reporting beats repairing: silently dropping part of a saved design is worse than
  declining to restore it. Rejection is all-or-nothing, so a part that fails partway registers nothing.

**Obstacles are volumes, and are lenient.** `CONTEXT.md` is explicit that an obstacle is not a part:
it costs nothing, appears in no BOM, and exists only to mark space unavailable. Overlapping volumes
therefore lose no information — the union is exactly what the grid needs to represent, and whichever
obstacle claimed a cell first, the cell is occupied. Cells outside the build area are clipped, since
nothing can occupy them anyway.

**An obstacle overlapping a part is accepted**, not rejected. `validation.ts` has a rule for it,
  `checkObstacleIntersections`, at level `error` — which means the product intends that state to be
  representable and flagged. Refusing to restore the design would leave the visitor unable to fix the
problem the validator exists to report.

## Consequences

- `deserializeDesign` returns a typed failure listing every offending part, not just the first.
- `designFromScene` keeps its name and signature but wraps the same implementation and *throws*,
  because its callers pass designs already known to be valid. One implementation, two failure
  policies, and deliberately no second permissive path.
- The asymmetry has to be preserved by anything that adds a new occupant kind. The question to ask is
  the one above: is this an object, or a volume?
- `expectGridMatchesDesign` encodes the same asymmetry — every part cell must belong to that part,
  every obstacle cell need only be occupied by something.

## Notes

The test suite settled this rather than an argument. A stricter first version, rejecting
part/obstacle overlap along with everything else, made `checkObstacleIntersections`'s own fixture
unconstructible — the test for that validation rule deliberately builds a part passing through an
obstacle. A validation rule whose subject cannot be built is a rule that can never fire, and that
contradiction is what identified the right boundary.
