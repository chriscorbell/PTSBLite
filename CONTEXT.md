# PTSBuilder — Domain Context

A 3D builder for **pneumatic tube systems (PTS)**: lay a system out in a 3D grid, have it validated
against the system's engineering rules, and get a bill of materials out.

## Two products

They share this domain, the file format, the renderer and most of the UI. What differs is
commercial, and the host each runs inside. See
[ADR-0010](docs/adr/0010-one-codebase-two-products.md).

**PTSBuilderLite** — public, free, in a desktop browser. Prospects use it themselves. It shows
**no prices, costs or dollar amounts of any kind**, exports a bill of materials rather than a
quote, and autosaves one design to the browser rather than saving files. This is what ships today.

**PTSBuilder** — the full internal product, an Electron desktop app for installers and
distributors, with the quote and the installer's own pricing. The numbers it prints are intended to
end up in front of a paying customer. Its artifact builds are paused while Lite is the focus; the
code stays compiled by CI.

When something below says "the app" without qualifying, it is true of both.

## Authoritative vs. placeholder data

The single most important distinction in this codebase, because the two look alike in source:

| Kind | Where | Status |
|---|---|---|
| Engineering constraints | `src/domain/validation.ts`, bend geometry, tube stock length | **Authoritative.** Derived from the real PTS system spec. Do not loosen, round, or "simplify" without a cited source. See ADR-0001. |
| Prices and tax rate | `pricing` and `taxRate` in the user's `settings.json` | **Installer-entered.** The catalog ships no prices and the app no default tax rate; a quote cannot be exported until both are set. See ADR-0003. |
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

- `src/domain/` — pure logic: geometry, placement rules, topology, routing, validation, the file
  format, the autosaved session. No React, no Three.js. This is where most of the tests live.
- `src/renderer/` — the Three.js viewport, split by responsibility: `design-meshes` for the parts,
  `scene-affordances` for ground, highlights, ports and labels, `interaction` for pure pointer maths,
  `three-utils` for the palette and GPU disposal, and `Viewport.tsx` for the React lifecycle.
- `src/components/` — React UI. Each component's styling sits in a colocated `.css` file beside it;
  see ADR-0009 for the rule and the few runtime-value exceptions.
- `src/platform/` — what differs about the host the app runs inside: files or an autosaved session,
  a settings store or none, an updater or none. `Platform` in `types.ts` is the contract, and its
  capability table is the quickest way to see what each host can do.
- `src/products/` — one composition root per product. It supplies `App` with the surfaces that
  differ; `App` itself holds only the editor.
- `electron/` — main process and preload bridge.
- `shared/` — the IPC contract: channel names and payload types both processes import.

A `commercial/` subdirectory inside `domain/` and `components/` holds everything to do with money —
pricing, quote readiness, the quote PDF, the quote preview and the pricing settings panes. It is a
subdirectory rather than a sixth layer precisely because the layers separate by kind: pricing is
pure logic and the quote preview is React, so they belong in the layers they already belonged in.
**Nothing PTSBuilderLite imports may reach it**, and the Lite build fails if anything does
([ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md)).

`DesignState` carries a `SparseGrid` of cell occupancy alongside its parts and obstacles. **These
must agree.** A part present in one but not the other renders and gets priced yet cannot be erased or
collided with.

This is enforced rather than remembered. `reconstructDesign` is the single checked path that rebuilds
all three together, and `expectGridMatchesDesign` asserts the invariant across the placement and
erase suites. The two kinds of occupant are deliberately treated differently — parts are strict,
obstacles are lenient — for the reasons in ADR-0007.
