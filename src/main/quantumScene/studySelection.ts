import type { ImportedQuantumScene } from "./importer";

/** Link only the shared physical ky coordinate; sorted strip states are not tracked bulk bands. */
export function projectVerifiedHofstadterStudySample(source: ImportedQuantumScene, target: ImportedQuantumScene,
  sourceObjectId: string, sourceSampleIndex: number, targetObjectId: string) {
  const a = source.source, b = target.source;
  if (a.provenance.model !== "hofstadter" || b.provenance.model !== "hofstadter" ||
      a.provenance.runId !== b.provenance.runId ||
      a.provenance.resultSha256 !== b.provenance.resultSha256)
    throw new Error("Study panels do not share the exact saved Hofstadter result");
  const sourceStrip = a.objects.some(item => item.id === "strip-left");
  const targetStrip = b.objects.some(item => item.id === "strip-left");
  if (sourceStrip === targetStrip) throw new Error("Study needs one bulk and one strip panel");
  const sourceUnit = a.coordinates.units[sourceStrip ? 0 : 1];
  const targetUnit = b.coordinates.units[targetStrip ? 0 : 1];
  if (sourceUnit !== targetUnit) throw new Error("Hofstadter ky units differ");
  const sourceObject = a.objects.find(item => item.id === sourceObjectId);
  const targetObject = b.objects.find(item => item.id === targetObjectId);
  if (!sourceObject || !targetObject) throw new Error("Unknown study selection object");
  if ((sourceStrip ? !["strip-left", "strip-right"].includes(sourceObjectId) : !a.bands?.objects.includes(sourceObjectId)) ||
      (targetStrip ? !["strip-left", "strip-right"].includes(targetObjectId) : !b.bands?.objects.includes(targetObjectId)))
    throw new Error("Study selection must use a declared bulk band or strip weight object");
  const sourcePoints = source.arrays.get(sourceObject.positions)!;
  const targetPoints = target.arrays.get(targetObject.positions)!;
  if (!Number.isSafeInteger(sourceSampleIndex) || sourceSampleIndex < 0 || sourceSampleIndex >= sourcePoints.length / 3)
    throw new Error("Study sample index is outside the verified object");
  const ky = sourcePoints[sourceSampleIndex * 3 + (sourceStrip ? 0 : 1)];
  const candidates: number[] = [];
  for (let index = 0; index < targetPoints.length / 3; index++)
    if (Math.abs(targetPoints[index * 3 + (targetStrip ? 0 : 1)] - ky) <= 1e-10) candidates.push(index);
  return { axis: "ky" as const, value: ky, unit: sourceUnit, candidateCount: candidates.length,
    status: candidates.length === 0 ? "outside" as const : candidates.length === 1 ? "matched" as const : "ambiguous" as const,
    sampleIndex: candidates.length === 1 ? candidates[0] : null };
}
