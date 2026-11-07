import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { updateQuantumFieldView } from "@math3d/core";
import { quantumFieldDocumentFromVerifiedOpen } from "./quantumSceneAdmission";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";

const original = JSON.parse(readFileSync(new URL(
  "../../../tests/fixtures/quantum-scene-orbitals/orbital-3p.qscene/scene.json", import.meta.url), "utf8"));
const opened = (scene: typeof original, stream?: { level: number }) => ({ ok: true, canceled: false,
  directory: "C:\\verified.qscene", remembered: false,
  reference: { directory: "C:\\verified.qscene", sceneFingerprint: "a".repeat(64) },
  document: { title: scene.title, geometry: {}, cameras: [], extensions: { [scene.schema]: { scene } } },
  mappedObjectIds: [], deferredObjectIds: [], deferredFieldIds: scene.fields?.map((field: { id: string }) => field.id) ?? [],
  ...(stream ? { stream: { level: stream.level, levels: [{ id: "preview", label: "preview", bytes: 8 },
    { id: "full", label: "full", bytes: 16 }] } } : {}),
}) as Extract<QuantumSceneOpenResponse, { ok: true }>;

describe("QI-21 verified field promotion", () => {
  it("promotes a single complex field and retains an editable display state", () => {
    const document = quantumFieldDocumentFromVerifiedOpen(opened(original));
    expect(document.source.field.kind).toBe("complex-field");
    const changed = updateQuantumFieldView(document, { ...document.view, fixedIndex: 2, quantity: "phase" });
    expect(changed.source).toEqual(document.source);
    expect(changed.view.fixedIndex).toBe(2);
  });
  it("promotes one scalar field without inventing an imaginary component", () => {
    const scene = structuredClone(original);
    scene.provenance.model = "verified_scalar_grid";
    scene.fields[0].kind = "scalar-field";
    delete scene.fields[0].imaginary;
    scene.datasets = scene.datasets.filter((item: { id: string }) => item.id === scene.fields[0].real);
    const document = quantumFieldDocumentFromVerifiedOpen(opened(scene));
    expect(document.source.field.kind).toBe("scalar-field");
    expect(document.source.field).not.toHaveProperty("imaginary");
    expect(document.view.quantity).toBe("real");
    expect(() => updateQuantumFieldView(document, { ...document.view, quantity: "phase" })).toThrow();
  });
  it("refuses extra objects, mismatched complex units, and an unpinnable full stream level", () => {
    const objects = structuredClone(original); objects.objects = [{ id: "extra", label: "Extra object", kind: "polyline" }];
    expect(() => quantumFieldDocumentFromVerifiedOpen(opened(objects))).toThrow(/one regular/);
    const units = structuredClone(original); units.datasets[1].unit = "different";
    expect(() => quantumFieldDocumentFromVerifiedOpen(opened(units))).toThrow(/components or units/);
    expect(() => quantumFieldDocumentFromVerifiedOpen(opened(original, { level: 1 }))).toThrow(/full stream/);
  });
});
