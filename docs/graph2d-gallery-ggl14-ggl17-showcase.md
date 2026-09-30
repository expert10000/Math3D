# GGL14–17 — presentation, local viewing and discovery

2026-09-30. This release adds software paths on desktop/web and native. It does not assert physical-device, screen-reader or signed-release acceptance.

## Delivered behavior

- **GGL14:** Desktop Graphs has a clean presentation view with visible Fit/Export/Exit controls, Escape exit and restored keyboard focus. Native Graphs has a clean presentation view with a visible Exit control. The existing G2D36 publication pipeline remains the image/report renderer. Desktop downloads and native saves/shares a JSON capture companion containing a checked committed Graph document, source and publication snapshot identities, authored/effective viewport, output size, host window size, UI theme, attribution and publication diagnostics. The G2D36 canvas is currently light even in a dark UI; this is explicit. External point-table rows and result artifacts are not embedded, and the recipe labels that limitation.
- **GGL15:** The Gallery has a dedicated read-only local-file view on desktop/web. It validates the existing Graph document/workspace/handoff formats, enforces the existing 32 MB file limit, uses a bounded plot preview and displays missing sidecars/results before any mutation. Native My Graphs presents the same local-file read-only step. An explicit Open editable copy action uses the existing independent-fork/import path and stays disabled when required sidecars are missing. Local files and G2D36 static HTML reports are the chosen transport. There is no hosted viewer URL, upload endpoint, account, server cost or public-link promise.
- **GGL16:** Native Home and Explore show the ordered featured Graph catalog with one bundled preview at a time, manual Previous/Next controls and ordinary project-preserving Open. No autoplay, network preview fetch or tracking is added. Desktop/web already retain Featured discovery in Graph Gallery; this increment does not create a new desktop Home shell.
- **GGL17:** A mobile card/query adapter projects the existing Graph catalog and Surface example catalog without changing either document/factory. Explore searches Graph cards alongside its existing Surface filter. Three curated, bidirectional mathematical comparisons connect real Graph presets to real Surface scenes. Surface links check runtime capability and save the current Graph before switching. A link is educational navigation, never conversion or implicit-to-Surface promotion.

## Automated evidence

- Desktop/shared Graph unit suite: 279 tests across 46 files; native unit suite: 325 tests across 58 files.
- Root, renderer and native strict TypeScript checks pass. The 20 frozen SVG/PNG preview assets verify unchanged.
- Electron Graph suite: 33 passed, including presentation/focus/capture download, malformed local-file rejection, read-only preview and independent editable opening.
- Two-context Chromium web suite: 50 cases passed, including presentation and local-file read-only/open flow.
- Desktop renderer and web production builds pass. Android Hermes bundle compilation passes; compilation is not an installed-device check.

## Pending release evidence

Physical Samsung USB interaction for presentation, read-only files, Home/Explore showcase, related-scene links and capture save/share; TalkBack/VoiceOver; signed Android/iOS release builds; and the wider MOB-G13 device gate. GGL18 remains a separate, measurement-driven catalog scale task. Static HTML can be shared as a file or hosted externally by its owner, but Math3D does not issue hosted public links in this release.
