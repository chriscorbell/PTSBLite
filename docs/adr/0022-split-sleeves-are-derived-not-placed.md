# ADR-0022: Split sleeves are derived, not placed

- **Status:** Accepted
- **Date:** 2026-08-30

The client asked for couplings — split sleeves — to be "both" a visual indicator of where two
pieces join and a part in the BOM, and was explicit that they are not something the user places.
He gave the rule as "1 between blower/terminal, 1 immediately after (or before) terminal, then
every 6 feet. 1 on each end of a bend", one hard constraint — "it just has to show no more than
6 ft between couplings" — and licence to reach it any simpler way: "If there's an easier way to
handle it, by all means."

A sleeve is therefore the first thing in the model that is **counted but not stored**. `Part` has
no `"sleeve"` variant, `DesignState.parts` never holds one, and nothing is written to the saved
design. `splitSleeves(parts)` computes them on demand, the way `computeTopology` computes the
port graph.

**Why not a part.** Every alternative makes the design lie. Sleeves placed by hand would let a
system be exported with the joints missing, or with a sleeve on a run that no longer exists.
Sleeves inserted automatically into `parts` would have to be found and rewritten on every edit —
each placement, each erase, each Auto-Build — and the grid would have to hold occupants that
occupy no cell. Serializing them would freeze today's spacing rule into every saved design, so a
correction to the rule would leave old designs wrong. Deriving them means a sleeve cannot disagree
with the run it sits on, because there is nothing for it to disagree with.

**Two rules, not four.** The client listed four cases; they are all one:

1. **A sleeve at every joint** — wherever two ports are mated, on the cell face between them. That
   covers blower-to-terminal, terminal-to-first-tube, and each end of a bend, with none of them
   named in the code.
2. **A sleeve every 6 ft inside a tube** — stock is 6 ft, so a longer straight is several lengths
   sleeved together.

These give the 6 ft guarantee outright rather than by inspection: inside a tube the gap is 6 ft by
construction, and a bend is 5.71 ft end to end (0.5 + 4.71 + 0.5), so no two neighbouring sleeves
on a connected run can be further apart. `split-sleeve.test.ts` asserts it.

**An open end gets nothing.** A sleeve joins two pieces, so only mated ports get one. A valid
system has a blower at each end (ADR-0019) with everything between them joined, so every case the
client named is covered; a half-built design shows sleeves appearing as the run is connected, which
is the honest reading.

Consequences worth knowing:

- **The remainder falls at the far end.** Seven feet of tube is sleeved at 0, 6 and 7 ft. The
  client called this out himself and accepted it: "one end look normal and the other end just has
  two couplings 1 grid unit (foot) apart. This wouldn't happen in real life but I knew this
  question might come up."
- **They are not click targets.** The viewport draws them in a group of their own, outside the one
  the erase tool raycasts against, so clicking a sleeve erases the tube underneath it. There is no
  way to select or delete a sleeve, because there is no sleeve to delete.
- **They cost nothing but themselves.** A sleeve wraps a joint, so it adds no centerline, no tube
  footage, and nothing against the 300 ft cap. It is one BOM row and one row only.
- **`splitSleeve` is a placeholder part number** like every other (ADR-0013). Kelly Tube Systems'
  own site sells them as "Bolted Couplings with Hardware"; the app calls them split sleeves because
  the client asked for that name. The real name and number are still outstanding.
