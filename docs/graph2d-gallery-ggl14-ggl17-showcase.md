# GGL14–17 — presentation, local viewing and discovery

2026-09-30. This release adds software paths on desktop/web and native. Samsung debug-device interaction was checked separately below; it does not assert screen-reader or signed-release acceptance.

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

## Samsung debug-device interaction

- Samsung SM-A566B (`RZCY71087BY`) ran the separately installed `com.math3d.mobile` debug app via local Metro. The existing `com.math3d.mobile.internal` installation and its data were left untouched because internal-release signing credentials were not available.
- Home's bundled Graph feature showed its preview and manual 1/6 → 2/6 → 1/6 navigation. Opening Beating waves saved the previous Catenoid scene and entered an editable Graph.
- Native presentation showed a visible Exit action. A device-discovered chrome issue was corrected: the global bottom navigation now hides during Graph presentation and returns on exit. The corrected JS was rechecked on-device through Metro.
- The Graph capture-recipe JSON reached the Android share sheet with a `.json` filename; no share destination was selected.
- A 2,975-byte test handoff was picked from Downloads. The read-only view plotted Two slopes, listed two Graph objects, validated `graph2d.explicit.v1`, and warned that sidecar bytes are not embedded. Only the explicit Open independent editable Graph copy action imported it. The exact temporary Downloads handoff was removed afterward.
- A three-petal rose Gallery preview showed its available Wave Torus comparison. The related-scene action opened the separate Wave Torus Surface workspace.
- Explore search for `rose` returned the matching Graph scene. Searching `Wave Torus` returned the Surface example and its reverse related-Graph action; that action opened an editable A three-petal rose Graph and reported that previous work was saved.

## Pending release evidence

Physical capture save completion and share delivery remain unverified. TalkBack/VoiceOver, signed Android/iOS release builds, and the wider MOB-G13 device gate also remain pending. GGL18 remains a separate, measurement-driven catalog scale task. Static HTML can be shared as a file or hosted externally by its owner, but Math3D does not issue hosted public links in this release.
