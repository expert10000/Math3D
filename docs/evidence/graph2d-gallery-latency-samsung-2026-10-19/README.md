# Samsung Gallery launch latency follow-up — 2026-10-19

Physical Samsung `SM-A566B`, Android 16, with the standalone signed internal package `com.math3d.mobile.internal` (`1.6.0`/`150008`) installed over existing data. The final measured APK was built from clean tracked source `1b4731571189e0807ba34737830c49d0835e6531`, SHA-256 `663e2a5fa0030dc303306e8a1edfefdf15d989ef2d3d0eaaaea80e4273b0ace3`. The same device and growing local project library were used throughout; runs are observations, not a controlled population benchmark or full MOB-G13 attestation.

The [first focused check](../graph2d-gra11-8-samsung-2026-10-19/README.md) measured 11,680 ms for Driven trajectory and 12,573 ms for the 10,000-point regression preset. A phase-instrumented repeat on the unoptimized writer (source `5e61dd6`, 33 projects) measured **11,638 ms** for Driven trajectory: 18 ms launch planning, 8,846 ms project writing, and the remainder after the writer returned. The writer spent 1,766 ms encoding and validating the new snapshot, 3,527 ms rereading/validating the existing primary, 1,775 ms validating the staged file, and 1,777 ms validating the backup copy.

The writer now validates each distinct snapshot once and checks staged and backup copies for exact byte equality with validated content. It still checks the on-disk primary on every save and keeps the existing recovery path for damaged or unsupported data. A new fault test alters staged and backup bytes and confirms neither can replace the accepted primary. The Gallery also hands its already validated document directly to the workspace after the save.

| Final APK launch | Project library | Save phase | Publish phase | Total |
| --- | ---: | ---: | ---: | ---: |
| Driven trajectory | 35 projects, 391,168 serialized bytes | 3,653 ms | 2,715 ms | **6,382 ms** |
| 10,000-point regression | 36 projects, 392,735 serialized bytes | 4,500 ms | 2,518 ms | **7,032 ms** |

[Raw final device log](optimized-device-metrics.txt) includes the writer's subphases. Relative to the earlier single-run observations, these total times are about 45% and 44% lower, respectively. The project count grew between runs, and Android scheduling was not controlled; these percentages describe the observations, not a guaranteed speedup. `gallery-launch` ends after project save and React state handoff, before verified screen presentation. The remaining 2.5–2.7 s publish phase needs a separate trace before assigning a cause.

The final APK displayed the dense graph and its downsample notice, then reopened that saved Graph after force stop and relaunch. The scoped logcat scan found no app fatal exception, ANR, or React Native TypeError/Error match. Mobile typecheck, the focused Gallery suite (213 tests), and the storage/Gallery suite (265 tests) passed. TalkBack remained disabled, and the other MOB-G13/G2D40 device, gesture, performance-calibration, and spoken-accessibility slots remain open.
