# ADR-0002: The two-terminal limit is a v1 scope fence, not an invariant

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

`checkTerminalCount` rejects any design that does not have exactly two terminals, and
`checkBlowerTerminalAdjacency` requires one of them to be seated against the blower outlet. Together
these mean PTSBuilderLite can only model single-direction, point-to-point systems.

Real PTS installations frequently have many stations connected through diverters. So the question was
whether this pair of rules describes the hardware or describes the product's current ambition.

They sit in the same file as the genuinely spec-derived constraints of ADR-0001, which made them look
equally permanent.

## Decision

The **exactly-two-terminals** limit is a **v1 product scope fence**. Multi-station support is
expected; its shape is not yet designed.

The blower/Terminal-1 **adjacency** requirement is separate and *is* spec-derived (ADR-0001) — it
constrains how a blower meets its terminal, whatever the eventual station count.

## Consequences

- The rule stays a validation warning only. **No code outside `validation.ts` may assume a design has
  exactly two terminals**, or that there is a single run, or that there is one "far end".
- It is **not** enforced at the storage boundary. Geometric validation on restore checks footprints
  for bounds and overlap; it must not reject a stored design on topology or station count.
- The serialized format needs to tolerate growth. `deserializeDesign` currently hard-rejects any
  `schemaVersion !== "1"`, which is fine for forward-incompatible changes but means there is no
  migration path — worth designing before the station model changes.
- Vocabulary: prefer "run" and "station" over "the terminal pair" in new code and copy, so the naming
  does not have to be unpicked later. `Terminal 1` / `Terminal 2` remain valid for the v1 topology.
- Reopen this ADR when the multi-station model is designed; it will likely be superseded rather than
  amended.
