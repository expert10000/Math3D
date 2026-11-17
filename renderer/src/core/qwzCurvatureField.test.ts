import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGraph2DFieldReference, createScientificFieldDocument, parseScientificSceneManifest } from "@math3d/core";
import { importQuantumSceneBundle } from "../../../src/main/quantumScene/importer";
import { qwzCurvatureScientificField, writeQwzCurvatureScientificField } from "../../../src/main/quantumScene/qwzCurvatureField";

const fixture = fileURLToPath(new URL("../../../tests/fixtures/quantum-scene/run-97a132d1d712414bb62bb8c9212f517e.qscene", import.meta.url));
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it("promotes only the supplied regular QWZ curvature grid with its reciprocal units", async () => {
  const imported = await importQuantumSceneBundle(fixture);
  const prepared = qwzCurvatureScientificField(imported);
  const checked = parseScientificSceneManifest(JSON.stringify(prepared.manifest));
  expect(checked.ok).toBe(true);
  if (!checked.ok) return;
  expect(checked.value.datasets[0]).toMatchObject({ shape: [21, 21], semanticType: "scalar-field",
    quantity: { unit: "dimensionless (a=1)" } });
  expect(checked.value.coordinates[0].axes).toEqual([
    { name: "kx", unit: "rad / lattice constant" },
    { name: "ky", unit: "rad / lattice constant" },
  ]);
  const root = await mkdtemp(join(tmpdir(), "m3d-qwz-field-")); temporary.push(root);
  const written = await writeQwzCurvatureScientificField(imported, root);
  const ref = createGraph2DFieldReference(written.manifestJson, written.fingerprint,
    { kind: "directory", value: written.directory }, "berry-curvature", "scalar");
  const field = createScientificFieldDocument({ reference: ref,
    quantity: { name: "Lower-band Berry curvature", unit: "dimensionless (a=1)" },
    display: { view: "plane", normalAxis: null, fixedIndex: null, transfer: { mode: "symmetric" } } },
    { stableKey: written.sourceFingerprint });
  expect(field.source.reference.shape).toEqual([21, 21]);
  expect(field.source.reference.axes[0].origin).toBeCloseTo(-2.9919930034188504);
  expect(await writeQwzCurvatureScientificField(imported, root)).toEqual(written);
  const changed = { ...imported, arrays: new Map(imported.arrays) };
  const values = Float64Array.from(changed.arrays.get("curvature")!);
  values[0]! += 0.1; changed.arrays.set("curvature", values);
  expect(() => qwzCurvatureScientificField(changed)).toThrow(/positions do not match|bytes changed/);
});
