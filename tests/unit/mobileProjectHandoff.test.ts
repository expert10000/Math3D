import { describe, expect, it } from "vitest";
import {
  createProjectHandoff, createSceneProjectDocument, deserializeProjectHandoff,
  serializeProjectHandoff, serializeSceneProject,
} from "@math3d/core";
import { commitMobileProjectHandoff, inspectMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectHandoff";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import type { MobileStoredSceneProject } from "../../apps/mobile/src/models/mobileScene";

const source = createSceneProjectDocument({
  id: "desktop-project", title: "Desktop project", createdAt: 1, updatedAt: 2,
  surfaces: [{ id: "surface-1", kind: "explicit", expression: "x+y" }],
});
const handoff = serializeProjectHandoff(createProjectHandoff(source, {
  producer: { platform: "desktop", name: "Math3D Desktop", version: "1.5.0" },
  requiredCapabilities: ["surface.explicit"],
}));

describe("mobile project handoff", () => {
  it("previews, imports with stable IDs, and exports the imported base revision", async () => {
    const inspected = inspectMobileProjectHandoff(handoff, "desktop.json", []);
    expect(inspected).toMatchObject({ ok: true, preview: { unsupported: [], existingProjectId: null } });
    if (!inspected.ok) return;
    let saved: MobileStoredSceneProject[] = [];
    const result = await commitMobileProjectHandoff(inspected.preview, "copy", [], async (projects) => { saved = projects; }, 10);
    expect(result).toMatchObject({ ok: true, project: { id: "desktop-project" } });
    if (!result.ok) return;
    expect(saved).toHaveLength(1);
    const exported = deserializeProjectHandoff(serializeMobileProjectHandoff(result.project));
    expect(exported).toMatchObject({ ok: true, value: {
      producer: { platform: "mobile" },
      baseRevision: inspected.preview.manifest.projectRevision,
      projectId: "desktop-project",
    } });
  });

  it("requires a matching base revision to replace, otherwise makes an explicit copy", async () => {
    const existing: MobileStoredSceneProject = {
      id: source.scene.id, title: source.scene.title, updatedAt: 2, lastOpenedAt: 3,
      serializedProject: serializeSceneProject(source),
    };
    const incoming = serializeProjectHandoff(createProjectHandoff({
      ...source, scene: { ...source.scene, updatedAt: 4, surfaces: [{ id: "surface-1", kind: "explicit", expression: "x-y" }] },
    }, {
      producer: { platform: "desktop", name: "Math3D Desktop", version: "1.5.0" },
      baseRevision: deserializeProjectHandoff(handoff).ok ? (deserializeProjectHandoff(handoff) as { ok: true; value: { projectRevision: string } }).value.projectRevision : null,
    }));
    const inspected = inspectMobileProjectHandoff(incoming, "update.json", [existing]);
    expect(inspected).toMatchObject({ ok: true, preview: { canReplace: true, diverged: false } });
    if (!inspected.ok) return;
    const replaced = await commitMobileProjectHandoff(inspected.preview, "replace", [existing], async () => {}, 20);
    expect(replaced).toMatchObject({ ok: true, project: { id: "desktop-project" } });
    const diverged = { ...existing, serializedProject: serializeSceneProject({ ...source, scene: { ...source.scene, updatedAt: 5 } }) };
    expect(inspectMobileProjectHandoff(incoming, "update.json", [diverged])).toMatchObject({ ok: true, preview: { canReplace: false, diverged: true } });
    expect(await commitMobileProjectHandoff(inspected.preview, "replace", [diverged], async () => {})).toMatchObject({ ok: false, error: expect.stringContaining("base revision") });
    const copied = await commitMobileProjectHandoff(inspected.preview, "copy", [diverged], async () => {}, 21);
    expect(copied).toMatchObject({ ok: true, project: { id: "desktop-project-import" } });
  });

  it("reports unsupported content before open and leaves storage untouched on failure", async () => {
    const unsupported = serializeProjectHandoff(createProjectHandoff(source, {
      producer: { platform: "desktop", name: "Math3D Desktop", version: "1.5.0" },
      requiredCapabilities: ["analysis.curvature"],
    }));
    const inspected = inspectMobileProjectHandoff(unsupported, "unsupported.json", []);
    expect(inspected).toMatchObject({ ok: true, preview: { unsupported: ["analysis.curvature"] } });
    if (!inspected.ok) return;
    const failed = await commitMobileProjectHandoff(inspected.preview, "copy", [], async () => { throw new Error("disk full"); });
    expect(failed).toMatchObject({ ok: false, error: "disk full" });
  });
});
