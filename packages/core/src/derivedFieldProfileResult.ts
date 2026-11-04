import { canonicalJsonStringify, isStableDocumentId, isStructuralHash,
  type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { isScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import type { ValidationResult } from "./validation";
import type { VectorField3DSliceArtifact } from "./vectorField3DSlices";

export const DERIVED_FIELD_PROFILE_MAX_SAMPLES = 2048;
export type DerivedFieldProfileResult = Readonly<{
  profileId: StableDocumentId;
  cacheKey: StructuralHash;
  source: ScientificSourceGeneration;
  method: "analytic-expression" | "verified-volume-trilinear";
  axis: Readonly<{ name: string; unit: string; min: number; max: number }>;
  unit: string;
  rows: readonly Readonly<{ x: number; y: number | null }>[];
  verifiedSamples?: NonNullable<VectorField3DSliceArtifact["verifiedSamples"]>;
}>;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const label = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 80 &&
  value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);

export const normalizeDerivedFieldProfileResult = (value: unknown): ValidationResult<DerivedFieldProfileResult> => {
  if (!record(value) || !Object.keys(value).every(key =>
      ["profileId", "cacheKey", "source", "method", "axis", "unit", "rows", "verifiedSamples"].includes(key)) ||
      ["profileId", "cacheKey", "source", "method", "axis", "unit", "rows"].some(key => !Object.hasOwn(value, key)) ||
      !isStableDocumentId(value.profileId) ||
      !value.profileId.startsWith("math3d:derived-field:") ||
      !isStructuralHash(value.cacheKey) || !isScientificSourceGeneration(value.source) ||
      !["analytic-expression", "verified-volume-trilinear"].includes(String(value.method)) || !record(value.axis) ||
      !exact(value.axis, ["name", "unit", "min", "max"]) ||
      !label(value.axis.name) || !label(value.axis.unit) ||
      !finite(value.axis.min) || !finite(value.axis.max) || value.axis.min >= value.axis.max ||
      !label(value.unit) || !Array.isArray(value.rows) ||
      value.rows.length < 2 || value.rows.length > DERIVED_FIELD_PROFILE_MAX_SAMPLES)
    return { ok: false, errors: ["Invalid derived field profile result."] };
  if (value.method === "analytic-expression" && value.verifiedSamples !== undefined ||
      value.method === "verified-volume-trilinear" &&
      (!Array.isArray(value.verifiedSamples) || value.verifiedSamples.length !== 3 ||
        value.verifiedSamples.some((item: unknown) => !record(item) ||
          typeof item.name !== "string" || !/^[a-f0-9]{64}$/.test(String(item.sampleSha256)))))
    return { ok: false, errors: ["Verified profile transfer evidence is missing or invalid."] };
  const axis = value.axis as DerivedFieldProfileResult["axis"];
  const rows = value.rows as unknown[];
  if (rows.some((row, index) => !record(row) || !exact(row, ["x", "y"]) ||
      !finite(row.x) || row.x < axis.min || row.x > axis.max ||
      row.y !== null && !finite(row.y) ||
      index > 0 && row.x <= (rows[index - 1] as { x: number }).x) ||
      (rows[0] as { x: number }).x !== axis.min ||
      (rows[rows.length - 1] as { x: number }).x !== axis.max)
    return { ok: false, errors: ["Derived profile samples disagree with the physical axis."] };
  try { return { ok: true, value: JSON.parse(canonicalJsonStringify(value)) as DerivedFieldProfileResult }; }
  catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};
