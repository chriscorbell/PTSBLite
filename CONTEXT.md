# PTSBuilderLite — Domain Context

A 3D builder for **pneumatic tube systems (PTS)**: lay a system out in a 3D grid, have it validated
against the system's engineering rules, and get a bill of materials out.

## Product

**PTSBuilderLite** — the repository's only product; the [README](README.md) says what it is and
[ADR-0014](docs/adr/0014-ptsbuilderlite-is-the-only-product.md) why. It shows **no prices, costs
or dollar amounts of any kind** ([ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md)).

*Avoid:* "PTSBuilder", "full version", "desktop app".

## Authoritative vs. placeholder data

The single most important distinction in this codebase, because the two look alike in source:

| Kind | Where | Status |
|---|---|---|
| Engineering constraints | `src/domain/validation.ts`, bend geometry, tube stock length | **Authoritative.** Derived from the real PTS system spec. Do not loosen, round, or "simplify" without a cited source. See ADR-0001. |
| Part numbers / names | `partNo`, `name` in `src/data/parts.json` | **Placeholder.** Will be replaced as the catalog grows. |
| Product scope limits | the exactly-2-terminals rule | **Provisional.** A v1 fence, not a physical truth. See ADR-0002. |

## Glossary

Use these terms in issues, commits, tests, and UI copy. Where an avoided synonym is listed, don't
drift to it.

**Design** — one complete system layout: its parts, obstacles, metadata, and derived grid. The unit
that gets autosaved, validated, and summarized in a BOM. Modelled by `DesignState`.
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
Contributes 4.71 ft of centerline. `loadPartRegistry` checks the catalog's declared
`cells` against the footprint the geometry actually produces, so the two cannot drift.

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

Layers separated by kind, not by subject:

- `src/domain/` — pure logic: geometry, placement rules, topology, routing, validation, design
  serialization, and the autosaved session. No React, no Three.js. This is where most tests live.
- `src/renderer/` — the Three.js viewport, split by responsibility: `design-meshes` for the parts,
  `scene-affordances` for ground, highlights, ports and labels, `interaction` for pure pointer maths,
  `three-utils` for the palette and GPU disposal, and `Viewport.tsx` for the React lifecycle.
- `src/components/` — React UI. Each component's styling sits in a colocated `.css` file beside it;
  see ADR-0009 for the rule and the few runtime-value exceptions.
- `src/platform/` — browser services kept behind a testable boundary: session storage, PDF
  downloads, and safe external links.

The repository contains no pricing, quote, seller, customer, tax, or other commercial model.
`BomRow` cannot hold a price, the catalog loader rejects price data, and the application exports a
bill of materials rather than a quote
([ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md)).

`DesignState` carries a `SparseGrid` of cell occupancy alongside its parts and obstacles. **These
must agree.** A part present in one but not the other renders and appears in the BOM yet cannot be
erased or collided with.

This is enforced rather than remembered. `reconstructDesign` is the single checked path that rebuilds
all three together, and `expectGridMatchesDesign` asserts the invariant across the placement and
erase suites. The two kinds of occupant are deliberately treated differently — parts are strict,
obstacles are lenient — for the reasons in ADR-0007.
