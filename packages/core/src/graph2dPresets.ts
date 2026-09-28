import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { createGraph2DDocument, parseGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import { Graph2DPointTableStore, type Graph2DPointRow } from "./graph2dPointSeries";

export const GRAPH2D_PRESET_FORMAT = "math3d.graph2d-preset" as const;
export const GRAPH2D_PRESET_CATEGORIES = ["Algebra", "Trigonometry", "Calculus", "Parametric", "Polar", "Implicit and regions", "Piecewise and data"] as const;
export type Graph2DPresetCategory = typeof GRAPH2D_PRESET_CATEGORIES[number];
export type Graph2DPreset = Readonly<{
  format: typeof GRAPH2D_PRESET_FORMAT; schemaVersion: 1; id: string; version: number; digest: string;
  title: string; description: string; category: Graph2DPresetCategory; tags: readonly string[];
  difficulty: "basic" | "intermediate" | "advanced"; learningGoals: readonly string[];
  featuredOrder: number | null; costClass: "starter" | "complex";
  template: Graph2DDocument; sidecars: readonly Readonly<{ id: string; rows: readonly Graph2DPointRow[] }>[];
  requiredCapabilities: Graph2DDocument["requiredCapabilities"];
  attribution: Readonly<{ author: string; source: string; license: string }>;
}>;
export type Graph2DPresetInput = Omit<Graph2DPreset, "format" | "schemaVersion" | "digest" | "requiredCapabilities">;
const keys = ["format", "schemaVersion", "id", "version", "digest", "title", "description", "category", "tags", "difficulty", "learningGoals", "featuredOrder", "costClass", "template", "sidecars", "requiredCapabilities", "attribution"];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, fields: readonly string[]) => Object.keys(v).length === fields.length && fields.every((k) => Object.hasOwn(v, k));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= max;
const bytes = (v: unknown) => new TextEncoder().encode(canonicalJsonStringify(v)).length;
const freeze = <T>(v: T): T => {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
};
const digest = (v: Omit<Graph2DPreset, "digest"> | Graph2DPreset) => {
  const { digest: _ignored, ...payload } = v as Graph2DPreset;
  return structuralHash(payload);
};

/** Validate the entire catalog item, including canonical mathematical source and external data. */
export const parseGraph2DPreset = (raw: string): Graph2DPreset => {
  if (new TextEncoder().encode(raw).length > 2 * 1024 * 1024) throw new TypeError("Preset exceeds size limit.");
  const v: unknown = JSON.parse(raw);
  if (!record(v) || !exact(v, keys) || v.format !== GRAPH2D_PRESET_FORMAT || v.schemaVersion !== 1 ||
    !text(v.id, 80) || !/^[a-z][a-z0-9-]*$/.test(v.id) || !Number.isSafeInteger(v.version) || Number(v.version) < 1 ||
    !text(v.title, 160) || !text(v.description, 1200) || !GRAPH2D_PRESET_CATEGORIES.includes(v.category as Graph2DPresetCategory) ||
    !["basic", "intermediate", "advanced"].includes(String(v.difficulty)) || !["starter", "complex"].includes(String(v.costClass)) ||
    !(v.featuredOrder === null || Number.isSafeInteger(v.featuredOrder) && Number(v.featuredOrder) >= 0 && Number(v.featuredOrder) < 128) ||
    !Array.isArray(v.tags) || v.tags.length > 16 || !v.tags.every((tag) => text(tag, 48)) || new Set(v.tags).size !== v.tags.length ||
    !Array.isArray(v.learningGoals) || v.learningGoals.length > 8 || !v.learningGoals.every((goal) => text(goal, 240)) ||
    !record(v.attribution) || !exact(v.attribution, ["author", "source", "license"]) ||
    !text(v.attribution.author, 160) || !text(v.attribution.source, 500) || !text(v.attribution.license, 80))
    throw new TypeError("Invalid or unsupported Graph preset manifest.");
  const template = parseGraph2DDocument(canonicalJsonStringify(v.template));
  if (template.source.objects.length < 1 || template.source.objects.length > 6 ||
    canonicalJsonStringify(template.requiredCapabilities) !== canonicalJsonStringify(v.requiredCapabilities))
    throw new TypeError("Preset objects or capabilities are invalid.");
  if (!Array.isArray(v.sidecars) || v.sidecars.length > 6) throw new TypeError("Invalid preset sidecars.");
  const store = new Graph2DPointTableStore(), tableIds = new Set<string>();
  for (const sidecar of v.sidecars) {
    if (!record(sidecar) || !exact(sidecar, ["id", "rows"]) || !Array.isArray(sidecar.rows) || sidecar.rows.length > 128)
      throw new TypeError("Invalid preset point table.");
    // Explicit row keys stop arbitrary metadata sneaking into otherwise valid tables.
    if (!sidecar.rows.every((row) => record(row) && exact(row, ["id", "x", "y"]))) throw new TypeError("Invalid preset point rows.");
    const reference = store.publish(sidecar.rows as Graph2DPointRow[]);
    if (sidecar.id !== reference.id || tableIds.has(reference.id)) throw new TypeError("Preset sidecar identity mismatch.");
    tableIds.add(reference.id);
  }
  const referenced = new Set<string>();
  for (const object of template.source.objects) if (object.kind === "point-series") {
    if (!store.resolve(object.table)) throw new TypeError("Missing or corrupt preset point table.");
    referenced.add(object.table.id);
  }
  if (referenced.size !== tableIds.size) throw new TypeError("Unreferenced preset sidecar.");
  if (bytes({ ...v, sidecars: [] }) > 128 * 1024) throw new TypeError("Preset manifest exceeds 128 KiB.");
  if (v.digest !== digest(v as unknown as Graph2DPreset)) throw new TypeError("Preset digest mismatch.");
  return freeze({ ...v, template } as Graph2DPreset);
};
export const createGraph2DPreset = (input: Graph2DPresetInput): Graph2DPreset => {
  const payload = { ...input, format: GRAPH2D_PRESET_FORMAT, schemaVersion: 1 as const,
    requiredCapabilities: input.template.requiredCapabilities };
  return parseGraph2DPreset(canonicalJsonStringify({ ...payload, digest: digest(payload) }));
};
export const serializeGraph2DPreset = (preset: Graph2DPreset): string => canonicalJsonStringify(parseGraph2DPreset(canonicalJsonStringify(preset)));

/** Host supplies a fresh launch token; catalog IDs never become user project identities. */
export const instantiateGraph2DPreset = (preset: Graph2DPreset, instanceKey: string): Readonly<{
  document: Graph2DDocument; sidecars: Graph2DPreset["sidecars"];
  origin: Readonly<{ presetId: string; version: number; digest: string }>;
}> => {
  if (!text(instanceKey, 160)) throw new TypeError("A fresh preset launch token is required.");
  const verified = parseGraph2DPreset(serializeGraph2DPreset(preset));
  const document = createGraph2DDocument({ stableKey: ["gallery-launch", verified.id, verified.version, instanceKey],
    source: verified.template.source, display: verified.template.display, selection: verified.template.selection, title: verified.title });
  return { document, sidecars: verified.sidecars, origin: { presetId: verified.id, version: verified.version, digest: verified.digest } };
};

export const createGraph2DPresetRegistry = (items: readonly Graph2DPreset[]) => {
  if (items.length > 128) throw new TypeError("Catalog exceeds 128 entries.");
  const entries = freeze(items.map((item) => parseGraph2DPreset(serializeGraph2DPreset(item))));
  if (new Set(entries.map((item) => item.id)).size !== entries.length) throw new TypeError("Duplicate preset ID.");
  if (new Set(entries.filter((item) => item.featuredOrder !== null).map((item) => item.featuredOrder)).size !==
    entries.filter((item) => item.featuredOrder !== null).length) throw new TypeError("Duplicate featured order.");
  return Object.freeze({ entries, get: (id: string) => entries.find((item) => item.id === id),
    filter: (query = "", category: Graph2DPresetCategory | "All" = "All") => {
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      return entries.filter((item) => (category === "All" || item.category === category) &&
        words.every((word) => [item.title, item.description, item.category, ...item.tags].join(" ").toLowerCase().includes(word)));
    } });
};
