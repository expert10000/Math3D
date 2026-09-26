# Mobile project library sections

MOB65 organizes the single saved-project list into filter views: **All**, **My Projects**, **Imported**, **Shared**, and **Files**. It does not create duplicate project records or stores.

- **My Projects** contains locally created projects, including templates and local duplicates.
- **Imported** contains Math3D project imports and desktop project files.
- **Shared** contains projects explicitly opened through the Shared project entry point.
- **Files** contains every project created from a selected file, including imported, desktop, and shared sources. A project can appear in Imported or Shared and Files because these are filters over one record.

The optional source metadata on a saved project records source kind, the selected file name, original project ID, and import time. Existing saved projects have no source metadata and remain valid as My Projects. Rename, open, and save retain source metadata; duplicating a project creates a new local project.

Cards show origin, compatibility, object count, update time, and source file where applicable. The latest persisted worker job is shown when available. A ready preview is reported only for the currently open project; a completed worker job for another project is marked for recheck on open. Search covers title, ID, origin, and file name; recent, updated, and title sorting apply within every filter.
