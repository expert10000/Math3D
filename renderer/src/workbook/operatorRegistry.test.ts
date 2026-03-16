import { describe, expect, it } from "vitest";
import {
  WORKBOOK_OPERATOR_CATALOG,
  WORKBOOK_OPERATOR_REGISTRY,
  createOperatorRegistry,
} from "./operatorRegistry";

describe("operator registry functional behavior", () => {
  it("indexes custom entries by id", () => {
    const registry = createOperatorRegistry([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);

    expect(registry.list).toHaveLength(2);
    expect(registry.byId.get("a")?.value).toBe(1);
    expect(registry.get("b")?.value).toBe(2);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.get(null)).toBeUndefined();
  });

  it("exposes the workbook operator catalog through registry", () => {
    expect(WORKBOOK_OPERATOR_REGISTRY.list.length).toBe(WORKBOOK_OPERATOR_CATALOG.length);
    const op = WORKBOOK_OPERATOR_REGISTRY.get("surface.geodesicDistance");
    expect(op?.outputs?.[0]?.type).toBe("curve");
  });
});
