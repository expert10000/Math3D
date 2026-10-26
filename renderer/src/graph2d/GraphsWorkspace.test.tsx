import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createGraph2DFieldReference, createScientificFieldDocument, Graph2DPointTableStore,
  reviseScientificFieldDocument, scientificFieldResultBinding, sha256Checksum } from "@math3d/core";
import { recommendedWorkspaceDockLayout } from "../workspaceDocks";
import { GraphsWorkspace } from "./GraphsWorkspace";

const document = createEmptyGraph2DDocument("graphs-shell-test");
const dockLayout = recommendedWorkspaceDockLayout("graphs");

describe("Graphs workspace shell", () => {
  it("labels saved field Graph rows unverified after reopen and stale after a revision", () => {
    const manifestJson = readFileSync(fileURLToPath(new URL(
      "../../../tests/fixtures/scientific-scene/thermal-gradient.sscene/manifest.json", import.meta.url)), "utf8");
    const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
    const reference = createGraph2DFieldReference(manifestJson, fingerprint,
      { kind: "preset", value: "thermal-gradient" }, "temperature", "scalar");
    const field = createScientificFieldDocument({ reference,
      quantity: { name: "Temperature", unit: "K" },
      display: { view: "plane", normalAxis: null, fixedIndex: null,
        transfer: { mode: "data" } } }, { stableKey: reference.id });
    const rows = [{ id: "row_1", x: 0, y: 1 }, { id: "row_2", x: 1, y: 2 }];
    const table = new Graph2DPointTableStore().publish(rows);
    const origin = { schema: "scientific-scene/v1" as const, sceneId: reference.sceneId,
      datasetId: reference.datasetId, component: reference.component,
      sceneFingerprint: reference.sceneFingerprint, resourceSha256: reference.resourceSha256,
      sourceProducer: "fixture", sourceId: "thermal", sourceSchema: "fixture/v1",
      sourceSha256: reference.resourceSha256, xName: "time", xUnit: "s",
      yName: "Temperature", yUnit: "K", fieldDocument: scientificFieldResultBinding(field) };
    const source = applyGraph2DAuthoring(document, { type: "create-point-series", draft: {
      label: "Thermal line", table, mode: "line", domain: { min: 0, max: 1,
        includeMin: true, includeMax: true }, origin,
      style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } } });
    const graph = createGraph2DDocument({ stableKey: "bound-thermal", source: source.source,
      display: source.display, selection: { objectId: source.source.objects[0]!.id, probe: null } });
    expect(renderToStaticMarkup(<GraphsWorkspace document={graph} dockLayout={dockLayout}
      savedScientificFields={[field]} />)).toContain("Saved rows; reverify against the source after Project reopen");
    const revised = reviseScientificFieldDocument(field, { ...field.source,
      display: { ...field.source.display, transfer: { mode: "percentile" } } });
    expect(renderToStaticMarkup(<GraphsWorkspace document={graph} dockLayout={dockLayout}
      savedScientificFields={[revised]} />)).toContain("Stale — saved field source or revision changed");
    expect(renderToStaticMarkup(<GraphsWorkspace document={graph} dockLayout={dockLayout}
      savedScientificFields={[revised]} />)).toContain("Reverify Graph line");
  });
  it("renders document-backed empty, loading, and error states", () => {
    const empty = renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} />);
    expect(empty).toContain("0 graph objects");
    expect(empty).toContain("No graph objects yet. Choose Add Graph to begin.");
    expect(empty).toContain('aria-label="Graph view essentials"');
    expect(empty).toContain('aria-label="Zoom in"');
    expect(empty).toContain("Fit selection");
    expect(empty).toContain("Fit all");
    expect(empty).toContain("Reset view");
    expect(empty).toContain("<summary>More</summary>");
    expect(empty).toContain('aria-label="Construction tools"');
    expect(empty).toContain('aria-label="Analysis"');
    expect(empty).toContain('aria-label="Export and presentation"');
    expect(renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} status="loading" />))
      .toContain("Loading graph");
    expect(renderToStaticMarkup(<GraphsWorkspace document={document} dockLayout={dockLayout} status="error" errorMessage="Invalid source" />))
      .toContain("Invalid source");
  });

  it("shows angular polar measurements instead of Cartesian interval actions", () => {
    const scene = applyGraph2DAuthoring(document, { type: "create-polar", draft: {
      label: "circle", rExpression: "2*cos(theta)",
      domain: { min: 0, max: Math.PI, includeMin: true, includeMax: true },
      style: { visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" } } });
    const polar = createGraph2DDocument({ stableKey: "graphs-polar-shell", source: scene.source, display: scene.display,
      selection: { objectId: scene.source.objects[0]!.id, probe: null } });
    const markup = renderToStaticMarkup(<GraphsWorkspace document={polar} dockLayout={dockLayout} />);
    expect(markup).toContain('aria-label="Polar measurements"');
    expect(markup).toContain("Measure swept area");
    expect(markup).toContain("Measure polar arc length");
    expect(markup.indexOf('aria-label="Polar measurements"')).toBeLessThan(
      markup.indexOf('aria-label="Source and sampling details"'));
    expect(markup).toContain('aria-label="More actions for circle"');
    expect(markup).not.toContain('aria-label="Interval area"');
    expect(markup).not.toContain('aria-label="Arc length"');
    expect(markup).not.toContain('aria-label="Pairwise intersections"');
    expect(markup).not.toContain("Empty Cartesian graph scene");
  });
});
