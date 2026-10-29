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
    expect(scientificOperationsFor("geometry", "Symbolic").some((entry) => entry.id === "sage.symbolic.gradient")).toBe(false);
    expect(scientificOperationsFor("geometry", "Numerical")).toEqual([]);
  });
});
