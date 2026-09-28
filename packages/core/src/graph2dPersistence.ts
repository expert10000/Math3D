import { canonicalJsonStringify, createDocumentIdentity, isDocumentIdentity, structuralHash } from "./documentIdentity";
import {
  GRAPH2D_DOCUMENT_FORMAT, GRAPH2D_DOCUMENT_SCHEMA_VERSION, GRAPH2D_EXPLICIT_CAPABILITY,
  GRAPH2D_PARAMETRIC_CAPABILITY,
  GRAPH2D_POLAR_CAPABILITY,
  GRAPH2D_IMPLICIT_CAPABILITY,
  GRAPH2D_INEQUALITY_CAPABILITY,
  GRAPH2D_POINT_SERIES_CAPABILITY,
  GRAPH2D_PIECEWISE_CAPABILITY,
  GRAPH2D_PROBES_CAPABILITY,
  GRAPH2D_MAX_DOCUMENT_BYTES, normalizeGraph2DDocument, type Graph2DDocument,
} from "./graph2dDocument";
import { parseGraph2DExpression } from "./graph2dExpression";
import { createMixedWorkspaceDocument, type MixedWorkspaceDocument } from "./mixedWorkspace";
import type { ValidationResult } from "./validation";

export type Graph2DCompatibilityPreview = Readonly<{
  status: "current" | "migratable" | "unsupported" | "corrupt";
  schemaVersion: number | null;
  title: string | null;
  unsupportedCapabilities: readonly string[];
  reason: string;
}>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const titleOf = (value: Record<string, unknown>): string | null =>
  record(value.metadata) && typeof value.metadata.title === "string" ? value.metadata.title.slice(0, 160) : null;

/** Compatibility inspection does not open or partially accept an unsupported document. */
export const inspectGraph2DCompatibility = (value: unknown): Graph2DCompatibilityPreview => {
  if (!record(value) || value.format !== GRAPH2D_DOCUMENT_FORMAT)
    return { status: "corrupt", schemaVersion: null, title: null, unsupportedCapabilities: [], reason: "Not a Graph2D document." };
  const version = Number.isSafeInteger(value.schemaVersion) ? Number(value.schemaVersion) : null;
  const title = titleOf(value);
  if (version === null || version < 0)
    return { status: "corrupt", schemaVersion: version, title, unsupportedCapabilities: [], reason: "Invalid Graph2D schema version." };
  if (version > GRAPH2D_DOCUMENT_SCHEMA_VERSION)
    return { status: "unsupported", schemaVersion: version, title, unsupportedCapabilities: [], reason: "Future Graph2D schema version." };
  const required = Array.isArray(value.requiredCapabilities) ? value.requiredCapabilities : [];
  const supported = [GRAPH2D_EXPLICIT_CAPABILITY, GRAPH2D_PARAMETRIC_CAPABILITY,
    GRAPH2D_POLAR_CAPABILITY, GRAPH2D_IMPLICIT_CAPABILITY, GRAPH2D_INEQUALITY_CAPABILITY,
    GRAPH2D_POINT_SERIES_CAPABILITY, GRAPH2D_PIECEWISE_CAPABILITY, GRAPH2D_PROBES_CAPABILITY];
  const unsupportedCapabilities = required.filter((capability): capability is string => typeof capability === "string" && !supported.includes(capability as typeof supported[number]));
  if (unsupportedCapabilities.length)
    return { status: "unsupported", schemaVersion: version, title, unsupportedCapabilities, reason: "Graph2D capabilities are unavailable." };
  if (version === 0)
    return { status: "migratable", schemaVersion: version, title, unsupportedCapabilities: [], reason: "Legacy Graph2D source can be migrated." };
  const normalized = normalizeGraph2DDocument(value);
  return normalized.ok
    ? { status: "current", schemaVersion: version, title, unsupportedCapabilities: [], reason: "Graph2D document is supported." }
    : { status: "corrupt", schemaVersion: version, title, unsupportedCapabilities: [], reason: normalized.errors.join(" ") };
};

/** v0 stored expression text; v1 adds a checked, versioned AST and advances the exact source generation. */
export const migrateGraph2DDocument = (value: unknown): ValidationResult<Graph2DDocument> => {
  const preview = inspectGraph2DCompatibility(value);
  if (preview.status === "current") return normalizeGraph2DDocument(value);
  if (preview.status !== "migratable" || !record(value)) return { ok: false, errors: [preview.reason] };
  try {
    const serialized = canonicalJsonStringify(value);
    if (new TextEncoder().encode(serialized).length > GRAPH2D_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["Legacy Graph2D source exceeds size limit."] };
    const legacy = JSON.parse(serialized) as Record<string, unknown>;
    if (!isDocumentIdentity(legacy.identity) || !String(legacy.identity.id).startsWith("math3d:graph2d:") ||
        !record(legacy.source) || !Array.isArray(legacy.source.objects) || !Array.isArray(legacy.source.variables) ||
        legacy.identity.structuralHash !== structuralHash(legacy.source) || legacy.identity.revision >= Number.MAX_SAFE_INTEGER)
      return { ok: false, errors: ["Invalid legacy Graph2D source identity."] };
    const variableNames = ["x", ...legacy.source.variables.map((item: unknown) => record(item) ? item.name : null)];
    if (variableNames.some((name) => typeof name !== "string")) return { ok: false, errors: ["Invalid legacy Graph2D variables."] };
    const objects = legacy.source.objects.map((item: unknown) => {
      if (!record(item) || !record(item.expression) || typeof item.expression.source !== "string" ||
          item.expression.variable !== "x" || Object.keys(item.expression).sort().join("|") !== "source|variable")
        throw new TypeError("Invalid legacy Graph2D expression.");
      const parsed = parseGraph2DExpression(item.expression.source, variableNames as string[]);
      if (!parsed.ok) throw new TypeError(parsed.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
      return { ...item, expression: { ...item.expression, ast: parsed.ast } };
    });
    const source = { ...legacy.source, objects };
    const candidate = { ...legacy, schemaVersion: GRAPH2D_DOCUMENT_SCHEMA_VERSION, source,
      identity: createDocumentIdentity(legacy.identity.id, source, legacy.identity.revision + 1) };
    return normalizeGraph2DDocument(candidate);
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const createGraph2DWorkspaceProject = (document: Graph2DDocument): MixedWorkspaceDocument => {
  const normalized = normalizeGraph2DDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return createMixedWorkspaceDocument({ entries: [{ module: "graph2d", checkpoint: normalized.value,
    expected: normalized.value.identity, replay: null }], activeDocumentIds: [normalized.value.identity.id],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
};
