# ADR-0023: A horizontal run belongs in the run band

- **Status:** Accepted
- **Date:** 2026-08-30
- **Amended:** 2026-08-31 — `runBandVolume` no longer returns one band per floor. A two-floor
  building has a single band, upstairs: [ADR-0025](0025-a-two-floor-building-runs-upstairs.md).
  The three kinds and the "always, at any height" rule below are unchanged.

Auto-Build carried horizontal runs in the plenum when the climb repaid itself and along the floor
when it did not. The client was asked where the line should fall and drew it nowhere: asked whether
a short run should stay direct, "No, see #1"; asked whether a ceiling could be high enough that
climbing stops being worth it, "No". Item 1 was the rule itself — "always prefer the plenum when
there is one".

So the plenum stops being a preference the room can outvote. And a room without one is not
exempt: the client gave the fallback in the same breath — with no plenum, a room of 12 ft or lower
runs next to its ceiling, and a taller room is routed under a "ghost" ceiling at 12 ft, with
anything higher left for the visitor to build by hand.

## Every design has a run band

`runBandVolume` answers one question for a design: where does a horizontal run belong? It returns
one band per floor, spanning the room's footprint, in one of three kinds.

| Kind | When | Where the band sits |
| --- | --- | --- |
| `plenum` | the design has a plenum | the plenum bands, whatever their height |
| `ceiling` | no plenum, floor 12 ft or lower | the foot below the ceiling |
| `ghost-ceiling` | no plenum, floor taller than 12 ft | the foot below 12 ft |

The band is a volume, not a height: outside the room's footprint there is no drop ceiling to be
under, and a run out there is credited nothing — unchanged from the plenum bias that preceded this.

`MAX_RUN_HEIGHT_FEET` is 12. It is the client's figure for how high Auto-Build climbs unaided, not
a measurement from the PTS specification, and ADR-0001 governs the difference. The separate rule
for a system built entirely outside a building is its own card and is not implemented here — it
became ADR-0024, which adds a fourth kind alongside these three.

## The riser is a tie-breaker, not a cost

The band could not be made unconditional by raising the out-of-band penalty. The search estimates
the remaining cost at the rate the cell it stands on charges, and a penalty above about 3.7 makes a
bend look like progress outside the band — which is how a diagonal came back as a ten-bend
staircase once before.

What actually voted the band down was the riser: a vertical foot cost a foot, so reaching a band 27
ft up cost 54 ft against the 2 ft per horizontal foot the band saved, and a 40 ft run stayed on the
floor. A vertical foot now costs `VERTICAL_STEP_COST`, 0.005, in the search and in the estimate
that guides it — enough to prefer the lower of two bands that are otherwise equal, far too little
for any climb the build area can hold (200 ft, up and back) to outweigh a single foot of banded
run.

The geometric cost of a vertical foot is still a foot. Penalties steer the route; the 300 ft
centerline cap is charged real tube, and a banded route genuinely is longer.

**Search bounds had to move with it.** Bounds are drawn around the endpoints and 12 ft of margin,
which put a band 27 ft above two floor-level ports outside the searchable space entirely. No cost
model can prefer a route the search cannot see, so the bounds now always reach the band.

## What this costs

**Routes are longer, by the riser twice over.** In a 30 ft room a 40 ft run went from 43 ft of
tube to 85. No route gained a bend: the band is bought with length, never with turns, which is the
trade the client asked for in as many words.

**A short hop between two upward ports climbs the whole way.** Six feet apart in a 30 ft room is 73
ft of tube and five bends. That is the price of "always", and the client has already been asked
about the same daftness in a 12 ft room: "in real life, there would never be a 6 ft run ... just
let auto build do a 31 ft daft looking build". The row is in `pathfinder-behaviour.test.ts` for
whoever needs to reopen it with him.

**Bends still vote.** Between two ports that face along the ground, climbing into the band adds
four bends that a direct shot does not place, and a short run does not buy them. Between the
upward-facing ports a visitor gets by default the bends are paid either way and the band always
wins. The band outranks distance and room height; it does not outrank the client's other rule, that
a system should be built in the fewest bends.

**A room with no plenum now routes differently.** It used to be the case with nothing to prefer.
This is the change most likely to surprise someone who had learned the old behaviour.

## What the visitor is told

The "Auto-Build complete" box carries the client's own two lines: "Auto-build favors plenum when
available" whenever the design has a plenum, and "Autobuild stops at 12ft - please try building
manually if you need more rise." only when the ghost ceiling is what capped the route. The 12 is
interpolated from `MAX_RUN_HEIGHT_FEET` rather than typed into the copy.
