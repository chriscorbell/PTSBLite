# ADR-0005: Defer the bend-geometry model; do not harden the single-bend assumption

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

Bend geometry is currently generated, not authored. `computeBendFootprints` derives a radius from the
catalog's `arcLength` (4.71 → 3.0 ft), then samples the quarter-turn arc at 48 points and floors them
into cells, producing a 7-cell staircase inside a 4×4 bounding box. Twenty-four orientations are
generated: four planar entries × (left, right, up, down), plus two vertical entries × four planar exits.

Everything downstream assumes there is exactly one bend type. `bendEntries()` in the pathfinder reads
`partRegistry.get("bend90")` directly. `catalogKey` in `topology.ts` maps every bend part to the
literal `"bend90"`. `labelTextForPart` does the same.

The catalog is expected to grow, but it is not yet known how far bend geometry has to flex — a second
radius is a contained change; 45° or 30° bends are not, because a 1-cell-per-foot grid cannot
represent them cleanly and the routing model itself would need rework.

## Decision

**Consciously defer the decision.** Do not design for variable bend geometry now, and do not harden
the single-bend assumption further either.

## Consequences

- No new code may hardcode `"bend90"`, a 3 ft radius, a 7-cell footprint, or a 90° turn. Where an
  existing call site already does, leave it — but do not add more, and do not build optimisations that
  depend on it (relevant to issue #13: caching topology is fine; caching *the* bend orientation table
  as a singleton is the kind of hardening this ADR forbids).
- Accept some duplication rather than extracting a premature abstraction over "bend types". A wrong
  abstraction here is more expensive than the duplication it would remove.
- The `arcLength` → radius derivation stays as-is. It is indirect, but it is the one place the
  catalog already parameterises geometry, so it is the natural seam if radius becomes variable.
- Reopen when the catalog's real bend range is known. If only the radius varies, parameterise
  `computeBendFootprints` and `bendEntries()`. If the angle varies, expect this to supersede into a
  routing-model ADR rather than a parameterisation.
- The catalog's `cells` field currently misstates the bend footprint as 5 (issue #26). Fixing it is in
  scope; trusting it to *drive* geometry is not, until this ADR is reopened.
