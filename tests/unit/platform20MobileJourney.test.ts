import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";

const raw = readFileSync(new URL("../fixtures/project-workbook-note-journey.json", import.meta.url), "utf8");

describe("M3D20-12 Android model journey", () => {
  it("imports, reopens and exports a verified resource package without claiming every editor", () => {
    const stored = importMobileProjectPreview(raw, [], "project.resources.json", "desktop", 100);
    const project = readMobilePreviewProject(stored);
    const explorer = buildMobileProjectExplorer(stored.serializedProject, stored.projectResources);
    expect(explorer.workbooks[0]).toMatchObject({ available: true });
    expect(explorer.groups.flatMap(group => group.documents).map(document => document.editing)).toEqual(["Graph workspace", "Curve workspace"]);
    expect(parseMath3DProject(JSON.stringify(JSON.parse(serializeMobileProjectHandoff(stored)).project)).identity).toEqual(project.identity);
  });
  it("labels unsupported native module editors as saved previews", () => {
    const project = instantiateMath3DProjectTemplate("scene-topology-study", "m3d20-12-mobile");
    const stored = importMobileProjectPreview(serializeMath3DProject(project), [], "topology.json", "desktop", 101);
    const explorer = buildMobileProjectExplorer(stored.serializedProject);
    const documents = explorer.groups.flatMap(group => group.documents);
    expect(documents).toHaveLength(project.workspace.entries.length);
    expect(documents.every(document => document.editing === "Saved preview")).toBe(true);
  });
});
