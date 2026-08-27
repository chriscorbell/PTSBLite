# PTSBLite — Domain Context

A 3D builder for **pneumatic tube systems (PTS)**: lay a system out in a 3D grid, have it validated
against the system's engineering rules, and get a bill of materials out.

## Product

**PTSBLite** — the repository's only product; the [README](README.md) says what it is and
[ADR-0014](docs/adr/0014-ptsblite-is-the-only-product.md) why. It shows **no prices, costs
or dollar amounts of any kind** ([ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md)).

*Avoid:* "PTSBuilder", "PTSBuilderLite" (the pre-rename name), "full version", "desktop app".

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

**Obstacle** — a rectangular volume, in one of two kinds chosen when it is drawn. An
**impenetrable** obstacle is what routing must avoid: it occupies grid cells so nothing can be
placed inside it. A **penetrable** obstacle — a wall with penetrations, a soft ceiling — claims no
cells, so tubes pass through it (ADR-0016). Either kind costs nothing and appears in no BOM.
*Avoid:* "volume" alone, "blocker", "keep-out" (all appear informally; "obstacle" is the term).

**Cell** — one grid position. **1 cell = 1 ft** on every axis. Cell coordinates are integers;
`cellCenter` offsets by 0.5 for rendering and for the endpoints stored on tubes and bends.

**Build area** — the fixed volume every design exists in: 300 × 300 × 100 ft (`BUILD_AREA`),
centered on the origin, rising from the ground plane. Not configurable and not stored — what a
visitor sizes on the welcome screen is their **room** (ADR-0017). Parts may be placed anywhere in
the build area, inside the room or out.
*Avoid:* using "build area" for the typed dimensions — that is the room.

**Room** — the space a design is built in and around: per-floor `height` and a `width` × `depth`
footprint (the form labels `depth` **Length**; the code keeps `depth`), centered in the build area
(`roomRect`). Stored as `metadata.room`; `metadata.buildArea` is the pre-rename key, still read on
restore. It is the only thing that identifies one design from another — designs carry no name. Its floor draws brighter than the ground outside, and it is ringed by 1 ft **penetrable
walls** (`roomWalls`) rising its full height — faintly translucent slabs in the floor separator's
material, and, like penetrable obstacles, claiming no grid cells, so tubes pass through and
nothing collides (ADR-0016). Hatch stays the mark of a placed obstacle; the room's structure
carries none. `height` is
per-floor; a two-floor room is twice that plus the floor separator, derived by `roomHeightFeet` and
never stored (ADR-0015), and capped so both floors fit the build area (`clampRoom`). Set on the
welcome screen when the design is created, and fixed for its lifetime: there is no way to resize an
existing room.

**Floor separator** — the 1 ft structural slab between the floors of a two-floor room
(`FLOOR_SEPARATOR_FEET`), spanning the room's footprint. Drawn in the viewport, but it occupies no
grid cells: tubes pass through it to reach the second floor, so it deliberately does not collide
like an obstacle.

**Plenum** — the space between a floor's drop ceiling and its top, `plenumHeightFeet` tall,
occupying the top of each of the room's floors (directly under the separator slab on floor 1) and
spanning the room's footprint — outside the room there is no drop ceiling to be above. The declared
per-floor height includes it. Drawn as a tinted band via `plenumBands`, and fully buildable — it
restricts nothing. Auto-Build prefers carrying horizontal runs and bends inside it, and gives no
such credit outside the room.

**Ground plane** — `Y = 0`. Nothing may occupy a cell below it.

**Centerline** — total path length through the system, in feet: straight tube lengths plus bend arc
lengths. The quantity capped at 300 ft.

**Port** — a connection point on a part: a cell it would connect *into*, plus the direction it
faces. **Open port** — a port not currently mated to another part's port. Open ports are what the
tube/bend tools snap to and what Auto-Build routes between.

**Topology** — the derived graph of every part's ports and which of them are mated. Recomputed from
the parts list; not stored.

**Landing cell** — a cell highlighted in the viewport as a legal placement target for the active
tool. Derived from open ports.

**Ghost** — the translucent preview of the part that would be placed at the hovered cell.

**Auto-Build** — the routing pass that connects open port pairs automatically. One behavior, no
modes: shortest path with a per-bend penalty, plus a soft preference for carrying horizontal runs
and bends in the plenum when the design has one.

**BOM** — bill of materials: catalog rows with quantities derived from the design. **Stock tube** is
the count of 6 ft sections to purchase (`ceil(total tube feet / 6)`), distinct from the tube *parts*
placed in the design.

**Height marker** — a label reading a height in feet, drawn beside the thing it belongs to:
every placed part, each plenum's drop ceiling, and a two-floor room's slab, plus the height the
armed tool would place at (in the accent colour). Shown only while a placement tool is armed —
`heightMarkersVisible` — since that is when elevation is the question on screen. Sized in world
units so a marker shrinks with the part it labels, bounded at both ends by `heightMarkerScale`:
hidden once it would be too small to read, capped before it could cover the part. Replaced a
translucent plane that showed *where* the placement height was without saying what it was.

**Elevation** — the Y level of the active placement plane, moved with `[` / `]` and shown beside
the armed tool. In a
two-floor design, the floor selector (or `1` / `2`) jumps it to a floor's base.

**Free placement** — placement that does not require snapping to an open port (blower, and
Terminal 2). Contrast with tube/bend/Terminal 1, which must land on a port.

## Architecture

Layers separated by kind, not by subject:

- `src/domain/` — pure logic: geometry, placement rules, topology, routing, validation, design
  serialization, and the autosaved session. No React, no Three.js. This is where most tests live.
- `src/renderer/` — the Three.js viewport, split by responsibility: `design-meshes` for the parts,
  `scene-affordances` for ground, highlights and ports, `interaction` for pure pointer maths,
  `three-utils` for the palette and GPU disposal, and `Viewport.tsx` for the React lifecycle.
- `src/components/` — React UI. Each component's styling sits in a colocated `.css` file beside it;
  see ADR-0009 for the rule and the few runtime-value exceptions.
- `src/platform/` — browser services kept behind a testable boundary: session storage and PDF
  downloads.

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
