import {
  buildExactCellularBoundaryOperators,
  type CellularBoundaryOperators,
} from "./cellularBoundary";
import {
  computeEulerHomologyConsistency,
  type TopologyAlgebraicConsistency,
} from "./algebraicConsistency";
import { deriveFundamentalGroupPresentation, type FundamentalGroupPresentation } from "./fundamentalGroup";
import { computeExactHomology, type TopologyHomologyAnalysis } from "./homology";
import {
  certifyAndClassifySurface,
  type SurfaceClassificationReport,
} from "./surfaceClassification";
import {
  validateCanonicalTopologyObject,
  type TopologyStructuralValidationReport,
} from "./structuralValidation";
import type { TopologyObject, TopologyResult } from "./contracts";

export type CanonicalTopologyAnalysis = {
  topologyObject: TopologyObject;
  structuralValidation: TopologyResult<TopologyStructuralValidationReport>;
  cellularBoundaryOperators: TopologyResult<CellularBoundaryOperators>;
  homology: TopologyResult<TopologyHomologyAnalysis>;
  algebraicConsistency: TopologyResult<TopologyAlgebraicConsistency>;
  fundamentalGroup: TopologyResult<FundamentalGroupPresentation>;
  surfaceClassification: TopologyResult<SurfaceClassificationReport>;
};

/** Runs the shared exact analysis stack for any already-canonical finite 2-complex. */
export const analyzeCanonicalTopologyObject = (input: TopologyObject): CanonicalTopologyAnalysis => {
  const structuralValidation = validateCanonicalTopologyObject(input);
  let topologyObject: TopologyObject = {
    ...input,
    analysis: { ...input.analysis, structuralValidation },
  };
  const cellularBoundaryOperators = buildExactCellularBoundaryOperators(topologyObject, structuralValidation);
  topologyObject = {
    ...topologyObject,
    analysis: { ...topologyObject.analysis, cellularBoundaryOperators },
  };
  const homology = computeExactHomology(topologyObject, cellularBoundaryOperators);
  topologyObject = { ...topologyObject, analysis: { ...topologyObject.analysis, homology } };
  const fundamentalGroup = deriveFundamentalGroupPresentation(topologyObject, structuralValidation, homology);
  topologyObject = { ...topologyObject, analysis: { ...topologyObject.analysis, fundamentalGroup } };
  const algebraicConsistency = computeEulerHomologyConsistency(topologyObject, homology);
  topologyObject = { ...topologyObject, analysis: { ...topologyObject.analysis, algebraicConsistency } };
  const surfaceClassification = certifyAndClassifySurface(
    topologyObject,
    structuralValidation,
    algebraicConsistency
  );
  topologyObject = { ...topologyObject, analysis: { ...topologyObject.analysis, surfaceClassification } };
  return {
    topologyObject,
    structuralValidation,
    cellularBoundaryOperators,
    homology,
    algebraicConsistency,
    fundamentalGroup,
    surfaceClassification,
  };
};
