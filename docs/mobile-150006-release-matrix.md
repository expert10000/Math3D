# Mobile build 150006: network and release matrix evidence

Date: September 18, 2026. This record separates checks completed on the exact
internal APK from release work that still needs a credential or physical device.

## Exact internal candidate

| Field | Value |
| --- | --- |
| Source commit | `e36ec7ba90b8da2b3e53b4cdbf6c5df6cab5eb1c` |
| Application ID / version | `com.math3d.mobile.internal` / `1.5.0-internal` |
| Android build | `150006` |
| APK SHA-256 | `9d1a002d677a32a6ea75b84d018b4c632eccafb15ff9c3d0c9ff7799bc8d0227` |
| Signing certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |

The APK was built from clean tracked source. `apksigner` verified the same
internal signing certificate used on the Samsung for build `150004`.
The local candidate archive is
`artifacts/mobile/Math3D-mobile-1.5.0-internal-150006-candidate.zip` (SHA-256
`ff9f88aaca5f2c5a7691ff89e4e6129866737017528ed1869cd8752f4ba82dab`).
It contains the exact tested APK, build metadata, checksum, and tester note;
its candidate label remains until owner-observed signoff is complete.
`aapt` verified the internal variant allows cleartext HTTP for development
worker addresses. The merged release manifest has no cleartext override, so its
target API 36 retains [Android's HTTPS-only default](https://developer.android.com/guide/topics/manifest/application-element).

## Samsung `SM-A566B`, Android 16

The phone joined `Tenda_235898_5G` at `192.168.0.166`. The PC was on the same
LAN at `192.168.0.150`; the worker proxy listened on that address, backed by
the local Python worker. Phone `ping` and TCP connection to port `8787` passed.
ADB reported no USB port reverse mapping; the phone routed `192.168.0.0/24`
through `wlan0` at `192.168.0.166`.
The Math3D Settings health check returned `Health: ok` (97 ms warmed on build
`150005`, then 54 ms warmed on `150006`). Explore → Gallery → Implicit Torus
ran a worker preview on `150006`: Analyze reported `ready`, 14,056 vertices
and 28,000 triangles, with no cached marker. An invalid port returned
`Health: error` and an actionable URL/Wi-Fi/server message; restoring port
`8787` returned `Health: ok`.

The invalid-port check was repeated nine more times: 9/9 showed `Health: error`
and the actionable message, for 10/10 including the initial observation. The
working `8787` URL was restored afterward and returned `Health: ok` in 53 ms.
Evidence: `output/mobile-invalid-health-150006.json` (SHA-256
`4ff914ae8f124775649ec4b88e5ba98ca776291c3281ab9cfd00aba434b3d385`).

Ten automated physical cycles on the exact `150006` APK passed cold launch into
Catenoid, Explore/Gallery reopen, one-finger orbit, rotating quality presets,
worker health, and 30-second background/resume. The final screenshot still
rendered the rotated Catenoid. Android Activity `TotalTime` ranged from 196 to
278 ms (average 230 ms); this does **not** measure time to the first interactive
3D frame. Local ignored evidence is
`output/mobile-matrix-150006/result.json` (SHA-256
`1806e17a411a4cd3dcf12815782ff88d1254060ff567093887d1ce0ab5ab723e`)
and `output/mobile-matrix-150006/logcat.txt` (SHA-256
`726a002eb1c4354491acfc42cb7a6cafd33570eb5e0f15f2b06d606e70a5de8d`).
The log had zero filtered fatal Android, React Native JS, or app ANR entries.
The final screenshot (`final.png`, SHA-256
`f46304f83d9ccf6c0ad443e49eebba90eaa76bf2ec92eb08c5336f840a7e686a`)
visually showed the Catenoid after repeated orbit. Final `dumpsys meminfo`
reported 184,741 KB total PSS and 316,456 KB total RSS; this is one sample,
not a memory-growth trend.
Raw logs are not committed because they may contain device data.

Save to Files produced a Catenoid card. After force-stop and relaunch, both
Workspace and Files retained Catenoid; opening the saved card returned to
Workspace. The owner-observed USB-free relaunch and health check on this exact
APK are pending in [device signoff](mobile-device-signoff.json).

A corrected inspector-aware repeat ran nine further network-backed implicit
previews, alternating Gyroid Slice and Implicit Torus. All 9/9 reported
`Status: ready` without the cached fallback and kept the process alive. Along
with the first Torus preview above, that is 10/10 fresh implicit previews.
Evidence: `output/mobile-extra-matrix-150006/result.json` (SHA-256
`256f5f3ed1741170444a48093af0eda50f84c6029d23cb2e13637c4fa3b4ba91`).
The first automation attempt missed the inspector on two cycles because it
tapped before the sheet opened; opening the sheet showed the preview ready.

## Emulator and CI

The local Android 16 emulator passed clean install, offline Catenoid launch,
inspector swipe and opacity, all five destinations, Explore sections, unsaved
Helicoid restart restore, and fatal-log review on `150006`. The emulator was
left running.

The four shared internal signing credentials were provisioned as GitHub Actions
repository secrets from the existing internal keystore. The manual
[Mobile Android Gate run](https://github.com/expert10000/Math3D/actions/runs/35397425202)
passed shared-key provisioning, APK build, certificate comparison, and Android
16 emulator smoke. The downloaded CI APK is build `150006` from the same source,
with SHA-256 `2429be7ec5887ae20765a0b1341a08fa87856428360a0aa26da3d3eed64ea075`
and certificate SHA-256 `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`.
The CI APK hash differs from the locally tested APK; the two artifacts must not
be treated as interchangeable for physical signoff. Normal CI still uses a
disposable key.

The [iOS simulator run](https://github.com/expert10000/Math3D/actions/runs/35399420885)
built and launched a Debug app, but its screenshot was blank white. That is not
accepted as a visual smoke pass. The workflow now builds an unsigned Release
simulator app to embed JavaScript; its
[Release rerun](https://github.com/expert10000/Math3D/actions/runs/35401091401)
is pending.

## Still open

- Complete the owner-observed USB-free `150006` relaunch and Wi-Fi health check.
- Run the remaining physical cases: 30-second multi-touch pan/zoom and measured
  first interactive frame.
- Build and verify a release AAB with the existing production signing identity,
  or establish the first production key if no identity exists.
- Run iOS simulator sanity and physical iPhone checks where available.
- Back up signing keys and configuration in owner-controlled secure storage
  before external distribution.
