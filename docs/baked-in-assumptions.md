# Baked-in assumptions

What the current model can and cannot express, so an incoming requirement can be sized in an
afternoon rather than a week.

This records the scope of each assumption, not a roadmap. Nothing here is a commitment to change, and
several entries are deliberate and correct.

**Entries are classified, because the categories cost wildly different amounts.** A workflow
limitation is usually days; a schema limitation reaches the serialized format, the grid, the renderer and
the router at once.

| Category | Meaning |
|---|---|
| **Schema** | The data model genuinely cannot represent it. Changing it touches the serialized format and everything downstream |
| **Workflow** | The state could hold it; the UI and validation assume otherwise |
| **Provisional** | A deliberate v1 fence, already documented, expected to be revisited |
| **Absent** | Simply not built |

---

## Schema

**1 cell = 1 ft, integer coordinates.** `Vec3` is a integer triple throughout, and `SparseGrid` keys
on it. Sub-foot placement, metric units, or a different resolution would change every geometry
module, the serialized format, and the renderer's cell-to-world mapping. *Authoritative per
[ADR-0001](adr/0001-engineering-constraints-are-authoritative.md) — this is a spec fact, not a
convenience.*

**Axis-aligned routing only.** Ports face one of six directions; the pathfinder expands along axes.
Diagonal or free-angle runs are not expressible.

**One bend geometry: 90°, 3 ft radius.** A second radius or a 45° bend needs new catalog entries and
new footprint generation. See [ADR-0005](adr/0005-defer-the-bend-geometry-model.md).

**One build area per design.** A single width × depth × height box centred on the origin, rising
from Y = 0. A two-floor design doubles the height of that box and draws a separator slab
([ADR-0015](adr/0015-two-floor-volume-is-derived-not-stored.md)); it is still one box — no rooms,
zones, non-rectangular sites, or per-floor footprints, and no third floor.

**One design per browser profile.** A single design
autosaves to `localStorage` and is offered back on return
([ADR-0012](adr/0012-lite-persists-a-session-not-files.md)). It lives in one browser on one machine
— clearing site data loses it, and a different browser sees nothing. Storage is scoped to the
origin, so moving to a custom domain makes every stored design unreachable. Two tabs overwrite each
other, last write wins.

---

## Workflow

**One blower, exactly two terminals.** `DesignState.parts` will hold any number of each — this is
enforced by `validation.ts` and assumed by the placement rules, not by the schema. Relaxing the
count is materially cheaper than it looks. *See Provisional below for the two-terminal fence.*

**Single-direction system.** Assumed by how the topology is walked, not by the data.

**Terminal 1 must sit flush against the blower outlet**, zero tubing between. *Authoritative per
ADR-0001 — a spec requirement, not a workflow convenience.*

**Nothing below Y = 0.** The ground plane is the floor. Basements or below-grade runs would need the
build area to describe a Y origin rather than assuming zero.

**A design's setup answers are fixed once it is created.** The build area, and the multi-floor and
plenum answers, are collected on the welcome screen and cannot be changed afterwards — there is no
settings screen, and the system name and revision are no longer editable either. Changing one means
starting a new design. `DesignMetadata` would hold an edit fine; what was deliberately removed is
the UI and the resize path that dropped parts no longer fitting a shrunken area.

---

## Provisional

**The exactly-two-terminals rule** is a v1 product fence, not a physical truth —
[ADR-0002](adr/0002-two-terminal-limit-is-a-v1-fence.md) says so explicitly. This is the single
largest determinant of how much routing and validation work the client's requirements imply, and
worth asking about early.

---

## Published catalog

**Part numbers and names** in `src/data/parts.json` are invented and will be replaced when the real
catalog arrives. The `partNo` values in particular look authoritative and are not. **They are now
published**: PTSBuilderLite prints them into a BOM PDF that any member of the public can download
and keep. That is a deliberate decision, recorded in
[ADR-0013](adr/0013-lite-publishes-placeholder-part-numbers.md), and it is the one place invented
data reaches a customer-facing artifact on purpose. Issue #94.

**Prices do not exist in this product.** The catalog cannot carry one: `loadPartRegistry` rejects
`unitPrice`, and the BOM model has no price field
([ADR-0011](adr/0011-lite-has-no-commercial-data-path.md)). A requirement that adds money changes
the product's scope and needs an explicit new decision.

**The stock-tube purchasing rule is an open question**, not a decision. `bomRows` currently uses
`ceil(total tube feet / 6)`, which assumes offcuts are not reused. See issue #48.

---

## Absent

**Selection and move.** The `cursor` tool is inert: it selects nothing and does nothing on click.
The only way to change a placed part is to erase it and place another. **This is the gap most likely
to appear in the client's requirements**, and it is substantial — it implies a selection model,
hit-testing beyond the current erase path, move/rotate operations that maintain the grid invariant,
and probably multi-select.

**Copy, duplicate, array, mirror.** No bulk operations of any kind.

**Part labels, camera buttons, and an About screen.** All three existed and were removed. The
camera is still driven by dragging and the scroll wheel; there are no zoom or reset-view buttons.
Nothing on screen names the running build, so `appVersion` on a stored design is the only way to
identify it.

**Plenum behavior.** The welcome screen asks whether the space has a plenum (drop ceiling, with an
approximate height in feet) and stores the answer in the design's metadata, but nothing reads it
yet: placement and validation ignore the plenum. The second-floor answer, by contrast, is now
implemented — it doubles the buildable volume and draws the separator slab
([ADR-0015](adr/0015-two-floor-volume-is-derived-not-stored.md)).

**Any collaboration, cloud, account, or telemetry surface.** Deliberately. PTSBuilderLite is
served as static files with a `connect-src 'none'` policy: nothing it does reaches the network
after load, so there is also no error reporting from production.

**A styled "you have unsaved work" prompt in the browser.** A browser offers only `beforeunload`,
whose message cannot be written or styled. Lite registers it solely while a write to storage has
failed, because autosave means there is otherwise nothing to lose.

---

## How to use this when requirements arrive

A requirement that only touches **Workflow** or **Absent** is ordinary feature work. One that
touches **Schema** needs a design pass and probably a serialized-format version bump. One that contradicts
an **Authoritative** constant (marked above and in `CONTEXT.md`) needs a cited source before
anything is written — that is what ADR-0001 exists to prevent.

When a requirement overturns an entry here, it produces a new ADR *and* an update to this file and
`CONTEXT.md` in the same commit, so the three cannot drift apart.
