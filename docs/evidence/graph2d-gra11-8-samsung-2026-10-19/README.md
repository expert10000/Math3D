# GRA-11.8 focused Samsung check — 2026-10-19

Physical Samsung `SM-A566B`, Android 16, 1080 × 2340, ADB serial `RZCY71087BY`. The standalone signed internal package `com.math3d.mobile.internal` (`1.6.0`/`150008`) was installed over existing app data. Final tested APK: source `6e6763ee0abf24931caf5458f219af59dc332bdb`, SHA-256 `c8a84a26e30dc416886a58383f4ce410e195cba128d4e099fa6f45e642f29492`, clean tracked source at build. This is an ADB-driven focused check, not the full MOB-G13 signed-release attestation.

## GRA-11.8 journey

- Graphs → Gallery search found **Driven trajectory** and its offline preview, with time/state axis labels and dashed backward versus solid forward paths. Opening created an ordinary Graph project. [Gallery card](gallery-card.png).
- The default `x′=t-x, x(0)=1` on the final APK displayed backward `state-boundary`, last `(-1.640625, 7.67615997453845)`, 18 accepted/0 rejected; forward `time-boundary`, last `(4, 3.036631277520534)`, 44 accepted/0 rejected. Both paths were visible. [Analyze screen](final-analyze.png) and [accessibility hierarchy](final-analyze-accessibility.xml).
- Functions → Edit changed the first object's initial time and value to `x(0.5)=2.5`. Functions → Add graph object → Add time-ode created a second `x(0)=1` object. Save completed; after force stop and relaunch, Projects showed the two-object Graph and Functions retained both definitions. [Reopened first card](reopened-create-edit.png), [second card](reopened-second.png), [hierarchy](reopened-create-edit-accessibility.xml).
- The accessibility hierarchy exposes a plot description naming the axes, initial marker, and two path styles. Each status Text has a distinct spoken label naming direction, stop reason in words, final time/state, and step counts. This verifies labels available to Android accessibility services; **TalkBack was disabled (`accessibility_enabled=0`) and actual speech was not heard or confirmed**.

## Device latency and workload

The APK logs `MATH3D_DEVICE_METRIC` from JavaScript. `gallery-launch` starts in the Gallery open handler and ends after the normal project save/sidecar transaction and state switch; it excludes subsequent plot rendering and display presentation. `fit-publish` starts in the Analyze handler and ends when a result is handed to React state; it includes the scheduled 50 ms start delay and bounded work, but excludes the final painted frame. These are app-side wall-clock observations, not touch-to-photon timing. [Raw log](device-metrics-log.txt).

| Workload | Device observations |
| --- | --- |
| Driven trajectory Gallery launch | 11,680 ms, one run |
| 10,000-point regression Gallery launch | 12,573 ms, one run |
| 10,000-row quartic fit publication | 10 runs: 1,771–2,154 ms; median 2,108.5 ms; nearest-rank p95 2,154 ms |

The quartic result showed `n=10000`, `excluded=0`, `df=9995`, residual SD `0.0020004487`, and `R²=0.99999139`. The approximately 12-second Gallery transactions are a performance finding; no Gallery acceptance threshold or broad device calibration has been established. Repeated launch and phase-level storage timing are needed before attributing the delay to one component.

Ten alternating 30-pixel, 220 ms ADB pan gestures on the ODE plot were followed by 900 ms settling and the in-app diagnostic readout. All ten reported **mid**, `refine`, 1,024 samples, 20 ms cooperative deadline, and 3,003 retained artifact bytes. [Raw readings](pan-metrics.csv) give nearest-rank p95 sampling **12.4 ms** and next-frame delivery **13.1 ms**. The latter is a scheduling measurement, not GPU frame duration. High-tier promotion was not observed; this series does not calibrate a high-tier workload or natural finger gestures.

A scoped logcat scan after installing the final APK and performing the walkthrough found no `FATAL EXCEPTION`, app ANR, or `ReactNativeJS` TypeError/Error match; the app remained resumed. [Scan record](crash-scan.txt).

## Gate status

This contributes focused Samsung evidence to create/open/edit, save/reopen, workload, and crash review. It does **not** mark any complete MOB-G13 or G2D40 case as passed: invalid draft/undo, true pinch and interruption, broad probes/analysis, rotation/background, native import/share, large text and screen-reader speech, professional publication/scales/animation/regression intervals, other Android slots, tablet, and iOS remain outstanding under the roadmap. The owner has deferred iOS release evidence. A further ODE feature still needs separate scope before implementation.
