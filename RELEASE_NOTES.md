# Math3D 1.6.0

This release expands the shared Graph workspace, its offline gallery and the
Android companion. Android is version `1.6.0`, build `150008`.

## Graph workspace and discovery

- Desktop, web and Android support editable explicit, parametric, polar,
  implicit, inequality, piecewise and data graphs, with source-aware probes.
  Numerical calculus remains scoped to supported explicit functions;
  regression uses the original checked point-table rows.
- Graph tools include grid/scales, saved probes, parameters with opt-in
  animation, linear/quadratic regression with residuals and uncertainty,
  and reproducible SVG/PNG/CSV/HTML publication.
- Graph Gallery supplies 20 offline examples, optional interactive copies,
  guided concepts and personal collections. My Graphs supports reusable
  independent copies, checked file exchange and local read-only previews.
- Android Home/Explore add manual featured navigation and Graph↔Surface
  discovery. Presentation mode has an explicit exit; capture recipes retain
  source/view provenance and external-data caveats.
- Switching from a saved Graph to an unsaved Surface example now restores
  the Surface after app restart. Existing saved projects remain available.

## Reusable test pack

`Math3D-1.6.0-test-pack.zip` contains nine importable Graph fixtures covering
all seven Graph kinds, two CSV tables, a deliberately invalid import,
15 walkthrough cases with expected results, a blank per-device results
record and a standalone file-integrity checker. The regression reference
fits `y=2*x+1` with SSE `0.32`. CSV sidecars remain separate from Graph JSON.

The pack is reusable for future devices. Its automated checker verifies
canonical imports/round trips, data resolution, reference regression,
unsupported-file rejection and checksums. Blank records intentionally stay
pending; file integrity and unit tests do not claim a manual device pass.

## Validation and release scope

The owner scoped 1.6.0 to the checked test pack, automated software acceptance,
the existing signed Android/emulator gates and exact-APK Samsung baseline
signoff. The Samsung SM-A566B on Android 16 passed update/data preservation,
Graph and Catenoid restart, navigation, inspector and scoped crash-log checks;
the owner confirmed cable-free Catenoid reopening. Production AAB signature,
checksum and the existing upload-key certificate were verified separately.

The broader low/mid/high Android/tablet, iPhone/iPad, full spoken accessibility
and measured workload calibration matrix is deferred to subsequent releases.
MOB-G13 and the full G2D40 physical freeze remain pending; this release does
not certify them. No iOS build is distributed with 1.6.0. Worker-dependent
Surface analyses remain subject to host capabilities; production Android
worker connections require HTTPS.

Windows/Linux installers, web/docs archives and corresponding source assets
are built by the tag release workflow. The Android production AAB was built
by its existing signing/verification workflow and attached after matching its
verified checksum. Release source, test steps and
detailed evidence are in `docs/mobile-1.6.0-release-candidate.md` and
`docs/test-packs/1.6.0/README.md`.
