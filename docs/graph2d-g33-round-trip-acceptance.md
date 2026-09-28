# G2D33 software round-trip acceptance

Implemented 2026-09-28. This freezes an automated checkpoint/handoff regression. Physical two-app release acceptance remains subject to [MOB-G13](mobile-graphs-g11-g13-acceptance.md).

## Contract and workflow

- `math3d.project-handoff` version 1 remains the existing scene contract. Version 2 carries a normal `math3d.mixed-workspace` v1 checkpoint with exactly one Graph and optional companion documents. No separate Graph project container is introduced.
- Kernel workspace → **Export Graph handoff** exports the Graph and its promotion companions, with canonical full-workspace hashes. Mobile's ordinary desktop/file import accepts it and keeps its incoming revision as the base for subsequent export/share.
- Kernel workspace → **Open Graph handoff** compares the returned base revision against live data immediately before replacement. Source, viewport, style, probes and saved result descriptors count toward divergence. Conflict leaves local work intact. Opening a different project saves the previous workspace under `math3d.mixed-workspace.v1.before-handoff`; accepted checkpoints and ancestry are persisted for reopen.
- Imported companions, result envelopes, provenance and compatible input descriptors survive edits. Stale results remain inspectable; they do not become current merely because the file reopened. External artifact bytes and CSV/TSV data sidecars still transfer separately.
- Raw Graph v0/v1 and mixed workspace imports remain supported on mobile. Raw files have no trustworthy ancestry. Graph-only identity collisions create a copy and clear ancestry; rich workspace collisions fail instead of discarding companions.
- Checkpoints persist stable document/object IDs, canonical AST/source hashes, display and selection. Undo logs are session-local. Commands remain usable after reopen; mathematical undo/redo advances generation revisions rather than reusing old revisions.

## Verification

`tests/unit/mobileGraphRoundTrip.test.ts` exercises desktop shared commands creating `f,g`, a saved derivative envelope and Curve companion, real mobile import/probe/pin/add-`h`/save/export models, desktop conflict checks, source hashes, staleness, corrupt/version/capability/ancestry rejection and collision handling.

`tests/e2e/graph2d-handoff.spec.ts` exercises the built Electron UI and real file download, hands the exported bytes through mobile models, reimports `h`, observes its rendered path, then verifies that a conflicting return preserves the desktop `3*x` edit. It is not a physical mobile UI test.

```powershell
npm run test:graph2d:handoff
npm run test:graph2d:mobile:unit
npm run test:graph2d:desktop:unit
npm --prefix apps/mobile run typecheck
npm run typecheck:noemit
npm run build:core
npm run build:web
```

Playwright's source transformer loads the shared workspace packages in the file regression. Production core/kernel and mobile models are typechecked by the existing renderer/mobile gates; the E2E harness retains its NodeNext configuration.
