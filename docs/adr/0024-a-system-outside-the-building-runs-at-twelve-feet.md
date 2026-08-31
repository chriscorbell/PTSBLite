# ADR-0024: A system outside the building runs at twelve feet

- **Status:** Accepted
- **Date:** 2026-08-31
- **Amended:** 2026-08-31 — a building the outdoor band passes over is closed to the route, so
  "clearing the roof counts as outside" describes what gets built rather than what happened to
  get built. See "The route has to actually go over" below.

ADR-0023 gave every design a run band and left one case open in as many words: "The separate rule
for a system built entirely outside a building is its own card and is not implemented here." This
is that card.

The client drew the line at touching the building at all:

> If a system is built with any part under a ceiling, _OR_ an auto-build path routes through a
> building (ex: two terminals on either side of a "room/building", not a likely scenario, but why
> not account for it), always obey routing through the plenum. If a system is 100% _outside_
> (meaning, not part of an auto-build would route through a room/building), default linear run
> heights to 12 ft.

So there is a fourth band, `outside`: the foot below `MAX_RUN_HEIGHT_FEET`, spanning the whole
build area rather than the room's footprint. It is the only band not measured against a ceiling,
because there is no ceiling over it; the room's own height gets no say.

## The test is about the system, not the run

One band is chosen for the whole Auto-Build, not per pair. The client's rule is written about the
system — one run touching the building puts every run under the plenum rules — and `runBandVolume`
was already a per-design decision, so this stays one.

## The second half of the test is only answerable after routing

Whether a part stands under a ceiling can be read off the design. Whether a route passes through
the building cannot: the route depends on the band, and the band depends on the route.

Auto-Build resolves it by trying the outdoor answer and looking at what it built. When no placed
part ends up inside the building, the outdoor build stands; when one does, the whole build is
discarded and redone under `runBandVolume`. A design with anything indoors to begin with skips
straight to the second pass, so the extra search is paid only by a system that is entirely outdoors
*and* cannot stay that way — the case the client called unlikely.

## Clearing the roof counts as outside

"Inside the building" is the room's footprint below its roof, not its footprint at any height. Two
terminals either side of an 8 ft building are joined by a run at 12 ft that passes over it: nothing
routes *through* the building, so the outdoor rule stands and the plenum is not used.

That is the client's example, and it lands on the answer he did not describe — he expected that
layout to use the plenum. It is the reading his rule actually gives, and it is the better build: a
run that clears the roof is outdoors in the way that matters to whoever installs it. A building
taller than `MAX_RUN_HEIGHT_FEET` cannot be cleared, and there the run does go through and the
plenum rules apply, which is `pathfinder.test.ts`'s companion case. If the client wants the
footprint alone to decide, that is a new card and a one-line change to `touchesBuilding`.

## The route has to actually go over

The client tested the section above and it did not hold: "buildings set to 10ft with a terminal on
the outside of the wall bounds, the system stops the rise at the ceiling height and routes the
autobuild through like normal."

The band is a bias, and a bias can lose. Between two ports on the ground either side of a low
building, climbing into the outdoor band costs four bends where the band saves only
`OUT_OF_BAND_STRAIGHT_PENALTY` a foot, so on a short run the route went straight through the
building rather than over it — and a route through the building is exactly what the test above
reads as "this system obeys the plenum rules". The system was demoted for a dip it never had to
take, and the demoted build then ran at the room's ceiling height, through the room, which is what
he saw.

So the outdoor band now closes the building to the route, whenever the band passes above its roof.
The outdoor answer means what this ADR always said it meant — over the roof, or not outdoors at all
— and the second test is answered before routing rather than after it. A building too tall to clear
is left open, because there a dip is the honest answer and the demotion is correct; that is still
the client's two-terminals-either-side case, unchanged.

Two things follow, both deliberate:

- **A bend may overhang the footprint.** A bend's cell block is the square its arc sweeps through,
  and it is conservative: the turn from a riser a foot outside a 10 ft wall into a run at 11 ft has
  block cells inside the building, while the arc inside that block is above the roof everywhere it
  overhangs. Holding bends to the closed building would leave a system beside a low building unable
  to climb over it at all, so only straight run is held to it. A bend spans 3 ft and both its ends
  are outside, so what can fall inside is a corner of the building — or the whole of one at the 4 ft
  minimum room the welcome screen allows. Neither is a run carried through the building.
- **A port too close to the wall it faces still goes through.** A bend needs 3 ft to turn, so a
  terminal a foot or two from the wall cannot rise outside the building; there is no route over the
  roof to prefer, and the plenum rules take it.

A pair whose only path is through a closed building comes back unrouted rather than routed indoors.
Where that happens, the indoor build is asked for as well and the one that joins more of the system
wins: run height is not worth losing a connection over.

## What the visitor is told

The "Auto-Build complete" box gains a fourth line, "Nothing under a ceiling - auto-build runs at
12ft.", with the 12 interpolated from `MAX_RUN_HEIGHT_FEET`. Unlike the other three it is not the
client's wording — he gave no copy for this case.
