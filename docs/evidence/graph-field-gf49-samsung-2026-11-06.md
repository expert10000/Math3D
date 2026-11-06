# GF-49 focused Samsung observation — 6 November 2026

## Artifact and device

| Item | Observation |
| --- | --- |
| Device | Samsung SM-A566B, Android 16, 1080 × 2340, density 450, 120 Hz display |
| App | Isolated `com.math3d.mobile.gf49`, version `1.6.0-internal`, build `150008` |
| Final test APK | 86,264,309 bytes; SHA-256 `171925d46850c94f83e92ab9d794bff8d421e591a9e17aa843630e48e72e8628` |
| Build | `:app:assembleInternal` with a temporary test key and temporary `.gf49` application suffix; source Gradle file restored afterward |
| Scope | One physical Android device; installed production and internal Math3D packages were not replaced |

The normal internal build could not run because its signing credentials were
not present. The local React Native install also lacked the locked
`@react-native/virtualized-lists@0.81.5`; that package was restored from the
local npm cache before the isolated build. The first test APK used for the
tensor Project round trip had SHA-256
`97c8524383cf484ad7e15017ad701cb81b8cdddd7bb09b4c72e05d5eb931b1415`.
An intermediate APK with SHA-256
`bcd43cb608979be8837c87a755c428c3c6ae701730c226961869ba5b385d8f9e`
included the corrected mobile `unverified` status for pinned bundled
selections. The final APK additionally distinguishes an upstream source change
from missing Graph point-table verification.

## Project fixtures and observed behavior

| Fixture | SHA-256 | Physical observation |
| --- | --- | --- |
| `gf49-tensor-glyph.math3d.project.json` | `0f22bfd6cc3487b356469964ab12d8d9f7af0590d22469e747a16ad998a1d578` | Imported into the first isolated APK. Saved tensor recipe exposed unit `m/s/m`, 16 glyph positions, source revision/hash; result was focusable with Tab, expandable with Enter, and present after force-stop/reopen. Numerical glyphs were not recomputed on mobile. |
| `gf23-bundled-profile.math3d` | `f49016ae1073e8e9b93a63fa62d31aa51c53417599262f5c95bcbe59213c4c88` | Imported and reopened in the intermediate APK. The saved axis-line selection retained its ID, coordinate units and source revision/hash; status was `unverified` and values were withheld because mobile could not verify the external bundle. Tab and Enter reached and expanded the selection. |
| `gf49-return-graph.math3d.project.json` | `757a59ac7a1ad86c9367f084ee9f57b9baf78c4b26fdba4a3a1c20afc1636dc72` | Imported and reopened in the intermediate and final APKs. The saved Poincaré return row remained `unverified`, exposed both axis units (`m`), Project/result lineage and summary hash, and said values were withheld until source and point table verification. Tab and Enter reached and expanded it on the intermediate build. |

`adb shell am start -W` reported cold native activity times of 219–277 ms
across the observed launches. These times exclude React Native mounting and
Project content availability, so they are **not** first-preview measurements.

## Rotation, interaction and memory

Rotation was temporarily fixed to 90° on the first APK. Android reported
`ROTATION_90` and a 2340 × 1080 app bound; the tensor recipe was still present
in the accessibility hierarchy. The device's original automatic portrait
setting was restored. Result visibility below the landscape fold was not
measured.

ADB tapped an expanded scientific control ten times after `gfxinfo reset`.
The first APK's bundled selection produced 19 rendered frames, 8 janky frames,
and p95 frame time 14 ms. The intermediate APK's saved Graph row produced 19
rendered frames, 10 janky frames, and p95 17 ms; the final APK produced 19
frames, 8 janky frames, and p95 15 ms on the same row. These are on-device frame metrics for
small interactions, not finger-to-display latency or a broad performance
benchmark. At 120 Hz the jank counts warrant follow-up before signoff.

Sampled `dumpsys meminfo` process total PSS was 181,038 KiB while viewing the
tensor Project, 163,594 KiB after its interaction run, 168,819 KiB after the
intermediate Graph row run, and 151,640 KiB after the final run. The largest
observed sample is **not a peak-memory bound**.

## Accessibility and signoff boundary

The Samsung TalkBack service was enabled briefly and reached the tensor result
label containing `m/s/m`, source revision/hash and saved-summary status. The
user heard speech but said it was too quiet to assess clearly. Accessibility
and media volumes both read 15/15, their maximum. Spoken clarity is therefore
inconclusive. At the end, TalkBack was off (`accessibility_enabled=0`, no
enabled service) and rotation was restored (`accelerometer_rotation=1`,
`user_rotation=0`).

This is focused GF-49 evidence for the connected Samsung. iOS, a wider Android
matrix, sustained memory, physical-keyboard use and full screen-reader speech
acceptance remain unsigned.
