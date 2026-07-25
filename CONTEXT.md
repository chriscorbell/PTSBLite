# PTSBuilder — Domain Context

PTSBuilder is a desktop 3D builder for **pneumatic tube systems (PTS)**: an installer lays out a
system in a 3D grid, the app validates it against the system's engineering rules, and it produces a
bill of materials and a customer-facing quote PDF.

Audience: PTS installers and distributors. It is an early-stage product, not a demo — the numbers it
prints are intended to end up in front of a paying customer.

## Authoritative vs. placeholder data

The single most important distinction in this codebase, because the two look alike in source:

| Kind | Where | Status |
|---|---|---|
| Engineering constraints | `src/domain/validation.ts`, bend geometry, tube stock length | **Authoritative.** Derived from the real PTS system spec. Do not loosen, round, or "simplify" without a cited source. See ADR-0001. |
| Catalog prices | `unitPrice` in `src/data/parts.json` | **Placeholder.** Invented, plausible-looking numbers. Never treat as reference data, never show to an end user as real. See ADR-0003. |
| Part numbers / names | `partNo`, `name` in `src/data/parts.json` | **Placeholder.** Will be replaced as the catalog grows. |
| Product scope limits | the exactly-2-terminals rule | **Provisional.** A v1 fence, not a physical truth. See ADR-0002. |

## Glossary

Use these terms in issues, commits, tests, and UI copy. Where an avoided synonym is listed, don't
drift to it.

**Design** — one complete system layout: its parts, obstacles, metadata, and derived grid. The unit
that gets saved to a file, validated, and quoted. Modelled by `DesignState`.
*Avoid:* "document", "model", "drawing".

**Part** — any physical catalog item placed in a design: a blower, terminal, tube, or bend.
Obstacles are **not** parts. Modelled by `Part`.
*Avoid:* "component", "element", "piece".

**Blower** — the unit that drives air through the system. Has exactly one **port**, facing `dir`.

**Terminal** — a send/receive station. Has exactly two ports, on the `axis` and its negation.
- **Terminal 1** — the terminal seated directly against the blower outlet, with zero tubing between
  them. Spec-required adjacency; see ADR-0001.
- **Terminal 2** — the terminal at the far end of the run.

**Tube** — a straight run. Stocked in 6 ft lengths; shorter runs are cut on site.

**Bend** — a 90°, 3 ft radius turn. Occupies a 7-cell staircase footprint within a 4×4 bounding box
(not the 5 cells the catalog currently claims — see issue #26). Contributes 4.71 ft of centerline.

**Obstacle** — a rectangular volume the routing must avoid. Costs nothing, appears in no BOM, and
occupies grid cells so nothing can be placed inside it.
*Avoid:* "volume" alone, "blocker", "keep-out" (all appear informally; "obstacle" is the term).

**Cell** — one grid position. **1 cell = 1 ft** on every axis. Cell coordinates are integers;
`cellCenter` offsets by 0.5 for rendering and for the endpoints stored on tubes and bends.

**Build area** — the buildable volume of a design, in feet: `width` (X) × `depth` (Z) footprint
centered on the origin, rising `height` (Y) from the ground plane. Per-design and user-configurable.

**Ground plane** — `Y = 0`. Nothing may occupy a cell below it.

**Centerline** — total path length through the system, in feet: straight tube lengths plus bend arc
lengths. The quantity capped at 300 ft.

**Port** — a connection point on a part: a cell it would connect *into*, plus the direction it
faces. **Open port** — a port not currently mated to another part's port. Open ports are what the
tube/bend tools snap to and what auto-build routes between.

**Topology** — the derived graph of every part's ports and which of them are mated. Recomputed from
the parts list; not stored.

**Landing cell** — a cell highlighted in the viewport as a legal placement target for the active
tool. Derived from open ports.

**Ghost** — the translucent preview of the part that would be placed at the hovered cell.

**Auto-build** — the routing pass that connects open port pairs automatically, optimising for either
shortest path or fewest bends.

**BOM** — bill of materials: catalog rows with quantities derived from the design. **Stock tube** is
the count of 6 ft sections to purchase (`ceil(total tube feet / 6)`), distinct from the tube *parts*
placed in the design.

**Elevation** — the Y level of the active placement plane, moved with `[` / `]`.

**Free placement** — placement that does not require snapping to an open port (blower, and
Terminal 2). Contrast with tube/bend/Terminal 1, which must land on a port.

## Architecture

Four layers, deliberately separated:

- `src/domain/` — pure logic: geometry, placement rules, topology, routing, validation, pricing,
  file format. No React, no Three.js. This is where the tests live (194 of them).
- `src/renderer/` — the Three.js viewport. Pure math is extracted into testable helpers; the
  imperative scene-building lives in effects.
- `src/components/` — React UI.
- `electron/` — main process and preload bridge.

`DesignState` carries a `SparseGrid` of cell occupancy alongside the parts list. **These two must
agree.** Code that adds or removes parts must keep the grid in lockstep; a mismatch produces parts
that render and get priced but cannot be erased or collided with (issue #11).
