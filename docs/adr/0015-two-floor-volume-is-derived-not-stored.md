# ADR-0015: The two-floor volume is derived, not stored

- **Status:** Accepted
- **Date:** 2026-08-16

A design whose metadata says `multiFloor` builds in a volume twice its stored height plus a 1 ft
structural slab between the floors: 30 ft per floor becomes 61 ft in all. That taller volume is
derived by `effectiveBuildArea` in `src/domain/floors.ts` wherever geometry needs it — grid bounds,
placement, elevation, the viewport — and is never written anywhere.

`metadata.buildArea.height` always holds the per-floor height the visitor typed at setup. Storing
the doubled height instead would have changed what the field means depending on `multiFloor`,
let the two heights disagree in a hand-edited or migrated payload, and collided with
`clampBuildArea`'s limits, which are per-floor limits. Deriving keeps the serialized format at
schema version 1 and makes disagreement inexpressible.

The separator slab is visual only. It is drawn in the viewport at the first floor's ceiling but
occupies no grid cells, because tubes must penetrate the floor to reach the storey above — it is
deliberately not an obstacle. The 1 ft thickness is `FLOOR_SEPARATOR_FEET`, client-specified, and
user-facing copy interpolates it rather than restating it (per ADR-0001's rule for engineering
constants).
