# ADR-0008: Bun replaces pnpm as the package manager, and nothing else

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

The project used pnpm 11 to install dependencies and run scripts. Bun is faster and would mean one
tool instead of two on a machine that already has it.

"Port to Bun" could mean four different things, and they are not equally possible:

| | Verdict |
|---|---|
| Package manager and script runner | Straightforward |
| Test runner (`bun test` for Vitest) | Possible, large, and not what pnpm was doing |
| Bundler (Bun's bundler for electron-vite) | No. electron-vite bundles three targets with the React plugin, CSP injection and build-time defines; Bun's bundler has no equivalent Electron integration |
| Runtime (Bun for Node) | **Impossible.** Electron ships and runs its own Node. Bun cannot be the runtime of an Electron app |

## Decision

**Bun replaces pnpm as the package manager and script runner. Nothing else changes.**

Vitest stays. It is not pnpm, so replacing it is not part of this, and it is doing work `bun test`
would have to be re-taught: two projects (a bare Node environment for the ~250 domain tests and
happy-dom for the UI ones), path aliases, and `define` for the build-time version constants. Bun runs
Vitest without complaint.

electron-vite stays, for the reasons in the table.

## Consequences

**What transferred cleanly.** electron-builder 26 ships a dedicated `bunNodeModulesCollector` and
detects `bun.lock`, so packaging is unaffected. `trustedDependencies` expresses what
`pnpm-workspace.yaml`'s `allowBuilds` did — electron and esbuild may run install scripts, and
electron-winstaller is absent rather than explicitly denied, which is the same refusal.
`--frozen-lockfile` exists. `bun install` migrated the pnpm lockfile by itself.

**What was lost, and it is not nothing.** pnpm 11 refuses packages published within a minimum release
age, as a guard against installing a compromised release in the hours before anyone notices. It is
not a hypothetical protection here: it blocked a Dependabot PR the day before this migration. Bun has
no equivalent. `bun audit` is not a substitute — it reports *known* advisories, which is a different
and later thing. The freshly-published-and-compromised window is now uncovered, so reviewing what a
Dependabot PR actually bumps matters more than it did.

**A new footgun.** `bun test` is not `bun run test`. Bun's own test runner picks up the same files,
ignores the Vitest configuration, and reports failures that are not real — 7 of them, at the time of
writing. Every entry point uses `bun run test`, and this is called out in `AGENTS.md` and the README,
because the failure mode is a confident false negative rather than an error.

## Notes

Revisit `bun test` if Bun grows a Vitest-compatible project/environment story, or if the test suite
is being reworked for other reasons. Doing it now would mean rewriting 299 tests across 28 files to
gain nothing the current runner does not already provide.
