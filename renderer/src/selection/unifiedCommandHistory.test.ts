import { describe, expect, it } from "vitest";
import {
  buildGeometryConstructionCommandHistoryEntry,
  buildGeometryObjectCommandHistoryEntry,
  buildMeshTopologyCommandHistoryEntry,
  buildUnifiedCommandHistoryRows,
  formatUnifiedCommandCounts,
} from "./unifiedCommandHistory";

describe("unifiedCommandHistory", () => {
  it("formats shared before/after topology counts", () => {
    expect(formatUnifiedCommandCounts({ vertexCount: 8, faceCount: 12 }, { vertexCount: 9, faceCount: 14 })).toBe(
      "V 8 -> 9, F 12 -> 14"
    );
  });

  it("normalizes Mesh topology history entries", () => {
    expect(
      buildMeshTopologyCommandHistoryEntry({
        id: "m1",
        at: 100,
        actionLabel: "Split edge",
        sourceLabel: "Box",
        targetLabel: "Edge 5-6",
        paramsLabel: "ratio=0.5000",
        resultLabel: "Edge 5-6 -> split vertex (+1V, +2F)",
        selectedResultLabel: "midpoint vertex on Edge 5-6",
        beforeCounts: { vertexCount: 8, faceCount: 12 },
        afterCounts: { vertexCount: 9, faceCount: 14 },
      })
    ).toMatchObject({
      workspace: "Mesh",
      kind: "topology",
      sourceLabel: "Box",
      actionLabel: "Split edge",
      targetLabel: "Edge 5-6",
      countsLabel: "V 8 -> 9, F 12 -> 14",
      confirmationLabel: "Done: midpoint vertex on Edge 5-6",
      lastCommandLabel: "Edge 5-6 split",
    });
  });

  it("normalizes Geometry object history entries", () => {
    expect(
      buildGeometryObjectCommandHistoryEntry({
        id: "g1",
        at: 200,
        action: "face-extrude",
        label: "Face extrude",
        operationType: "Face edit",
        operationTarget: "Face 8",
        operationParameters: "distance=0.15",
        objectName: "Box",
        topologySummary: "Face 8 -> extruded prism",
        beforeVertexCount: 27,
        afterVertexCount: 30,
        beforeFaceCount: 19,
        afterFaceCount: 26,
      })
    ).toMatchObject({
      workspace: "Geometry",
      kind: "object",
      actionLabel: "Face edit",
      targetLabel: "Face 8",
      resultLabel: "Face 8 -> extruded prism",
      countsLabel: "V 27 -> 30, F 19 -> 26",
      confirmationLabel: "Done: Face 8 extruded, V 27 -> 30, F 19 -> 26",
      lastCommandLabel: "Face 8 extruded",
    });
  });

  it("normalizes Geometry construction history entries", () => {
    expect(
      buildGeometryConstructionCommandHistoryEntry({
        id: "c1",
        at: 300,
        action: "Project",
        source: "Line A",
        result: "Projected line",
        operationSummary: {
          source: "Line A",
          action: "Project line",
          result: "Projected line on plane",
          parameters: "plane=XY",
        },
      })
    ).toMatchObject({
      workspace: "Geometry",
      kind: "construction",
      sourceLabel: "Line A",
      actionLabel: "Project line",
      resultLabel: "Projected line on plane",
      parametersLabel: "plane=XY",
      confirmationLabel: "Done: Projected line on plane",
      lastCommandLabel: "Project line: Projected line on plane",
    });
  });

  it("builds the same command-history rows for Mesh Split and Geometry Extrude", () => {
    const meshRows = buildUnifiedCommandHistoryRows(
      buildMeshTopologyCommandHistoryEntry({
        id: "m2",
        at: 400,
        actionLabel: "Split edge",
        sourceLabel: "Box",
        targetLabel: "Edge 5-6",
        paramsLabel: "ratio=0.5000",
        resultLabel: "Edge 5-6 -> split vertex (+1V, +2F)",
        beforeCounts: { vertexCount: 8, faceCount: 12 },
        afterCounts: { vertexCount: 9, faceCount: 14 },
      })
    );
    const geometryRows = buildUnifiedCommandHistoryRows(
      buildGeometryObjectCommandHistoryEntry({
        id: "g2",
        at: 500,
        action: "face-extrude",
        label: "Face extrude",
        operationType: "Face edit",
        operationTarget: "Face 8",
        operationParameters: "distance=0.15",
        objectName: "Box",
        topologySummary: "Face 8 -> extruded prism",
        beforeVertexCount: 27,
        afterVertexCount: 30,
        beforeFaceCount: 19,
        afterFaceCount: 26,
      })
    );

    expect(meshRows.map((row) => row.label)).toEqual(["Source", "Action", "Before", "After", "Result", "Params"]);
    expect(geometryRows.map((row) => row.label)).toEqual(["Source", "Action", "Before", "After", "Result", "Params"]);
  });
});
