export type SceneValidationCheck = { name: string; status: "checked" | "warning" | "unavailable";
  detail: string };

/** Read-only dashboard for source evidence available after scene import. */
export function quantumSceneValidation(scene: {
  datasets: readonly { id: string }[]; objects: readonly { id: string }[];
  topology?: { invariants: readonly { label: string; value: number | null; status: string; method: string }[];
    limitations: readonly string[] };
}, source: { fingerprint: string; mappedObjectIds: readonly string[];
  deferredObjectIds: readonly string[]; deferredFieldIds: readonly string[] }): SceneValidationCheck[] {
  const checks: SceneValidationCheck[] = [
    { name: "Source identity", status: /^[a-f0-9]{64}$/.test(source.fingerprint) ? "checked" : "warning",
      detail: `Opened source fingerprint ${source.fingerprint}; datasets were checked by the scene importer before display.` },
    { name: "Mapped geometry", status: source.deferredObjectIds.length ? "warning" : "checked",
      detail: `${source.mappedObjectIds.length} mapped objects of ${scene.objects.length}; ${source.deferredObjectIds.length} objects and ${source.deferredFieldIds.length} fields deferred.` },
  ];
  for (const invariant of scene.topology?.invariants ?? []) checks.push({ name: invariant.label,
    status: invariant.value !== null && invariant.status === "verified" ? "checked" : "warning",
    detail: `Producer ${invariant.status}; ${invariant.value ?? "undefined"}; method ${invariant.method}. No invariant is recomputed in Math3D.` });
  for (const limitation of scene.topology?.limitations ?? []) checks.push({ name: "Source warning", status: "warning", detail: limitation });
  for (const name of ["Hermiticity", "Normalization", "Trace", "Orthogonality", "Convergence"])
    checks.push({ name, status: "unavailable", detail: `${name} evidence is not a general field in this scene contract; inspect the saved producer run for model-specific checks.` });
  if (!scene.topology?.invariants.length) checks.push({ name: "Topological invariant", status: "unavailable",
    detail: "No producer invariant is recorded for this scene." });
  return checks;
}
