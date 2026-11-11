import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("expo-file-system", () => ({ Paths: { document: "test://documents" } }));
import { createGraph2DWorkspaceProject, createMath3DProject, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, serializeMath3DProject } from "@math3d/core";
import { snapshotFromMobileProbe } from "../../apps/mobile/src/services/mobilePlatformCapabilities";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { resolveMobileProjectJourneys } from "../../apps/mobile/src/models/mobileProjectJourneys";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { buildMobileProjectLibraryCards } from "../../apps/mobile/src/models/mobileProjectLibrary";

const host = (storage: boolean, network = false) => snapshotFromMobileProbe({ persistentStorage: storage, network, touchInput: true });
const packageRaw = () => readFileSync(new URL("../fixtures/project-workbook-note-journey.json", import.meta.url), "utf8");

describe("M3D20-12 mobile Project subset", () => {
  it("returns verified research and its sidecars through a mobile preview without claiming an editor", () => {
    const original = packageRaw();
    const saved = importMobileProjectPreview(original, [], "research-package.json", "desktop", 10, host(true));
    const restarted = JSON.parse(JSON.stringify(saved));
    const returned = serializeMobileProjectHandoff(restarted);
    const independent = importMobileProjectPreview(returned, [], "returned-package.json", "shared", 20, host(true));
    expect(readMobilePreviewProject(independent)).toEqual(readMobilePreviewProject(saved));
    expect(independent.projectResources).toEqual(saved.projectResources);
    const decisions = resolveMobileProjectJourneys(restarted, host(true));
    expect(decisions.project.mode).toBe("preview");
    expect(decisions.projectSave.mode).toBe("open");
    expect(decisions.research.mode).toBe("preview");
    expect(decisions.compute.mode).toBe("unavailable");
    expect(resolveMobileProjectJourneys(restarted, host(true, false)).project).toEqual(decisions.project);
  });

  it("names missing source resources and refuses writes when sandbox storage is unavailable", () => {
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "mobile-platform").document;
    const raw = serializeMath3DProject(createMath3DProject(createGraph2DWorkspaceProject(graph), { stableKey: "mobile-platform" }));
    const saved = importMobileProjectPreview(raw, [], "missing-source.json", "desktop", 10, host(true));
    expect(resolveMobileProjectJourneys(saved, host(true)).project.reason).toMatch(/Required Project source resources are missing/);
    expect(buildMobileProjectLibraryCards([saved], { section: "all", query: "", sort: "title", host: host(true) })[0]!.compatibilityMessage)
      .toMatch(/Required Project source resources are missing/);
    const existing = [saved], before = JSON.stringify(existing);
    expect(() => importMobileProjectPreview(packageRaw(), existing, "blocked.json", "desktop", 20, host(false)))
      .toThrow(/persistentStorage|storage/i);
    expect(JSON.stringify(existing)).toBe(before);
    expect(resolveMobileProjectJourneys(saved, host(false)).projectSave.mode).toBe("unavailable");
  });

  it("refuses unknown Project extension fields before adding a mobile copy", () => {
    const raw = readFileSync(new URL("../../docs/evidence/projects-local-share-2026-10-03/received.math3d.project.json", import.meta.url), "utf8");
    const value = JSON.parse(raw);
    expect(() => importMobileProjectPreview(JSON.stringify({ ...value, futureExtension: { evidence: 1 } }), [],
      "future.json", "desktop", 10, host(true))).toThrow(/unsupported|invalid/i);
  });
});
