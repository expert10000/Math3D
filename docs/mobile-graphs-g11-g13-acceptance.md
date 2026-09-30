# Mobile Graphs G11–G13

## MOB-G11 — tablet split pane

The measured workspace (after navigation/safe areas) uses a side panel at width ≥840 and height ≥480 logical pixels, both adjusted for font scale above 1. The panel is 340–440 scaled pixels; the graph retains at least 400 scaled pixels. Short landscape phones, narrow split windows and large text fall back to the scrollable phone sheet. These are reviewed layout thresholds, not device-name guesses.

Functions/Analyze/Display/Promote stay beside the graph on tablets. Graph defaults to the Functions side panel; phone Graph closes the sheet. Panel changes never create mathematical commands. Raw editor and analysis drafts, source selection and command history remain owned by the workspace, not a layout-specific mount. Plot resizing cancels an in-flight gesture instead of committing an obsolete screen transform. Native device checks are recorded below when performed.

## MOB-G12 — adaptive native workload policies

Sampling is scheduled outside render: animation-frame previews coalesce rapid viewport changes; a quiet 160 ms interval allows refinement. Cold deadline-limited refinement can retry at 240/480 ms, at most twice, with the same cancellation generation. Request generations reject obsolete source/viewport publications and cancel pending frames/timers on changes, background and unmount. Matching-source preview geometry can remain visible while a viewport refines; probes require the current viewport artifact. Mathematical source, saved quality intent and command history are never modified by this policy. The fixed-height sampling status area prevents ready/incomplete messages from resizing and resampling the plot in a feedback loop.

| Policy tier | Interaction / preview / refine samples | Refine cooperative deadline | Native lines | Fills / markers per layer | Serialized sample artifacts |
| --- | --- | --- | --- | --- | --- |
| Low | 128 / 256 / 512 | 12 ms | 768 | 64 / 32 | 256 KiB |
| Mid (initial) | 256 / 512 / 1024 | 20 ms | 2048 | 128 / 64 | 512 KiB |
| High | 256 / 512 / 2048 | 32 ms | 4096 | 256 / 128 | 1 MiB |

Every sample policy is additionally capped by saved intent. Interaction deadlines are at most 8 ms; previews at most 12 ms. The shared sampler checks deadlines cooperatively, so this is **not a hard preemptive CPU guarantee**. Table reads, checksums, geometry serialization and native View creation have separate bounded sizes but can still exceed a frame budget. Diagnostics measure sampling plus table/serialization work and next-frame delivery (not GPU frame duration). Repeated slow work lowers one tier; six fast workloads can raise one tier after a recovery hold. These are conservative policy presets awaiting physical low/mid/high device calibration, not benchmarked device classes.

The point-table cache is capped at 4 MiB of serialized file bytes, with eviction/reload through immutable checksum-checked sidecars. Hidden/over-budget tables are not read for sampling. Background/memory warnings release sample artifacts, point cache and ephemeral analysis; source/drafts/history survive. Resume starts with preview before refinement. Native memory warnings and a user-operated Reduce workload control force the low tier with a 30-second recovery hold. Android does not guarantee memory-warning delivery: the fixed ceilings and manual fallback remain necessary. No thermal sensor is read; sustained slowdown is only a workload signal. Serialized byte limits are not a measurement or guarantee of total JS/native heap usage.

Focused tests cover policy ceilings, hysteresis/holds, stale publication tokens, scheduler coalescing/cancellation, bounded artifact/line output, point-cache eviction/reload/corruption and host deadline validation. Shared desktop defaults remain unchanged.

## MOB-G13 — companion acceptance gate prepared, baseline not frozen

`npm run test:graph2d:mobile:device-gate -- path/to/evidence.json --android path/to/exact.apk --ios path/to/exact.ipa` checks a separately completed copy of `mobile-graph-device-evidence.template.json`. The committed template intentionally fails. This Graph-specific gate supplements (does not replace) the existing Android signing/release/device-signoff gates.

Required slots are physical Android low/mid/high phones and a tablet, plus a physical iPhone and iPad. The same reviewed runtime source must underpin both exact artifacts. The CLI hashes the supplied artifact files, compares runtime Git trees (mobile, core, kernel, API client and root package/lock files), requires a clean runtime worktree and verifies tested-source ancestry. Each record must identify device model, OS, tester, date, source commit and exact artifact hash. Both builds must be attested standalone embedded release builds, with application/version/build and signing-certificate identities. Debug/Metro, emulators, stale source, replaced artifacts, duplicate/missing devices, future dates, pending/failed cases or missing evidence block signoff.

Each device record has `slot`, `kind: "physical"`, `platform`, `model`, `os`, `tester`, ISO `testedAt`, `sourceCommit`, `artifactSha256`, `cases` and `metrics`. Each case is `{ "status": "passed", "evidence": "capture/report path and observations" }`. Do not fill these from unit test results. Required case keys:

- `create-open-edit`: create empty/example, edit a definition, invalid draft preservation, ordinary undo/redo.
- `pan-pinch-cancel-undo`: pinch anchor, one command per gesture, interruption/resize cancellation and undo.
- `probe-overlap`: explicit/parameter/data/contour probes, repeat-tap overlap cycle and empty clear.
- `multi-function-analysis`: chosen-pair analysis, source-linked locate, stale-result rejection, incomplete caveats.
- `save-reopen`: relaunch/reopen exact checkpoint; data-sidecar persistence and missing-sidecar diagnostics.
- `background-resume`: in-flight sampling cancellation, cache/analysis cleanup, preview/refinement recovery; drafts/selection/history retained while the workspace lives.
- `portrait-landscape`: usable tools/plot, selection/draft retained across normal rotation, no accidental viewport commit.
- `desktop-fixture-compatibility`: canonical/shared seven-kind checkpoint handoff, source/identity preservation, unsupported-file rejection. This does not certify the broader G2D33 two-app workflow.
- `native-import-share`: native picker and system share sheet, cancellation, standalone receiving/opening; Graph JSON and CSV/TSV sidecars handled separately.
- `keyboard-accessibility`: keyboard avoidance, large text, focus/labels, touch targets and screen-reader walkthrough.
- `workload-recovery`: measured previews/refinement, retained ceilings, sustained slowdown/manual reduction, background/cold recovery without an unbounded retry loop.
- `crash-log-review`: scoped native crash/warning review across the whole walkthrough.
- Tablets additionally require `tablet-split-pane`: graph + scrollable tools, panel switches, portrait/landscape and narrow-window fallback.

`metrics` requires at least ten runs, finite nonnegative `samplingP95Ms`, `nextFrameDeliveryP95Ms`, `serializedArtifactPeakBytes` (≤1 MiB), `serializedPointCachePeakBytes` (≤4 MiB), a measurement `report` and a reviewed `calibrationDecision`. Record workload/fixture identity, per-tier ceilings, missed-frame observations and recovery behavior in that report; next-frame delivery is not GPU timing. Performance acceptance is a documented reviewer decision, not an invented device benchmark. Evidence validation is an attestation consistency check: it cannot prove a human performed tests, independently verify the signing certificate or infer an embedded bundle merely from a JSON claim. Use the platform release-verification tools and attach their reports.

## Acceptance status

**1.6.0 scope decision — September 30, 2026:** the owner approved a release
with the reusable [test pack](test-packs/1.6.0/README.md), automated software
checks and the exact-APK Samsung baseline. The broader physical matrix is
deferred to subsequent releases. This is a narrower release scope, not a
passed MOB-G13 freeze; this gate/template and their rejection rules remain
unchanged. See [release evidence](mobile-1.6.0-release-candidate.md).

Physical Android and iOS release acceptance is pending; emulator or unit evidence is not a substitute. Advanced Curve/Surface worker analyses remain desktop-only; MOB-G11/G12 are layout/performance items, not worker-analysis delivery items.

The [2026-09-28 readiness audit](mobile-graphs-g13-readiness-2026-09-28.md) reruns the automated suite/typecheck and records the current device/artifact blockers without promoting them to physical signoff.

Automated evidence: 207 mobile tests in 46 files and mobile type checks, including canonical desktop fixture import/export and seven-kind aggregate native bounds; 97 desktop Graph unit tests in 28 files, root type checks, desktop production build and 18 desktop end-to-end tests. Synthetic gate records exist only inside unit tests and are not device attestations.

Android emulator checks on 2026-09-28: API 35 / Android 15, `sdk_gphone64_x86_64`, `Medium_Phone_API_35`, phone 1080×2400 at density 420. Circle/data source and the parameter probe remained visible; Display showed a measured 11.1 ms sample and 15.8 ms next-frame delivery in one mid-tier observation (not a benchmark). Manual low-tier reduction and Home/resume retained the probe and reduced workload state. A temporary 1600×1000/density-160 configuration showed a Functions side panel beside the graph. Cold low-tier layout exposed deadline-empty geometry, motivating the bounded refinement retries above. The original size/density settings were restored. These partial emulator checks do not certify the complete case matrix, native sharing, real pinch injection, accessibility or physical/iOS behavior.

Debug artifact produced successfully: `artifacts/mobile/Math3D-mobile-1.5.1-debug.apk`, application `com.math3d.mobile`, version 1.5.1/build 150007, SHA-256 `0ca4e355a130a04e53d324472b83b80798ecdbf02eb6245b0baaab8ef9aab4cc`. It loads JavaScript from Metro, so that APK hash alone does not identify the tested JavaScript and **cannot** be used as standalone release signoff. G11/G12 source commits are `d718ad8`/`173ae90`; the G13 commit additionally contains cold-retry regression coverage. No stored project was deleted or app data cleared.

After the chat interruption the emulator and Metro were no longer running. Metro was restarted; the same AVD was reopened without wiping data. Snapshot and cold startup subsequently appeared ADB-offline, including a software-rendered cold boot; the emulator console screenshot showed the Android boot logo. Consequently the post-restart rotation walk-through and native confirmation of the final bounded-retry change remain pending. Emulator/Metro processes were left running. This host/emulator limitation is separate from the passing automated tests and must not be counted as a passed native case.
