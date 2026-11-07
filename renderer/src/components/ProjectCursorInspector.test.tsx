import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { listProjectScientificSelections, migrateProjectScientificSelections,
  parseMath3DProject, upsertProjectScientificSelection, viewerSourceFromDocument } from "@math3d/core";
import { ProjectCursorInspector, vectorPointCursorAvailability } from "./ProjectCursorInspector";

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
