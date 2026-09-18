# Mobile build 150006: network and release matrix evidence

Date: September 18, 2026. This record separates checks completed on the exact
internal APK from release work that still needs a credential or physical device.

## Approved internal APK

| Field | Value |
| --- | --- |
| Source commit | `e36ec7ba90b8da2b3e53b4cdbf6c5df6cab5eb1c` |
| Application ID / version | `com.math3d.mobile.internal` / `1.5.0-internal` |
| Android build | `150006` |
| APK SHA-256 | `9d1a002d677a32a6ea75b84d018b4c632eccafb15ff9c3d0c9ff7799bc8d0227` |
| Signing certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |

The APK was built from clean tracked source. `apksigner` verified the same
internal signing certificate used on the Samsung for build `150004`.
The [approved device signoff](mobile-device-signoff.json) covers this exact
APK, including the owner's USB-free Catenoid restore after closing the app.
The local approved archive is
`artifacts/mobile/Math3D-mobile-1.5.0-internal-150006-approved.zip` (SHA-256
`6ad8e93ad0e8241352650e6d653f8fc82603e685ac9a7d4c1045afdd81f74f6f`).
It contains the exact tested APK, build metadata, checksum, and tester note.
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
Workspace. The owner then confirmed a USB-free relaunch restored Catenoid on
this exact APK. Worker health and implicit previews used the phone's Wi-Fi
route without ADB reverse while USB was connected for diagnostics; a separate
owner-observed USB-free health check was not recorded.

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

The first production/upload key was created outside Git. Its public certificate
SHA-256 is `66a86e95eaf60f8d2224dd06ad5ef4eec6c856ca2b5e32dc954384bc6ad41be3`
in [mobile-release-signing.json](mobile-release-signing.json). All four release
signing secrets are configured in GitHub Actions. A local production AAB from
commit `6c128cd87351b3010fa801aeb543ea0ca2db5080` passed checksum, embedded
certificate, and `jarsigner` verification. Its SHA-256 is
`008620ed336ba77fcc4f1d734f65781dcd53e2a1fd492af6fa5d052db47693c1`.
The local [AAB archive](../artifacts/mobile/Math3D-mobile-1.5.0-release-150006-6c128cd.zip)
has SHA-256 `c0f9f9d9cd11f27a7ee737adae43a3e45df0ca564d38928ec7714195caaaa19f`.
The [production AAB CI run](https://github.com/expert10000/Math3D/actions/runs/35405368898)
also passed. Its downloadable artifact (ID `10572113936`) contains a separately
built AAB with SHA-256
`52681593987e20250d780a63cf89691720d0bf44bf86029df69c96fc499fc4f0`.
Its build metadata and verification report match that hash and source commit;
independent `keytool` inspection of the downloaded AAB matched the public
release certificate. The CI artifact ZIP has SHA-256
`9e19a44fbaf4568b9aab18923cc6c80bf93770cbec816db9cc5511df2818171f`.

The [iOS simulator run](https://github.com/expert10000/Math3D/actions/runs/35399420885)
built and launched a Debug app, but its screenshot was blank white. That is not
accepted as a visual smoke pass. The workflow now builds an unsigned Release
simulator app to embed JavaScript; its
[Release rerun](https://github.com/expert10000/Math3D/actions/runs/35401091401)
passed build, install, and launch. Its screenshot (SHA-256
`ff481a5cb375413faeec902deae31d52bbce27613dc04fa0fee44d69e6a7eb7f`)
shows the Workspace shell, Catenoid title, inspector, and five destinations.
The viewport is a uniform pale rectangle: 0 of 5,135 sampled viewport pixels
varied materially from its center. iOS simulator **shell launch passes; 3D
rendering does not pass**. A screenshot gate now rejects a blank app or blank
viewport. Its [45-second gate run](https://github.com/expert10000/Math3D/actions/runs/35403064988)
failed specifically with `Simulator 3D viewport is blank after launch` and
`0` varied samples. The 15- and 45-second screenshots were byte identical
(each SHA-256 `b94e1d97441349836ac2b1f7313483df5b51581878c293881fe9ffd1de804562`).
Physical iPhone rendering remains untested. The cause of the blank simulator
GL viewport is not yet established.

## Still open

- Confirm worker health from the unplugged phone if USB-free compute is an
  explicit external release criterion; the observed traffic already used Wi-Fi.
- Run the remaining physical cases: 30-second multi-touch pan/zoom and measured
  first interactive frame.
- Resolve the blank iOS simulator viewport and test rendering on a physical
  iPhone where available.
- Back up signing keys and configuration in owner-controlled secure storage
  before external distribution.
