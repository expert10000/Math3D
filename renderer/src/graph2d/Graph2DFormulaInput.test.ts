import { describe, expect, it } from "vitest";
import { insertGraph2DFormulaFunction } from "./Graph2DFormulaInput";

describe("Graph formula buttons", () => {
  it("wraps selected text with a supported function", () => {
    expect(insertGraph2DFormulaFunction("x+theta", 2, 7, "sin"))
      .toEqual({ value: "x+sin(theta)", cursor: 11 });
  });

  it("inserts an empty function at the caret and leaves the caret inside", () => {
    expect(insertGraph2DFormulaFunction("x+1", 2, 2, "exp"))
      .toEqual({ value: "x+exp()1", cursor: 6 });
  });
});
