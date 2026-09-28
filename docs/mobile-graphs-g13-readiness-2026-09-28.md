# MOB-G13 readiness audit — 2026-09-28

Status: automated readiness passed; physical companion baseline remains pending.
Reviewed source: `dea28de` (`test(mobile-graphs): prepare exact-build companion acceptance gate`).

## Checks performed in this audit

- `npm run test:graph2d:mobile:unit`: 207 tests in 46 files passed, including the physical evidence validator and seven-kind companion fixtures.
- `npm --prefix apps/mobile run typecheck`: passed.
- Initially no device was attached. After USB connection, ADB detected a physical Samsung SM-A566B running Android 16 (1080×2340).
- Local artifact inventory: Android candidates exist, but no iOS IPA or completed Graph-specific physical evidence JSON was found. Existing generic mobile signoff reports are not MOB-G13 evidence.

These results verify automated readiness. They do not demonstrate native gestures, accessibility, performance calibration, sharing, or lifecycle behavior on physical devices.

## Partial physical Android run

Built and installed the standalone embedded **internal** APK with `npm run mobile:android:internal` and `adb install -r`, preserving existing projects. Tested runtime source: `dea28de80ce85f5b67c49ac7fa60d00dfcb69afe`; APK SHA-256: `c93ef37563db4cf510389ef521137e78117fdc91a0a5c500f43d26f54e88dcfd`; application `com.math3d.mobile.internal`, version `1.5.1-internal`, build `150007`. Build metadata reported one tracked documentation change, with no runtime changes. This internal candidate does not satisfy the gate's production release-artifact requirement.

Created a separate `G13-USB-20260928` starter project. Verified on the physical phone:

- Explicit line rendered; tap probe returned `f: x=0.00483098, y=0.00483098`.
- Pan committed an undo step; undo and redo remained usable.
- Edited `f` from `x` to `2*x`, applied the draft, then undid/redid and saved.
- Background/home then launch returned to the Graph workspace.
- Forced process stop, relaunched, opened the saved project from Projects, and confirmed `y = 2*x` and the saved panned viewport. Undo history correctly reset on checkpoint reopen.
- Crash buffer was empty at review; process exit history showed the deliberate force-stop and package update, with no crash/ANR during this run.

Reviewed captures and hierarchy extracts are in [the physical evidence folder](evidence/mobile-graph-g13-2026-09-28/). The first rotation capture was taken during transition; subsequent captures were blocked by automatic screen locking, so rotation is **pending**. Device rotation preferences were restored (`accelerometer_rotation=1`, `user_rotation=0`).

This is partial coverage of one phone, not a completed device slot. Pinch/cancellation, overlap, multi-function analysis, import/share, keyboard/accessibility, full workload recovery, ten-run performance measurement/calibration, production artifacts and the remaining physical matrix are pending. Later G2D33 runtime changes require a rebuilt candidate and another device run.

## Required completion evidence

Use the [G11–G13 acceptance matrix](mobile-graphs-g11-g13-acceptance.md) and a separate copy of [the pending evidence template](mobile-graph-device-evidence.template.json).
Complete all six physical slots: Android low/mid/high phones, Android tablet, iPhone, and iPad. Each slot needs the full case matrix, at least ten measured workload runs, capture/report references, and a reviewed calibration decision.

Build both standalone embedded release artifacts from the same committed runtime source. Record exact artifact hashes, source commit, application/version/build, and signing certificate identities. Metro/debug APKs and emulator runs cannot sign off the baseline.

```powershell
npm run test:graph2d:mobile:device-gate -- path/to/completed-evidence.json --android path/to/exact.apk --ios path/to/exact.ipa
```

The gate must pass with a clean runtime checkout and unchanged tested runtime tree. Missing devices or artifacts remain pending; do not replace those records with synthetic unit-test data.

## Work that can proceed

G2D33–35 software tests and documentation can be implemented while the physical matrix is collected. Their automated checks must be described separately from two-app/native signoff; neither the mobile nor the whole Graph2D release baseline is frozen until the physical gate passes.
