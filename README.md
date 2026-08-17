# PTSBLite

PTSBLite is a public, consumer-facing marketing tool for Kelly Tube Systems. Visitors can lay out
a pneumatic tube system in a web browser, explore routing and validation, and export a bill of
materials.

It is a static web application with no backend. One design autosaves in the visitor's browser.

## Development

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm dev       # Vite development server
pnpm run check # formatting, lint, typecheck, and tests
pnpm run build # production build into dist/
pnpm preview   # serve the production build locally
```

Deployment settings are in [docs/deploying.md](docs/deploying.md).

## Architecture

| Path | Contains |
|---|---|
| `src/domain/` | Pure geometry, placement, routing, validation, serialization, and BOM logic |
| `src/renderer/` | Three.js viewport and interaction helpers |
| `src/components/` | React UI and colocated stylesheets |
| `src/platform/` | Browser storage and downloads |
| `web-public/` | Production headers copied into the static build |
| `docs/adr/` | Decisions with lasting consequences |

## Controls

| Input | Action |
|---|---|
| Left-drag | Orbit |
| Right-drag | Pan |
| Wheel | Zoom |
| `V` / `O` / `X` | Select / obstacle / erase |
| `R` / `Shift`+`R` | Rotate the placement ghost |
| `[` / `]` | Lower / raise the placement elevation |
| `Esc` | Cancel the active tool |
| `Ctrl`/`Cmd`+`Z` | Undo; add `Shift` to redo |
