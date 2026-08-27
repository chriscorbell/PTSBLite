# ADR-0017: The build area is fixed; a design's variable geometry is its room

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

Until now the welcome screen sized the build area itself: the grid, the ground plane, the camera
bounds and the placement limits all followed whatever dimensions the visitor typed, and nothing
existed outside them. The client's direction is different: systems are routinely built *around*
a building, not only inside it — parts on the exterior of a room, runs across open ground — and
the thing a visitor should describe is the room, not the world.

The client has also asked (Trello, "Rooms") about a future tool for dragging out additional
pen/impenetrable rooms inside a design.

## Decision

**The build area is a fixed constant: 300 × 300 × 100 ft (`BUILD_AREA`).** Every grid spans it;
it is never stored, never typed, never resized. The welcome screen collects the dimensions of a
**room** instead, stored as `metadata.room` (the old `buildArea` key is still read on restore,
like `filename` before it).

The room is derived scenery, not an occupant:

- Its footprint (`roomRect`) sits centered in the build area under the same rule the build area
  itself uses, so a room-sized-like-the-build-area lands exactly on it.
- Its floor draws a step brighter than the ground outside; the brightness border is what marks
  where the room ends.
- Four 1 ft walls (`roomWalls`) ring the footprint inside its own dimensions, rising the room's
  full height. They render with the penetrable obstacle's mesh and, like penetrable obstacles
  (ADR-0016), claim **no grid cells**: tubes route through walls, and validation stays out of it.
- The floor separator and the plenum bands span the room's footprint, not the build area, and the
  Auto-Build plenum bias only credits cells inside the room's footprint.
- A two-floor room is derived (ADR-0015) and capped by `clampRoom` so both floors plus the
  separator fit the build area's height: at 100 ft, a two-floor room is at most 49 ft per floor.

## Consequences

**Placement is world-wide.** Parts and obstacles may be placed anywhere in the fixed build area.
Tests about grid edges now test the world's edges; nothing clips at the room.

**The room cannot collide.** Walls are visual. If the client wants impenetrable rooms — walls
that block routing — that is the "Rooms tool" feature, and those rooms will be occupants like
obstacles are, placed and erased, not metadata. This ADR deliberately does not build that: one
room, made at design creation, immutable. Promoting rooms to occupants later does not disturb the
serialized format — `metadata.room` simply remains the first room.

**The schema stays at version 1.** `room` is parsed forgivingly with `buildArea` as its fallback
key, so every stored design keeps its dimensions; a stored two-floor room too tall for the build
area restores capped rather than refused.

**Camera bounds are constants again.** Zoom limit and far plane derive from `BUILD_AREA`; only
the opening framing still varies, following the room.
