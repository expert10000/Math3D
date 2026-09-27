import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  Graph2DPointTableStore, graph2DPointDomain, inspectGraph2DCompatibility,
  pickGraph2DProbe, previewGraph2DPointImport, sampleGraph2DPointSeries,
  selectionForGraph2DObject, serializeGraph2DDocument } from "@math3d/core";

const style = { color: "#ea580c", lineWidth: 2, lineStyle: "solid" as const, visible: true };
const viewport = { xMin: -1, xMax: 4, yMin: -1, yMax: 5, aspect: "free" as const };
const size = { width: 500, height: 600 };

describe("Graph2D point series", () => {
  it("previews typed CSV/TSV rows and rejects malformed or oversized input", () => {
    const preview = previewGraph2DPointImport("x,y\n0,0\n1,NA\n2,4");
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((row) => row.id)).toEqual(["row_1", "row_2", "row_3"]);
    expect(preview.missingCount).toBe(1);
    expect(previewGraph2DPointImport("x\ty\n1\t2").rows[0]?.y).toBe(2);
    expect(previewGraph2DPointImport("x,y\nno,1").errors).not.toHaveLength(0);
    expect(previewGraph2DPointImport("x,y\n" + "1,2\n".repeat(10001)).errors).not.toHaveLength(0);
  });

  it("keeps table bytes in a checked managed sidecar and source commands compact", () => {
    const backing = new Map<string, string>();
    const store = new Graph2DPointTableStore({ read: (id) => backing.get(id) ?? null,
      write: (id, content) => { backing.set(id, content); } });
    const rows = previewGraph2DPointImport("x,y\n0,0\n1,1\n2,4").rows;
    const table = store.publish(rows);
    expect(new Graph2DPointTableStore({ read: (id) => backing.get(id) ?? null,
      write: () => {} }).resolve(table)).toEqual(rows);
    const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("points"), {
      type: "create-point-series", draft: { label: "data", table, mode: "points",
        domain: graph2DPointDomain(rows), style } });
    const document = createGraph2DDocument({ source: scene.source, display: scene.display,
      selection: scene.selection, stableKey: "points" });
    expect(document.requiredCapabilities).toContain("graph2d.point-series.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(serializeGraph2DDocument(document)).not.toContain("row_1");
    expect(store.resolve({ ...table, checksum: "sha256:" + "0".repeat(64) })).toBeNull();
    const dense = previewGraph2DPointImport("x,y\n" + Array.from({ length: 5000 }, (_, i) => `${i},${i * i}`).join("\n")).rows;
    const denseRef = store.publish(dense);
    const denseScene = applyGraph2DAuthoring(createEmptyGraph2DDocument("dense-points"), {
      type: "create-point-series", draft: { label: "dense", table: denseRef, mode: "line",
        domain: graph2DPointDomain(dense), style } });
    const denseDocument = createGraph2DDocument({ source: denseScene.source, display: denseScene.display,
      selection: denseScene.selection, stableKey: "dense-points" });
    expect(serializeGraph2DDocument(denseDocument).length).toBeLessThan(2000);
    const denseObject = denseDocument.source.objects[0]!;
    if (denseObject.kind !== "point-series") throw new Error("Expected dense point series.");
    expect(sampleGraph2DPointSeries(denseObject, store.resolve(denseRef), 6000).points).toHaveLength(5000);
  });

  it("plots points, splits connected lines at gaps, and probes stable row IDs", () => {
    const rows = previewGraph2DPointImport("x,y\n0,0\n1,1\n2,NA\n3,4").rows;
    const table = new Graph2DPointTableStore().publish(rows);
    const empty = createEmptyGraph2DDocument("series-pick");
    const scene = applyGraph2DAuthoring(empty, { type: "create-point-series", draft: {
      label: "data", table, mode: "points", domain: graph2DPointDomain(rows), style } });
    const document = createGraph2DDocument({ source: scene.source, display: scene.display,
      selection: scene.selection, stableKey: "series-pick" });
    const object = document.source.objects[0]!;
    if (object.kind !== "point-series") throw new Error("Expected point series.");
    const artifact = sampleGraph2DPointSeries(object, rows, 100);
    expect(artifact.points.map((point) => point.rowId)).toEqual(["row_1", "row_2", "row_4"]);
    expect(sampleGraph2DPointSeries({ ...object, mode: "line" }, rows, 100).segments).toHaveLength(1);
    expect(sampleGraph2DPointSeries(object, null, 100).state).toBe("missing-table");
    expect(sampleGraph2DPointSeries(object, rows, 2).state).toBe("complexity-limit");
    const picked = pickGraph2DProbe({ document, series: [{ objectId: object.id, artifact }],
      viewport, size, screen: { x: 200, y: 400 } }).selection;
    expect(picked.probe?.rowId).toBe("row_2");
    expect(selectionForGraph2DObject(document, [{ objectId: object.id, artifact }], object.id).probe?.rowId).toBeTypeOf("string");
  });
});
