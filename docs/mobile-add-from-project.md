# Mobile add from project

MOB64 adds **Workspace → Add to Project → Objects from project**. The source may be another saved local project or a selected Math3D project file. The source project is read as a snapshot and is never mutated.

The preview lists each source surface object, its compatibility, approximate serialized transfer size, and declared internal dependencies. A selection must include every dependency target. Incompatible objects remain visible with a reason and cannot be selected. A second preview shows the selected objects, collision remaps, dependency count, and transfer size before confirmation.

The commit rebuilds the composition plan against the current destination, validates the shared scene-object envelopes and dependency references, and saves the destination once. A failed validation, cancellation, or storage error leaves the destination and source unchanged. A successful addition remains undoable through the existing Workspace Add undo action. Imported mesh geometry and object presentation are retained in the destination project.

Declared dependencies use the `math3d.scene-object.dependencies.v1` scene extension. Their endpoints and JSON pointer references are rewritten by the shared MOB63 planner, and the remapped declarations are stored alongside the imported objects.
