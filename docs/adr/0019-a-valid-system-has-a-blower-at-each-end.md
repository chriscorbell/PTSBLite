# ADR-0019: A valid system has a blower at each end, and the blower may be remoted

- **Status:** Accepted
- **Date:** 2026-08-28
- **Supersedes:** the blower/Terminal-1 adjacency rule in [ADR-0001](0001-engineering-constraints-are-authoritative.md) and [ADR-0002](0002-two-terminal-limit-is-a-v1-fence.md)

## Context

Since the first validation pass, PTSBLite has held that a valid system is a blower, a terminal seated
flush against its outlet, tubing, and a second terminal. ADR-0001 classed that adjacency as
spec-derived and therefore unchangeable without a cited source; ADR-0002 reaffirmed it while
declaring the *station count* mere product scope.

That was wrong. The client corrected it directly, describing what a real installation looks like:

> In reality, a valid system is the following: a blower, possibility of tubing/bends between the
> blower and terminal (this is calling "remoting the blower"), tubing/bends are next, and then the
> 2nd terminal, possibility of tubing/bends, and a 2nd blower.
>
> So in the case, the "terminal immediately after the blower" is no longer true, and a system now
> requires a blower on both ends to be "valid".

— Nick Gray, Kelly Tube Systems, on the "UI Stuff" card, 2026-08-28.

This is the cited source ADR-0001 asks for. Kelly Tube Systems is the authority on what the hardware
does; the adjacency rule was our reading of the spec, not the spec.

## Decision

A valid system is, end to end:

    blower 1 → [tubing/bends] → terminal 1 → tubing/bends → terminal 2 → [tubing/bends] → blower 2

with the bracketed segments optional. Two consequences follow directly.

**Terminal 1 need not touch the blower.** Tubing and bends between a blower and its terminal are a
real configuration — the client calls it *remoting the blower*. Adjacency becomes one legal layout
among several, not a requirement.

**A system needs a blower at each end.** One blower is an incomplete system, not a complete one
missing a nicety. This is a change of kind: the old model had a single blower as the system's origin,
and the topology walk assumed it.

The two-terminal count is untouched and remains a v1 product fence (ADR-0002).

## Consequences

- `checkBlowerTerminalAdjacency` no longer describes a real constraint and its warning
  ("Blower not adjacent to Terminal 1") is wrong as written. **The code still enforces the old rule
  as of this ADR** — the documentation is corrected first so nothing keeps citing a superseded fact
  while the change is built.
- Blower count validation has to invert: the model currently treats more than one blower as suspect.
- `findTerminalOne` identifies Terminal 1 by adjacency to the blower. With adjacency optional, "which
  terminal is first" becomes a question about the walked topology rather than about position.
- Auto-Build pairs open ports on the assumption of one origin. A second blower is a second endpoint
  it must route to, not an obstacle.
- The BOM gains a second blower for every complete system.
- ADR-0001 stands for everything else it covers. What this ADR removes from it is one entry in its
  list of spec facts, not its principle — which worked exactly as intended here: the rule was flagged
  as authoritative, so it was questioned and sourced rather than quietly edited.

## Notes

The client's message also asks for a "blower with pedestal" build item, whose auto-placed tubing is
excluded from the BOM and footage totals. That interacts with this model but is a separate decision,
not yet made.
