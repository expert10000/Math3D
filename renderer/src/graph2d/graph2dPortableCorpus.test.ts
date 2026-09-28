import { describe, expect, it } from "vitest";
import canonical from "../../../packages/core/fixtures/graph2d/canonical-v1.json";
import legacy from "../../../packages/core/fixtures/graph2d/legacy-v0.json";
import corrupt from "../../../packages/core/fixtures/graph2d/corrupt.json";
import future from "../../../packages/core/fixtures/graph2d/future.json";
import unsupported from "../../../packages/core/fixtures/graph2d/unsupported-capability.json";
import { GRAPH2D_MAX_DOCUMENT_BYTES, inspectGraph2DCompatibility, migrateGraph2DDocument,
  normalizeGraph2DDocument, parseGraph2DDocument, serializeGraph2DDocument } from "@math3d/core";

describe("portable Graph2D schema and migration corpus", () => {
  it("gives independent v1 readers the same canonical identity and hash", () => {
    const parserReader = parseGraph2DDocument(JSON.stringify(canonical));
    const validatorReader = normalizeGraph2DDocument(JSON.parse(JSON.stringify(canonical)));
    expect(validatorReader.ok).toBe(true);
    if (!validatorReader.ok) throw new Error(validatorReader.errors.join(" "));
    expect(parserReader.identity).toEqual(validatorReader.value.identity);
    expect(serializeGraph2DDocument(parserReader)).toBe(serializeGraph2DDocument(validatorReader.value));
  });

  it("migrates legacy input deterministically with matching hashes", () => {
    const left = migrateGraph2DDocument(legacy), right = migrateGraph2DDocument(JSON.parse(JSON.stringify(legacy)));
    expect(left.ok).toBe(true); expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) throw new Error("migration failed");
    expect(left.value.identity.structuralHash).toBe(right.value.identity.structuralHash);
    expect(left.value.identity.revision).toBe(2);
  });

  it("returns stable diagnostics for corrupt, unsupported, future, and oversized fixtures", () => {
    expect(inspectGraph2DCompatibility(corrupt)).toMatchObject({ status: "corrupt" });
    expect(inspectGraph2DCompatibility(unsupported)).toMatchObject({ status: "unsupported",
      unsupportedCapabilities: ["graph2d.future.v9"] });
    expect(inspectGraph2DCompatibility(future)).toMatchObject({ status: "unsupported", reason: "Future Graph2D schema version." });
    const oversized = JSON.stringify({ ...legacy, metadata: { title: "x".repeat(GRAPH2D_MAX_DOCUMENT_BYTES) } });
    const first = migrateGraph2DDocument(JSON.parse(oversized)), second = migrateGraph2DDocument(JSON.parse(oversized));
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: false, errors: ["Legacy Graph2D source exceeds size limit."] });
  });
});
