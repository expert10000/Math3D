import { extractVectorField3DSpeedIsosurface, planVectorField3DIsosurface,
  vectorField3DIsosurfaceSampler, VectorField3DNeededTile, VectorField3DVerifiedTileCache,
  verifyVectorField3DVolumes, type VectorField3DClipBounds, type VectorField3DDocument,
  type VectorField3DVerifiedTile, type VectorField3DVolumes } from "@math3d/core";

type Start = { document: VectorField3DDocument; clipBounds: VectorField3DClipBounds;
  level: number; triangleBudget: number;
  scientific?: { manifestJson: string; fingerprint: string;
    volumes?: VectorField3DVolumes; tileMode?: boolean } };
type Message = Start | { tilesResponse: VectorField3DVerifiedTile[] };
let start: Start | null = null;
let cache: VectorField3DVerifiedTileCache | null = null;
let plan: ReturnType<typeof planVectorField3DIsosurface> | null = null;
let speeds: Float64Array | null = null;
let cursor = 0;
let boundedSample: ReturnType<typeof vectorField3DIsosurfaceSampler> | null = null;
const run = () => {
  if (!start || !plan || !speeds) throw new Error("Isosurface worker is not initialized.");
  const coordinates = plan.coordinates;
  const ny = coordinates[1].length, nz = coordinates[2].length;
  while (cursor < speeds.length) {
    const x = Math.floor(cursor / (ny * nz));
    const y = Math.floor(cursor / nz) % ny;
    const z = cursor % nz;
    const point = [coordinates[0][x]!, coordinates[1][y]!, coordinates[2][z]!] as const;
    try {
      const vector = cache ? cache.sample(point) : boundedSample?.(point);
      if (!vector || vector.some(value => !Number.isFinite(value)))
        throw new TypeError("The field is undefined inside the isosurface clipping box.");
      speeds[cursor] = Math.hypot(...vector);
      cursor++;
    } catch (cause) {
      if (cause instanceof VectorField3DNeededTile) {
        self.postMessage({ tileRequests: { indices: cause.indicesBatch } });
        return;
      }
      throw cause;
    }
  }
  const result = extractVectorField3DSpeedIsosurface(start.document, plan, speeds,
    start.level, start.triangleBudget);
  const complete = cache ? { ...result, verifiedTiles: cache.provenance,
    residentTileBytes: cache.residentBytes } : result;
  self.postMessage({ ok: true, result: complete },
    [result.positions.buffer, result.normals.buffer, result.indices.buffer]);
};
self.onmessage = async (event: MessageEvent<Message>) => {
  try {
    if ("tilesResponse" in event.data) {
      if (!cache) throw new Error("Unexpected isosurface tile response.");
      for (const transfer of event.data.tilesResponse) await cache.addAsync(transfer);
      run(); return;
    }
    start = event.data;
    const { document, scientific } = start;
    if (scientific?.tileMode) {
      cache = new VectorField3DVerifiedTileCache(document, scientific.manifestJson,
        scientific.fingerprint);
    } else if (document.source.field.kind === "scientific-bundle") {
      if (!scientific?.volumes) throw new TypeError("Verified source volumes are required.");
      const volumes = verifyVectorField3DVolumes(document, scientific.manifestJson,
        scientific.fingerprint, scientific.volumes);
      boundedSample = vectorField3DIsosurfaceSampler(document, volumes);
    } else boundedSample = vectorField3DIsosurfaceSampler(document);
    plan = planVectorField3DIsosurface(document, start.clipBounds, 64_000,
      scientific?.volumes?.[0]?.sampleShape);
    speeds = new Float64Array(plan.coordinates.reduce((count, axis) => count * axis.length, 1));
    run();
  } catch (cause) {
    self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
};
