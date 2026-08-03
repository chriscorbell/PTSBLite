# Deploying PTSBuilderLite

**This covers PTSBuilderLite only** — the public web app. PTSBuilder, the Electron desktop app, is
not deployed from here and its artifact builds are currently paused; see
[ADR-0010](adr/0010-one-codebase-two-products.md) and the header of `.github/workflows/release.yml`.

PTSBuilderLite is a static site. It has no backend, makes no network request after load, and stores
nothing outside the visitor's own browser.

## Cloudflare Pages project

Created through **Workers & Pages → Create → Pages → Connect to Git**. Not the Workers flow, which
the dashboard offers first and which needs a `wrangler.jsonc` this repository does not have.

| Setting | Value |
|---|---|
| Project name | `ptsblite` |
| Production branch | `main` |
| Framework preset | None |
| Build command | `pnpm run build:lite` |
| Build output directory | `dist-lite` |
| Root directory | *(empty)* |

Environment variables, set for both Production and Preview:

```
NODE_VERSION = 24
PNPM_VERSION = 11.5.0
```

**`NODE_VERSION` is not optional.** Cloudflare's default build image ships an older Node than the
`>=24` in `package.json`'s `engines`, and `pnpm install` refuses outright rather than warning. It is
a confusing failure because nothing in the log points at the version.

## Who can see what

Production is public, from `main`. Every push that passes the required `verify` check is live.

Preview deployments are **restricted** — they build for pull requests but are not publicly
reachable. That was a deliberate choice: previews are useful, since nobody had seen this UI in a
browser before it shipped, but a branch that has not been reviewed should not have a public URL.

## What the build does

`pnpm run build:lite` runs `tsc --noEmit && vite build`, so a type error fails the deploy before
anything is published.

It also runs the check from [ADR-0011](adr/0011-lite-has-no-commercial-data-path.md): if any module
under `commercial/` or `platform/electron` reaches the bundle, the build fails and names it. That
check runs on Cloudflare's builder exactly as it does locally, so it gates what is published and not
only what is merged.

`web-public/_headers` is copied into the output. It carries the Content-Security-Policy and the
cache rules, and explains itself — including why `connect-src 'none'` is a statement of fact rather
than an aspiration.

## Before changing the hostname

**Pick the final hostname before telling anyone about the tool.**

A visitor's design autosaves to `localStorage`, which is scoped to the origin
([ADR-0012](adr/0012-lite-persists-a-session-not-files.md)). Moving from `*.pages.dev` to a custom
domain, or renaming the project, makes every stored design unreachable — silently, because the new
origin simply has nothing in it. There is no migration path and there is nothing to warn with.

## What the deployed build calls itself

Not `package.json`'s version. That only moves when a desktop release tag is cut, and those are
paused, so it would name a build from weeks ago. The About modal shows the short commit SHA instead,
taken from `CF_PAGES_COMMIT_SHA` on Cloudflare and from `git rev-parse` locally. The reasoning is in
`vite.config.ts`.

## Running the same build locally

```sh
pnpm run build:lite     # into dist-lite/
pnpm run preview:lite   # serve it on http://localhost:4173
```

`preview:lite` serves the built output, not the dev server, so it is the closest thing to what
Cloudflare publishes. It does **not** apply `_headers` — the CSP is only enforced once Cloudflare is
serving it, so a policy violation will not show up locally.
