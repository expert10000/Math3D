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

The production AAB is **not qualified**. At the frozen commit, `node scripts/mobile-device-signoff.mjs` fails because the checked-in device signoff still identifies 1.6.0; this record updates that signoff for 2.0.0 and passes the device gate on this branch. `node scripts/mobile-release-backup-check.mjs` still fails because `docs/mobile-release-signing.json` identifies 1.6.0, and no 2.0 production signing key was available locally. The production workflow must verify the owner-controlled key backup, build the AAB, check the AAB signature and certificate, and generate its release SBOM before distribution.

This is a one-device, supported Graph/Project qualification. Other Android devices and production-signed AAB behavior remain unverified.
