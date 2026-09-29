# GGL12 — checked portable personal preset exchange

**Software status — 2026-09-30:** implemented on desktop, web and native. Physical cross-device and accessibility release signoff remains open.

My Graphs now exports an ordinary saved Graph through the existing checkpointed `math3d.project-handoff` v2 file. Desktop/web download it; native uses the existing project export picker. Desktop/web can copy the Graph document definition, and native can share that definition as text. The definition is only the Graph source and display state; the full handoff can also retain supported Curve/Surface companions and workspace relations.

Import accepts the existing Graph document, mixed Graph workspace or v2 handoff contracts. The shared inspector checks the 32 MB Graph limit, schema/version, handoff integrity, one checkpointed Graph and supported companions, then identifies referenced point-table sidecars; the native file picker applies its existing 25 MB limit first. Desktop/web and native show a bounded read-only plot preview and source/companion/result summary. A missing or corrupt local point table blocks acceptance. Cancel leaves the current workspace open. Accept creates a fresh Graph identity with the GGL11 personal-copy ancestry and saves through the existing atomic project path; current unsaved Graph or scene work is preserved. Export and import do not execute scripts or invent a second preset format.

The handoff contains **references**, not external point-table rows or result artifact bytes. Those must be transferred by their existing separate workflows. Saved result descriptors remain labeled observations and are not recomputed during import. No extra metadata envelope was needed because existing Graph titles and provenance cover this file-based exchange.

## Verification

- Shared/desktop model tests: accepted Graph and handoff files, hash rejection, missing sidecar refusal, fresh identity/source preservation, export and atomic-save rollback. Existing GGL11 tests cover copy and companion lineage.
- Native model tests: independent import, preservation of unsaved current work and missing-sidecar refusal. Native TypeScript check and Android Hermes/Metro export pass.
- Electron: real My Graphs download, checked preview, cancel and independent import pass.
- Web: the same export/preview/cancel/import flow passes under both configured locale/time-zone contexts. Production web build passes.

The native UI still needs an installed-device file round trip with a desktop-produced handoff and a native-produced handoff opened on desktop. Also verify keyboard/touch focus and real screen-reader announcements on devices, missing-data recovery with actual sidecars, and signed Android/iOS builds. These are release evidence gates, not claims established by the software tests.
