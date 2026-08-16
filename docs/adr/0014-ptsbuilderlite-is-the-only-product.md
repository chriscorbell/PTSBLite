# ADR-0014: PTSBuilderLite is the only product

- **Status:** Accepted
- **Date:** 2026-08-16

The internal Electron version of PTSBuilder has been removed from the project's scope indefinitely.
This repository now produces only PTSBuilderLite: Kelly Tube Systems' public, consumer-facing web
app and marketing tool. The Electron host, commercial quote and pricing model, desktop packaging,
release automation, and two-product composition boundary are removed rather than kept dormant.

PTSBuilderLite remains a static browser application with no prices or other commercial data. It
autosaves one design in the visitor's browser and exports a bill of materials. There is one Vite
entry point, one browser platform, and one deployment target.

This supersedes ADR-0010. ADR-0003 and ADR-0006 are retained as history but no longer describe a
product in this repository.
