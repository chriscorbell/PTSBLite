# ADR-0020: A pedestal is drawn but not counted

- **Status:** Accepted
- **Date:** 2026-08-30

The client asked for a fifth item in the Build drawer: a blower with a pedestal, which grows
straight tubing under it as it is raised off the floor with `[` and `]` — "elevate it 2 ft and 2 ft
of tube appears under it, meeting the floor". He was explicit that this tubing is **not part of the
system**: it must not appear in the BOM, and must not count toward the footage total or the 300 ft
centerline cap.

That makes the mast the first geometry in the model that is drawn but not counted, and the two
obvious representations are both wrong.

**Not an ordinary tube with a flag.** A `TubePart` carrying `pedestal: true` would put uncounted
feet inside the one collection every length, BOM and validation query already reads.
`totalPathLength`, `tubeFeet`, `bomRows` and `checkPathLength` would each have to remember to
exclude it, and the first one to forget would silently overstate a system against a cap that comes
from the real PTS specification (ADR-0001). A rule everything must remember is a rule something
will eventually forget.

**Not a separate part type either.** A pedestal blower *is* a blower: it drives the same air,
closes the same end of a system, holds the same single port, and counts toward the two a valid
system needs (ADR-0019). A `"blowerPedestal"` part type would fork every one of those checks for a
distinction that is about mounting hardware.

So the mast is a property of the blower: `BlowerPart.pedestalFeet`, the height in feet of the
column beneath it. Its consequences:

- **Nothing counts it, because nothing looks for it.** `partLength` returns 0 for a blower, as it
  always has, so the mast contributes to no centerline, no tube footage and no stock-tube count
  without a single exclusion being written anywhere.
- **Presence marks the variant, not truthiness.** Zero is a legal height — a pedestal blower
  standing on the floor — so `hasPedestal` tests for the field rather than for a non-zero value.
- **It is stored, not derived.** The height could be recomputed from the design's metadata, but
  storing it keeps `partCells` a pure function of the part, which is what reconstruction, erasing
  and the floor shadows rely on.
- **It still claims grid cells.** The mast is a physical column of tube; leaving it out of the grid
  would let Auto-Build route a run straight through it. So a pedestal blower is refused where the
  column beneath it is not clear, with a message naming the mast rather than the cell under the
  cursor, and erasing the blower — from any cell of its mast — gives every cell back.
- **It is its own catalog row.** `blowerPedestal` is a separate placeholder part number
  (ADR-0013), and the BOM counts the two kinds of blower separately. The mast within it is not a
  row at all.

The mast measures to the floor of the storey the blower stands on: the ground on floor 1, the slab
on floor 2. It does not step down onto an obstacle beneath it — a pedestal stands on the floor, and
that is why the pedestal tool is left out of `restOnObstacles`, which lets a plain blower or
terminal climb onto a shelf.
