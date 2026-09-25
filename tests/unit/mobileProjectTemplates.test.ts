import { describe, expect, it } from "vitest";
import { deserializeSceneProject } from "@math3d/core";
import { planMobileProjectCreation } from "../../apps/mobile/src/models/mobileProjectCreation";
import {
  mobileProjectTemplates,
  validateBundledMobileProjectTemplates,
  validateMobileProjectTemplate,
} from "../../apps/mobile/src/models/mobileProjectTemplates";

const expectedIds = [
  "empty-3d-scene",
  "surface-study",
  "mesh-inspection",
  "curvature-analysis",
  "topology-study",
  "implicit-surface-study",
];

describe("mobile project templates", () => {
  it("ships the six validated, versioned, offline MOB57 templates", () => {
    expect(mobileProjectTemplates.map((template) => template.id)).toEqual(expectedIds);
    expect(validateBundledMobileProjectTemplates()).toEqual({ ok: true });
    for (const template of mobileProjectTemplates) {
      expect(template.version).toBe(1);
      expect(validateMobileProjectTemplate(template)).toEqual({ ok: true });
    }
  });

  it.each(mobileProjectTemplates.map((template) => [template.id, template] as const))(
    "instantiates %s with provenance and fresh project/object identities",
    (_id, template) => {
      const first = planMobileProjectCreation({
        route: "template",
        templateId: template.id,
        templateVersion: template.version,
        scene: template.scene,
      }, [], 100);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const second = planMobileProjectCreation({
        route: "template",
        templateId: template.id,
        templateVersion: template.version,
        scene: template.scene,
      }, [first.project], 200);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.project.id).not.toBe(first.project.id);
      const firstScene = deserializeSceneProject(first.project.serializedProject);
      const secondScene = deserializeSceneProject(second.project.serializedProject);
      expect(firstScene.ok && firstScene.value.scene.metadata).toMatchObject({
        "math3d.template.id": template.id,
        "math3d.template.version": template.version,
      });
      expect(secondScene.ok && secondScene.value.scene.metadata).toMatchObject({
        "math3d.template.id": template.id,
        "math3d.template.version": template.version,
      });
      const firstIds = firstScene.ok ? (firstScene.value.scene.surfaces ?? []).map((surface) => surface.id) : [];
      const secondIds = secondScene.ok ? (secondScene.value.scene.surfaces ?? []).map((surface) => surface.id) : [];
      expect(new Set(firstIds).size).toBe(firstIds.length);
      if (firstIds.length > 0) expect(secondIds).not.toEqual(firstIds);
    }
  );
});
