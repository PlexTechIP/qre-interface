# Week 3 Team 3 contract-decision proposals

These are evidence-backed proposals for PM arbitration. They are not approved
contract changes, and this branch makes no new edits to `contracts/` for items
2–4.

1. **Sparse fixture.** QDK 1.29.1 returns no feasible point for
   `tStatesPerRotation: 5`, while its paired result fixture requires success.
   At `20` the same input succeeds. Recommended ruling: ratify `20` and update
   the contract change/version record together. Alternative: restore `5`,
   rename the paired result as a failed fixture, and make conformance expect
   `ESTIMATION_FAILED`. The current branch retains `20` only as the explicit
   interim proposal.
2. **Majorana `operationTime`.** QDK 1.29.1 accepts only `error_rate` and uses
   an internal 1000 ns instruction time. Recommended ruling: mark
   `operationTime` advisory/inert for 1.29.1, rather than implying the adapter
   applies it; reconsider when QDK exposes a parameter.
3. **Trace transforms.** PSSPC and Lattice Surgery are composed in the QDK
   pipeline and are not a genuine exclusive one-of. Recommended ruling: model
   an ordered transform pipeline, while retaining a compatibility shorthand for
   one selected transform if consumers need it.
4. **Provisional `source`.** The current adapter can reliably report input
   format (`qsharp`, `openqasm`, or `qir`), not a flat ISA source. Recommended
   ruling: rename/map this value as `inputFormat`; reserve `source` for a future
   ISA/provenance mapping or mark it provisional and nullable.

Any ruling should move schema, TypeScript types, fixtures, documentation, and
the contract version in one PM-owned contract-change.
