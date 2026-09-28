import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, parseGraph2DDocument,
  queryGraph2DInspector, resolveGraph2DViewport, sampleGraph2DExplicit,
  selectionForGraph2DObject, serializeGraph2DDocument } from "@math3d/core";
import { Graph2DAuthoringPanel } from "./Graph2DAuthoringPanel";
import { Graph2DCommandAdapter } from "./Graph2DCommandAdapter";

const style = { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" as const };
const domain = { min: -10, max: 10, includeMin: true, includeMax: true };

describe("Graph2D desktop acceptance baseline", () => {
  it("freezes create/edit/multiple-function undo, redo, save, and reopen behavior", () => {
    const empty = createEmptyGraph2DDocument("desktop-baseline");
    const first = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "f", expression: "x", domain, style } });
    const created = new Graph2DCommandAdapter(empty);
    created.commitScene(first, "create");
    const second = applyGraph2DAuthoring(created.document(), { type: "create", draft: {
      label: "g", expression: "1/x", domain, style: { ...style, color: "#dc2626" } } });
    created.commitScene(second, "create");
    expect(created.document().source.objects).toHaveLength(2);
    expect(created.undo()?.source.objects).toHaveLength(1);
    expect(created.redo()?.source.objects).toHaveLength(2);
    const reopened = parseGraph2DDocument(serializeGraph2DDocument(created.document()));
    expect(reopened.identity).toEqual(created.document().identity);
    expect(reopened.source.objects.map((object) => object.label)).toEqual(["f", "g"]);
  });

  it("freezes adaptive discontinuity sampling, probe selection, and inspector provenance", () => {
    const empty = createEmptyGraph2DDocument("desktop-sampling");
    const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "reciprocal", expression: "1/x", domain, style } });
    const adapter = new Graph2DCommandAdapter(empty);
    const document = adapter.commitScene(scene, "create");
    const object = document.source.objects[0]!;
    if (object.kind !== "explicit-cartesian") throw new Error("fixture kind");
    const artifact = sampleGraph2DExplicit({ ast: object.expression.ast, domain: object.domain,
      viewport: document.display.viewport, width: 800, height: 500, policy: document.display.sampling });
    expect(artifact.segments.length).toBeGreaterThan(1);
    expect(artifact.diagnostics.some((entry) => entry.code === "suspected-jump" || entry.code === "invalid-sample")).toBe(true);
    const selected = selectionForGraph2DObject(document, [{ objectId: object.id, artifact }], object.id, 2);
    const selectedDocument = adapter.commitSelection(selected);
    const inspector = queryGraph2DInspector(selectedDocument, { objectId: object.id, artifact });
    expect(inspector).toMatchObject({ objectId: object.id, probeMethod: "direct-expression-floating-point",
      provenance: { documentId: document.identity.id, structuralHash: document.identity.structuralHash } });
  });

  it("freezes responsive projection and keyboard-visible accessible controls", () => {
    const document = createEmptyGraph2DDocument("desktop-accessibility");
    const wide = resolveGraph2DViewport(document.display.viewport, { width: 1440, height: 850 });
    const narrow = resolveGraph2DViewport(document.display.viewport, { width: 620, height: 800 });
    expect(wide.xMax - wide.xMin).toBeGreaterThan(narrow.xMax - narrow.xMin);
    const markup = renderToStaticMarkup(<Graph2DAuthoringPanel document={document} />);
    expect(markup).toContain("<h2>Functions</h2>");
    for (const label of ["Add function", "Add parametric", "Add polar", "Add implicit", "Add inequality", "Add data series"])
      expect(markup).toContain(`>${label}</button>`);
    expect(markup).not.toContain('tabindex="-1"');
  });
});
