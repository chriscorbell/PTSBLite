# ADR-0025: A two-floor building carries its horizontal run upstairs

- **Status:** Accepted
- **Date:** 2026-08-31
- **Builds on:** [ADR-0023](0023-a-horizontal-run-belongs-in-the-run-band.md)

[ADR-0023](0023-a-horizontal-run-belongs-in-the-run-band.md) gave every design a run band and made
it a rule rather than a preference, but a two-floor room got one band per floor and both were
credited the same. The router took whichever was cheaper, which is almost always the lower one — so
a run to an upstairs terminal crossed the building at 1st floor level and climbed at the end.

The client asked for the opposite three times, and the third time gave the rule in both directions:
with a terminal upstairs, "the auto build will always prefer the 2nd floor plenum"; with one
downstairs, the auto-build "will essentially ignore the 1st floor plenum and ceiling, and use the
2nd floor plenum for linear run, passing through the last floor ceiling/plenum". His reason is
installation, not routing: upstairs is where the tube is easiest to run.

## The decision

In a two-floor building the run band is the **upper** floor's, and only the upper floor's. Which
floor the parts stand on does not enter into it — the band follows the building.

`runBandVolume` picks the floor first and then answers ADR-0023's question for that floor alone, so
the three kinds carry over unchanged:

| Kind | Where the band sits in a two-floor building |
| --- | --- |
| `plenum` | the floor 2 plenum band |
| `ceiling` | the foot below the 2nd floor's ceiling |
| `ghost-ceiling` | the foot below 12 ft **measured from the 2nd floor's own level** |

The last row is the client's "up to 12ft in relation to the 2nd story floor". It falls out of
`floorBaseElevation` rather than being special-cased: the cap was always measured from the storey,
and the 1st floor band was the only one that made that invisible.

## What this costs

A run between two parts that both stand downstairs now rises past the separator slab, crosses
upstairs and comes back down. In the 30 ft-per-floor room the behaviour table uses that is 106 ft of
riser to cross 48 ft, and the table records it. This is the same trade ADR-0023 already made — the
band outranks length — carried to the case where the band is a storey away, and it is what "ignore
the 1st floor plenum and ceiling" asks for in as many words. The client was told to expect it before
it shipped, and told that a length floor is available if it bothers him once he sees it.

Nothing else changes: the 300 ft centerline cap still counts every one of those feet, bends still
vote against the climb where the ports face along the ground, and a system that never touches the
building still runs at 12 ft outdoors ([ADR-0024](0024-a-system-outside-the-building-runs-at-twelve-feet.md)).

## Still open

Nothing. A terminal placed *outside* a two-storey building was left open here — the client wants its
outdoor length carried at the lower of the 1st floor's ceiling and 12 ft, adopting the upstairs band
only once the route is inside the footprint, and one band per design could not express two run
heights on one route. [ADR-0028](0028-a-run-carries-two-heights-across-the-wall.md) settles it by
giving the band a side.

## What the visitor is told

Nothing new. The "Auto-Build complete" box says which band was used, not which floor it sat on, and
its two lines are unchanged.
