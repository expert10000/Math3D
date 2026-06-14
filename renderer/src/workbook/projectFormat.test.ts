import { describe, expect, it } from "vitest";
import {
  WORKBOOK_PROJECT_EXTENSION,
  WORKBOOK_PROJECT_FORMAT,
  WORKBOOK_PROJECT_FORMAT_VERSION,
  buildWorkbookProjectEnvelope,
  parseWorkbookProject,
} from "./projectFormat";

describe("workbook project format", () => {
  it("builds v3 envelope with a SceneDocument workspace extension", () => {
    const payload = { workbooks: [{ id: "w1" }] };
    const sceneDocument = {
      id: "scene-w1",
      title: "Workbook scene",
      createdAt: 123,
      updatedAt: 123,
      extensions: {
        "math3d.sceneDocument": {
          version: 1,
          constructionGraph: {
            version: 1,
            nodes: [{ id: "script:geometry-procedural", kind: "script", type: "scene-script" }],
            edges: [],
          },
          scripts: [{ id: "script-1", kind: "workbook", language: "math3d-scene-script", source: "clear" }],
          workbookWorkspace: { version: 2 },
        },
      },
    };
    const env = buildWorkbookProjectEnvelope(payload, "embedded", 123, sceneDocument);
    expect(env.version).toBe(WORKBOOK_PROJECT_FORMAT_VERSION);
    expect(env.format).toBe(WORKBOOK_PROJECT_FORMAT);
    expect(env.extension).toBe(WORKBOOK_PROJECT_EXTENSION);
    expect(env.assetMode).toBe("embedded");
    expect(env.payload).toEqual(payload);
    expect(env.sceneDocument).toEqual(sceneDocument);

    const parsed = parseWorkbookProject(env);
    expect(parsed?.sourceVersion).toBe(3);
    expect(parsed?.sceneDocument).toEqual(sceneDocument);
  });

  it("parses legacy v2 envelope", () => {
    const parsed = parseWorkbookProject({
      version: 2,
      format: WORKBOOK_PROJECT_FORMAT,
      extension: WORKBOOK_PROJECT_EXTENSION,
      savedAt: Date.now(),
      assetMode: "embedded",
      payload: { workbooks: [{ id: "w1" }] },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.sourceVersion).toBe(2);
    expect(parsed?.assetMode).toBe("embedded");
  });

  it("parses legacy v1 envelope", () => {
    const parsed = parseWorkbookProject({
      version: 1,
      format: "math3d-bundle",
      extension: ".math3d",
      savedAt: Date.now(),
      assetMode: "linked",
      payload: { workbooks: [{ id: "w1" }] },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.sourceVersion).toBe(1);
    expect(parsed?.assetMode).toBe("linked");
    expect(parsed?.payload.workbooks).toHaveLength(1);
  });

  it("parses raw payload and raw workbook arrays", () => {
    const payloadParsed = parseWorkbookProject({ workbooks: [{ id: "w1" }] });
    expect(payloadParsed?.sourceVersion).toBe(0);
    expect(payloadParsed?.assetMode).toBe("embedded");
    expect(payloadParsed?.payload.workbooks).toHaveLength(1);

    const listParsed = parseWorkbookProject([{ id: "w1" }, { id: "w2" }]);
    expect(listParsed?.sourceVersion).toBe(0);
    expect(listParsed?.payload.workbooks).toHaveLength(2);
  });
});
