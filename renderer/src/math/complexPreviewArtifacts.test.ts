import { describe, expect, it } from "vitest";
import { COMPLEX_COMMAND_TYPES } from "@math3d/core";
import { C } from "./complex";
import { COMPLEX_PREVIEW_LAYERS, ComplexFunctionPreviewSession } from "./complexPreviewArtifacts";

const spec = () => ({ inputMode: "fz" as const, fExpr: "exp(z)", reExpr: "u", imExpr: "v", uMin: -2, uMax: 2, vMin: -2, vMax: 2, nu: 512, nv: 512, mapMode: "standard" as const, sheetCount: 1, sheetIndex: 0, branchCutAngle: Math.PI });

describe("C05 revision-safe Complex preview artifacts", () => {
  it("publishes low/high artifacts for every Function Explorer view family", async () => {
    const session = new ComplexFunctionPreviewSession(spec());
    const low = await session.build("low");
    const high = await session.build("high");
    expect(low.ignored).toBe(false);
    expect(Object.keys(low.handles).sort()).toEqual([...COMPLEX_PREVIEW_LAYERS].sort());
    expect(low.dimensions).toEqual({ columns: 32, rows: 32 });
    expect(high.dimensions).toEqual({ columns: 256, rows: 256 });
    for (const layer of COMPLEX_PREVIEW_LAYERS) expect(session.artifacts.resolve(high.handles[layer], high.source).ok, layer).toBe(true);
    const lowReal = session.artifacts.resolve(low.handles.real, low.source);
    const highReal = session.artifacts.resolve(high.handles.real, high.source);
    expect(lowReal.ok && highReal.ok && highReal.bytes.byteLength > lowReal.bytes.byteLength).toBe(true);
  });

  it("returns only compact handles while grids remain in the F07 registry", async () => {
    const session = new ComplexFunctionPreviewSession(spec());
    const bundle = await session.build("high");
    const serialized = JSON.stringify(bundle);
    expect(serialized.length).toBeLessThan(10_000);
    expect(serialized).not.toContain("positions");
    expect(serialized).not.toContain("samples");
    expect(session.artifacts.registry.listMetadata().every((entry) => entry.byteLength !== null && entry.byteLength! <= 256 * 256 * 3 * 4)).toBe(true);
  });

  it("ignores a late preview after the source revision changes", async () => {
    const session = new ComplexFunctionPreviewSession(spec());
    const oldDocument = session.commands.document();
    const result = await session.artifacts.build(oldDocument, "high", { beforePublish: () => {
      session.commands.commit(COMPLEX_COMMAND_TYPES.setDomain, { re: { min: -1, max: 1 }, im: { min: -1, max: 1 }, exclusions: [] });
    } });
    expect(result).toMatchObject({ ignored: true, reason: "stale-source" });
    expect(session.artifacts.resolve(result.handles.real, result.source)).toMatchObject({ ok: false, reason: "stale-source" });
  });

  it("caps drag previews independently of persistent sampling resolution", () => {
    const session = new ComplexFunctionPreviewSession(spec());
    expect(session.artifacts.createDragPreview(session.commands.document(), C(0, 0), 100_000)).toHaveLength(256);
    expect(session.commands.document().identity.revision).toBe(1);
    expect(session.commands.history().undoDepth).toBe(0);
  });

  it("advances artifact provenance when synchronized source changes", async () => {
    const session = new ComplexFunctionPreviewSession(spec());
    const first = await session.build("low");
    const changed = session.synchronize({ ...spec(), fExpr: "1/z", nu: 64, nv: 48 });
    expect(changed.error).toBeUndefined();
    const second = await session.build("low");
    expect(second.source.revision).toBeGreaterThan(first.source.revision);
    expect(second.source.structuralHash).not.toBe(first.source.structuralHash);
    expect(session.artifacts.resolve(first.handles.real, first.source)).toMatchObject({ ok: false, reason: "stale-source" });
  });
});
