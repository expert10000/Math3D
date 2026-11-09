import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SurfaceAnalysisInspectorPanel } from "./SurfaceAnalysisWorkspacePanels";
import type { SurfaceAnalysisPayload } from "../surfaceAnalysis/contracts";
import { adaptSurfaceDefinition, createSurfaceAnalysisRegistry, createSurfaceAnalysisRequest,
  createSurfaceAnalysisResultStore, getSurfaceAnalysisResult, invalidateSurfaceAnalysisResult,
  publishSurfaceAnalysisResult } from "../surfaceAnalysis/infrastructure";

const definition = adaptSurfaceDefinition({ id: "plane", revision: 7, label: "Plane", representation: "parametric",
  expressions: { x: "u", y: "v", z: "0" }, domain: { kind: "parameter", u: { min: 0, max: 1 }, v: { min: 0, max: 1 } } });
const registry = createSurfaceAnalysisRegistry();
const payload = (kind: "curvature" | "local-probe") => ({ version: 1,
  surfaceId: definition.identity.surfaceId, surfaceRevision: definition.identity.surfaceRevision,
  representation: definition.representation, method: "surface-sampling",
  units: definition.units, orientation: definition.orientation, warnings: [], data: { kind } }) as SurfaceAnalysisPayload;
const staleResult = (kind: "curvature-field" | "surface-probe") => {
  let store = publishSurfaceAnalysisResult({ store: createSurfaceAnalysisResultStore(), registry,
    request: createSurfaceAnalysisRequest({ requestId: "source", kind: "surface-definition", definition,
      domain: "surface", method: "surface-sampling" }), payload: payload("curvature"), now: 1 });
  store = publishSurfaceAnalysisResult({ store, registry,
    request: createSurfaceAnalysisRequest({ requestId: kind, kind, definition,
      domain: kind === "surface-probe" ? "point" : "surface", method: "surface-sampling" }),
    payload: payload(kind === "surface-probe" ? "local-probe" : "curvature"), now: 2 });
  store = invalidateSurfaceAnalysisResult(store, definition.identity, "surface-definition", "default", 3);
  return { store, result: getSurfaceAnalysisResult<SurfaceAnalysisPayload>(store, definition.identity, kind) };
};

describe("Surface Inspector stale evidence", () => {
  it("withholds historical curvature statistics and actions", () => {
    const { store, result } = staleResult("curvature-field");
    const html = renderToStaticMarkup(<SurfaceAnalysisInspectorPanel definition={definition} store={store}
      result={result} historyCount={store.history.length} savedResultCount={0} probeRows={[]} />);
    expect(html).toContain('data-status="historical"');
    expect(html).toContain("Curvature values are withheld");
    expect(html).not.toContain('data-testid="surface-curvature-result"');
  });

  it("withholds historical local probe coordinates and actions", () => {
    const { store, result } = staleResult("surface-probe");
    const html = renderToStaticMarkup(<SurfaceAnalysisInspectorPanel definition={definition} store={store}
      result={result} preferredTab="probe" historyCount={store.history.length} savedResultCount={0}
      probeRows={[{ label: "Position", value: "(9, 9, 9)" }]} />);
    expect(html).toContain('data-status="historical"');
    expect(html).toContain("Probe values are withheld");
    expect(html).not.toContain("(9, 9, 9)");
    expect(html).not.toContain('data-testid="surface-local-probe-result"');
  });
});
