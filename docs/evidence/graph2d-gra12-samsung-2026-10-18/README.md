# GRA-12.7 focused Samsung check — 2026-10-18

The connected physical Samsung `SM-A566B` (Android 16, 1080 × 2340) ran the standalone internal Android package `com.math3d.mobile.internal` installed over its existing data. The APK was built from source commit `5e39ea0f4e26bd0938e72056e8d5026fefc8bca7` and has SHA-256 `166f205dc5ccc0df01f092a9c3ff518771f1b6326d9ed7441d47faf4cf28cc50`. This is a focused automated ADB walkthrough, not a human touch, signed-release, or full MOB-G13 attestation.

## Observations

- **Graphs → Gallery → 10,000-point regression** opened on the device. The graph said “Plot downsampled for display. Regression uses all original checked rows.” The Gallery transition completed during the next short wait after the first UI hierarchy dump; UIAutomator and ADB overhead prevent treating that as an app-only latency number.
- **Workspace → Analyze → Quartic regression → Run analysis** displayed `n=10000`, `excluded=0`, `df=9995`, `residual SD=0.0020004487`, and `R²=0.99999139`. The result and its chart overlay are visible in [quartic-result.png](quartic-result.png).
- Starting the same fit again and tapping **Cancel fit** after approximately 250 ms displayed “Fit cancelled. No new result was published.” The prior quartic result remained visible in the UI hierarchy. The 250 ms value is the scripted tap interval, not measured fit cancellation latency.
- A one-finger ADB swipe panned the chart; the fitted overlay remained aligned with the data in [before-pan.png](before-pan.png) and [after-pan.png](after-pan.png). **Fit all** restored the framing in [fit-all.png](fit-all.png).
- With the in-app sampling diagnostics open, ten alternating 30-pixel ADB pan gestures (220 ms gesture, 800 ms settling before reading) all reported the adaptive **low** tier and `refine` phase. The retained serialized artifact was 69,214 bytes each time. [Raw measurements](pan-metrics.csv) give nearest-rank p95 sampling **11.1 ms** and next-frame delivery **35.6 ms**. These are app-reported sampling/scheduling observations, not GPU presentation timing or Gallery/fit latency; the workload had already adapted to low tier before the series.
- A scoped recent Android log review found no `FATAL EXCEPTION`, React Native `TypeError`/`Error`, or app ANR. The app remained the resumed activity after the walkthrough.

## Still required

This check does not measure app-only Gallery or fit latency, nor physical finger-to-display latency; ADB/UIAutomator timings include host and capture overhead. The in-app pan sampling/next-frame metrics cover only the low-tier dense-series case. Real two-finger pinch, gesture interruption/undo, mid/high-tier and long-run workload calibration, large-text and spoken TalkBack use, and the other MOB-G13/G2D40 cases remain open. iOS checks are deferred by the user. The internal APK and this one Samsung do not satisfy the exact signed-artifact, multi-device release gate.
