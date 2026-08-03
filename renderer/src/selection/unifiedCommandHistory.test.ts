import { describe, expect, it } from "vitest";
import {
  buildGeometryConstructionCommandHistoryEntry,
  buildGeometryObjectCommandHistoryEntry,
  buildMeshTopologyCommandHistoryEntry,
  buildUnifiedOperationTreeNode,
  buildUnifiedCommandHistoryRows,
  coerceUnifiedCommandParameterDraftValue,
  formatUnifiedCommandCounts,
  resolveUnifiedCommandParameterDraftValue,
  parseUnifiedCommandParameterLabel,
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

  it("parses command parameters into editable values", () => {
    expect(parseUnifiedCommandParameterLabel("ratio=0.5000 (50%), visible=true")).toEqual([
      {
        key: "ratio",
        label: "ratio",
        value: 0.5,
        valueType: "number",
        sourceValue: "0.5000 (50%)",
        restoreValue: 0.5,
        editable: true,
      },
      {
        key: "visible",
        label: "visible",
        value: true,
        valueType: "boolean",
        sourceValue: "true",
        restoreValue: true,
        editable: true,
      },
    ]);

    expect(parseUnifiedCommandParameterLabel("radius: 1 -> 2.5")).toMatchObject([
      {
        key: "radius",
        value: 2.5,
        restoreValue: 1,
        valueType: "number",
      },
    ]);
  });

  it("builds editable operation-tree metadata from commands", () => {
    const node = buildUnifiedOperationTreeNode(
      buildMeshTopologyCommandHistoryEntry({
        id: "m3",
        at: 600,
        actionLabel: "Bevel edge",
        sourceLabel: "Box",
        targetLabel: "Edge 1-2",
        paramsLabel: "amount=0.0600",
        resultLabel: "Edge 1-2 -> bevel band (+2V, +2F)",
        beforeCounts: { vertexCount: 8, faceCount: 12 },
        afterCounts: { vertexCount: 10, faceCount: 14 },
      })
    );

    expect(node).toMatchObject({
      id: "mesh:m3",
      sourceSnapshotLabel: "Before snapshot: V 8 / F 12",
      resultSnapshotLabel: "Result snapshot: V 10 / F 14",
      operationType: "Bevel edge",
      targetLabel: "Edge 1-2",
      parametersLabel: "amount=0.0600",
      canRestoreParameters: true,
      canEditParameters: true,
      canRestoreBefore: true,
      canRestoreAfter: true,
      topologyChanged: true,
    });
    expect(node.parameterEdits.map((entry) => [entry.key, entry.value])).toEqual([["amount", 0.06]]);
    expect(node.actions.map((entry) => [entry.id, entry.enabled])).toEqual([
      ["restore-params", true],
      ["apply-edited", true],
      ["restore-before", true],
      ["restore-after", true],
      ["open", true],
      ["copy", true],
    ]);
  });

  it("resolves and coerces operation-node draft values through shared helpers", () => {
    const node = buildUnifiedOperationTreeNode(
      buildGeometryConstructionCommandHistoryEntry({
        id: "c2",
        at: 700,
        action: "Extend",
        source: "Line A",
        result: "Line A extended",
        operationSummary: {
          source: "Line A",
          action: "Extend line",
          result: "Line A extended",
          parameters: "length=0.75",
        },
      })
    );
    const parameter = node.parameterEdits[0];

    expect(resolveUnifiedCommandParameterDraftValue(node, {}, parameter)).toBe("0.75");
    expect(resolveUnifiedCommandParameterDraftValue(node, { [node.id]: { length: "1.25" } }, parameter)).toBe("1.25");
    expect(coerceUnifiedCommandParameterDraftValue(parameter, "1.25")).toBe(1.25);
  });
});
