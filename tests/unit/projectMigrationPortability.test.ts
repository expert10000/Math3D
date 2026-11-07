import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { previewProjectImport } from "../../renderer/src/projects/projectTransfer";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";

const legacy = readFileSync(new URL("../fixtures/migration-1x/workspace-v1.json", import.meta.url), "utf8");

describe("M3D20-11 supported-subset portability", () => {
  it("round-trips a historical Graph through desktop preview, browser format and mobile preview", () => {
    const desktop = previewProjectImport(legacy);
    expect(desktop.canOpenWorkspace).toBe(true);
    const canonical = serializeMath3DProject(desktop.project);
    const browser = previewProjectImport(canonical);
    expect(browser.project).toEqual(desktop.project);
    const mobile = importMobileProjectPreview(canonical, [], "browser.json", "shared", 42);
    expect(readMobilePreviewProject(mobile)).toEqual(desktop.project);
    expect(buildMobileProjectExplorer(mobile.serializedProject).groups.flatMap(group => group.documents)
      .map(document => document.id)).toEqual(desktop.project.workspace.entries.map(entry => entry.expected.id));
    const returned = previewProjectImport(serializeMobileProjectHandoff(mobile));
    expect(returned.project).toEqual(desktop.project);
    expect(returned.project.workspace.entries.map(entry => entry.expected)).toEqual(desktop.project.workspace.entries.map(entry => entry.expected));
    expect(parseMath3DProject(canonical).identity).toEqual(returned.project.identity);
  });

  it("keeps original legacy bytes in mobile storage and refuses forged or future data", () => {
    const mobile = importMobileProjectPreview(legacy, [], "legacy.json", "desktop", 43);
    expect(mobile.migrationOriginal).toBe(legacy);
    const project = readMobilePreviewProject(mobile);
    expect(previewProjectImport(serializeMobileProjectHandoff(mobile)).project).toEqual(project);
    expect(() => readMobilePreviewProject({ ...mobile, migrationOriginal: "{}" })).toThrow();
    expect(() => importMobileProjectPreview(JSON.stringify({ ...project, schemaVersion: 2 }), [], "future.json")).toThrow();
  });
});
