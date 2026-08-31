# ADR-0027: A terminal turns with its ports

- **Status:** Accepted
- **Date:** 2026-08-31

The client, reading the note that shipped with the 2 ft terminal — "the square of floor it takes is
unchanged, and it stands upright however you turn it with `R`; only its two ports move around the
body" — asked for the opposite: "I should have specified this — is it possible to make the WHOLE
OBJECT rotate?? If that's too difficult and would break the app in other ways, we can ignore that
for now."

It is possible, and it does not break anything, so `R` now turns the unit rather than only its
fittings. A terminal whose ports run vertically stands up exactly as it did. One whose ports run
sideways lies on its side.

## Two squares of floor, not one

ADR-0021 recorded that a terminal "grows upward, never outward" and takes one square of floor
however it is turned. That was the honest reading of a body that always stood up. Once the body
turns, it is not: a 2 ft unit lying down covers 2 ft of floor, and the second square is claimed for
the same reason the second foot of a standing one is — a cell the app draws something in but leaves
unclaimed is a cell Auto-Build will route a tube straight through.

So the rule is no longer about height. **A terminal always occupies two cells: the one it was placed
in, and the next one along its own axis.** Standing up that is the cell above, which is what
ADR-0021 said; lying down it is the cell beside. `terminal.cells` is still 2, and free placement
still checks the geometry against it.

The body direction is normalized to the positive one, so a terminal and the same terminal turned end
for end lie across the same two cells. They are the same box: only which end the run leaves from
differs. That also keeps a downward-facing terminal standing in the cell above it, exactly as it did
before this change.

Its consequences:

- **Placement needs room in the direction it is turned.** A terminal is refused where the second
  cell is taken, and the message names where to look: "no room above that cell" standing up, "no
  room beside that cell" lying down. Which cells have to be free is not known until the orientation
  is, so the ghost resolves the orientation first and the click that follows resolves the same one
  rather than reading it back off a ghost that may have been refused.
- **Turning a terminal can refuse a cell that was fine a moment ago**, and `R` shows it: the preview
  disappears at the heading with no room and comes back at the next one.
- **The far port opens two cells along.** Horizontal ports used to leave the placed cell, because
  the body never lay in their way. Now one of them does lie in their way, so each port leaves from
  the end of the body it belongs to — the rule ADR-0021 already applied vertically, applied to every
  axis.

## What this costs

**A design saved before this change may no longer open** if it holds a terminal turned sideways with
something connected to its far port. That tube now stands in the terminal's own second foot, which
is a state the app cannot represent, so `deserializeDesign` reports it like any other overlap and the
visitor is told their previous design could not be reopened.

This is the same cost ADR-0021 accepted a day earlier, for the same reason: reporting beats
repairing, and handing someone a design that is quietly not the one they built is worse than
declining to reopen it. The schema version is untouched — the payload *format* did not change.

**Auto-Build routes from a sideways terminal are a foot shorter at that end**, the tube having been
taken over by the terminal's own second foot. Bend counts, plenum bands and warnings are unchanged.

## The drawing

`buildTerminalMesh` still builds the unit upright — barrel, collars, door, wordmark, send button —
and then lays the whole group onto the body direction, mapping its local "up" onto the axis and
keeping the door's face horizontal. The door therefore ends up across the run rather than into the
floor, which is where it belongs: a carrier is loaded from the front while the tube leaves the end.
Both port fittings are built at the two ends of the barrel, so they land where `terminalPortAnchor`
says the ports leave from whichever way the unit is turned.

## What this is not

Nothing here changes the part itself. It is still 1 ft square and 2 ft long, still the same
approximate model taken from the Kel2020 media (ADR-0026), and still bears the placeholder name and
number every part in the app has until Kelly Tube Systems supplies the real ones.
