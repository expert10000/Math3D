# CI baseline correction — 2026-09-29

The Android gate at `933c9cb` installed and opened successfully, then failed looking for `50%`. Its uploaded UI evidence showed Object controls with no selected object. The smoke now opens Scene, selects its accessible object row, and opens Object before checking opacity. It also uses the current Projects navigation and New Project entry; the quality matrix uses Projects too.

Both scripts pass Node syntax checks. Remote emulator acceptance is recorded after running the updated gate. Cancelled professional/general CI runs at that revision had no steps; they provide no acceptance evidence.
