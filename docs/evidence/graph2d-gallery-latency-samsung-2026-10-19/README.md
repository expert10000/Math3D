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

## Publication trace and batched handoff

A trace build (`0965c80`, APK SHA-256 `da1a495b62f64b1f1d2e525f0af29622b84eb28024954219d36f929c8318bd75`) separated React state handoff from the settings call. On a 37-project library, Driven trajectory took 6,255 ms: 3,614 ms save and 2,625 ms after save. State changes before opening the Graph took 1,349 ms; the Graph state changes took 1,267 ms; the settings call took only 1 ms. The delay was therefore in repeated screen state publication, not settings persistence.

The Gallery success path now batches its project, workspace, Gallery-close, and busy-state changes. A post-commit marker records when React commits the workspace screen. On the same Samsung, the standalone internal APK built from clean source `2d2b927` (SHA-256 `b577a9bb25bd4bc216053e9a718609134c16239ee9ee5d19578999ae0a675cd8`) produced:

| Batched APK launch | Project library | Save phase | Publish phase | Screen commit from action |
| --- | ---: | ---: | ---: | ---: |
| Driven trajectory | 38 projects, 396,165 serialized bytes | 3,615 ms | 1,254 ms | **4,889 ms** |
| 10,000-point regression | 39 projects, 397,732 serialized bytes | 4,503 ms | 1,250 ms | **5,765 ms** |

[Raw batched metrics](batched-device-metrics.txt) include a later 40-project Two slopes launch at 4,911 ms screen commit. The Driven publish phase fell from 2,625 to 1,254 ms in these runs; the dense launch was 5,765 ms versus the earlier 7,032 ms observation. Library size increased and device scheduling was uncontrolled. The commit marker is after the React state commit, not a GPU presentation or touch-to-photon measurement. The dense result and its downsample notice are visible in [portrait](batched-portrait.png) and [landscape](batched-landscape.png).

The dense Graph remained visible across rotation to landscape and back and after Home/resume. After a force stop, Projects reopened the saved dense Graph with its downsample notice. These are partial rotation, background, and save/reopen observations; draft retention, gesture cancellation, and the full case definitions were not exercised. On the light Two slopes Graph, ten alternating 30-pixel ADB pans left the adaptive policy at **mid** (7.1 ms sampling, 10.2 ms next-frame delivery, 3,576 retained serialized bytes in the [first hierarchy read](light-first-diagnostic.xml)). [A subsequent diagnostic capture](light-workload-diagnostics.png) also remained at mid and showed 8.8 ms sampling, 5.4 ms next-frame delivery, and 3,562 bytes. This does not establish high-tier calibration. The [scoped crash scan](batched-crash-scan.txt) found no app fatal exception, ANR, or React Native TypeError/Error match. Mobile typecheck and the 213 focused Gallery tests passed. The earlier ten-run quartic fit series remains the fitting measurement; this change did not touch fitting. Wider MOB-G13/G2D40 device and interaction evidence remains pending. Spoken testing was omitted from this follow-up at the owner's request.
