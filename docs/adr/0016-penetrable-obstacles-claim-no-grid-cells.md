# ADR-0016: Penetrable obstacles claim no grid cells

- **Status:** Accepted
- **Date:** 2026-08-17

Obstacles come in two kinds. The impenetrable kind is what obstacles have always been: it claims
grid cells, so placement refuses to build inside it and Auto-Build routes around it. The penetrable
kind — a wall with penetrations, a soft ceiling — is a volume tubes may pass through, chosen per
obstacle in the viewport when the obstacle tool is armed and stored as an optional `penetrable`
flag (absent means impenetrable; parsing is forgiving and the schema stays at version 1).

A penetrable obstacle never claims a grid cell. The `SparseGrid` is the single collision structure
that placement and routing consult, and staying out of it is what being penetrable *means* — a
"penetrable except" list threaded through every occupancy check would reintroduce the split-brain
bug `reconstructDesign` exists to prevent. The consequences are accepted deliberately:

- The parts-agree-with-grid invariant becomes kind-aware: an impenetrable obstacle's cells must be
  spoken for, a penetrable obstacle's cells must *not* be attributed to it.
  `expectGridMatchesDesign` asserts both directions.
- Erase finds penetrable obstacles by AABB containment rather than grid lookup. On a cell a part
  shares with one, the grid occupant — the part — wins; the obstacle is erased from any of its
  cells nothing else holds. `eraseObstacle` only removes cells the obstacle actually owns.
- Validation's obstacle-intersection rule considers only impenetrable obstacles: passing through a
  penetrable one is its purpose, not a fault.

Both kinds render with the same geometry, edges, and diagonal hatching on every face; color alone
tells them apart — red for a volume routing must avoid, steel blue for one it may pass through.
