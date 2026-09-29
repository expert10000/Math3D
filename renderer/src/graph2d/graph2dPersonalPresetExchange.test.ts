import { expect, it } from "vitest";
import { createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, forkGraph2DPersonalPreset,
  getGraph2DPresetCatalog, inspectGraph2DPersonalPreset, instantiateGraph2DPreset, parseWorkspaceProjectHandoff,
  serializeGraph2DDocument, serializeWorkspaceProjectHandoff } from "@math3d/core";
import { exportPersonalGraphProject, importPersonalGraphProject, personalGraphDefinition,
  previewPersonalGraphImport } from "./graph2dGallerySession";

const storage = () => {
  const values = new Map<string, string>(); let fail = false;
  return { values, failNextWorkspace: () => { fail = true; }, getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); }, setItem: (key: string, value: string) => {
      if (fail && key === "math3d.mixed-workspace.v1") { fail = false; throw new Error("quota"); }
      values.set(key, value);
    } };
};

it("accepts existing Graph and handoff files, validates hashes, and forks independent identities", () => {
  const document = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "portable").document;
  const workspace = createGraph2DWorkspaceProject(document);
  const manifest = createWorkspaceProjectHandoff(workspace, { producer: { platform: "desktop", name: "Math3D", version: "1" } });
  const handoff = serializeWorkspaceProjectHandoff(manifest);
  const preview = inspectGraph2DPersonalPreset(handoff, () => true);
  expect(preview.format).toBe("Graph handoff"); expect(preview.document).toEqual(document);
  const copy = forkGraph2DPersonalPreset(preview, "other-host");
  expect(copy.entries[0]!.expected.id).not.toBe(document.identity.id);
  expect(copy.entries[0]!.checkpoint.source).toEqual(document.source);
  expect(inspectGraph2DPersonalPreset(serializeGraph2DDocument(document), () => true).format).toBe("Graph document");
  expect(() => inspectGraph2DPersonalPreset(handoff.replace(manifest.projectRevision, "sha256:" + "0".repeat(64)), () => true)).toThrow(/revision|hash/i);
  expect(parseWorkspaceProjectHandoff(handoff).project).toEqual(workspace);
});

it("shows missing external point data before acceptance and refuses the incomplete import", () => {
  const preset = getGraph2DPresetCatalog().get("piecewise-data-gaps")!;
  const document = instantiateGraph2DPreset(preset, "portable-data").document;
  const raw = serializeGraph2DDocument(document);
  const preview = inspectGraph2DPersonalPreset(raw, () => false);
  expect(preview.externalTableCount).toBe(1); expect(preview.missingTables).toHaveLength(1);
  expect(() => forkGraph2DPersonalPreset(preview, "missing")).toThrow(/sidecar/);
  expect(inspectGraph2DPersonalPreset(raw, reference => reference.id === preset.sidecars[0]!.id).missingTables).toHaveLength(0);
});

it("exports a saved project and imports only after preview, rolling back a failed save", () => {
  const document = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "host").document;
  const workspace = createGraph2DWorkspaceProject(document), local = storage();
  const exported = exportPersonalGraphProject(() => workspace, document.identity.id, local);
  expect(exported.externalTableCount).toBe(0);
  expect(personalGraphDefinition(() => workspace, document.identity.id, local)).toBe(serializeGraph2DDocument(document));
  const preview = previewPersonalGraphImport(exported.bytes, local), before = [...local.values];
  expect([...local.values]).toEqual(before);
  local.failNextWorkspace();
  expect(() => importPersonalGraphProject(() => workspace, preview, "failed-import", local)).toThrow("quota");
  expect([...local.values].sort()).toEqual(before.sort());
  const imported = importPersonalGraphProject(() => workspace, preview, "accepted-import", local);
  expect(imported.entries[0]!.expected.id).not.toBe(document.identity.id);
  expect(imported.entries[0]!.checkpoint.source).toEqual(document.source);
});
