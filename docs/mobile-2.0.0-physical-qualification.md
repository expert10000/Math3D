# Android 2.0 physical-phone qualification

**Result:** Passed the Samsung Android 16 baseline on 2026-11-25. This qualifies the exact internal APK below for the listed phone journeys. It does not qualify a production AAB or wider device coverage.

| Identity | Verified value |
| --- | --- |
| Frozen application source | `300d2420b0cbdac0f04fb9a10fd424ac55f1403a` |
| Internal APK SHA-256 | `d73d197a7cd927e97fead8684a71088993cf76574fa622ba354cf99aba2b5dd8` |
| Internal signing certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |
| Host | Samsung SM-A566B, Android 16 (API 36) |
| Private evidence receipt SHA-256 | `4238bb03ff991669fb97e8df7634d57de14c9c5692cbd0b4c10079bae687cb7b` |

The exact APK installed and first launched. A named Graph survived a cold reopen. Project import and export retained the explicit Graph `x*x`. Portrait and landscape controls, keyboard expression focus and return, and storage recovery passed. The final scoped `AndroidRuntime` and `ReactNativeJS` fatal log was empty.

A project package with one required `graph-point-table` source imported with **1/1 verified and retained** resources. Its Graph opened in the complete project. Export from the phone was byte-identical to the input package: both files have SHA-256 `e8cab7b9412133e10a39842d290d427f84770ddb3364e2a542024287d9f2553e`.

A separate project identity with that sidecar removed imported as a retained preview. The project card reported a missing required source; the explorer showed **0/1** resources, “Missing source bytes,” and a disabled Edit Graph control. Importing the matching complete package through **Import project resources** changed the same saved project to **1/1 verified and retained**; Edit Graph became enabled and opened the Graph. The missing and recovery input hashes are in the private evidence receipt. No app data was cleared during these checks.

## Production AAB gate

The production AAB is **not yet qualified**. At the frozen commit, the checked-in device signoff identifies 1.6.0; this branch updates it for 2.0.0. On 2026-11-25 the owner explicitly confirmed that the same production upload key and verified backup apply to 2.0.0 build 200001. `docs/mobile-release-signing.json` now records that confirmation while preserving the key certificate fingerprint and original backup evidence. Both `node scripts/mobile-device-signoff.mjs` and `node scripts/mobile-release-backup-check.mjs` pass on this branch. No production signing key was available locally. The production workflow still needs to build the AAB, check its signature and certificate against the release record, and generate its release SBOM.

Read-only GitHub Actions inspection on 2026-11-25 found the four expected repository secret names: `MATH3D_ANDROID_RELEASE_KEYSTORE_BASE64`, `MATH3D_ANDROID_RELEASE_STORE_PASSWORD`, `MATH3D_ANDROID_RELEASE_KEY_ALIAS`, and `MATH3D_ANDROID_RELEASE_KEY_PASSWORD`. A 2026-09-30 production AAB run successfully provisioned, built, and verified with these inputs. Secret values are not readable, so the verification-only 2.0 production workflow must confirm that the current CI key still matches the recorded certificate before any publication.

This is a one-device, supported Graph/Project qualification. Other Android devices and production-signed AAB behavior remain unverified.
