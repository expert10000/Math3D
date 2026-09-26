# Project handoff contract

`math3d.project-handoff` version 1 wraps a validated `math3d.scene-project` v1 document. Its manifest records producer platform/name/version, stable project ID, a SHA-256 revision of the scene, an optional base revision, a scene content hash, required capability IDs, and result descriptors. Result descriptors identify external results; they do not imply that result bytes are embedded.

`deserializeProjectHandoff` accepts old scene-project v1 files by migrating them into a legacy handoff with no base revision. It does not invent ancestry. Imports reject mismatched IDs, content hashes, malformed revisions, and unknown handoff versions. `serializeProjectHandoff` writes canonical JSON for repeatable exchange.

The revision is a content hash of the full scene, including its metadata and update time. A host must compare an incoming base revision against its current project revision before replacing an existing project. A mismatch is a conflict; it must not be silently overwritten.
