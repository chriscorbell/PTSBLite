# ADR-0028: A run carries one height outdoors and another inside

- **Status:** Accepted
- **Date:** 2026-08-31
- **Builds on:** [ADR-0023](0023-a-horizontal-run-belongs-in-the-run-band.md),
  [ADR-0024](0024-a-system-outside-the-building-runs-at-twelve-feet.md),
  [ADR-0025](0025-a-two-floor-building-runs-upstairs.md)
- **Closes:** the "Still open" section of [ADR-0025](0025-a-two-floor-building-runs-upstairs.md)

[ADR-0023](0023-a-horizontal-run-belongs-in-the-run-band.md) gave every design one run band, spanning
the room's footprint. Outside that footprint nothing was credited: a horizontal foot out there paid
the out-of-band penalty wherever it sat, so the search had no reason to prefer one height to another
and picked whatever the rest of the route made cheapest. With a terminal outdoors and a two-storey
building, that meant climbing to the upstairs band out in the open air, tens of feet before the
route reached the building at all.

The client gave the rule for that layout in full:

> if someone builds one terminal _(OUTSIDE)_ of a 2 story floor, placing the terminal within the
> height constraints of the 1st floor, and the autobuild route goes through the room, here's how the
> autobuild should behave: rise to 1st floor ceiling height at 12ft - whichever is shorter - and once
> inside the building (via bends and/or linear tubes) the 'use the 2nd floor plenum or ceiling' rule
> kicks in, and the route should then rise to the 2nd floor plenum or ceiling ... completes the rest
> of its linear run, and then back down to wherever the remaining terminal is.

## The decision

A run band has two sides. Inside the room's footprint it is whatever ADR-0023 and ADR-0025 already
said it was — the plenum, the ceiling, or the ghost ceiling, on the upper floor in a two-storey
building. Outside the footprint it is the foot below `min(1st floor height, 12 ft)`, the client's
"1st floor ceiling height at 12ft - whichever is shorter".

The outdoor side is always measured from floor 1, whatever the building does upstairs: outdoors
there is no upstairs to be in, and a terminal out there stands on the ground.

`RunBand` therefore carries a `side`, and `inRunBand` credits a cell against the bands for the side
of the footprint the cell is actually on. That is the whole mechanism — the search keeps one band
volume per build, so which height applies is still a property of the system rather than of the pair
being routed, and the two heights meet wherever the route crosses the wall.

This is a rule about where a run belongs, not a limit on where one may go: both sides are still a
bias, and both still lose to a layout that makes them impossible.

## What this costs

Two bends, on any route that crosses the wall with the two heights far apart. In a two-storey
building the outdoor leg now carries at 11 ft and steps up to the upstairs band at the footprint,
where before it climbed once and held the upstairs height throughout. That is the trade the client
asked for in as many words, and the behaviour table records both rows.

Where the two heights coincide — a single-storey building 12 ft or lower, which is the shape the
setup form opens with — the outdoor band sits inside the indoor one and nothing changes: the run
crosses the wall at the same height it was already at, and buys no bends at all.

A system that never touches the building is untouched. It has its own band
([ADR-0024](0024-a-system-outside-the-building-runs-at-twelve-feet.md)), measured against the whole
build area rather than the room, and 12 ft there is not the 1st floor's ceiling but the absence of
one.

## What the visitor is told

Nothing new. The "Auto-Build complete" box names which of the client's cases produced the band, and
the case is unchanged: a run that crosses the wall of a building with a plenum is still a plenum
run. The second height is a detail of how it gets there.
