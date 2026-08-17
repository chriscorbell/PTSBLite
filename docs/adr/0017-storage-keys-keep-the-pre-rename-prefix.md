# ADR-0017: Storage keys keep the pre-rename prefix

- **Status:** Accepted
- **Date:** 2026-08-17

The product was renamed from PTSBuilderLite to PTSBLite, and the GitHub repository with it. The
`localStorage` keys were **not** renamed. They remain:

```
ptsbuilder-lite:autosave:v1
ptsbuilder-lite:autosave:unreadable
```

A storage key is an address, not a label. Renaming it to match the product would leave every design
already saved in a visitor's browser at an address nothing reads — the design is still there, still
valid, and permanently unreachable. There is no migration path (the app cannot enumerate what it
did not write) and nothing to warn with, so the loss would be silent. That is the same failure
`docs/deploying.md` warns about for the *origin*, arriving by a different route.

Nobody ever sees these strings: they appear in no UI, no export, and no BOM. The cost of leaving
them stale is that a reader must be told why they disagree with the product name, which is what
this record and the comment in `src/platform/web.ts` are for. The cost of "tidying" them is
destroyed work.

The Cloudflare Pages project was already named `ptsblite`, so the rename changed no origin either:
`ptsblite.pages.dev` is unaffected, and saved designs survive the rename entirely.

If the keys ever must change — a schema break that warrants it — the migration is to read the old
key, write the new one, and leave the old value in place for a release. Not a bare rename.
