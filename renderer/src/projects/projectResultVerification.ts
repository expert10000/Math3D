export type ProjectResultVerification = Readonly<{
  label: string;
  detail: string;
  scope: "saved-bytes" | "source-only" | "unavailable" | "not-checked";
}>;

/** Reports what this Project view actually checked, separately from producer status. */
export const presentProjectResultVerification = (input: Readonly<{
  kind: "mesh" | "field" | "other";
  savedMeshChecked?: boolean;
  sourceCurrent?: boolean;
}>): ProjectResultVerification => {
  if (input.kind === "mesh") return input.savedMeshChecked
    ? { label: "Saved Mesh evidence checked", detail: "The retained result and exact Mesh generation passed saved-byte checks; mathematical correctness is not proved here.", scope: "saved-bytes" }
    : { label: "Saved Mesh evidence unavailable", detail: "The exact retained generation or its result could not be checked in this view.", scope: "unavailable" };
  if (input.kind === "field") return input.sourceCurrent
    ? { label: "Field source reverified", detail: "The recorded field source is current; the numerical calculation was not independently recomputed here.", scope: "source-only" }
    : { label: "Field source not verified", detail: "The source is pending, missing, changed, or failed verification; saved values remain withheld where required.", scope: "unavailable" };
  return { label: "No independent check in this view", detail: "Inspect the recorded method, source generation, warnings and any module-specific verification before relying on values.", scope: "not-checked" };
};
