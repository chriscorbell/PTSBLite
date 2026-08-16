# ADR-0012: PTSBuilderLite persists a session, not files

- **Status:** Accepted
- **Date:** 2026-08-03

## Context

PTSBuilderLite's visitors are exploring the product in a browser. They have no reason to manage a
design file, but they do expect closing the tab and returning later not to lose their work.

What they do have a reason to expect is that closing the tab and coming back later does not lose
their work.

## Decision

**One design, autosaved to `localStorage`, offered back on return.**

The value stored under `ptsbuilder-lite:autosave:v1` is exactly what `serializeDesign` produces.
No wrapper, no second version number: a timestamp and an
independent autosave format version would both be things to maintain with no use the UI has asked
for.

Written on an 800ms debounce after any change, and again on `visibilitychange` → hidden and on
`pagehide`. `visibilitychange` is the reliable signal and also covers a tab switch; `pagehide`
covers navigation and the back/forward cache. Neither survives a crash, which is what the debounce
is for.

**What is worth keeping is not "has parts".** A visitor who sizes the build area and names the
system before placing anything has done real work. What is excluded is the untouched design every
visit starts from — see `isWorthKeeping` in `src/domain/session-autosave.ts`.

**Restoring goes through `deserializeDesign`.** It validates the schema version and every occupant,
then rebuilds the grid through `reconstructDesign`, so the parts/obstacles/grid invariant holds by
construction and a design whose geometry no longer rebuilds is refused rather than half-loaded. No
second validator exists.

**An unreadable payload is set aside, not deleted.** An unsupported schema means a rollback or a
missed migration, and a later deployment may manage what this one could not. It moves to
`ptsbuilder-lite:autosave:unreadable`, which a second failure will not overwrite. The visitor is
told "Your previous design could not be reopened" and nothing else; schema versions and parse
errors go to `console.warn`.

**`beforeunload` is registered only while a write has failed.** Normally there is nothing unsaved
and the browser's unstyleable prompt is pure friction. Once storage has refused there is genuinely
something to lose, and that prompt is all a browser offers.

## Consequences

There is no Save, Save As or Open in PTSBuilderLite, and no unsaved-work marker — the design is
never not saved.

**A design lives in one browser profile on one machine.** Clearing site data loses it. A different
browser, a different machine, or private browsing sees nothing. This is a real product limitation
and is recorded in `docs/baked-in-assumptions.md`.

**`localStorage` is scoped to the origin.** Moving PTSBuilderLite to a different hostname — from
`*.pages.dev` to a custom domain, say — makes every stored design unreachable. Choose the hostname
before telling anyone about the tool.

**One slot means two tabs overwrite each other.** Last write wins. Documented rather than
coordinated against, because multi-tab work has not been asked for.

**A future schema change must handle autosave before it deploys.** `CURRENT_SCHEMA_VERSION` moving will
make every stored session unreadable until `deserializeDesign` can migrate it. The backup key is
what makes that recoverable rather than final.
