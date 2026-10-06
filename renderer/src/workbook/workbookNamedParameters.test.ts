import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate } from "@math3d/core";
import { bindWorkbookNamedParameter, createDefaultWorkbook, createBlockDependencySource, inspectWorkbookDependency,
  normalizeWorkbookNamedParameters, resolveWorkbookFreshness, updateWorkbookNamedParameter, validateWorkbookDependencies,
  workbookDependencyInputSignature, workbookNamedParameterHash, workbookParameterAffectedBlocks, type WorkbookNamedParameter, type WorkbookParamDef } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
const source: WorkbookNamedParameter = { schemaVersion: 1, id: "resolution", label: "Resolution", unit: "samples", min: 17, max: 65, step: 1, value: 33 };
const def: WorkbookParamDef = { id: "sample-count", label: "Samples", kind: "number", unit: "samples", min: 3, max: 101, step: 1, defaultValue: 17 };
const fixture = () => {
  let n = 0; const book = createDefaultWorkbook(() => `b${++n}`); book.namedParameters = [source];
  book.stages[1]!.blocks = [{ id: "consumer", type: "compute", title: "Consumer", compute: { operatorId: "real-operation" } }, { id: "independent", type: "compute", title: "Independent" }];
  book.stages[2]!.blocks = [{ id: "view", type: "visualize", title: "Linked view" }];
  const bound = bindWorkbookNamedParameter(book, source.id, "consumer", def, "binding");
  bound.dependencies!.push({ id: "view-edge", targetBlockId: "view", source: createBlockDependencySource(bound, "consumer") });
  return bound;
};
describe("WB04 named parameters", () => {
  it("invalidates only explicit descendants and preserves independent blocks, outputs and histories", () => {
    const before = fixture(), next = updateWorkbookNamedParameter(before, source.id, { value: 65 });
    expect(workbookParameterAffectedBlocks(next, source.id)).toEqual(["consumer", "view"]);
    const states = resolveWorkbookFreshness(next, null, { consumer: "ok", independent: "ok" });
    expect(states.get("consumer")).toMatchObject({ status: "stale", blockedBySource: false });
    expect(states.get("view")).toMatchObject({ status: "stale", blockedBySource: true });
    expect(states.get("independent")?.status).toBe("current");
    expect(next.stages[1]!.blocks[1]).toBe(before.stages[1]!.blocks[1]);
    expect(next.stages[1]!.blocks[0]!.params?.values[def.id]).toBe(65);
    expect(workbookDependencyInputSignature(next, "consumer")).not.toEqual(workbookDependencyInputSignature(before, "consumer"));
    expect(before.namedParameters![0]!.value).toBe(33);
  });
  it("includes existing inferred input links in the work preview", () => {
    expect(workbookParameterAffectedBlocks(fixture(), source.id, new Map([["independent", ["view"]]]))).toEqual(["consumer", "independent", "view"]);
  });
  it("keeps stable identity on rename and never rebinds removed sources by label", () => {
    const book = fixture(), renamed = updateWorkbookNamedParameter(book, source.id, { label: "New title" });
    expect(workbookNamedParameterHash(renamed.namedParameters![0]!)).toBe(workbookNamedParameterHash(source));
    expect(inspectWorkbookDependency(renamed.dependencies![0]!, renamed, null).status).toBe("current");
    const missing = { ...book, namedParameters: [{ ...source, id: "replacement" }] };
    expect(inspectWorkbookDependency(missing.dependencies![0]!, missing, null).status).toBe("missing");
    expect(resolveWorkbookFreshness(missing, null).get("consumer")?.blockedBySource).toBe(true);
  });
  it("rejects invalid bounds, off-step values, units, duplicate targets and forged fields atomically", () => {
    const book = fixture();
    for (const patch of [{ value: Infinity }, { min: 66 }, { step: 0 }, { step: 2, value: 34 }, { unit: "metres" }])
      expect(() => updateWorkbookNamedParameter(book, source.id, patch)).toThrow();
    expect(() => normalizeWorkbookNamedParameters([{ ...source, executor: "code" }])).toThrow();
    expect(() => bindWorkbookNamedParameter(book, source.id, "consumer", def, "duplicate")).toThrow(/already bound/);
    expect(book.namedParameters).toEqual([source]);
  });
  it("retains named sources and exact bindings through a checksummed Project resource", () => {
    const book = fixture(), adopted = prepareProjectWorkbook(instantiateMath3DProjectTemplate("catenary-study", "named"), book, "adopt");
    const reopened = readProjectWorkbook(adopted.bytes, adopted.reference);
    expect(reopened.namedParameters).toEqual(book.namedParameters); expect(reopened.dependencies).toEqual(book.dependencies);
    validateWorkbookDependencies(reopened);
  });
});
