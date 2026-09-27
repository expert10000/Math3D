import { describe, expect, it } from "vitest";
import {
  createDocumentIdentity, createEmptyGraph2DDocument, createGraph2DDocument, createGraph2DWorkspaceProject,
  inspectGraph2DCompatibility, migrateGraph2DDocument, parseGraph2DExpression,
  parseMixedWorkspaceDocument, replayMixedWorkspaceDocument, serializeMixedWorkspaceDocument,
} from "@math3d/core";

const empty = createEmptyGraph2DDocument("portable-graph");

describe("Graph2D project adapter and migration", () => {
  it("embeds a Graph2D source in the normal mixed workspace and replays it exactly", () => {
    const project = createGraph2DWorkspaceProject(empty);
    const reopened = parseMixedWorkspaceDocument(serializeMixedWorkspaceDocument(project));
    expect(reopened.entries).toHaveLength(1);
    expect(reopened.entries[0]).toMatchObject({ module: "graph2d", expected: empty.identity, replay: null });
    expect(replayMixedWorkspaceDocument(reopened).get(empty.identity.id)).toEqual(empty);
    expect(serializeMixedWorkspaceDocument(reopened)).toBe(serializeMixedWorkspaceDocument(project));
    expect(serializeMixedWorkspaceDocument(project)).not.toContain("samples");
  });

  it("migrates text-only v0 expressions to checked ASTs and advances the generation", () => {
    const parsed = parseGraph2DExpression("x^2");
    if (!parsed.ok) throw new Error("Invalid fixture expression");
    const source = { objects: [{ id: "f_1", kind: "explicit-cartesian" as const, label: "Square",
      expression: { source: "x^2", variable: "x" as const, ast: parsed.ast },
      domain: { min: -2, max: 2, includeMin: true, includeMax: true } }], variables: [], assumptions: [] };
    const current = createGraph2DDocument({ source, stableKey: "legacy-source" });
    const oldSource = { ...source, objects: source.objects.map((item) => ({ ...item,
      expression: { source: item.expression.source, variable: item.expression.variable } })) };
    const old = { ...current, schemaVersion: 0, source: oldSource,
      identity: createDocumentIdentity(current.identity.id, oldSource) };
    expect(inspectGraph2DCompatibility(old).status).toBe("migratable");
    const migrated = migrateGraph2DDocument(old);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.identity.revision).toBe(2);
    expect(migrated.value.source.objects[0]?.expression.ast).toEqual(parsed.ast);
    expect(inspectGraph2DCompatibility(migrated.value).status).toBe("current");
  });

  it("previews future capabilities and fails safely on corrupt or oversized inputs", () => {
    expect(inspectGraph2DCompatibility({ ...empty, schemaVersion: 99 })).toMatchObject({ status: "unsupported", schemaVersion: 99 });
    expect(inspectGraph2DCompatibility({ ...empty, requiredCapabilities: ["graph2d.future.v1"] }))
      .toMatchObject({ status: "unsupported", unsupportedCapabilities: ["graph2d.future.v1"] });
    expect(inspectGraph2DCompatibility({ ...empty, extra: true }).status).toBe("corrupt");
    expect(migrateGraph2DDocument({ ...empty, schemaVersion: 99 }).ok).toBe(false);
    expect(migrateGraph2DDocument({ ...empty, schemaVersion: 0, metadata: { title: "x".repeat(300000) } }).ok).toBe(false);
    expect(() => parseMixedWorkspaceDocument("{".repeat(100))).toThrow();
  });
});
