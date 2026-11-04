# SAGE-B06 saved algebra dossier Inspector — 2026-11-04

## Delivered

CAS → Algebra → Operations now opens a saved object-linked result in the right Inspector. The **Results** view presents operation-specific exact values, factors, roots and matrix tables. **Structure** shows the pinned object ID, revision, definition hash, parent revisions and current, historical or stale status. **Verification** separates repeated exact checks from worker-reported claims. **Execution** shows the stored backend, Sage version, job ID, elapsed time, output schema, result hash and warnings. Unreported algorithm and proof settings are marked as such.

The Inspector recomputes saved GCD values and modular inverse identities with `BigInt`. For matrix dossiers it describes the kernel and image witnesses checked by the core parser without claiming full row equivalence. For integer Smith/Hermite forms it shows whether exact unimodular transformations were supplied and verified. Reconstruction and domain inspection display their pinned metadata and directional coercion results without claiming an independent proof of Sage's mathematical construction. Results lacking a certificate retain the **COMPUTED** mode. The existing freeform Services result card remains available.

## Acceptance

- Model tests check an exact `gcd(84,30)=6`, detect a schema-valid but mathematically wrong `7`, and display historical evidence after a structure revision. The Smith fixture shows checked transformations; the rational matrix fixture shows checked kernel/image witnesses and a reported full-equivalence claim.
- Desktop acceptance runs a controlled Sage HTTP reconstruction from a selected saved object and checks all four Inspector views. A separate fresh-profile import reopens saved evidence and selects it in the Inspector without rerunning Sage.
- Focused Vitest, desktop Playwright, typecheck, build and dependency checks are recorded in the implementation run. Docker Sage is unavailable on this PC; the controlled HTTP worker exercises the broker and saved evidence contract.

## Next

**SAGE-B07** introduces versioned recipe graphs and dependency-aware execution over saved algebra objects and results.
