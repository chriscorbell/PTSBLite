# ADR-0024: A system outside the building runs at twelve feet

- **Status:** Accepted
- **Date:** 2026-08-31

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

## What the visitor is told

The "Auto-Build complete" box gains a fourth line, "Nothing under a ceiling - auto-build runs at
12ft.", with the 12 interpolated from `MAX_RUN_HEIGHT_FEET`. Unlike the other three it is not the
client's wording — he gave no copy for this case.
