import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, MATH3D_PROJECT_TEMPLATES } from "@math3d/core";
import { CURATED_STUDIES } from "./curatedStudyCatalog";
import { prepareCuratedStudyBundle } from "./curatedStudyProject";
import { instantiateNotebookStarter } from "./notebookStarters";
import { inspectProjectCompatibility } from "./projectTransfer";
import { measureCuratedStudyAssets, qualifyCuratedStudy } from "./curatedStudyQualification";
import { snapshotFromRendererProbe } from "../kernel/rendererPlatformCapabilities";
import { projectResourceInventory, exportProjectPackage } from "./projectResources";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const templates = new Set(MATH3D_PROJECT_TEMPLATES.map(item => item.id));
const builtIn = CURATED_STUDIES.filter(item => item.route.kind === "project");
const measurements: { id: string; projectBytes: number; resourceBytes: number; totalBytes: number;
  packageBytes: number; requiredResources: number }[] = [];

describe("guided Gallery desktop open contract", () => {
  it.each(builtIn)("opens $id with saved research resources on the desktop renderer", card => {
    if (card.route.kind !== "project") throw new Error("Invalid Gallery route.");
    const id = card.route.starterId, token = `gallery-open-${id}`;
    const bundle = templates.has(id) ?
      { project: instantiateMath3DProjectTemplate(id as Parameters<typeof instantiateMath3DProjectTemplate>[0], token) } :
      instantiateNotebookStarter(id as Parameters<typeof instantiateNotebookStarter>[0], token);
    const guided = prepareCuratedStudyBundle(bundle, id, token);
    const compatibility = inspectProjectCompatibility(guided.project, { resources: guided.resources });
    expect(compatibility.canOpenWorkspace, `${id}: ${compatibility.reasons.join(" ")}`).toBe(true);
    expect(compatibility.documents.length).toBeGreaterThan(0);
    expect(guided.project.workspace.studies).toHaveLength(1);
    expect(guided.project.workbooks?.length).toBeGreaterThan(0);
    expect(guided.project.notes?.length).toBeGreaterThan(0);
    const measured = measureCuratedStudyAssets(guided.project, guided.resources);
    const requiredResources = projectResourceInventory(guided.project).filter(item => item.required);
    expect(requiredResources.every(item => !!guided.resources?.bytes(item))).toBe(true);
    const packageBytes = new TextEncoder().encode(exportProjectPackage(guided.project, guided.resources!)).byteLength;
    expect(packageBytes).toBeGreaterThanOrEqual(measured.totalBytes);
    measurements.push({ id, ...measured, packageBytes, requiredResources: requiredResources.length });
  });

  it("certifies 13 built-in, three external, and one CAS routes against desktop and browser capabilities", () => {
    expect(CURATED_STUDIES).toHaveLength(17);
    expect(measurements).toHaveLength(13);
    const desktop = snapshotFromRendererProbe({ desktopBridge: true, hostFileSystem: true, nativeDialog: true,
      webgl2: true, backgroundWorker: true, persistentStorage: true, network: false, touchInput: false });
    const browser = snapshotFromRendererProbe({ desktopBridge: false, hostFileSystem: false, nativeDialog: false,
      webgl2: true, backgroundWorker: true, persistentStorage: true, network: true, touchInput: false });
    expect(builtIn.every(item => qualifyCuratedStudy(item, desktop).mode === "open")).toBe(true);
    expect(CURATED_STUDIES.filter(item => item.route.kind === "verified-quantum-import").every(item =>
      qualifyCuratedStudy(item, browser).mode === "unavailable" &&
      qualifyCuratedStudy(item, desktop, { quantumChooser: true }).mode === "open")).toBe(true);
    expect(qualifyCuratedStudy(CURATED_STUDIES.find(item => item.id === "cas-structures")!, browser,
      { casAvailable: true }).mode).toBe("open");
    if (process.env.MATH3D_GALLERY_ASSET_OUTPUT) writeFileSync(process.env.MATH3D_GALLERY_ASSET_OUTPUT,
      JSON.stringify({ format: "math3d.gallery-asset-baseline/v1", sourceCommit: execFileSync("git", ["rev-parse", "HEAD"],
        { encoding: "utf8" }).trim(), host: "Windows source checkout, Vitest renderer model",
        metric: "UTF-8 Project JSON plus verified raw resource bytes; package is serialized JSON with encoded sidecars",
        cards: [...measurements].sort((a, b) => a.id.localeCompare(b.id)),
        externalScenes: "not measured; producer-created .qscene bundles are not included" }, null, 2) + "\n");
  });
});
