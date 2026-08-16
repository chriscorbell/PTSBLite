# ADR-0003: Quotes required installer-entered pricing

- **Status:** Superseded by ADR-0014
- **Date:** 2026-07-25
- **Superseded:** 2026-08-16

The former internal product required installers to enter every price, the tax rate, seller details,
and customer details before exporting a quote. This prevented placeholder commercial data from
reaching a customer.

ADR-0014 removed that product, its quote workflow, and all commercial data from the repository.
PTSBuilderLite exports only an unpriced bill of materials; ADR-0011 now governs that boundary.
