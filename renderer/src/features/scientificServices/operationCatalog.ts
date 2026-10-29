import { SAGE_SYMBOLIC_OPERATIONS, type SageSymbolicOperation } from "../../integrations/sage/sageSchemas";

export type ScientificServiceContext = "surface" | "geometry";
export type ScientificServicePreset = "All" | "Basic" | "Symbolic" | "Numerical" | "Algebraic Geometry" | "Number Theory";

export const SCIENTIFIC_SERVICE_PRESETS: readonly ScientificServicePreset[] = [
  "All", "Basic", "Symbolic", "Numerical", "Algebraic Geometry", "Number Theory",
];

export type ScientificOperationEntry = {
  id: SageSymbolicOperation;
  label: string;
  engine: "SageMath";
  presets: readonly ScientificServicePreset[];
  contexts: readonly ScientificServiceContext[];
};

const BOTH: readonly ScientificServiceContext[] = ["surface", "geometry"];
const SURFACE: readonly ScientificServiceContext[] = ["surface"];

// This is a UI catalog. The Sage schema and worker still validate the executable contract.
export const SCIENTIFIC_OPERATION_CATALOG: readonly ScientificOperationEntry[] = [
  { id: "sage.symbolic.simplify", label: "Simplify", engine: "SageMath", presets: ["Basic", "Symbolic"], contexts: BOTH },
  { id: "sage.symbolic.factor", label: "Factor", engine: "SageMath", presets: ["Basic", "Symbolic"], contexts: BOTH },
  { id: "sage.symbolic.expand", label: "Expand", engine: "SageMath", presets: ["Symbolic"], contexts: BOTH },
  { id: "sage.symbolic.solve", label: "Solve", engine: "SageMath", presets: ["Basic", "Symbolic"], contexts: BOTH },
  { id: "sage.symbolic.gradient", label: "Gradient", engine: "SageMath", presets: ["Basic", "Symbolic"], contexts: SURFACE },
  { id: "sage.symbolic.hessian", label: "Hessian", engine: "SageMath", presets: ["Symbolic"], contexts: SURFACE },
  { id: "sage.symbolic.singularities", label: "Singularities", engine: "SageMath", presets: ["Algebraic Geometry"], contexts: SURFACE },
  { id: "sage.matrix.eigen_exact", label: "Exact eigen", engine: "SageMath", presets: ["Symbolic"], contexts: BOTH },
  { id: "sage.matrix.charpoly", label: "Characteristic polynomial", engine: "SageMath", presets: ["Symbolic"], contexts: BOTH },
  { id: "sage.polynomial.roots_exact", label: "Exact algebraic roots", engine: "SageMath", presets: ["Symbolic", "Algebraic Geometry"], contexts: BOTH },
  { id: "sage.polynomial.factor", label: "Exact polynomial factor", engine: "SageMath", presets: ["Symbolic", "Algebraic Geometry"], contexts: BOTH },
  { id: "sage.groebner.compute", label: "Groebner basis", engine: "SageMath", presets: ["Algebraic Geometry"], contexts: BOTH },
  { id: "sage.numberTheory.gcd", label: "GCD", engine: "SageMath", presets: ["Number Theory"], contexts: BOTH },
  { id: "sage.numberTheory.modInverse", label: "Mod inverse", engine: "SageMath", presets: ["Number Theory"], contexts: BOTH },
];

export const scientificOperationsFor = (
  context: ScientificServiceContext,
  preset: ScientificServicePreset = "All",
): readonly ScientificOperationEntry[] => SCIENTIFIC_OPERATION_CATALOG.filter(
  (entry) => entry.contexts.includes(context) && (preset === "All" || entry.presets.includes(preset)),
);

if (new Set(SCIENTIFIC_OPERATION_CATALOG.map((entry) => entry.id)).size !== SCIENTIFIC_OPERATION_CATALOG.length ||
    SCIENTIFIC_OPERATION_CATALOG.length !== SAGE_SYMBOLIC_OPERATIONS.length ||
    SCIENTIFIC_OPERATION_CATALOG.some((entry) => !SAGE_SYMBOLIC_OPERATIONS.includes(entry.id))) {
  throw new Error("Scientific Services catalog and Sage operation schema differ.");
}
