# ADR-0008: Bun was trialled as the package manager and reverted

- **Status:** Reverted
- **Date:** 2026-07-26
- **Reverted:** 2026-07-26, the same day

## Context

The project used pnpm 11. Bun is faster and would mean one tool instead of two on machines that
already have it, so it was migrated, verified end to end, and then reverted after weighing what the
change actually bought against what it cost.

This record is kept rather than deleted, because the migration itself was sound and the reasons not
to keep it are specific to this project. Anyone tempted to try again should read the ledger below
first rather than rediscover it.

## What the trial established

Most of the migration worked, and worked well:

- `bun install` migrated the pnpm lockfile unprompted; 448 packages in 1.8s.
- **electron-builder 26 supports Bun properly** — it ships a dedicated `bunNodeModulesCollector` and
  detects `bun.lock`. The packaged asar had the same 265 entries as the pnpm build, `electron-updater`
  included, and the packaged app launched with a clean renderer console.
- **Dependabot supports Bun.** `package-ecosystem: bun` was accepted and produced an update PR.
- `trustedDependencies` expresses what `pnpm-workspace.yaml`'s `allowBuilds` does.
- CI ran in 41s instead of 50s.

None of that is why it was reverted.

## Decision

**Stay on pnpm.** The trial is reverted.

Three things decided it, all specific to this project rather than to Bun:

**pnpm's `minimumReleaseAge` is worth more here than the speed is.** It refuses packages published
within the last few days, guarding against installing a compromised release in the window before
anyone notices. That is not hypothetical: it blocked a Dependabot PR the day before the migration.
This repository runs Dependabot weekly, will sit unattended for months awaiting client requirements,
and ships signed installers to a paying customer. Bun has no equivalent, and `bun audit` is not one —
it reports *known* advisories, which is a different and later thing. `pnpm audit signatures`, which
verifies registry signatures, has no Bun equivalent either.

**`bun test` is not `bun run test`.** Bun's own runner picks up the same files, ignores the Vitest
configuration, and reports failures that are not real — seven of them. The next phase of this project
is explicitly AI-assisted, and an agent typing `bun test` and believing the result is close to
inevitable. A permanent false-negative trap is a poor trade for nine seconds of CI.

**The speed bought almost nothing at this scale.** One developer, a 45-second pipeline, and an
install that runs a handful of times a week.

## Consequences

- `pnpm-lock.yaml`, `pnpm-workspace.yaml` and the pnpm workflows are restored.
- The one thing kept from the trial is the **js-yaml override**, which fixed a real shipped
  vulnerability. It moved from Bun's `overrides` in `package.json` to pnpm's `overrides` in
  `pnpm-workspace.yaml` — pnpm 11 no longer reads settings from `package.json` at all, and silently
  ignores a `pnpm.overrides` key there with only a warning. Worth knowing: the override *looked*
  applied and was not, until the resolved version was checked directly.
- `bun audit` deserves no credit for finding that vulnerability. `pnpm audit` finds it too. It was
  found because an audit was finally run, not because of the package manager.

## Notes

Reconsider if the shape of the project changes: a much larger dependency graph, a CI bill that makes
install time material, or a team where a single toolchain saves real onboarding friction. Bun's
support for this stack is genuinely good — the blocker is the supply-chain guard, not compatibility.
