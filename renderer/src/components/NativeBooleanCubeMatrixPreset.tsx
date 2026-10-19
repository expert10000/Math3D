import { useRef, useState } from "react";

type Operation = "union" | "intersection" | "difference";
type MatrixRow = { operation: Operation; passed: boolean; detail: string };

type BooleanResponse = {
  ok: boolean;
  error?: string;
  positions?: ArrayBuffer;
  indices?: ArrayBuffer;
  vertexCount?: number;
  triCount?: number;
  boolean?: { kernel?: string };
};

type BooleanBridge = {
  booleanMesh: (request: {
    jobId: string;
    operation: Operation;
    positionsA: ArrayBuffer;
    indicesA: ArrayBuffer;
    positionsB: ArrayBuffer;
    indicesB: ArrayBuffer;
  }) => Promise<BooleanResponse>;
};

const cases: ReadonlyArray<{
  operation: Operation;
  volume: number;
  bounds: readonly [number, number, number, number, number, number];
  vertices: number;
  triangles: number;
}> = [
  { operation: "union", volume: 12, bounds: [-1, 2, -1, 1, -1, 1], vertices: 24, triangles: 44 },
  { operation: "intersection", volume: 4, bounds: [0, 1, -1, 1, -1, 1], vertices: 16, triangles: 28 },
  { operation: "difference", volume: 4, bounds: [-1, 0, -1, 1, -1, 1], vertices: 12, triangles: 20 },
];

function cubeInput() {
  const positionsA = new Float32Array([
    -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
  ]);
  const positionsB = new Float32Array(positionsA);
  for (let i = 0; i < positionsB.length; i += 3) positionsB[i] += 1;
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]);
  return { positionsA, positionsB, indices };
}

function geometryEvidence(positionsBuffer: ArrayBuffer, indicesBuffer: ArrayBuffer) {
  const positions = new Float32Array(positionsBuffer);
  const faces = new Uint32Array(indicesBuffer);
  const bounds = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  let signedVolumeSix = 0;
  for (let i = 0; i < positions.length; i += 3) {
    bounds[0] = Math.min(bounds[0], positions[i]);
    bounds[1] = Math.max(bounds[1], positions[i]);
    bounds[2] = Math.min(bounds[2], positions[i + 1]);
    bounds[3] = Math.max(bounds[3], positions[i + 1]);
    bounds[4] = Math.min(bounds[4], positions[i + 2]);
    bounds[5] = Math.max(bounds[5], positions[i + 2]);
  }
  for (let i = 0; i < faces.length; i += 3) {
    const a = faces[i] * 3;
    const b = faces[i + 1] * 3;
    const c = faces[i + 2] * 3;
    signedVolumeSix +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) +
      positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return { volume: Math.abs(signedVolumeSix / 6), bounds };
}

export function NativeBooleanCubeMatrixPreset() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const runningRef = useRef(false);

  async function runMatrix() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setRows([]);
    try {
      const bridge = (window as unknown as { cgalMesh?: BooleanBridge }).cgalMesh;
      for (const fixture of cases) {
        let row: MatrixRow;
        try {
          if (!bridge?.booleanMesh) throw new Error("Desktop CGAL bridge is unavailable.");
          const { positionsA, positionsB, indices } = cubeInput();
          const result = await bridge.booleanMesh({
            jobId: `cube-matrix-${fixture.operation}-${Date.now()}`,
            operation: fixture.operation,
            positionsA: positionsA.buffer,
            indicesA: indices.buffer,
            positionsB: positionsB.buffer,
            indicesB: indices.buffer,
          });
          if (!result.ok || !result.positions || !result.indices) {
            throw new Error(result.error || "Worker did not return a mesh.");
          }
          const actual = geometryEvidence(result.positions, result.indices);
          const passed = result.boolean?.kernel === "native-cgal" &&
            Math.abs(actual.volume - fixture.volume) < 0.0001 &&
            actual.bounds.every((value, index) => Math.abs(value - fixture.bounds[index]) < 0.0001) &&
            result.vertexCount === fixture.vertices && result.triCount === fixture.triangles;
          row = {
            operation: fixture.operation,
            passed,
            detail: `${result.boolean?.kernel || "unknown backend"}; volume ${actual.volume.toFixed(5)} / ${fixture.volume}; ` +
              `bounds [${actual.bounds.join(", ")}] / [${fixture.bounds.join(", ")}]; ` +
              `${result.vertexCount} vertices, ${result.triCount} triangles`,
          };
        } catch (error) {
          row = { operation: fixture.operation, passed: false, detail: error instanceof Error ? error.message : String(error) };
        }
        setRows((current) => [...current, row]);
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  return (
    <section data-testid="native-boolean-cube-matrix" style={{ border: "1px solid #9ab9c9", borderRadius: 8, padding: 8, marginTop: 8 }}>
      <strong>Overlapping cubes / native CGAL</strong>
      <div>A is [-1, 1] cubed; B is shifted +1 on X. This check does not change the current scene or History.</div>
      <button type="button" onClick={() => void runMatrix()} disabled={running} data-testid="run-native-boolean-cube-matrix">
        {running ? "Running cube matrix..." : "Run all 3 Booleans"}
      </button>
      <div aria-live="polite" data-testid="native-boolean-cube-matrix-results">
        {rows.map((row) => (
          <div key={row.operation}>
            <strong>{row.operation}: {row.passed ? "PASS" : "FAIL"}</strong> {row.detail}
          </div>
        ))}
      </div>
    </section>
  );
}
