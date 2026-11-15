import { describe, expect, it } from "vitest";
import { applyAndContinueOperation, beginOperation, cancelOperation, commitOperation, updateOperation, validateOperation } from "./operationTransaction";

type Model = { vertices: number[] };
const clone = (model: Model): Model => ({ vertices: [...model.vertices] });

describe("operation transaction", () => {
  it("cancels to the exact pre-operation model after preview changes", () => {
    const source = { vertices: [1, 2, 3] };
    const started = beginOperation({ id: "split-1", workspace: "mesh", label: "Split Edge", selectionSummary: "Edge e-1", snapshot: source, clone });
    const updated = updateOperation(started, { vertices: [1, 2, 3, 4] }, { ratio: 0.5 }, clone);
    source.vertices[0] = 9;
    expect(cancelOperation(updated, clone)).toEqual({ vertices: [1, 2, 3] });
  });

  it("blocks invalid previews and records parameters once on apply", () => {
    const started = beginOperation({ id: "split-2", workspace: "geometry", label: "Split Edge", selectionSummary: "Edge e-2", snapshot: { vertices: [1, 2] }, clone });
    expect(() => commitOperation(started, clone)).toThrow("not been validated");
    const invalid = validateOperation(updateOperation(started, { vertices: [1, 2, 3] }, { ratio: 1.5 }, clone), (_, parameters) => Number(parameters.ratio) > 1 ? ["Ratio must be between 0 and 1."] : []);
    expect(() => commitOperation(invalid, clone)).toThrow("Ratio must be between 0 and 1.");
    const valid = validateOperation(updateOperation(started, { vertices: [1, 2, 3] }, { ratio: 0.5 }, clone), () => []);
    expect(commitOperation(valid, clone)).toEqual({
      state: { vertices: [1, 2, 3] },
      history: { transactionId: "split-2", workspace: "geometry", label: "Split Edge", parameters: { ratio: 0.5 } },
    });
    const continued = applyAndContinueOperation(valid, "split-3", clone);
    expect(continued.next.before).toEqual(continued.state);
    expect(continued.next.id).toBe("split-3");
  });
});
