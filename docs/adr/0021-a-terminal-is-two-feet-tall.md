# ADR-0021: A terminal is two feet tall

- **Status:** Accepted
- **Date:** 2026-08-30

The client corrected a part fact: "I actually need the terminal height to be 2 grid units (2 ft)
tall. So 1'x1'x2'. The 3d model for it needs to be redone to satisfy this change." Asked whether
that widened the footprint too, he was explicit: "the terminal will still only take up a 1 ft foot
print, but just be 2 ft tall."

This is a measurement of Kelly Tube Systems hardware, not a modelling convenience, so it is
sourced and authoritative in the sense of ADR-0001 — recorded here so the next person to find a `2`
in the terminal geometry has something to check it against. Nothing about the scale it is measured
in changes: 1 cell is still 1 ft on every axis, and a 2 ft body is two cells of one column.

## The body claims both cells

A terminal now occupies the cell it was placed in **and the cell directly above it**. That is the
only honest reading of a solid 2 ft part on a 1 ft grid, and the alternative is the split
CONTEXT.md names as the invariant that matters most: a cell the app draws something in but leaves
unclaimed is a cell Auto-Build will route a tube straight through. The same argument made the
pedestal's mast claim its column (ADR-0020).

Its consequences:

- **Placement needs headroom.** A terminal is refused where the cell above the cursor is taken, or
  where there is no cell above it, with a message naming the height rather than the cell under the
  cursor — which is free, and would be the wrong square to point at.
- **The footprint on the floor is unchanged.** One square, however the unit is turned. A terminal
  grows upward, never outward, so nothing about the plan view, the landing cells or the floor
  shadows changes. *Superseded by [ADR-0027](0027-a-terminal-turns-with-its-ports.md): the client
  asked for `R` to turn the whole unit, and one lying on its side covers two squares of floor. The
  two cells are still claimed; which two now depends on the axis.*
- **The catalog says two.** `terminal.cells` is 2, and free placement checks the geometry against
  it rather than trusting it, in the same spirit as the bend footprint check in
  `part-registry.ts`.

## Where the ports sit

The two ports still sit on the axis and its negation. What moved is where they leave from: each
port leaves from the end of the body it belongs to, so an **upward** port opens two cells above the
base rather than one.

It has to. Measured from the base, an upward port would land in the terminal's own second foot: a
tube connected to it would be drawn through the middle of the unit, and could never be placed at
all, since the cell is occupied by the terminal itself.

Horizontal ports stay on the base cell. Nothing about a taller body moves them, and leaving them
alone is what lets a design built before this change keep the connections it had.

## What this costs

**A design saved before this change may no longer open.** The commonest arrangement there is — a
terminal facing up with the run leaving its top — puts a tube in the cell the terminal's second
foot now stands in, and that is a state the app cannot represent. `deserializeDesign` reports it
like any other overlap and the visitor is told their previous design could not be reopened
(`session-autosave.ts`).

This is deliberate, and it follows the rule the file module already states: reporting beats
repairing. Migrating would mean silently shortening or dropping the tubing a stored design holds,
and handing someone a design that is quietly not the one they built is worse than declining to
reopen it. The schema version is untouched, because the payload *format* did not change: a stored
design with no upward-facing terminal still opens exactly as before.

**Auto-Build routes buy one foot less riser at each end.** Every route that climbs out of both
terminals leaves a foot higher than it used to, so it spends 2 ft less tube — tube the terminal's
own second foot has taken over. Bend counts, plenum bands and warnings are unchanged; the table in
`pathfinder-behaviour.test.ts` records the shift.

## What this is not

Redrawing the terminal to look like a real Kel2020 unit is separate work, agreed with the client on
its own card. This ADR is the height and the geometry that follows from it; the existing shape
simply became 2 ft tall, with its port fittings moved to the ends of the axis and its body left
standing upright however those ports are turned — which
[ADR-0027](0027-a-terminal-turns-with-its-ports.md) later changed, on the client's correction.
