# Damaged project-store recovery checks

The mobile reader and writer use the same directory-scoped storage service in
normal operation and in the native recovery diagnostic. Diagnostic damage is
confined to `Paths.document/math3d-mobile-recovery-check`; no action accepts a
path from the UI. The real `math3d-mobile` library is read only, fingerprinted
before and after. Sample data contains a named Graph/Curve/Surface study with
relations and results, plus a Scene project.

Build an internal APK with `MATH3D_PROJECT_RECOVERY_CHECKS=1`. The Android CI
workflow enables this flag and records it in `build-info.json`. The normal
configuration hides the diagnostic controls. Install the matching signed APK
as an upgrade; never uninstall or clear data on a user's handset.

Run `scripts/mobile-android-storage-recovery.mjs` with `ANDROID_SERIAL` set to
the intended device. Optional `MATH3D_MOBILE_ARTIFACT_DIR` and
`MATH3D_RECOVERY_OUTPUT` select the local build metadata and evidence directories.
The runner checks the installed APK hash, opens Settings, prepares the isolated
matrix, force-stops the process, relaunches and verifies persisted repair. It
never installs, uninstalls, clears app data or requires root/debug access.

The nine preparation cases cover first-save backup initialization; truncated,
missing and blank primary repair; a healthy primary with a damaged backup;
both copies damaged; a newer unsupported primary; legacy migration; and a
recovery/save queue. The tenth case repairs a damaged primary after an actual
process restart, with uncommitted staging files present. After recovery, another
reader must select the repaired primary and recover exactly the original data.

Use **Settings → Export recovery report** to save the detailed JSON through the
native directory picker. Keep `native-result.json`, the screenshot, exported
report, APK/build/certificate hashes and source commit together. Emulator
evidence and physical-handset evidence are separate qualifications.

Read errors, disk-full failures, rename rollback, failed cleanup and failed
repair are covered by fault-injected unit checks. Native damage uses real Expo
private files; it does not manufacture operating-system I/O faults or fill the
device's disk. When both copies are invalid, or a primary has an unsupported
schema, loading reports an error and saving preserves the original files.
Recovery from that state requires a valid storage backup; the diagnostic does
not provide a user-library reset or overwrite action.
