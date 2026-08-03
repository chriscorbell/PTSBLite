<div align="center">
    <img src="build/icon.png"
        title="PTSBuilder" alt="PTSBuilder logo" width="120" />
    <h1>PTSBuilder</h1>
    <p>
        A 3D builder for pneumatic tube systems: part placement, obstacle volumes,
        auto-routing, validation and BOM review.
    </p>
</div>

## Two products

One codebase, two build targets ([ADR-0010](docs/adr/0010-one-codebase-two-products.md)).

**PTSBuilderLite** is the public web app, and the one that ships today. It runs in a desktop
browser, autosaves a single design to that browser, and exports a bill of materials. It shows no
prices — not hidden, but absent: the code that knows what a price is cannot reach its bundle, and
the build fails if it does ([ADR-0011](docs/adr/0011-lite-has-no-commercial-data-path.md)).

**PTSBuilder** is the full internal desktop app, which adds the installer's pricing and the
customer-facing quote PDF. Its artifact builds are paused while Lite is the focus; CI keeps the
target compiling.

## Tech Stack

- Vite for the web build, deployed as static files to Cloudflare Pages
- Electron, electron-vite, and electron-builder for the desktop app shell and packaging
- React 19 and TypeScript for the UI
- Three.js for the 3D viewport
- Vitest for automated tests
- pnpm for package management

## Development

Requires **Node 24** and **pnpm 11** (see `engines` in `package.json`; CI and the Electron runtime
both track Node 24).

```sh
pnpm install
pnpm run dev:lite    # PTSBuilderLite in a browser — this is what ships
pnpm dev             # PTSBuilder, the Electron app
```

Quality gates, in the order CI runs them:

```sh
pnpm run format:check   # or `pnpm run format` to fix
pnpm run lint           # or `pnpm run lint:fix`
pnpm run typecheck
pnpm test
pnpm run check          # all four in one go
```

Building:

```sh
pnpm run build:lite     # typecheck + vite build, into dist-lite/
pnpm run preview:lite   # serve that build locally
pnpm run build          # typecheck + electron-vite build
```

Packaging the desktop app writes installers to `release/`. **These are not currently published** —
`release.yml` runs only on manual dispatch while PTSBuilderLite is the focus.

```sh
pnpm run package        # build + electron-builder
pnpm run package:dir    # unpacked directory, faster for smoke tests
```

`git blame` skips the bulk reformat listed in `.git-blame-ignore-revs`. GitHub applies it
automatically; locally, run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

## Architecture

Layers separated by kind, not by subject:

| Path | Contains |
|---|---|
| `src/domain/` | Pure logic: geometry, placement rules, topology, routing, validation, the file format, the autosaved session. No React, no Three.js. Most tests live here |
| `src/renderer/` | The Three.js viewport, split into meshes, scene affordances, pure interaction helpers, and the React lifecycle |
| `src/components/` | React UI |
| `**/commercial/` | Anything to do with money. PTSBuilderLite may not import it |
| `src/platform/` | What differs about the host: files or an autosaved session, an updater or none |
| `src/products/` | One composition root per product, supplying `App` with what differs |
| `electron/` | Main process and preload bridge |
| `shared/` | Types and channel names shared by the Electron main process and the renderer |

**Read [`CONTEXT.md`](CONTEXT.md) before changing domain code.** It defines the vocabulary (design,
part, terminal, bend, cell, centerline, open port) and — critically — which numbers in this codebase
are authoritative engineering spec versus placeholder catalog data. The two look identical in
source. Decisions with lasting consequences are recorded in [`docs/adr/`](docs/adr).
[`AGENTS.md`](AGENTS.md) is the short version for anyone — human or agent — picking the project up.

While the product waits on client requirements,
[`docs/baked-in-assumptions.md`](docs/baked-in-assumptions.md) says what the current model can and
cannot express. Questions only the client can answer are tracked as issues labelled `question`, and
[`docs/client-questions.md`](docs/client-questions.md) is the plain-English version to send them.

## Controls

| Input | Action |
|---|---|
| Left-drag | Orbit · **Right-drag** pan · **Wheel** zoom |
| `V` / `O` / `X` | Select · Obstacle · Erase |
| `R` / `Shift`+`R` | Rotate the placement ghost |
| `[` / `]` | Lower / raise the placement elevation |
| `Esc` | Cancel the active tool |
| `Ctrl`/`Cmd`+`Z` | Undo (`Shift`+ to redo, or `Ctrl`+`Y`) |

## Releases

Pushing a `v*` tag builds and publishes installers for macOS, Windows, and Linux, then fills in the
release notes from the commit log. The tag drives the version — `package.json` is synced to it
during the build rather than bumped by hand.

macOS builds are signed with a Developer ID and notarized; Windows builds are not signed, so
SmartScreen warns once at first install. Both are deliberate — see
[ADR-0006](docs/adr/0006-ship-unsigned-builds.md). [`docs/installing.md`](docs/installing.md) covers
what users see per platform, and is inlined into every release's notes so it appears on the download
page itself.

Self-update works on Windows, macOS, and Linux AppImage. Flatpak and non-AppImage Linux launches are
managed by the host, so those check GitHub and point the user at the download page instead.

Signing requires five repository secrets on the macOS runner; ADR-0006 lists them and how to produce
them. A local `pnpm run package` needs none of it and simply builds unsigned.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). You may use, modify, and
distribute this software, including commercially, subject to the attribution and notice terms in the
license. It carries an express patent grant and no warranty.

The name "PTSBuilder" is not licensed with the code (Apache-2.0 §6); derivative works should use a
different name.

Note that this repository ships no commercial data. Part prices, the tax rate, and company and
customer details are entered by the installer and stored in local application settings — a quote
cannot be exported until they are. See [ADR-0003](docs/adr/0003-quotes-require-installer-entered-pricing.md).
