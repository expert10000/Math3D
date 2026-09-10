import { describe, expect, it } from "vitest";
import type { AnalysisIdentity } from "./contracts";
import { createAnalysisRegistry, resolveAnalysisDependencies } from "./registry";
import {
  createAnalysisResultStore,
  getAnalysisResult,
  upsertAnalysisResult,
} from "./resultStore";

type CustomQuantity = "source" | "derived" | "report";

const identity: AnalysisIdentity = {
  key: "custom:sample@revision-1",
  revision: "revision-1",
  label: "Analytical sample",
};

describe("shared analysis result store", () => {
  it("invalidates a custom analytical quantity and all of its transitive dependents", () => {
    const registry = createAnalysisRegistry<CustomQuantity>([
      { kind: "source", label: "Source", family: "custom", domain: "point" },
      {
        kind: "derived",
        label: "Derived quantity",
        family: "custom",
        domain: "point",
        dependencies: [{ kind: "source" }],
      },
      {
        kind: "report",
        label: "Quantity report",
        family: "custom",
        domain: "object",
        dependencies: [{ kind: "derived" }],
      },
    ]);
    let store = createAnalysisResultStore<CustomQuantity, AnalysisIdentity>();
    store = upsertAnalysisResult(store, {
      identity,
      kind: "source",
      payload: { value: 2 },
      now: 1,
    });
    store = upsertAnalysisResult(store, {
      identity,
      kind: "derived",
      dependencies: resolveAnalysisDependencies(registry, store, identity, "derived"),
      payload: { value: 4 },
      now: 2,
    });
    store = upsertAnalysisResult(store, {
      identity,
      kind: "report",
      dependencies: resolveAnalysisDependencies(registry, store, identity, "report"),
      payload: { summary: "four" },
      now: 3,
    });

    expect(getAnalysisResult(store, identity, "derived")?.state).toBe("ready");
    expect(getAnalysisResult(store, identity, "report")?.state).toBe("ready");

    store = upsertAnalysisResult(store, {
      identity,
      kind: "source",
      payload: { value: 3 },
      now: 4,
    });

    expect(getAnalysisResult(store, identity, "source")?.state).toBe("ready");
    expect(getAnalysisResult(store, identity, "derived")?.state).toBe("stale");
    expect(getAnalysisResult(store, identity, "report")?.state).toBe("stale");
    expect(store.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "derived", state: "stale" }),
      expect.objectContaining({ kind: "report", state: "stale" }),
    ]));
  });
});
