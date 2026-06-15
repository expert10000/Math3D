import { describe, expect, it } from "vitest";
import { createConstructionGraph } from "@math3d/core";
import {
  applyConstructionGraphTransaction,
  commitConstructionGraphTransaction,
  createConstructionGraphTransaction,
  createConstructionGraphTransactionHistory,
  redoConstructionGraphTransaction,
  undoConstructionGraphTransaction,
} from "./constructionGraphTransactions";

describe("construction graph transactions", () => {
  it("stores graph patches and metadata instead of graph snapshots", () => {
    const before = createConstructionGraph([{ id: "object:box", kind: "geometry", type: "geometry-object" }]);
    const after = createConstructionGraph([
      { id: "object:box", kind: "geometry", type: "geometry-object" },
      { id: "parameter:box:params.width", kind: "parameter", type: "geometry-parameter", data: { value: 4 } },
    ]);
    const transaction = createConstructionGraphTransaction(before, after, {
      kind: "edit-parameter",
      label: "Set box.width",
      sourceView: "definition",
      beforeValues: { width: 2 },
      afterValues: { width: 4 },
      timestamp: 10,
      id: "tx",
    });

    expect(transaction).toMatchObject({
      id: "tx",
      kind: "edit-parameter",
      timestamp: 10,
      changedNodeIds: ["parameter:box:params.width"],
      beforeValues: { width: 2 },
      afterValues: { width: 4 },
    });
    expect(transaction).not.toHaveProperty("beforeGraph");
    expect(transaction).not.toHaveProperty("afterGraph");
  });

  it("undoes and redoes by applying transaction patches", () => {
    const before = createConstructionGraph([{ id: "object:box", kind: "geometry", type: "geometry-object" }]);
    const after = createConstructionGraph([{ id: "object:sphere", kind: "geometry", type: "geometry-object" }]);
    const transaction = createConstructionGraphTransaction(before, after, {
      kind: "create-object",
      label: "Create sphere",
      sourceView: "create",
    });
    expect(transaction).not.toBeNull();
    if (!transaction) return;
    const history = commitConstructionGraphTransaction(createConstructionGraphTransactionHistory(), transaction);
    const undone = undoConstructionGraphTransaction(after, history);
    const redone = redoConstructionGraphTransaction(undone.graph, undone.history);

    expect(undone.graph).toEqual(before);
    expect(redone.graph).toEqual(after);
    expect(applyConstructionGraphTransaction(before, transaction, "forward")).toEqual(after);
  });

  it("reports recomputed downstream nodes as affected", () => {
    const before = createConstructionGraph(
      [
        { id: "parameter:width", kind: "parameter", type: "geometry-parameter", data: { value: 2 } },
        { id: "object:box", kind: "geometry", type: "geometry-object", data: { width: 2 } },
        { id: "analysis:volume", kind: "analysis", type: "volume", data: { value: 8 } },
      ],
      [
        { id: "width-box", sourceId: "parameter:width", targetId: "object:box", relation: "depends-on" },
        { id: "box-volume", sourceId: "object:box", targetId: "analysis:volume", relation: "analyzes" },
      ]
    );
    const after = createConstructionGraph(
      [
        { id: "parameter:width", kind: "parameter", type: "geometry-parameter", data: { value: 4 } },
        { id: "object:box", kind: "geometry", type: "geometry-object", data: { width: 4 } },
        { id: "analysis:volume", kind: "analysis", type: "volume", data: { value: 16 } },
      ],
      before.edges
    );

    const transaction = createConstructionGraphTransaction(before, after, {
      kind: "edit-parameter",
      label: "Set width",
      sourceView: "definition",
    });

    expect(transaction?.changedNodeIds).toEqual(["parameter:width", "object:box", "analysis:volume"]);
    expect(transaction?.affectedNodeIds).toEqual(["object:box", "analysis:volume"]);
  });
});
