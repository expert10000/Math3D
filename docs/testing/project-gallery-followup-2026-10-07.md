# Projects follow-up verification — October 7, 2026

Base: `25d4c3c`, branch `codex/gallery-performance-platform-baseline`.

## Gallery navigation

Selecting Projects now opens it idempotently. Repeated navigation activation
preserves the Gallery and its current filters; the existing Close action closes
it. The regression covers repeated activation and native Electron resizing,
including matching the renderer viewport after DPI rounding.

The original intermittent filter failure could not be reproduced in five
baseline repeats. Its trace showed the Gallery disappearing while clicking a
filter, but did not establish the cause. The change hardens reactivation rather
than claiming a proven diagnosis of that original failure.

All eight Gallery navigation journeys passed, including narrow-window access,
Notes beside the viewer, saved Catenoid reopening, copy reuse and missing data.
The Project detail journey passed save, export and cold reopen after converting
the new binary resource archive to the legacy base64 archive format. Its evidence
screenshot uses a page capture with animations disabled to avoid an element
stability timeout.

## Opening performance and bundle

Resource archives now store detached binary bytes in IndexedDB. Portable exports
retain the existing base64 format, and previous archive records still load.
Backup capture uses asynchronous native SHA-256 where available, preserving
checksum, ownership and domain validation. It snapshots inputs before yielding
and rejects opening if the live workspace changes while preparing the backup.

The desktop entry bundle changed from 3,457.97 kB to 3,143.55 kB. Existing Surface
control components and their helper dependencies were extracted from App into
`surfacePanels.tsx` and `surfacePanelShared.tsx`; the controls load lazily in a
292.37 kB chunk. The entry remains above the existing 2,400 kB warning threshold.

The 25-project benchmark measured saved-card opening at 2,827 ms before the work
and 447 ms in the final run. Final phase timings were compatibility 7 ms, capture
23 ms, backup document 60 ms, backup resources 102 ms and commit/restore 138 ms.
Before native hashing, backup resources took 2,023 ms. These are local samples,
not a latency guarantee; a run during other machine activity took 2,235 ms.
The test records phase timings in its JSON artifact for future comparisons.

Final focused evidence is under `test-results/project-open-native-final`; Gallery
navigation evidence is under `test-results/gallery-final-verification`.
Resource/transfer/Notes unit tests passed (24), mobile Notes/resources models
passed (6), and the existing F01 baseline passed its 28 unit checks and both
desktop laboratory workflows. Desktop and mobile typechecks, production desktop
and web builds, and kernel dependency boundaries passed.

## Remaining physical mobile gate

The Notes device journey and read-only preflight are prepared in
`../mobile-project-notes-device-acceptance.md`. A local signed internal APK was
found under the October 4 PRJ28–30 candidate build, but its source commit
`99363f9c77627a00def9f62a544b5455d6978d6d` predates the Notes delivery. Its preflight
reported differing mobile/shared sources and no connected physical ADB handset.
The Samsung SM-A566B subsequently connected and is authorized through ADB.
The existing internal signing configuration has not yet been located. Physical
acceptance remains pending; earlier Samsung signoff does not cover these changes.

F01 was already delivered on main. The new `test:platform:baseline` commands
make its frozen fixtures and desktop workflows directly runnable, and the
manifest gate checks that its referenced files exist. The combined application
kernel roadmap remains the authority for subsequent work.
