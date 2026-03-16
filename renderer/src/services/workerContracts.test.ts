import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cgalHealth, cgalPing, cgalVersion, runCgalMesh, stopCgalWorker } from "./cgalMeshClient";
import { runGeodesicHeat } from "./geodesicHeatClient";
import { getPythonWorkerDiagnostics } from "./pythonWorkerDiagnosticsClient";
import { vtkCleanNormals, vtkPreviewImplicit } from "./vtkMeshClient";

type AnyWindow = Window & {
  cgalMesh?: any;
  vtkMesh?: any;
  pythonWorkerDiagnostics?: any;
};

const setWindowApi = (api: Partial<AnyWindow>) => {
  (globalThis as any).window = api;
};

describe("renderer worker contracts", () => {
  beforeEach(() => {
    setWindowApi({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setWindowApi({});
  });

  it("returns unavailable errors when CGAL IPC is missing", async () => {
    await expect(cgalHealth()).resolves.toEqual({ ok: false, error: "CGAL IPC unavailable" });
    await expect(cgalPing()).resolves.toEqual({ ok: false, error: "CGAL IPC unavailable" });
    await expect(cgalVersion()).resolves.toEqual({ ok: false, error: "CGAL IPC unavailable" });
    await expect(stopCgalWorker()).resolves.toEqual({ ok: false, error: "CGAL IPC unavailable" });
  });

  it("injects jobId when running CGAL mesh", async () => {
    const mesh = vi.fn().mockResolvedValue({ ok: true, positions: [0, 0, 0], indices: [0, 1, 2] });
    setWindowApi({ cgalMesh: { mesh } });

    const req = {
      f: "x*x + y*y + z*z",
      iso: 1,
      domain: { min: [-1, -1, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
      quality: { target_edge: 0.1 },
      verbose: true,
    };
    const res = await runCgalMesh(req);

    expect(res.ok).toBe(true);
    expect(mesh).toHaveBeenCalledTimes(1);
    const call = mesh.mock.calls[0][0];
    expect(call).toMatchObject(req);
    expect(typeof call.jobId).toBe("string");
    expect(call.jobId.length).toBeGreaterThan(0);
  });

  it("injects jobId when running geodesic heat", async () => {
    const geodesicHeat = vi.fn().mockResolvedValue({ ok: true, polyline: [[0, 0, 0], [1, 0, 0]], length: 1 });
    setWindowApi({ cgalMesh: { geodesicHeat } });

    const req = {
      mesh: { V: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], F: [[0, 1, 2]] },
      source: { face: 0, bary: [1, 0, 0] as [number, number, number] },
      target: { face: 0, bary: [0, 1, 0] as [number, number, number] },
      options: { return_phi: true },
    };
    const res = await runGeodesicHeat(req);

    expect(res.ok).toBe(true);
    expect(geodesicHeat).toHaveBeenCalledTimes(1);
    const call = geodesicHeat.mock.calls[0][0];
    expect(call).toMatchObject(req);
    expect(typeof call.jobId).toBe("string");
    expect(call.jobId.length).toBeGreaterThan(0);
  });

  it("returns unavailable error when VTK IPC is missing", async () => {
    const res = await vtkPreviewImplicit({
      expr: "x^2 + y^2 + z^2",
      iso: 1,
      domain: { min: [-1, -1, -1], max: [1, 1, 1] },
      resolution: 16,
    });
    expect(res).toEqual({ ok: false, error: "VTK IPC unavailable" });
  });

  it("normalizes VTK typed arrays and computes fallback counts", async () => {
    const cleanNormals = vi.fn().mockResolvedValue({
      ok: true,
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    });
    setWindowApi({ vtkMesh: { cleanNormals } });

    const res = await vtkCleanNormals(
      Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      Uint32Array.from([0, 1, 2]),
      { computeNormals: true }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.positions).toBeInstanceOf(Float32Array);
      expect(res.indices).toBeInstanceOf(Uint32Array);
      expect(res.vertexCount).toBe(3);
      expect(res.triCount).toBe(1);
    }
    expect(cleanNormals).toHaveBeenCalledTimes(1);
    const call = cleanNormals.mock.calls[0][0];
    expect(call.options).toEqual({ computeNormals: true });
    expect(typeof call.jobId).toBe("string");
  });

  it("passes through VTK preview explicit counts", async () => {
    const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer;
    const indices = Uint32Array.from([0, 1, 2]).buffer;
    const previewImplicit = vi.fn().mockResolvedValue({
      ok: true,
      positions,
      indices,
      vertexCount: 77,
      triCount: 55,
    });
    setWindowApi({ vtkMesh: { previewImplicit } });

    const res = await vtkPreviewImplicit({
      expr: "x^2 + y^2 + z^2",
      iso: 1,
      domain: { min: [-1, -1, -1], max: [1, 1, 1] },
      resolution: 24,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.vertexCount).toBe(77);
      expect(res.triCount).toBe(55);
      expect(res.positions).toBeInstanceOf(Float32Array);
      expect(res.indices).toBeInstanceOf(Uint32Array);
    }
    expect(previewImplicit).toHaveBeenCalledTimes(1);
    const call = previewImplicit.mock.calls[0][0];
    expect(call.expr).toBe("x^2 + y^2 + z^2");
    expect(typeof call.jobId).toBe("string");
  });

  it("returns diagnostics fallback when API is missing, invalid, or failing", async () => {
    const missing = await getPythonWorkerDiagnostics();
    expect(missing.available).toBe(false);
    expect(missing.statusMessage).toContain("IPC unavailable");
    expect(missing.lastError?.code).toBe("DIAGNOSTICS_IPC_UNAVAILABLE");

    setWindowApi({ pythonWorkerDiagnostics: { getStatus: vi.fn().mockResolvedValue("bad") } });
    const invalid = await getPythonWorkerDiagnostics();
    expect(invalid.available).toBe(false);
    expect(invalid.statusMessage).toContain("Invalid");
    expect(invalid.lastError?.code).toBe("DIAGNOSTICS_IPC_UNAVAILABLE");

    setWindowApi({ pythonWorkerDiagnostics: { getStatus: vi.fn().mockRejectedValue(new Error("boom")) } });
    const failed = await getPythonWorkerDiagnostics();
    expect(failed.available).toBe(false);
    expect(failed.statusMessage).toContain("boom");
    expect(failed.lastError?.code).toBe("DIAGNOSTICS_IPC_UNAVAILABLE");
  });
});
