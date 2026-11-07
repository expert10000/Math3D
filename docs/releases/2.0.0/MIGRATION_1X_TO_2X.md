# Moving 1.x work toward Math3D 2.0

**Release state:** the repository still identifies as 1.7.0. The exact signed 2.0.0 installer and its 1.7→2.0 upgrade gate have not run. This guide describes the current compatibility controls and the procedure to follow once a candidate passes. It is not a claim that every 1.x Project or local profile has been migrated.

## Preserve a recoverable original

1. In the 1.x app, keep a copy of the original Project file and any source folders used by `.qscene` or `.sscene` links. For a Project you need on another computer, choose **Projects → Import / export → Download with resources**. That package includes available source data and Workbooks. **Download project JSON** contains definitions and history but requires resource files to travel separately.
2. Keep the export and a copy of the old user profile outside the installation directory. Do not overwrite or rename the original to make an unsupported format appear current.
3. Install a signed 2.0 candidate only after its hash, signer, and release identity are recorded. The clean-VM [upgrade gate](INSTALL_UPGRADE_GATE.md) first seeds a Graph Project and a setting in the published 1.7.0 app, backs up the profile, then installs 2.0 in place and checks the original saved bytes and reopen behavior.
4. In the new app, choose **Projects → Import / export → Import a project file**. Review the **Import preview** before **Open project** or **Save to library**. **Cancel** leaves the current workspace and library unchanged. **Save to library** keeps the current workspace open; **Open project** saves the import and switches workspaces when the host can restore it.
5. Inspect the document compatibility and external sidecar list. Reopen key documents, Results, Notes, and Workbooks; compare source identity, revisions, and important values with the original. Export the new copy independently and verify it can be imported again before retiring the old environment.

## What the compatibility review means

The current canonical named Project uses `math3d.project` schema version 1; a 2.0 application version does not automatically imply a new Project envelope. The importer also recognizes supported older mixed-workspace and Graph handoff forms through explicit adapters. Validation checks document replay, identities, required capabilities, source sidecars, and host editor support. Unsupported or future envelopes are refused rather than silently reinterpreted. An older unversioned analysis summary can remain limited evidence; it must not be promoted to an exact or certified result.

| Review result | Action |
| --- | --- |
| **Editor supported**, required sources available | Open the Project and verify key documents and saved outputs. |
| **Preview only** for a document | Inspect it without assuming this host can restore its editor. Use a supported host or retain the original for editing. |
| Required source sidecar missing or unverified | Find the complete **Download with resources** package or original source data. Do not replace bytes with a same-named file. |
| Optional analysis cache missing | Source may still open, but cached output remains unavailable until a supported recomputation or exact artifact is restored. |
| External scene folder moved or changed | Relink an exact `.qscene` or `.sscene` bundle; opening rechecks its fingerprint. Project JSON does not embed the scene arrays. |
| Persistent storage unavailable | Keep the export; the preview cannot safely save or open into that host's library. |

## Current limits and pending qualification

- **Version coverage:** a focused 1.7→2.0 installed upgrade script exists, but no 2.0 candidate has executed it. The broader 1.4/1.5/1.6/1.7 corpus named in the [roadmap](ROADMAP.md) needs exact artifact and format evidence before universal migration claims.
- **Host coverage:** Windows desktop and local browser have source-build Project tests. Hosted browser storage/deployment, Android device round trips, and installed Linux package journeys remain limited in the [capability matrix](PLATFORM_CAPABILITIES.md). A mobile preview may preserve a Project subset without editing desktop-only documents.
- **Resource coverage:** source sidecars and Workbook bytes can travel in a verified Project package; external quantum/scientific scene folders remain separate. Optional analysis artifacts and thumbnails may stay local.
- **Scientific meaning:** old results keep their recorded source and method. A changed convention or algorithm in a newer app does not silently recalculate or upgrade historical values. See [scientific conventions](SCIENCE_CONVENTIONS.md).
- **Recovery:** the installed upgrade test retains an unmodified profile copy in its clean VM work root. Ordinary imports have a compatibility review and transactional backup/rollback paths, but users should keep their own export and profile backup until the exact candidate passes release qualification.

If a migration fails, cancel the import or close the new app, preserve the original bytes and error text, and use the old app/profile to continue work. Report the old and new app versions, Project format/schema, host, missing resource IDs or checksums, and the first incompatible document. Never repair a failure by editing a saved Project's JSON or source fingerprint by hand.
