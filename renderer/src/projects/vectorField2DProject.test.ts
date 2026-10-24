import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProjectExplorer, createGraph2DVectorFieldReference, createMath3DProject,
  createMixedWorkspaceDocument, createVectorField2DDocument, normalizeVectorField2DDocument,
  parseMath3DProject, reviseVectorField2DDocument, serializeMath3DProject,
  sha256Checksum } from "@math3d/core";
import { inspectProjectCompatibility } from "./projectTransfer";

const fixture = readFileSync(fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-flow.sscene/manifest.json", import.meta.url)), "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(fixture)).slice(7);
const reference = createGraph2DVectorFieldReference(fixture, fingerprint,
  { kind: "preset", value: "vortex-flow" }, "field");
const field = () => createVectorField2DDocument({ reference,
  quantity: { name: "Velocity", unit: "m/s" },
  display: { density: [17, 17], maxGlyphs: 512, magnitudeScale: 1 } },
{ stableKey: reference.id, title: "Velocity · 2D vector field" });
const projectFor = (document: ReturnType<typeof field>) => createMath3DProject(createMixedWorkspaceDocument({
  entries: [{ module: "vector2d", checkpoint: document, expected: document.identity, replay: null }],
  activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
  committedSelection: null, constructions: [],
}), { stableKey: "vector2d-project" });

describe("2D vector field Project workspace", () => {
  it("round-trips the paired source and controls without storing sampled values", () => {
    const authored = field();
    const reopened = parseMath3DProject(serializeMath3DProject(projectFor(authored)));
    expect(reopened.workspace.entries[0]?.checkpoint).toEqual(authored);
    expect(buildProjectExplorer(reopened).groups.find(group => group.module === "vector2d")?.documents)
      .toMatchObject([{ title: "Velocity · 2D vector field" }]);
    expect(inspectProjectCompatibility(reopened)).toMatchObject({ canOpenWorkspace: true,
      documents: [{ module: "vector2d", editable: true, replayVerified: true }] });
    expect(serializeMath3DProject(reopened)).not.toContain("values");
    expect(authored.source.reference.components.map(part => part.component)).toEqual(["east", "north"]);
  });

  it("revises display settings with a new identity and rejects out-of-bounds controls", () => {
    const original = field();
    const revised = reviseVectorField2DDocument(original, { ...original.source,
      display: { density: [9, 13], maxGlyphs: 80, magnitudeScale: 1.8 } });
    expect(revised.identity.revision).toBe(original.identity.revision + 1);
    expect(revised.source.display).toEqual({ density: [9, 13], maxGlyphs: 80, magnitudeScale: 1.8 });
    expect(normalizeVectorField2DDocument({ ...revised, source: { ...revised.source,
      display: { ...revised.source.display, maxGlyphs: 513 } } }).ok).toBe(false);
  });
});
