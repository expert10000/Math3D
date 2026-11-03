# Desktop Mesh comparison starter acceptance — 2026-11-03

This gate used a Windows Electron development build. The isolated worktree started at remote `main` commit `5660e0bed58d122366c32ed7a1c4fc69fc5b9dbb`, then merged upstream Project and Sage changes through `674e9cf6ff7003cba125049683dbd57ca9f3aef8`. The final evidence and checks came from the merged source. Each of the three new starters was opened through **Projects → Starter projects**, checked in its saved-result trend, saved to the library, and exported with verified source resources. Each exported Project was then imported into its own fresh Electron profile, opened, and checked again. The imported library copy passed the same check after an app restart.

| Starter and metric | Recorded values by Mesh revision | Acceptance result |
| --- | --- | --- |
| Retained Mesh Generation Study · `faceCount` | 8, 32, 32 | All three results and source hashes verified after transfer and restart. Subdivision changes the face count; the later transform keeps it at 32. |
| Saved Mesh Curvature Study · `mean.avg` | 1.0155928333600361, 0.7812252971861098, 0.6009425454669528 | All three discrete-curvature results verified. Their ratios follow the expected inverse scale law for successive 1.3× Mesh scaling, within Float32/numerical tolerance. These are sampled Mesh estimates, not analytic sphere curvature certificates. |
| Mesh Trend With Missing Result · `metrics.triangleArea.avg` | 0.5, **not recorded**, 2.53125 m² | The middle retained generation has no result ID or value. The chart shows two points, the table states why the middle result is missing, and transfer/restart do not fill the gap. |

The Electron acceptance checked each visible value against the saved `summary` in its exported Project package, confirmed the expected number of `saved-mesh-analysis` results and nonempty source-resource payload, and compared the complete trend rows, including source hashes, after independent import and restart. A visual check found that full-precision curvature axis labels overlapped the plot. The axis now uses short labels beside the plot while the table and exported values retain full precision. After the upstream merge, six selected Electron flows and 13 focused model tests passed. `npm run build:core` and `npm run typecheck:noemit` passed.

## Portable evidence

| Exported Project | SHA-256 |
| --- | --- |
| [Retained Mesh Generation Study](mesh-subdivision-study.json) | `bde1b73da2bb5ce848c6f6896ac77f09084b3adb9532f1e9bdf671a7f9e35252` |
| [Saved Mesh Curvature Study](mesh-curvature-study.json) | `a9cfb804276f478d9133fa6514244d80afaeeaa807e0cc99b6e73b9e6b3fbb8d` |
| [Mesh Trend With Missing Result](mesh-trend-gap-study.json) | `4dc4c879fac1a8d0e830e521ebf6622f4d30c1da51380850e3378e684001594a` |
| [Structured observations](mesh-starter-observation.json) | `11ba5a132c3138fda967245a374ad04eb5f04ccfb27e662fe65f7f75ff5cf9a8` |

The reopened screenshots show [retained generations](mesh-subdivision-study-reopened.png), [curvature](mesh-curvature-study-reopened.png), and the [unrecorded middle revision](mesh-trend-gap-study-reopened.png).

This acceptance covers the three built-in Mesh starters in the desktop development build and Project packages exported with resources. It does not establish support for unretained legacy Mesh histories or cross-device native transfer.
