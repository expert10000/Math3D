import { createGraph2DWorkspaceProject } from "./graph2dPersistence";
import { parseGraph2DDocument, type Graph2DDocument, type Graph2DPointTableReference } from "./graph2dDocument";
import { createMixedWorkspaceDocument, parseMixedWorkspaceDocument, type MixedWorkspaceDocument } from "./mixedWorkspace";
import { forkGraph2DWorkspaceProject } from "./graph2dPersonalProjects";
import { parseWorkspaceProjectHandoff } from "./workspaceProjectHandoff";

export type Graph2DPersonalPresetPreview = Readonly<{
  workspace: MixedWorkspaceDocument;
  document: Graph2DDocument;
  format: "Graph document" | "Graph workspace" | "Graph handoff";
  missingTables: readonly Graph2DPointTableReference[];
  externalTableCount: number;
  companionCount: number;
  resultCount: number;
  externalArtifactCount: number;
}>;

/** Inspect existing portable Graph formats without saving or changing the current workspace. */
export function inspectGraph2DPersonalPreset(raw: string, tableAvailable: (reference: Graph2DPointTableReference) => boolean): Graph2DPersonalPresetPreview {
  if (new TextEncoder().encode(raw).length > 32 * 1024 * 1024) throw new TypeError("Graph preset file exceeds the 32 MB import limit.");
  const header: unknown = JSON.parse(raw);
  if (!header || typeof header !== "object" || !Object.hasOwn(header, "format")) throw new TypeError("Choose a Math3D Graph document or handoff file.");
  const format = (header as { format: unknown }).format;
  const workspace = format === "math3d.project-handoff" ? parseWorkspaceProjectHandoff(raw).project :
    format === "math3d.mixed-workspace" ? parseMixedWorkspaceDocument(raw) :
      format === "math3d.graph2d-document" ? createGraph2DWorkspaceProject(parseGraph2DDocument(raw)) :
        (() => { throw new TypeError("Unsupported Graph preset file format."); })();
  const checked = createMixedWorkspaceDocument(workspace);
  if (checked.entries.filter(entry => entry.module === "graph2d").length !== 1 ||
    checked.entries.some(entry => entry.replay !== null || !["graph2d", "curve", "surface"].includes(entry.module)))
    throw new TypeError("A personal preset requires one checkpointed Graph and supported Curve/Surface companions.");
  const document = checked.entries.find(entry => entry.module === "graph2d")!.checkpoint as Graph2DDocument;
  const tables = document.source.objects.flatMap(object => object.kind === "point-series" ? [object.table] : []);
  const missingTables = tables.filter(reference => !tableAvailable(reference));
  return { workspace: checked, document,
    format: format === "math3d.project-handoff" ? "Graph handoff" : format === "math3d.mixed-workspace" ? "Graph workspace" : "Graph document",
    missingTables, externalTableCount: tables.length, companionCount: checked.entries.length - 1,
    resultCount: checked.results.length, externalArtifactCount: checked.artifacts.length };
}

/** Imported projects always get fresh Graph/companion identities and independent ancestry. */
export function forkGraph2DPersonalPreset(preview: Graph2DPersonalPresetPreview, token: string): MixedWorkspaceDocument {
  if (preview.missingTables.length) throw new TypeError("Import the required point-table sidecars before accepting this preset.");
  return forkGraph2DWorkspaceProject(preview.workspace, token, preview.document.metadata.title);
}
