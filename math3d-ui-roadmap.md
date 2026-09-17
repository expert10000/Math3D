# Math3D UI roadmap

## 3. Unify the Inspector

Every workspace should use the same outer Inspector structure:

1. Summary
2. Selection
3. Geometry
4. Analysis
5. Diagnostics
6. Provenance
7. History

The small object summary stays visible while the selected category scrolls beneath it. Modules add domain-specific views inside these categories; they do not add another competing row of top-level Inspector tabs. For example, Complex analysis groups Branch, Monodromy, Residues, Laurent and Covering under Analysis.

## 4. Make the side panels genuine IDE docks

The three-pane workspace remains tools/editor, viewer and inspector. Left and right docks are independently resizable, collapsible and persisted per module/workspace. The recommended sizes are deliberately different: Geometry and Complex start wider on the left, while Mesh starts wider on the right for analysis.

The dock controls also provide a viewer-focus mode and a reset to the workspace's recommended width. Divider double-click is reserved as a shortcut for that same reset behavior.
