# ADR-0001: Engineering constraints are authoritative spec, not placeholders

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

`src/domain/validation.ts` and the geometry constants encode specific numbers: a 300 ft maximum
centerline, 6 ft tube stock, 90° bends at a 3 ft radius, 1 cell = 1 ft, and a requirement that
Terminal 1 sit flush against the blower outlet with zero tubing between them.

Read cold, these are indistinguishable from the invented names and part numbers in
`src/data/parts.json` — both are just literals in source. That ambiguity is dangerous in opposite
directions: someone could "clean up" a real spec constraint or trust placeholder catalog data.

## Decision

The engineering constraints are **derived from the real PTS system specification and are
authoritative**. They may not be loosened, rounded, re-derived, or removed without a cited source.

The catalog's names and part numbers are **placeholder** and carry no authority. See ADR-0013.

Where the two disagree, the spec wins. Concretely: `arcLength: 4.71` in the catalog currently drives
the derived bend radius of 3.0 ft — the 3 ft radius is the spec fact, and the catalog value exists to
express it, not the other way round.

## Consequences

- New validation rules are additive. Existing thresholds are not tuning knobs.
- The 300 ft cap has one home, `MAX_CENTERLINE_FEET`. User-facing copy must interpolate it rather
  than restating "300ft". Enforced as of #52; `StatusBar`, `FinalizeModal` and the warning strings in
  `validation.ts` all interpolate it, and the left rail's tool labels read part names and numbers from
  the registry rather than repeating them.
- Anything reading a spec-derived number from the catalog needs a validation guard, so a future
  catalog edit cannot silently contradict the spec. `loadPartRegistry` does this for the declared
  `cells` count, and separately refuses any entry carrying a `unitPrice` (ADR-0011).
- Deriving spec numbers afresh from geometry is forbidden even where it looks equivalent; the sampled
  arc approximation in `computeBendFootprints` is a rendering/occupancy detail, not a source of truth.

## Notes

The exactly-2-terminals rule also lives in `validation.ts` but is **not** covered by this ADR — it is
product scope, not a physical constraint. See ADR-0002.
