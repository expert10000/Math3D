# CI baseline correction — 2026-09-29

The Android gate at `933c9cb` installed and opened successfully, then failed looking for `50%`. Its uploaded UI evidence showed Object controls with no selected object. The smoke now opens Scene and selects its accessible object row. Selection automatically opens Object; the test checks Opacity there, then scrolls within the inspector's measured native ScrollView before choosing 50%.

The smoke follows the current Examples/Learn and Projects navigation. It distinguishes the Helicoid search field from the Helicoid result card by resource ID and verifies that the opened scene survives a process restart. The quality matrix resolves text and accessibility names, measures bottom tabs instead of duplicate headings, sizes the logical display directly to test landscape dimensions even when hosted emulators ignore rotation locks, accepts the landscape Expand inspector control, and scrolls editor fields into its measured ScrollView.

An isolated local Android 16 emulator passed all six focused smoke checks with the CI-built internal APK from `8359ef1`. The final matrix script passed four layouts plus seven lifecycle cases against the CI-built internal APK from `33c08d7`. The hosted gate remains the acceptance authority. Cancelled professional/general CI runs at the original baseline revision had no steps and provide no acceptance evidence.

The Windows geometry smoke's injected error check now waits for pending mesh state updates to settle and allows five seconds for the error snapshot to render. The resulting renderer build and local geometry smoke passed.
