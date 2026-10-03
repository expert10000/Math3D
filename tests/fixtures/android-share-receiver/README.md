# Local Android share recipient

This acceptance fixture is a separate app, package
`com.math3d.acceptance.sharereceiver`, with its own Android UID and private files.
It receives `ACTION_SEND` / `application/json` through Android's share chooser.
The recipient opens the granted content URI through `ContentResolver`, saves the
exact stream in its own private directory, and records SHA-256, byte count,
permission flag, provider authority and project identity in `receipt.json`.
There is no network service, contact selection, sender-directory access or
storage permission. It is a debug test fixture, not part of the Math3D APK.

On Windows, build using JDK 17 and Android SDK platform/build-tools 36:

```powershell
./scripts/mobile-android-share-receiver.ps1 -OutputDirectory C:/path/to/local-evidence/receiver
```

Install the fixture on the intended device only if its package is absent. Never
uninstall or clear Math3D data. In Math3D's saved Projects list, choose **Share**
for the public acceptance project, then **Math3D Local Receiver** in the native
chooser. Do not inject an `ACTION_SEND` intent from ADB: the test must exercise
the actual Math3D share button and its URI grant. The recipient must visibly
report **RECEIVED**.

Retrieve `files/receipt.json` and `files/received-project.json` through `adb
exec-out run-as com.math3d.acceptance.sharereceiver cat ...`, preserving stdout
as bytes. `run-as` applies only to this debug recipient. Verify the receipt's
hash, byte count, MIME, identity and successful content-stream read. Compare the
received bytes with the actual exported acceptance file; import the receipt in
an independent host profile and verify export/reload. Record both installed APK
hashes and distinct app UIDs. Remove only this fixture after recording evidence.

The receipt collector verifies both installed APK hashes, the separate recipient
UID and the exact observed share filename before comparing bytes:

```powershell
$env:ANDROID_SERIAL = 'the-connected-device-serial'
node scripts/mobile-android-share-receipt.mjs expected.math3d.project.json C:/path/to/receipt sender-build-info.json receiver-build-info.json observed-share-filename.math3d.project.json
```

For the edited PRJ17 acceptance study, start the renderer preview and verify the
actual received file in a fresh Chromium context:

```powershell
node scripts/mobile-android-share-roundtrip.mjs C:/path/to/receipt/received.math3d.project.json C:/path/to/browser http://127.0.0.1:5186
```

This study's unchanged historical Surface is preview-only. The browser check
asserts that full opening stays disabled, saves the complete imported project,
and compares exported bytes before and after reload. It does not regenerate
companions or silently discard unsupported sources.

This qualifies actual delivery to a separate local Android recipient. Email,
messenger, nearby transfer and delivery to another physical device remain
separate transport cases.
