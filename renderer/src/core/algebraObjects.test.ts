import { describe, expect, it } from "vitest";
import {
  createAlgebraObjectRecord,
  createStableDocumentId,
  deserializeAlgebraObjectRecord,
  parseAlgebraObjectRecord,
  serializeAlgebraObjectRecord,
  structuralHash,
} from "@math3d/core";

const qId = createStableDocumentId("algebra", "project-1:Q");
const rId = createStableDocumentId("algebra", "project-1:R");
const qRef = { objectId: qId, revision: 1 };

const rationalField = () => createAlgebraObjectRecord({
  id: qId, label: "Q", revision: 1, definition: { kind: "rational-field" },
});

const polynomialRing = () => createAlgebraObjectRecord({
  id: rId, label: "R", revision: 1,
  definition: { kind: "polynomial-ring", coefficientDomain: qRef,
    variables: ["x", "y"], monomialOrder: "degrevlex" },
});

describe("SAGE-A01 algebra object schema", () => {
  it("roundtrips the exact QQ[x,y] definition, parent revision and identity", () => {
    const q = rationalField();
    const r = polynomialRing();
    expect(q.dependencies).toEqual([]);
    expect(r.dependencies).toEqual([qRef]);
    expect(r.contentHash).toBe(structuralHash({ schemaVersion: 1, definition: r.definition }));

    const json = serializeAlgebraObjectRecord(r);
    const reopened = deserializeAlgebraObjectRecord(json);
    expect(reopened).toEqual(r);
    expect(serializeAlgebraObjectRecord(reopened)).toBe(json);
    expect(reopened.definition).toEqual({
      kind: "polynomial-ring", coefficientDomain: qRef,
      variables: ["x", "y"], monomialOrder: "degrevlex",
    });
    expect(reopened.id).toBe(rId);
    expect(reopened.revision).toBe(1);
    expect(Object.isFrozen(reopened)).toBe(true);
    expect(Object.isFrozen(reopened.definition)).toBe(true);
    expect(Object.isFrozen(reopened.dependencies[0])).toBe(true);
    expect(json).not.toContain("sage_eval");
  });

  it("hashes definitions independent of JSON field order, but preserves variable order", () => {
    const r = polynomialRing();
    const reordered = { ...r, definition: { variables: ["x", "y"], monomialOrder: "degrevlex",
      coefficientDomain: { revision: 1, objectId: qId }, kind: "polynomial-ring" } };
    expect(serializeAlgebraObjectRecord(parseAlgebraObjectRecord(reordered))).toBe(serializeAlgebraObjectRecord(r));
    const swapped = createAlgebraObjectRecord({ id: rId, label: "R", revision: 2,
      definition: { kind: "polynomial-ring", coefficientDomain: qRef,
        variables: ["y", "x"], monomialOrder: "degrevlex" } });
    expect(swapped.contentHash).not.toBe(r.contentHash);
    expect(swapped.id).toBe(r.id);
  });

  it("accepts canonical modular and finite field definitions without executable input", () => {
    const modular = createAlgebraObjectRecord({ id: createStableDocumentId("algebra", "Z/12Z"),
      label: "Z12", revision: 1, definition: { kind: "modular-ring", modulus: "12" } });
    const finite = createAlgebraObjectRecord({ id: createStableDocumentId("algebra", "GF(7^2)"),
      label: "F49", revision: 1, definition: { kind: "finite-field", characteristic: 7,
        degree: 2, generator: "a", construction: "canonical" } });
    expect(deserializeAlgebraObjectRecord(serializeAlgebraObjectRecord(modular))).toEqual(modular);
    expect(deserializeAlgebraObjectRecord(serializeAlgebraObjectRecord(finite))).toEqual(finite);
    expect(modular.dependencies).toEqual([]);
    expect(finite.dependencies).toEqual([]);
  });

  it.each([
    ["unknown kind", { kind: "sage-code", code: "2 + 2" }],
    ["duplicate variables", { kind: "polynomial-ring", coefficientDomain: qRef, variables: ["x", "x"], monomialOrder: "lex" }],
    ["invalid variable", { kind: "polynomial-ring", coefficientDomain: qRef, variables: ["x;quit()"], monomialOrder: "lex" }],
    ["missing variables", { kind: "polynomial-ring", coefficientDomain: qRef, variables: [], monomialOrder: "lex" }],
    ["invalid order", { kind: "polynomial-ring", coefficientDomain: qRef, variables: ["x"], monomialOrder: "unsafe" }],
    ["malformed parent", { kind: "polynomial-ring", coefficientDomain: { objectId: "Q", revision: 1 }, variables: ["x"], monomialOrder: "lex" }],
    ["zero parent revision", { kind: "polynomial-ring", coefficientDomain: { objectId: qId, revision: 0 }, variables: ["x"], monomialOrder: "lex" }],
    ["extra definition field", { kind: "rational-field", code: "print(1)" }],
    ["invalid modulus", { kind: "modular-ring", modulus: "01" }],
    ["oversized modulus", { kind: "modular-ring", modulus: "9".repeat(4097) }],
    ["composite characteristic", { kind: "finite-field", characteristic: 9, degree: 2, generator: "a", construction: "canonical" }],
    ["invalid finite degree", { kind: "finite-field", characteristic: 5, degree: 0, generator: "a", construction: "canonical" }],
    ["unvalidated finite construction", { kind: "finite-field", characteristic: 5, degree: 2, generator: "a", construction: "polynomial-code" }],
  ])("rejects %s", (_name, definition) => {
    expect(() => createAlgebraObjectRecord({ id: rId, label: "R", revision: 1,
      definition: definition as never })).toThrow(TypeError);
  });

  it("rejects self references, forged dependency lists, hashes and schema versions", () => {
    const r = polynomialRing();
    expect(() => createAlgebraObjectRecord({ id: rId, label: "R", revision: 1,
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: rId, revision: 1 },
        variables: ["x"], monomialOrder: "lex" } })).toThrow(/cannot depend on itself/);
    expect(() => parseAlgebraObjectRecord({ ...r, dependencies: [] })).toThrow(/dependencies/);
    expect(() => parseAlgebraObjectRecord({ ...r, contentHash: rationalField().contentHash })).toThrow(/contentHash/);
    expect(() => parseAlgebraObjectRecord({ ...r, schemaVersion: 2 })).toThrow(/schema version/);
    expect(() => parseAlgebraObjectRecord({ ...r, kind: "rational-field" })).toThrow(/must match/);
    expect(() => parseAlgebraObjectRecord({ ...r, surprise: true })).toThrow(/unknown fields/);
    expect(() => parseAlgebraObjectRecord({ ...r, label: undefined })).toThrow(TypeError);
  });
});
