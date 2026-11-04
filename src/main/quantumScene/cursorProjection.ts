import type { ImportedQuantumScene } from "./importer";

export type QwzCursorProjectionRequest = Readonly<{ fingerprint: string; runId: string;
  resultSha256: string; k: readonly [number, number]; basisId: string }>;
export type QwzCursorProjection = Readonly<{ sampleIndex: number; k: [number, number];
  distance: number; candidateCount: number; strategy: "nearest-lowest-index";
  target: "bands" | "curvature" }>;

/** Project physical reciprocal coordinates onto a separately verified QWZ sample grid. */
export function projectVerifiedQwzCursor(imported: ImportedQuantumScene,
  request: QwzCursorProjectionRequest): QwzCursorProjection {
  const scene = imported.source;
  if (scene.provenance.model !== "qwz" || scene.provenance.runId !== request.runId ||
      scene.provenance.resultSha256 !== request.resultSha256 ||
      request.basisId !== `qwz:${scene.coordinates.units[0]}` ||
      !Array.isArray(request.k) || request.k.length !== 2 || !request.k.every(Number.isFinite))
    throw new TypeError("QWZ cursor source or reciprocal basis differs.");
  const target = scene.bands ? "bands" : "curvature";
  const positionId = target === "bands" ? scene.bands!.coordinates :
    scene.objects.find(object => object.id === "berry-curvature")?.positions;
  const positions = positionId && imported.arrays.get(positionId);
  if (!positions || positions.length < 3 || positions.length % 3 !== 0 || positions.length > 300_000 * 3)
    throw new TypeError("Target QWZ coordinate grid is unavailable.");
  const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  let best = Infinity, chosen = -1, ties = 0;
  for (let index = 0; index < positions.length / 3; index++) {
    const kx = positions[3 * index], ky = positions[3 * index + 1];
    min[0] = Math.min(min[0], kx); min[1] = Math.min(min[1], ky);
    max[0] = Math.max(max[0], kx); max[1] = Math.max(max[1], ky);
    const distance = Math.hypot(kx - request.k[0], ky - request.k[1]);
    if (distance < best - 1e-10) { best = distance; chosen = index; ties = 1; }
    else if (Math.abs(distance - best) <= 1e-10) ties++;
  }
  if (request.k.some((value, axis) => value < min[axis] - 0.2 || value > max[axis] + 0.2))
    throw new RangeError("QWZ cursor is outside the target reciprocal grid.");
  return { sampleIndex: chosen, k: [positions[3 * chosen], positions[3 * chosen + 1]],
    distance: best, candidateCount: ties, strategy: "nearest-lowest-index", target };
}
