import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { listProjectScientificSelections, migrateProjectScientificSelections,
  parseMath3DProject, upsertProjectScientificSelection, viewerSourceFromDocument,
  createStableDocumentId, createMath3DProject, instantiateMath3DProjectTemplate, type ScientificSelection } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { ProjectCursorInspector, projectPointCursorFrame, vectorPointCursorAvailability } from "./ProjectCursorInspector";
import { instantiateMeshComparisonStarter } from "../projects/meshComparisonStarter";
import { projectCursorFromSavedPoint } from "./projectCursorAdapter";

const raw = readFileSync(new URL("../../../tests/fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8");
const project = migrateProjectScientificSelections(parseMath3DProject(raw));
const point = listProjectScientificSelections(project).find(item => item.identity.kind === "authored" &&
  item.geometry.kind === "point" && item.source?.kind === "document");
if (!point || point.source?.kind !== "document") throw Error("Missing Vector Field point fixture.");
const documentId = point.source.documentId;
const entry = project.workspace.entries.find(item => item.expected.id === documentId);
if (!entry) throw Error("Missing source fixture.");
const source = viewerSourceFromDocument(entry.checkpoint);
const pinned = { ...point, source: { ...point.source, checkpoint: {
  revision: source.revision, structuralHash: source.structuralHash } } } as typeof point;

describe("M3D20-03 Vector Field cursor inspector eligibility", () => {
  it("offers only a saved point with a pinned current source and declared metre frame", () => {
    expect(vectorPointCursorAvailability(project, point)).toMatch(/not pinned/);
    const current = upsertProjectScientificSelection(project, pinned);
    expect(vectorPointCursorAvailability(current, pinned)).toBeNull();
    expect(vectorPointCursorAvailability(current, { ...pinned, frame: { ...pinned.frame, axes:
      pinned.frame.axes.map(axis => ({ ...axis, unit: "cm" })) } })).toMatch(/metres/);
    expect(vectorPointCursorAvailability(current, { ...pinned, source: { ...pinned.source, checkpoint: {
      revision: source.revision + 1, structuralHash: source.structuralHash } } })).toMatch(/stale/);
  });
  it("renders pin and link controls for an eligible saved point", () => {
    const current = upsertProjectScientificSelection(project, pinned);
    const html = renderToStaticMarkup(<ProjectCursorInspector project={current} />);
    expect(html).toContain('data-testid="project-cursor-inspector"');
    expect(html).toContain('data-testid="project-cursor-link"');
    expect(html).toContain(`data-testid="project-cursor-pin-${pinned.identity.kind === "authored" ? pinned.identity.id : ""}"`);
  });
});

describe("M3D20-03 declared Surface and Mesh point eligibility", () => {
  const starter = instantiateMeshComparisonStarter("cursor-declared-points", "surface-mesh-probe").project;
  const selectionFor = (index: number): ScientificSelection => {
    const document = starter.workspace.entries[index]!.checkpoint;
    return { format: "math3d.scientific-selection", schemaVersion: 1,
      identity: { kind: "authored", id: createStableDocumentId("scientific-selection", [document.identity.id, "cursor"]) },
      role: "probe", source: { kind: "document", documentId: document.identity.id,
        checkpoint: { revision: document.identity.revision, structuralHash: document.identity.structuralHash } },
      frame: { kind: "cartesian", axes: ["x", "y", "z"].map(name => ({ name, unit: "m" })) },
      geometry: { kind: "point", position: [0.25, 0.25, 0.04] } };
  };
  it("pins exact declared Surface and Mesh points, including the Mesh resource hash", () => {
    for (const index of [0, 1]) {
      const selection = selectionFor(index);
      const project = upsertProjectScientificSelection(starter, selection);
      const qualified = projectPointCursorFrame(project, selection);
      expect(qualified.reason).toBeNull();
      if (!qualified.frame || selection.identity.kind !== "authored") continue;
      expect(qualified.frame.frameId).toBe("local");
      const draft = projectCursorFromSavedPoint(project, selection.identity.id, qualified.frame, "project-inspector");
      expect(draft.ok).toBe(true);
      if (draft.ok) {
        const document = starter.workspace.entries[index]!.checkpoint;
        expect(draft.value.resourceSha256).toBe(document.format === "math3d.mesh-document" ?
          document.source.resource.checksum.slice(7) : null);
      }
    }
  });
  it("refuses stale points and a guessed unit", () => {
    const selection = selectionFor(0);
    expect(projectPointCursorFrame(starter, { ...selection, frame: { ...selection.frame,
      axes: selection.frame.axes.map(axis => ({ ...axis, unit: "cm" })) } }).reason).toMatch(/axes or units/);
    if (selection.source?.kind !== "document" || !selection.source.checkpoint) return;
    expect(projectPointCursorFrame(starter, { ...selection, source: { ...selection.source,
      checkpoint: { ...selection.source.checkpoint, revision: selection.source.checkpoint.revision + 1 } } }).reason)
      .toMatch(/stale/);
  });
});

it("opens the cursor inspector for a replay-backed Graph Project without materialized selections", () => {
  const starter = instantiateMath3DProjectTemplate("derivative-study", "replay-cursor-inspector");
  const graph = starter.workspace.entries.find(item => item.module === "graph2d")!.checkpoint;
  if (graph.format !== "math3d.graph2d-document") throw Error("Fixture");
  const replay = new Graph2DCommandAdapter(graph).exportReplay();
  const { scientificSelections: _selections, ...base } = starter.workspace;
  const workspace = { ...base,
    entries: starter.workspace.entries.map(item => item.expected.id === graph.identity.id ?
      { ...item, checkpoint: replay.checkpoint.document, expected: graph.identity,
        replay: { format: "math3d.graph2d-replay.v1" as const, payload: replay } } : item) };
  const current = createMath3DProject(workspace, { stableKey: "replay-cursor-inspector" });
  expect(renderToStaticMarkup(<ProjectCursorInspector project={current} />)).toContain('data-testid="project-cursor-inspector"');
});
