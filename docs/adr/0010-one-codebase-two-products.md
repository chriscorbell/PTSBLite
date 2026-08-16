# ADR-0010: One codebase, two products

- **Status:** Superseded by ADR-0014
- **Date:** 2026-08-03
- **Superseded:** 2026-08-16

The repository previously built a public browser product and an internal desktop product from a
shared domain and UI. Separate entry points, platform adapters, and product compositions kept their
commercial and host capabilities apart.

The internal product was later removed from scope indefinitely. ADR-0014 replaces this decision:
PTSBuilderLite is now the repository's only product and deployment target.
