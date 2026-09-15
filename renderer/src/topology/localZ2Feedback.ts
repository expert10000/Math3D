import {
  computeLocalZ2Homology,
  constructExactSparseBoundaryMatrices,
  type LocalZ2HomologyLimits,
  type LocalZ2HomologyOutcome,
  type TopologyDocument,
} from "@math3d/core";
import { canonicalizeFundamentalDiagramTopologyDocument } from "./canonicalFinite2DAdapter";

/** Executes the complete T03 -> T06 -> T07 local feedback path for the current document. */
export const computeFundamentalDiagramLocalZ2Feedback = (
  document: TopologyDocument,
  limits?: Partial<LocalZ2HomologyLimits>
): LocalZ2HomologyOutcome => {
  const canonical = canonicalizeFundamentalDiagramTopologyDocument(document);
  if (canonical.status !== "canonicalized") {
    return {
      status: canonical.status === "unsupported" ? "unsupported" : "failed",
      diagnostics: canonical.diagnostics.map(({ code, message }) => ({ code, message })),
    };
  }
  const boundary = constructExactSparseBoundaryMatrices(canonical, document);
  if (boundary.status !== "exact") return boundary;
  return computeLocalZ2Homology({
    boundaryMatrices: boundary.payload,
    boundaryMatrixHandle: boundary.handle,
    currentSource: canonical.source,
    ...(limits ? { limits } : {}),
  });
};
