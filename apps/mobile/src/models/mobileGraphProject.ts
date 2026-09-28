import { createEmptyGraph2DDocument, createGraph2DDocument, parseGraph2DDocument, serializeGraph2DDocument,
  parseGraph2DExpression, inspectGraph2DCompatibility, migrateGraph2DDocument, parseMixedWorkspaceDocument,
  createMixedWorkspaceDocument, serializeMixedWorkspaceDocument,
  matchesScientificSourceGeneration, viewerSourceFromDocument,
  GRAPH2D_MAX_DOCUMENT_BYTES, type Graph2DDocument, type MixedWorkspaceDocument } from "@math3d/core";
import type { MobileStoredSceneProject } from "./mobileScene";

export const storeMobileGraph = (document: Graph2DDocument, now = Date.now(), workspace?: MixedWorkspaceDocument | null): MobileStoredSceneProject => ({
  projectType: "graph2d", id: document.identity.id, title: document.metadata.title,
  updatedAt: now, lastOpenedAt: now, serializedProject: workspace ? serializeMixedWorkspaceDocument(replaceMobileGraphCheckpoint(workspace, document)) : serializeGraph2DDocument(document),
});

export const readMobileGraphWorkspace = (project: MobileStoredSceneProject): MixedWorkspaceDocument | null =>
  (JSON.parse(project.serializedProject) as { format?: string }).format === "math3d.mixed-workspace" ? parseMixedWorkspaceDocument(project.serializedProject) : null;

export const replaceMobileGraphCheckpoint = (workspace: MixedWorkspaceDocument, document: Graph2DDocument): MixedWorkspaceDocument => {
  const graphs = workspace.entries.filter((entry) => entry.module === "graph2d");
  if (graphs.length !== 1 || graphs[0]!.expected.id !== document.identity.id || workspace.entries.some((entry) => entry.replay !== null))
    throw new TypeError("Mobile requires one Graph and checkpointed companion documents. Export checkpoints on desktop first.");
  return createMixedWorkspaceDocument({ ...workspace,
    entries: workspace.entries.map((entry) => entry.module === "graph2d" ? { module: "graph2d", checkpoint: document, expected: document.identity, replay: null } : entry),
    // Never persist a selection captured from a now-stale Graph generation.
    committedSelection: workspace.committedSelection?.source.documentId === document.identity.id &&
      !matchesScientificSourceGeneration(workspace.committedSelection.source, viewerSourceFromDocument(document)) ? null : workspace.committedSelection });
};
export const mobileGraphWorkspaceNeedsIdentityFork = (workspace: MixedWorkspaceDocument | null): boolean => !!workspace &&
  (workspace.entries.length > 1 || workspace.results.length > 0 || workspace.artifacts.length > 0 || workspace.relations.length > 0 || workspace.constructions.length > 0);
export const updateStoredMobileGraph = (project: MobileStoredSceneProject | undefined, document: Graph2DDocument, now = Date.now()) =>
  ({ ...project, ...storeMobileGraph(document, now, project ? readMobileGraphWorkspace(project) : null) });

export const readMobileGraph = (project: MobileStoredSceneProject): Graph2DDocument => {
  if (project.projectType !== "graph2d") throw new TypeError("Not a Graph project.");
  const workspace = readMobileGraphWorkspace(project);
  const graphs = workspace?.entries.filter((entry) => entry.module === "graph2d");
  if (workspace && (graphs!.length !== 1 || workspace.entries.some((entry) => entry.replay !== null)))
    throw new TypeError("Mobile requires one Graph and checkpointed companion documents.");
  const document = parseGraph2DDocument(workspace ? JSON.stringify(graphs![0]!.checkpoint) : project.serializedProject);
  if (document.identity.id !== project.id || document.metadata.title !== project.title)
    throw new TypeError("Graph project identity is inconsistent.");
  return document;
};

export const createMobileGraph = (title: string, withExample: boolean, stableKey: string): Graph2DDocument => {
  const name = title.trim().slice(0, 160) || (withExample ? "Line graph" : "Graphs");
  if (!withExample) return createEmptyGraph2DDocument(stableKey, name);
  const parsed = parseGraph2DExpression("x", ["x"]);
  if (!parsed.ok) throw new Error("Invalid graph starter.");
  return createGraph2DDocument({ stableKey, title: name, source: { objects: [{ id: "function_1", label: "f",
    kind: "explicit-cartesian", expression: { source: "x", variable: "x", ast: parsed.ast },
    domain: { min: -10, max: 10, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
};

export const mobileGraphCapabilities = (document: Graph2DDocument): string => {
  return `Graph · ${document.source.objects.length} objects · explicit, parametric, polar, implicit, inequality, piecewise and data authoring and probes. Explicit-only numerical analysis and saved pins. Data sidecars transfer separately.`;
};

/** Imports a portable Graph document or one unambiguous Graph checkpoint from a mixed workspace. */
export const importMobileGraph = (raw: string, projects: readonly MobileStoredSceneProject[], sourceName: string,
  now = Date.now(), sourceKind: "imported" | "desktop" | "shared" = "imported"): MobileStoredSceneProject => {
  if (new TextEncoder().encode(raw).length > 32 * 1024 * 1024) throw new TypeError("Graph import exceeds its size limit.");
  let value: unknown = JSON.parse(raw);
  let workspace: MixedWorkspaceDocument | null = null;
  if ((value as { format?: string })?.format === "math3d.mixed-workspace") {
    workspace = parseMixedWorkspaceDocument(raw);
    const graphs = workspace.entries.filter((entry) => entry.module === "graph2d");
    if (graphs.length !== 1) throw new TypeError("Import a workspace with exactly one Graph document.");
    if (workspace.entries.some((entry) => entry.replay !== null)) throw new TypeError("Export checkpointed documents before importing on mobile.");
    value = graphs[0]!.checkpoint;
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > GRAPH2D_MAX_DOCUMENT_BYTES)
    throw new TypeError("Graph document exceeds its size limit.");
  const compatibility = inspectGraph2DCompatibility(value);
  if (compatibility.status === "unsupported" || compatibility.status === "corrupt")
    throw new TypeError(`${compatibility.reason} ${compatibility.unsupportedCapabilities.join(", ")}`.trim());
  const normalized = migrateGraph2DDocument(value);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const source = normalized.value;
  let document = source, suffix = 1;
  if (mobileGraphWorkspaceNeedsIdentityFork(workspace) && projects.some((project) => project.id === document.identity.id))
    throw new TypeError("This mixed Graph workspace already exists. Open it locally, or fork its identities on desktop before importing another copy; companions will not be discarded.");
  // Raw Graph-only identity collisions import a copy; never implicitly replace local work.
  while (projects.some((project) => project.id === document.identity.id))
    document = createGraph2DDocument({ source: source.source, display: source.display, selection: source.selection,
      title: `${source.metadata.title.slice(0, 140)} import ${suffix}`, stableKey: { importOf: source.identity.id, copy: suffix++ } });
  if (workspace && document.identity.id !== source.identity.id) workspace = null; // Graph-only collision copy, no companions to lose.
  return { ...storeMobileGraph(document, now, workspace), source: { kind: sourceKind, name: sourceName.trim().slice(0, 240) || "Graph file",
    sourceProjectId: source.identity.id, importedAt: now } };
};
