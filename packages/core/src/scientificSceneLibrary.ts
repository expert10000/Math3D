import { isGraph2DFieldLocator, type Graph2DFieldLocator } from "./graph2dFieldReference";

/** Project catalog metadata. Source bytes and the scene manifest remain outside the Project. */
export type ScientificSceneLibraryReference = Readonly<{
  sceneId: string;
  title: string;
  locator: Graph2DFieldLocator;
  fingerprint: string;
  datasets: readonly Readonly<{
    id: string;
    kind: "vector" | "scalar" | "complex";
    title: string;
    shape: readonly [number, number, number];
    unit: string;
    ready: boolean;
  }>[];
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  keys.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => keys.includes(key));
const id = (value: unknown): value is string => typeof value === "string" &&
  /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value);
const label = (value: unknown) => typeof value === "string" && value.length > 0 &&
  value.length <= 160 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);

export function isScientificSceneLibraryReference(value: unknown): value is ScientificSceneLibraryReference {
  if (!record(value) || !exact(value, ["sceneId", "title", "locator", "fingerprint", "datasets"]) ||
      !id(value.sceneId) || !label(value.title) || !isGraph2DFieldLocator(value.locator) ||
      typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
      !Array.isArray(value.datasets) || value.datasets.length < 1 || value.datasets.length > 128) return false;
  const ids = new Set<string>();
  for (const dataset of value.datasets) {
    if (!record(dataset) || !exact(dataset, ["id", "kind", "title", "shape", "unit", "ready"]) ||
        !id(dataset.id) || ids.has(dataset.id) || !["vector", "scalar", "complex"].includes(String(dataset.kind)) ||
        !label(dataset.title) || typeof dataset.unit !== "string" || dataset.unit.length > 80 ||
        !Array.isArray(dataset.shape) || dataset.shape.length !== 3 ||
        dataset.shape.some(size => !Number.isSafeInteger(size) || size < 1 || size > 1_000_000) ||
        typeof dataset.ready !== "boolean") return false;
    ids.add(dataset.id as string);
  }
  return true;
}

export const scientificSceneLibraryKey = (source: Pick<ScientificSceneLibraryReference, "locator">): string =>
  `${source.locator.kind}:${source.locator.value}`;
