import { describe, expect, it } from "vitest";
import { SAGE_SYMBOLIC_OPERATIONS } from "../../integrations/sage/sageSchemas";
import { SCIENTIFIC_OPERATION_CATALOG, scientificOperationsFor } from "./operationCatalog";

describe("Scientific Services contextual operation catalog", () => {
  it("registers each Sage operation once with the executable schema", () => {
    expect(SCIENTIFIC_OPERATION_CATALOG.map((entry) => entry.id).sort()).toEqual([...SAGE_SYMBOLIC_OPERATIONS].sort());
  });

  it("offers the same simplify contract in Surface and Geometry", () => {
    const surface = scientificOperationsFor("surface", "Basic").find((entry) => entry.id === "sage.symbolic.simplify");
    const geometry = scientificOperationsFor("geometry", "Basic").find((entry) => entry.id === "sage.symbolic.simplify");
    expect(surface).toBe(geometry);
    expect(surface?.engine).toBe("SageMath");
  });

  it("filters contextual and unimplemented operations without inventing capabilities", () => {
    expect(scientificOperationsFor("surface", "Symbolic").some((entry) => entry.id === "sage.symbolic.gradient")).toBe(true);
    expect(scientificOperationsFor("geometry", "Symbolic").some((entry) => entry.id === "sage.symbolic.gradient")).toBe(true);
    expect(scientificOperationsFor("geometry", "Numerical")).toEqual([]);
  });

  it("composes every registered Sage operation in CAS without changing Surface or Geometry contracts", () => {
    expect(scientificOperationsFor("cas").map((entry) => entry.id).sort()).toEqual([...SAGE_SYMBOLIC_OPERATIONS].sort());
    expect(scientificOperationsFor("cas", "Number Theory").map((entry) => entry.id)).toEqual([
      "sage.numberTheory.gcd", "sage.numberTheory.modInverse",
    ]);
    expect(scientificOperationsFor("cas", "Basic").find((entry) => entry.id === "sage.symbolic.simplify"))
      .toBe(scientificOperationsFor("surface", "Basic").find((entry) => entry.id === "sage.symbolic.simplify"));
  });

  it("registers Graph symbolic and polynomial operations through the same catalog entries", () => {
    const graph = scientificOperationsFor("graphs");
    expect(graph.map((entry) => entry.id)).toEqual([
      "sage.symbolic.simplify", "sage.symbolic.factor", "sage.symbolic.expand", "sage.symbolic.solve",
      "sage.polynomial.roots_exact", "sage.polynomial.factor",
    ]);
    expect(graph[0]).toBe(scientificOperationsFor("surface")[0]);
    expect(scientificOperationsFor("graphs", "Number Theory")).toEqual([]);
  });

  it("offers the existing GCD and modular inverse contracts in Number Theory", () => {
    const numberTheory = scientificOperationsFor("number_theory");
    expect(numberTheory.map((entry) => entry.id)).toEqual([
      "sage.numberTheory.gcd", "sage.numberTheory.modInverse",
    ]);
    expect(scientificOperationsFor("number_theory", "Number Theory")).toEqual(numberTheory);
    expect(numberTheory[0]).toBe(scientificOperationsFor("cas", "Number Theory")[0]);
    expect(scientificOperationsFor("number_theory", "Basic")).toEqual([]);
  });
});
