# Desktop Mesh comparison starter acceptance — 2026-11-03

This gate used a Windows Electron development build from remote `main` commit `5660e0bed58d122366c32ed7a1c4fc69fc5b9dbb`. Each of the three new starters was opened through **Projects → Starter projects**, checked in its saved-result trend, saved to the library, and exported with verified source resources. Each exported Project was then imported into its own fresh Electron profile, opened, and checked again. The imported library copy passed the same check after an app restart.

| Starter and metric | Recorded values by Mesh revision | Acceptance result |
| --- | --- | --- |
| Retained Mesh Generation Study · `faceCount` | 8, 32, 32 | All three results and source hashes verified after transfer and restart. Subdivision changes the face count; the later transform keeps it at 32. |
| Saved Mesh Curvature Study · `mean.avg` | 1.0155928333600361, 0.7812252971861098, 0.6009425454669528 | All three discrete-curvature results verified. Their ratios follow the expected inverse scale law for successive 1.3× Mesh scaling, within Float32/numerical tolerance. These are sampled Mesh estimates, not analytic sphere curvature certificates. |
| Mesh Trend With Missing Result · `metrics.triangleArea.avg` | 0.5, **not recorded**, 2.53125 m² | The middle retained generation has no result ID or value. The chart shows two points, the table states why the middle result is missing, and transfer/restart do not fill the gap. |

The Electron acceptance checked each visible value against the saved `summary` in its exported Project package, confirmed the expected number of `saved-mesh-analysis` results and nonempty source-resource payload, and compared the complete trend rows, including source hashes, after independent import and restart. A visual check found that full-precision curvature axis labels overlapped the plot. The axis now uses short labels beside the plot while the table and exported values retain full precision. Existing four starter UI tests and four model tests passed alongside the new transfer journey. The transfer journey passed again after the label fix. `npm run build:core` and `npm run typecheck:noemit` passed.

## Portable evidence

| Exported Project | SHA-256 |
| --- | --- |
| [Retained Mesh Generation Study](mesh-subdivision-study.json) | `411ed2eba90fc063459d0c4cc115d2902957064ccae08a4636ce478f52a77f7f` |
| [Saved Mesh Curvature Study](mesh-curvature-study.json) | `8bd727c5f8a48a0f77e7b1417596882e2a298a31e372b793186ce00051c381e5` |
| [Mesh Trend With Missing Result](mesh-trend-gap-study.json) | `eaa5992e9aa2a7616567679a502d6650073ee4b4bb2470d618916cffae397673` |
| [Structured observations](mesh-starter-observation.json) | `b06429967974d9194760fab6b470406780b2b1a32d44c3f0862651da64e504d0` |

The reopened screenshots show [retained generations](mesh-subdivision-study-reopened.png), [curvature](mesh-curvature-study-reopened.png), and the [unrecorded middle revision](mesh-trend-gap-study-reopened.png).

This acceptance covers the three built-in Mesh starters in the desktop development build and Project packages exported with resources. It does not establish support for unretained legacy Mesh histories or cross-device native transfer.
