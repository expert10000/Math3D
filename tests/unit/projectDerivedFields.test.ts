import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendProjectDerivedField, buildProjectExplorer, createDerivedFieldDocument,
  createMixedWorkspaceDocument, createStableDocumentId, currentProjectDerivedFieldResult,
  deriveFieldOutput,
  inspectProjectDocumentDelete, listProjectDerivedFields,
  normalizeMixedWorkspaceDocument, parseMath3DProject, projectDerivedFieldsForDocument,
  replaceMath3DProjectWorkspace, reviewProjectDerivedField,
  reviseVectorField3DDocument, serializeMath3DProject, structuralHash,
  vectorField3DExpression,
} from "@math3d/core";
import { createGf03Project, GF03_DERIVED_IDS, gf03VerifyAnalyticSource } from
  "../fixtures/derived-field/gf03Project";

const fixture = new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));

describe("GF-03 typed Project derived fields", () => {
  it("reopens a source → magnitude → plane → line chain with exact generations, units and domain", () => {
    const raw = readFileSync(fixture, "utf8").replace(/\r\n/g, "\n");
    expect(raw).toBe(`${serializeMath3DProject(createGf03Project())}\n`);
    const project = load(), reopened = parseMath3DProject(serializeMath3DProject(project));
    const fields = listProjectDerivedFields(reopened);
    expect(fields.map(item => item.identity.id)).toEqual(Object.values(GF03_DERIVED_IDS));
    const source = reopened.workspace.entries.find(entry => entry.module === "vector3d")!;
    expect(fields[0]!.input).toMatchObject({ kind: "vector3d",
      documentId: source.expected.id, revision: source.expected.revision,
      structuralHash: source.expected.structuralHash });
    expect(fields.map(item => item.operation)).toEqual([
      { kind: "vector-magnitude" },
      { kind: "plane-slice", normalAxis: 2, coordinate: 3, interpolation: "linear" },
      { kind: "line-profile", varyingAxis: 0, fixedCoordinate: 2,
        extent: [-2, 2], samples: 17, interpolation: "linear" },
    ]);
    expect(fields.map(item => [item.output.kind, item.output.axes.length, item.output.unit])).toEqual([
      ["scalar", 3, "m/s"], ["scalar", 2, "m/s"], ["scalar", 1, "m/s"],
    ]);
    expect(fields[2]!.output.axes).toEqual([{ index: 0, name: "x", unit: "m", min: -2, max: 2 }]);
    expect(fields[1]!.input).toMatchObject({ kind: "derived",
      documentId: fields[0]!.identity.id, revision: fields[0]!.identity.revision,
      structuralHash: fields[0]!.identity.structuralHash });
    const review = reviewProjectDerivedField(reopened, GF03_DERIVED_IDS.profile, gf03VerifyAnalyticSource);
    expect(review.status).toBe("current");
    expect(review.cacheKey).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(currentProjectDerivedFieldResult(reopened, GF03_DERIVED_IDS.profile,
      { cacheKey: review.cacheKey!, value: [1, 2, 3] }, gf03VerifyAnalyticSource)).toEqual([1, 2, 3]);
    expect(buildProjectExplorer(reopened).derivedFields).toEqual(fields);
    expect(projectDerivedFieldsForDocument(reopened, source.expected.id, gf03VerifyAnalyticSource)
      .map(item => item.document.identity.id)).toEqual(Object.values(GF03_DERIVED_IDS));
  });

  it("withholds the chain on changed or unverified source generations", () => {
    const project = load();
    expect(reviewProjectDerivedField(project, GF03_DERIVED_IDS.profile, () => false))
      .toMatchObject({ status: "unverified", cacheKey: null });
    const workspace = createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(entry => {
        if (entry.module !== "vector3d" || entry.checkpoint.format !== "math3d.vector-field3d-document") return entry;
        const field = entry.checkpoint.source.field;
        if (field.kind !== "expressions") throw new TypeError("Wrong fixture field.");
        const next = reviseVectorField3DDocument(entry.checkpoint, { ...entry.checkpoint.source,
          field: { ...field, components: [vectorField3DExpression("2*x", "m/s"),
            field.components[1], field.components[2]] } });
        return { ...entry, checkpoint: next, expected: next.identity };
      }) });
    const changed = replaceMath3DProjectWorkspace(project, workspace);
    const savedKey = reviewProjectDerivedField(project, GF03_DERIVED_IDS.profile,
      gf03VerifyAnalyticSource).cacheKey!;
    for (const id of Object.values(GF03_DERIVED_IDS))
      expect(reviewProjectDerivedField(changed, id, gf03VerifyAnalyticSource))
        .toMatchObject({ status: "stale", cacheKey: null });
    expect(currentProjectDerivedFieldResult(changed, GF03_DERIVED_IDS.profile,
      { cacheKey: savedKey, value: [1, 2, 3] }, gf03VerifyAnalyticSource)).toBeNull();
    expect(() => appendProjectDerivedField(changed, GF03_DERIVED_IDS.profile,
      { kind: "line-profile", varyingAxis: 0, fixedCoordinate: 2,
        extent: [-2, 2], samples: 17, interpolation: "linear" },
      { stableKey: "blocked", title: "Blocked" }, gf03VerifyAnalyticSource))
      .toThrow(/not currently verified/);
  });

  it("rejects incompatible units, rank, physical domain and cycles", () => {
    const project = load(), field = project.workspace.entries.find(entry => entry.module === "vector3d")!;
    if (field.checkpoint.format !== "math3d.vector-field3d-document" ||
        field.checkpoint.source.field.kind !== "expressions") throw new Error("Wrong fixture field.");
    const changed = reviseVectorField3DDocument(field.checkpoint, { ...field.checkpoint.source,
      axes: [field.checkpoint.source.axes[0], field.checkpoint.source.axes[1],
        { ...field.checkpoint.source.axes[2], unit: "K" }],
      field: { kind: "expressions", components: [
        field.checkpoint.source.field.components[0], field.checkpoint.source.field.components[1],
        vectorField3DExpression("z", "K/s")] } });
    const incompatible = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(entry => entry.expected.id === field.expected.id ?
        { ...entry, checkpoint: changed, expected: changed.identity } : entry) }));
    expect(() => appendProjectDerivedField(incompatible, field.expected.id,
      { kind: "vector-magnitude" }, { stableKey: "bad-unit", title: "Bad unit" },
      gf03VerifyAnalyticSource)).toThrow(/compatible units/);
    expect(() => deriveFieldOutput(project.workspace.derivedFields![0]!.output,
      { kind: "line-profile", varyingAxis: 0, fixedCoordinate: 2,
        extent: [-2, 2], samples: 17, interpolation: "linear" })).toThrow(/domain/);
    expect(() => appendProjectDerivedField(project, GF03_DERIVED_IDS.magnitude,
      { kind: "plane-slice", normalAxis: 2, coordinate: 40, interpolation: "linear" },
      { stableKey: "bad-plane", title: "Bad plane" }, gf03VerifyAnalyticSource)).toThrow(/domain/);
    const shape = project.workspace.derivedFields![0]!.output;
    const magnitude = project.workspace.derivedFields![0]!;
    const forgedParentShape = createDerivedFieldDocument({ kind: "derived",
      documentId: magnitude.identity.id, revision: magnitude.identity.revision,
      structuralHash: magnitude.identity.structuralHash, shape: { ...shape, unit: "K" } },
    { kind: "plane-slice", normalAxis: 2, coordinate: 0, interpolation: "linear" },
    { stableKey: "gf03-wrong-parent", title: "Wrong parent shape" });
    expect(normalizeMixedWorkspaceDocument({ ...project.workspace,
      derivedFields: [...project.workspace.derivedFields!, forgedParentShape] }).ok).toBe(false);
    const aId = createStableDocumentId("derived-field", "gf03-cycle-a");
    const bId = createStableDocumentId("derived-field", "gf03-cycle-b");
    const input = (documentId: typeof aId) => ({ kind: "derived" as const,
      documentId, revision: 1, structuralHash: structuralHash("cycle"), shape });
    const operation = { kind: "plane-slice" as const, normalAxis: 2 as const,
      coordinate: 0, interpolation: "linear" as const };
    const a = createDerivedFieldDocument(input(bId), operation,
      { stableKey: "gf03-cycle-a", title: "Cycle A" });
    const b = createDerivedFieldDocument(input(aId), operation,
      { stableKey: "gf03-cycle-b", title: "Cycle B" });
    expect(normalizeMixedWorkspaceDocument({ ...project.workspace,
      derivedFields: [...project.workspace.derivedFields!, a, b] }).ok).toBe(false);
    expect(inspectProjectDocumentDelete(project, field.expected.id).canDelete).toBe(false);
  });
});
