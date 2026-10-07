# Samsung Project Notes verification — October 7, 2026

The physical Notes journey passed in the standalone **Math3D Notes Check** app
on a Samsung SM-A566B running Android 16. Internal-channel acceptance remains
pending because its original signing configuration has not been located.

## Build identity

- Final source: `439823a032301f785313e7987e1b27cd9075003e`.
- Application ID: `com.math3d.mobile.notesverification`.
- Version/build: `1.6.0-notescheck` / `150008`.
- APK SHA-256: `5d1e1c6b0c2ec7b0bdd7352fad9120975be8839c952a756fc0be83507dc17a34`.
- Debug certificate SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Fixture SHA-256: `585ca68358ee14d60a9ae45ac1fc160a8019b27fb0fbe1e34538b06f558313fb`.

The fixture import and initial Note creation used source `10fd40f99029972a01fd36cdbeb3143c14a74bda`.
The isolated app was then updated in place to the final source for keyboard,
editing, export, and cold-restart checks. Both builds bundle JavaScript and launch
without Metro. APK signature verification passed. Existing handset apps and
their projects were preserved.

## Results

| Check | Result |
| --- | --- |
| Standalone launch and initial Catenoid viewer | Passed |
| Native picker import of the resource package | Passed |
| Workbook problem statement and formula readable | Passed |
| Existing Derivative source Note readable | Passed |
| Create global Note and Workbook block Note | Passed |
| Edit global title/body and block body | Passed |
| Portrait editing and save with keyboard open | Passed |
| Landscape editing and save with Samsung floating keyboard | Passed |
| Force-stop, reopen, and read edited Notes | Passed |
| Compare exports before and after cold restart | Passed: byte-identical |
| Filtered app-process error/crash log review | No entries |
| Mobile typecheck and existing Note model tests | Passed: 2 tests |
| Standalone Android build | Passed |

The original Projects editor remained behind the portrait keyboard. The fix adds
keyboard avoidance to the non-workspace shell and lets handled presses reach the
scroll content while the keyboard is open. Workspace and Gallery retain their
existing keyboard handling. In landscape the handset uses a floating keyboard;
the Note text and a portion of Save remain reachable beside it.

## Persistence evidence

Native exports at `12:14:19Z` before force-stop and `12:16:05Z` after reopening
contain the same **12,108 bytes**, SHA-256
`7c76fe2fff4a7c061576aa48f61f24a204e0f080a8af0ac94de43f16844d7b37`.

Project identity remains `math3d:project:e5a400fab3b2e2a5024ab1a72f19bece`,
revision 7. The global Note retains its ID and null anchor, with title
`Samsung Global Note edited` and body `Samsung global body v2`. The block Note
retains its ID and exact anchor, with body `Samsung block body v2`:

```json
{
  "blockHash": "sha256:cc76c783ff7d5024de2c808207232dca2369821e6d64a6840bed6328930a4934",
  "blockId": "graph-derivative-notebook-web-journey-2",
  "kind": "workbook-block",
  "workbookId": "math3d:workbook:100b7678bf82a399c873e568199ad74e",
  "workbookRevision": 1
}
```

The original Note, Workbook resource bytes, and project workspace match the
initial export. Device power/rotation settings were restored after testing.

Local artifacts are in `output/mobile-notes-device/`: `acceptance.json`,
`build-info.json`, `export-verification.json`, the native exports, APK, build logs,
filtered app logs, and screenshots. `verify-exports.mjs` independently compares
the distinct pre/post export files and checks Note identities, text, and anchors.
Large APKs, screenshots, and raw phone logs are local artifacts, not Git contents.

This result covers the isolated package and tested journey. Updating the existing
`com.math3d.mobile.internal` app still requires its original signing key and a
matching internal build; this report does not change general device signoff or
approve the internal channel.
