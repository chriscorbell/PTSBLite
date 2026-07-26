# Baked-in assumptions

What the current model can and cannot express, so an incoming requirement can be sized in an
afternoon rather than a week.

This is a map of the blast radius, not a roadmap. Nothing here is a commitment to change, and
several entries are deliberate and correct.

**Entries are classified, because the categories cost wildly different amounts.** A workflow
limitation is usually days; a schema limitation reaches the file format, the grid, the renderer and
the router at once.

| Category | Meaning |
|---|---|
| **Schema** | The data model genuinely cannot represent it. Changing it touches the file format and everything downstream |
| **Workflow** | The state could hold it; the UI and validation assume otherwise |
| **Provisional** | A deliberate v1 fence, already documented, expected to be revisited |
| **Commercial** | Placeholder or installer-supplied data, never authoritative |
| **Absent** | Simply not built |

---

## Schema

**1 cell = 1 ft, integer coordinates.** `Vec3` is a integer triple throughout, and `SparseGrid` keys
on it. Sub-foot placement, metric units, or a different resolution would change every geometry
module, the file format, and the renderer's cell-to-world mapping. *Authoritative per
[ADR-0001](adr/0001-engineering-constraints-are-authoritative.md) — this is a spec fact, not a
convenience.*

**Axis-aligned routing only.** Ports face one of six directions; the pathfinder expands along axes.
Diagonal or free-angle runs are not expressible.

**One bend geometry: 90°, 3 ft radius.** A second radius or a 45° bend needs new catalog entries and
new footprint generation. See [ADR-0005](adr/0005-defer-the-bend-geometry-model.md).

**One build area per design.** A single width × depth × height box centred on the origin, rising
from Y = 0. No rooms, floors, zones, or non-rectangular sites.

**Flat per-part pricing.** A quote is quantity × unit price, plus one tax rate. No quantity breaks,
labour lines, discounts, freight, or arbitrary line items.

**One design per file, one file per window.** No project containers, no multi-document.

---

## Workflow

**One blower, exactly two terminals.** `DesignState.parts` will hold any number of each — this is
enforced by `validation.ts` and assumed by the placement rules, not by the schema. Relaxing the
count is materially cheaper than it looks. *See Provisional below for the two-terminal fence.*

**Single-direction system.** Assumed by the quote's default wording and by how the topology is
walked, not by the data.

**Terminal 1 must sit flush against the blower outlet**, zero tubing between. *Authoritative per
ADR-0001 — a spec requirement, not a workflow convenience.*

**Nothing below Y = 0.** The ground plane is the floor. Basements or below-grade runs would need the
build area to describe a Y origin rather than assuming zero.

---

## Provisional

**The exactly-two-terminals rule** is a v1 product fence, not a physical truth —
[ADR-0002](adr/0002-two-terminal-limit-is-a-v1-fence.md) says so explicitly. This is the single
largest determinant of how much routing and validation work the client's requirements imply, and
worth asking about early.

**Unsigned Windows builds.** [ADR-0006](adr/0006-ship-unsigned-builds.md) — revisit if the software
is sold beyond one customer, or a customer's IT policy blocks unsigned executables. macOS is signed
and notarized.

---

## Commercial

**Part numbers and names** in `src/data/parts.json` are invented and will be replaced when the real
catalog arrives. The `partNo` values in particular look authoritative and are not.

**Prices and the tax rate ship empty** and are entered by the installer
([ADR-0003](adr/0003-quotes-require-installer-entered-pricing.md)). The catalog cannot carry a
price — `loadPartRegistry` rejects one.

**The stock-tube purchasing rule is an open question**, not a decision. `bomRows` currently uses
`ceil(total tube feet / 6)`, which assumes offcuts are not reused — and the default quote wording
disclaims exactly that. See [open questions](requirements/open-questions.md) and issue #48.

---

## Absent

**Selection and move.** The `cursor` tool is inert: it selects nothing and does nothing on click.
The only way to change a placed part is to erase it and place another. **This is the gap most likely
to appear in the client's requirements**, and it is substantial — it implies a selection model,
hit-testing beyond the current erase path, move/rotate operations that maintain the grid invariant,
and probably multi-select.

**Per-quote fields.** Customer name, quote number, project and notes are *global settings*, so
quoting a second customer means editing Settings first. Issue #54 — the first quote is necessarily
correct because export is gated, but the second one can carry the first one's name.

**Copy, duplicate, array, mirror.** No bulk operations of any kind.

**Any collaboration, cloud, account, or telemetry surface.** Deliberately.

---

## How to use this when requirements arrive

A requirement that only touches **Workflow** or **Absent** is ordinary feature work. One that
touches **Schema** needs a design pass and probably a file-format version bump. One that contradicts
an **Authoritative** constant (marked above and in `CONTEXT.md`) needs a cited source before
anything is written — that is what ADR-0001 exists to prevent.

When a requirement overturns an entry here, it produces a new ADR *and* an update to this file and
`CONTEXT.md` in the same commit, so the three cannot drift apart.
