# SAGE-F04 typed algebra results in Workbook

In Workbook, add a **Project reference** block and choose a saved algebra operation under **Typed algebra result**. The cell retains the exact Sage request and typed result, pinned Project object ID/revision and content hash, result hash, backend/version, duration, warnings, and job ID. It accepts only Project-validated algebra evidence and limits saved cell size to 256 KiB.

After saving and reopening a Project Workbook, the cell resolves the pinned algebra revision against the Project. A newer revision or archive is visibly **stale**; missing or mismatched evidence is **missing**. The old exact result remains visible. The explicit **Recompute pinned request** action replays through the bounded Sage execution registry, supports cancellation, and replaces the saved cell only after the returned result passes the same evidence parser. It does not silently retarget to a newer object revision. Link a new result to adopt that revision.

Unit acceptance covers Project Workbook byte roundtrip, request/result retention, current→stale transition after revision 2, missing Project, explicit bounded-run callback after reopen, and forged result rejection. F02 and F03 focused acceptance checks run alongside F04. A live Docker/WSL recompute was not part of this unit acceptance; the UI reports backend failure without replacing the pinned result.
