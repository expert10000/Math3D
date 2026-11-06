import { createAlgebraObjectRecord,
  type AlgebraObjectDefinition, type AlgebraObjectRef } from "./algebraObjects";
import { createProjectAlgebraObjectId } from "./projectAlgebraRegistry";
import { FINITE_GROUP_PRESETS, analyzeFiniteGroup } from "./finiteGroup";
import { upsertMath3DProjectAlgebraObject } from "./math3dProject";
import type { Math3DProject } from "./math3dProject";

export type AlgebraGalleryId = "gf5" | "c4" | "nilpotent-ideal" | "z6-module";
export type AlgebraGalleryExample = Readonly<{ id: AlgebraGalleryId; title: string; category: string;
  explanation: string; expected: readonly string[]; failure: string }>;
export const ALGEBRA_GALLERY_EXAMPLES: readonly AlgebraGalleryExample[] = Object.freeze([
  { id: "gf5", title: "Five-element field", category: "Fields",
    explanation: "GF(5) is the prime field with characteristic and cardinality five.",
    expected: ["characteristic = 5", "cardinality = 5", "every nonzero element has an inverse"],
    failure: "GF(9) with characteristic 9 is invalid: 9 is not prime." },
  { id: "c4", title: "Cyclic group C4", category: "Groups",
    explanation: "One cyclic generator has order four; its square has order two.",
    expected: ["group order = 4", "generator order = 4", "one element has order 2"],
    failure: "A claimed order-four generator with inconsistent images is rejected by group validation." },
  { id: "nilpotent-ideal", title: "Nilpotent affine ideal", category: "Ideals",
    explanation: "In QQ[x,y]/(x²,y), x is nonzero and x²=0; the full ideal is retained.",
    expected: ["ambient ring = QQ[x,y]", "generators = x^2, y", "quotient basis = 1, x"],
    failure: "The generator z is outside the saved QQ[x,y] ambient ring." },
  { id: "z6-module", title: "Torsion module Z/6Z", category: "Modules",
    explanation: "A rank-one ZZ presentation with relation 6e=0.",
    expected: ["relation matrix = [6]", "invariant factor = 6", "free rank = 0"],
    failure: "A relation matrix with a row count different from the ambient rank is invalid." },
]);

/** Saves an entire curated dependency chain in one validated Project transaction. */
export const installAlgebraGalleryExample = (project: Math3DProject, id: AlgebraGalleryId):
  Readonly<{ project: Math3DProject; primary: AlgebraObjectRef; records: number }> => {
  if (!ALGEBRA_GALLERY_EXAMPLES.some((item) => item.id === id)) throw new TypeError("Unknown algebra gallery example.");
  let working = project, records = 0;
  const add = (key: string, label: string, definition: AlgebraObjectDefinition): AlgebraObjectRef => {
    const objectId = createProjectAlgebraObjectId(project.identity.id, `gallery-h04-${id}-${key}`);
    const record = createAlgebraObjectRecord({ id: objectId, revision: 1, label, definition });
    const existing = working.algebraObjects?.find((item) => item.id === objectId);
    if (existing) {
      if (existing.archived || existing.revisions.length !== 1 ||
          existing.revisions[0].contentHash !== record.contentHash)
        throw new TypeError("The gallery object's saved ID was changed or archived; use a fresh Project.");
      return { objectId, revision: 1 };
    }
    working = upsertMath3DProjectAlgebraObject(working, record);
    records += 1;
    return { objectId, revision: 1 };
  };
  let primary: AlgebraObjectRef;
  if (id === "gf5") primary = add("field", "Gallery GF(5)", {
    kind: "finite-field", characteristic: 5, degree: 1, generator: "a", construction: "canonical" });
  else if (id === "c4") {
    const preset = FINITE_GROUP_PRESETS.find((item) => item.id === "C4")!;
    if (analyzeFiniteGroup(preset.definition).order !== 4) throw new TypeError("Gallery C4 fixture changed.");
    primary = add("group", "Gallery C4", preset.definition);
  } else if (id === "nilpotent-ideal") {
    const q = add("qq", "Gallery QQ", { kind: "rational-field" });
    const ring = add("ring", "Gallery QQ[x,y]", { kind: "polynomial-ring", coefficientDomain: q,
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    primary = add("ideal", "Gallery (x²,y)", { kind: "ideal", ambientRing: ring,
      generators: ["x^2", "y"] });
  } else {
    const z = add("zz", "Gallery ZZ", { kind: "integer-ring" });
    primary = add("module", "Gallery Z/6Z", { kind: "module", baseRing: z,
      ambientRank: 1, generators: ["e"], relationMap: { domainRank: 1, codomainRank: 1, matrix: [["6"]] } });
  }
  return { project: working, primary, records };
};
