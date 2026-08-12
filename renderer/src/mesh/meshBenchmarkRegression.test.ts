import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateGeometryMeshReadiness } from "../geometry/meshReadiness";
import { computeMeshQualityReport } from "./meshQualityReport";
import { loadSurfaceMeshFromFile, type SurfaceMeshData } from "./surfaceMesh";
import { computeMeshTopologyInspector } from "./topologyInspector";

type BenchmarkExpected = {
  expected?: {
    boundaryEdges?: number;
    boundaryLoops?: number;
    closed?: boolean;
    components?: number;
    degenerateFacesAtLeast?: number;
    nonManifoldEdges?: number;
    orientationConsistent?: boolean;
    selfIntersectionPairsAtLeast?: number;
  };
  expectedAfterSpatialWeld?: {
    boundaryEdges?: number;
    edges?: number;
    faces?: number;
    uniqueVertices?: number;
  };
};

type MeshBenchmarkAnalysis = {
  boundaryEdges: number;
  boundaryLoops: number;
  closed: boolean;
  components: number;
  degenerateFaces: number;
  edges: number;
  faces: number;
  nonManifoldEdges: number;
  orientationConsistent: boolean | null;
  selfIntersectionPairs: number;
  vertices: number;
};

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const meshRoot = path.join(repoRoot, "tests", "assets", "meshes");

const readFixtureFile = async (relativePath: string): Promise<File> => {
  const bytes = await readFile(path.join(meshRoot, relativePath));
  return new File([bytes], path.basename(relativePath));
};

const loadMeshFixture = async (relativePath: string): Promise<SurfaceMeshData> =>
  loadSurfaceMeshFromFile([await readFixtureFile(relativePath)], { mergeVertices: true });

const loadExpected = async (relativePath: string): Promise<BenchmarkExpected> => {
  const parsed = path.parse(relativePath);
  const text = await readFile(path.join(meshRoot, "expected", `${parsed.name}.json`), "utf8");
  return JSON.parse(text) as BenchmarkExpected;
};

const analyzeBenchmarkMesh = (mesh: SurfaceMeshData): MeshBenchmarkAnalysis => {
  const topology = computeMeshTopologyInspector(mesh, { rowLimit: 16, itemLimit: 16 });
  if (!topology) throw new Error(`Topology analysis failed for ${mesh.label}`);

  const quality = computeMeshQualityReport(mesh, { maxListedDefects: 256 });
  const readiness = evaluateGeometryMeshReadiness(mesh);

  return {
    boundaryEdges: topology.boundaryEdgeCount,
    boundaryLoops: topology.boundaryLoops.length,
    closed: topology.closed,
    components: topology.connectedComponentCount,
    degenerateFaces: quality.topology.degenerateFaceCount,
    edges: topology.edgeCount,
    faces: topology.faceCount,
    nonManifoldEdges: topology.nonManifoldEdgeCount,
    orientationConsistent: topology.orientationConsistent,
    selfIntersectionPairs: readiness.stats.suspectedSelfIntersectionPairs,
    vertices: topology.vertexCount,
  };
};

const expectExpectedFields = (analysis: MeshBenchmarkAnalysis, expected: BenchmarkExpected) => {
  const exact = expected.expected;
  if (exact?.components != null) expect(analysis.components).toBe(exact.components);
  if (exact?.boundaryEdges != null) expect(analysis.boundaryEdges).toBe(exact.boundaryEdges);
  if (exact?.boundaryLoops != null) expect(analysis.boundaryLoops).toBe(exact.boundaryLoops);
  if (exact?.nonManifoldEdges != null) expect(analysis.nonManifoldEdges).toBe(exact.nonManifoldEdges);
  if (exact?.closed != null) expect(analysis.closed).toBe(exact.closed);
  if (exact?.orientationConsistent != null) expect(analysis.orientationConsistent).toBe(exact.orientationConsistent);

  if (exact?.degenerateFacesAtLeast != null) {
    expect(analysis.degenerateFaces).toBeGreaterThanOrEqual(exact.degenerateFacesAtLeast);
  }
  if (exact?.selfIntersectionPairsAtLeast != null) {
    expect(analysis.selfIntersectionPairs).toBeGreaterThanOrEqual(exact.selfIntersectionPairsAtLeast);
  }
};

describe("Math3D mesh benchmark fixtures", () => {
  it("detects the open boundary benchmark through the production OBJ importer", async () => {
    const mesh = await loadMeshFixture("problematic/15_open_boundary.obj");
    const analysis = analyzeBenchmarkMesh(mesh);

    expectExpectedFields(analysis, await loadExpected("problematic/15_open_boundary.obj"));
    expect(analysis.components).toBe(1);
    expect(analysis.boundaryEdges).toBe(4);
    expect(analysis.boundaryLoops).toBe(1);
    expect(analysis.nonManifoldEdges).toBe(0);
    expect(analysis.closed).toBe(false);
  });

  it.each([
    ["problematic/16_non_manifold_edge.obj", "nonManifoldEdges", 1],
    ["problematic/17_disconnected_components.obj", "components", 3],
  ] as const)("matches expected topology metadata for %s", async (fixturePath, key, value) => {
    const mesh = await loadMeshFixture(fixturePath);
    const analysis = analyzeBenchmarkMesh(mesh);

    expectExpectedFields(analysis, await loadExpected(fixturePath));
    expect(analysis[key]).toBe(value);
  });

  it("detects degenerate benchmark faces through the production OBJ importer", async () => {
    const mesh = await loadMeshFixture("problematic/18_degenerate_faces.obj");
    const analysis = analyzeBenchmarkMesh(mesh);

    expectExpectedFields(analysis, await loadExpected("problematic/18_degenerate_faces.obj"));
    expect(analysis.degenerateFaces).toBeGreaterThanOrEqual(3);
  });

  it("detects inconsistent benchmark winding through Mesh Analyse orientation checks", async () => {
    const mesh = await loadMeshFixture("problematic/19_inconsistent_normals.obj");
    const analysis = analyzeBenchmarkMesh(mesh);

    expectExpectedFields(analysis, await loadExpected("problematic/19_inconsistent_normals.obj"));
    expect(analysis.orientationConsistent).toBe(false);
  });

  it("detects the self-intersection benchmark through the Mesh Analyse readiness check", async () => {
    const mesh = await loadMeshFixture("problematic/20_self_intersection.obj");
    const analysis = analyzeBenchmarkMesh(mesh);

    expectExpectedFields(analysis, await loadExpected("problematic/20_self_intersection.obj"));
    expect(analysis.selfIntersectionPairs).toBeGreaterThanOrEqual(1);
  });

  it("reconstructs ASCII STL cube topology after spatial welding", async () => {
    const mesh = await loadMeshFixture("basic/03_cube_ascii.stl");
    const analysis = analyzeBenchmarkMesh(mesh);
    const expected = await loadExpected("basic/03_cube_ascii.stl");

    expect(analysis.vertices).toBe(expected.expectedAfterSpatialWeld?.uniqueVertices);
    expect(analysis.edges).toBe(expected.expectedAfterSpatialWeld?.edges);
    expect(analysis.faces).toBe(expected.expectedAfterSpatialWeld?.faces);
    expect(analysis.boundaryEdges).toBe(expected.expectedAfterSpatialWeld?.boundaryEdges);
  });
});
