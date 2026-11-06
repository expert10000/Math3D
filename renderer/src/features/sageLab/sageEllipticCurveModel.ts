import { createAlgebraObjectRecord, createProjectAlgebraObjectId, ellipticCurveFacts,
  inspectProjectAlgebraFreshness, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectRef, type Math3DProject } from "@math3d/core";

export const createEllipticCurveStarter = (project: Math3DProject, label: string,
  baseField: AlgebraObjectRef, a: string, b: string, stableKey: string) => {
  const name = label.trim();
  if (!name || name.length > 120 || project.algebraObjects?.some((entry) => !entry.archived &&
      entry.revisions.at(-1)?.label.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new TypeError("Choose a unique curve name of 1–120 characters in this Project.");
  const entry = project.algebraObjects?.find((item) => item.id === baseField.objectId);
  const parent = entry?.revisions[baseField.revision - 1];
  if (!entry || entry.archived || !parent || baseField.revision !== entry.revisions.length ||
      inspectProjectAlgebraFreshness(project).find((item) => item.objectId === entry.id)?.status !== "fresh")
    throw new TypeError("Choose the current fresh revision of a saved base field.");
  const field = parent.definition;
  if (field.kind !== "rational-field" && (field.kind !== "finite-field" || field.degree !== 1 ||
      field.characteristic < 5 || field.characteristic > 1009))
    throw new TypeError("Choose QQ or prime GF(p), 5 ≤ p ≤ 1009.");
  const facts = ellipticCurveFacts(a.trim(), b.trim(),
    field.kind === "finite-field" ? field.characteristic : 0);
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, stableKey),
    revision: 1, label: name, definition: { kind: "elliptic-curve", baseField,
      model: "short-weierstrass", a: facts.a, b: facts.b } });
  upsertMath3DProjectAlgebraObject(project, record);
  return { record, facts };
};
