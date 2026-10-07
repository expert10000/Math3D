# Mobile Project Notes: physical-device acceptance

Status on October 7, 2026: the physical Notes journey passed in the isolated,
standalone `Math3D Notes Check` package on the Samsung SM-A566B (Android 16).
See [the device report](mobile-project-notes-samsung-20261007.md) for build identity
and export verification. Testing found and fixed a keyboard overlap in Projects.

Internal-channel acceptance remains pending: the existing internal-signing
configuration has not been located, so the installed internal app was not updated.
The local October 4 candidate APK predates Notes and fails the source check.
The September 30 Samsung baseline signoff does not cover the subsequent Notes
editing delivery. The isolated debug-signed test does not approve that channel.

## Prepared input and build

Use `tests/fixtures/project-workbook-note-journey.json`, an ordinary resource
package containing a Project, a verified Workbook and a saved Note. Importing it
creates a separate copy; do not clear the handset's existing app data.

Build `npm run mobile:android:internal` using the existing internal signing
configuration, or supply the signed APK and its matching `build-info.json` from
the same source revision. Do not replace the internal signing key.

For a build from this branch, commit the intended mobile/shared source changes
before building so that the APK's recorded commit identifies those exact files.
The preflight rejects uncommitted differences in these source directories. Run:

```powershell
node scripts/mobile-project-notes-preflight.mjs
# For supplied artifacts:
node scripts/mobile-project-notes-preflight.mjs --apk C:/path/app.apk --build-info C:/path/build-info.json
```

The report identifies the APK checksum, source commit, fixture checksum and
physical handset. It checks the mobile and shared-package sources, including
working changes. `ready-for-device-test` means the inputs are ready; it is never
an acceptance approval. A missing or unauthorized handset remains pending.

## Device journey

1. Install/update the matching internal APK without clearing data. Record its
   signing certificate, version/build, APK SHA-256, source commit, handset model,
   Android version and test time. Confirm standalone launch.
2. Transfer the fixture to Downloads and import it through Projects → Math3D
   project. Open the imported card and Explore Workbooks, Notes and documents.
   Confirm the Workbook resource is verified and the existing Note is readable.
3. Open its Workbook and read a block. Add a Note on that block with a distinct
   title and body. Save it and confirm the saved block anchor.
4. Add a global Project Note. Edit its title and body, then edit the block Note's
   body. Confirm each update reports a successful save.
5. Force-stop and reopen the internal app. Open the same imported Project,
   Workbook and Notes. Confirm both texts, the unchanged Project identity and
   exact Workbook/block anchor survived. Missing resources or targets must stay
   explicitly unavailable rather than silently rebinding.
6. Repeat reading/editing in portrait and landscape with the keyboard open.
   Capture screenshots of the editor, saved block Note and reopened Note. Check
   logcat for app crashes or unhandled errors during the journey.

Record results and evidence paths for every step, plus an exported Project
package if available. A failed step leaves Notes acceptance pending. Preserve
existing general mobile signoff; publish this Notes-specific evidence separately.
