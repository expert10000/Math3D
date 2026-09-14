import type { TopologyObject, TopologyResult } from "./contracts";
import { createTopologyResult } from "./provenance";
import type { TopologyHomologyAnalysis } from "./homology";

export const TOPOLOGY_ALGEBRAIC_CONSISTENCY_VERSION = "euler-homology-consistency@1" as const;

export type EulerHomologyCoefficientCheck = {
  coefficientDomain: "Z" | "Z/2Z";
  bettiNumbers: [number, number, number];
  homologyEulerCharacteristic: number;
  holds: boolean;
};

export type TopologyAlgebraicConsistency = {
  identity: "χ(X) = c0 - c1 + c2 = β0 - β1 + β2";
  cellCounts: [number, number, number];
  cellularEulerCharacteristic: number;
  coefficientChecks: [EulerHomologyCoefficientCheck, EulerHomologyCoefficientCheck];
  holds: boolean;
};

export const computeEulerHomologyConsistency = (
  object: TopologyObject,
  homologyResult: TopologyResult<TopologyHomologyAnalysis>
): TopologyResult<TopologyAlgebraicConsistency> => {
  if (homologyResult.status !== "exact" || !homologyResult.value) {
    return createTopologyResult({
      status: "unsupported",
      method: "cell-count and homology Euler-characteristic comparison",
      assumptions: ["exact homology over Z and Z/2Z"],
      sourceRevision: object.provenance.source.revision,
      algorithmVersion: TOPOLOGY_ALGEBRAIC_CONSISTENCY_VERSION,
      diagnostics: [{
        code: "algebra/euler-homology-unavailable",
        severity: "error",
        message: "Euler–homology consistency was withheld because exact homology is unavailable.",
      }],
    });
  }

  const cellCounts: [number, number, number] = [
    object.canonical.vertices.length,
    object.canonical.edges.length,
    object.canonical.faces.length,
  ];
  const cellularEulerCharacteristic = cellCounts[0] - cellCounts[1] + cellCounts[2];
  const integralBetti = homologyResult.value.integer.groups.map((group) => group.bettiNumber) as [number, number, number];
  const mod2Betti = homologyResult.value.mod2.groups.map((group) => group.dimension) as [number, number, number];
  const makeCheck = (
    coefficientDomain: EulerHomologyCoefficientCheck["coefficientDomain"],
    bettiNumbers: [number, number, number]
  ): EulerHomologyCoefficientCheck => {
    const homologyEulerCharacteristic = bettiNumbers[0] - bettiNumbers[1] + bettiNumbers[2];
    return {
      coefficientDomain,
      bettiNumbers,
      homologyEulerCharacteristic,
      holds: homologyEulerCharacteristic === cellularEulerCharacteristic,
    };
  };
  const coefficientChecks: TopologyAlgebraicConsistency["coefficientChecks"] = [
    makeCheck("Z", integralBetti),
    makeCheck("Z/2Z", mod2Betti),
  ];
  const holds = coefficientChecks.every((check) => check.holds);

  return createTopologyResult({
    status: holds ? "exact" : "failed",
    value: {
      identity: "χ(X) = c0 - c1 + c2 = β0 - β1 + β2",
      cellCounts,
      cellularEulerCharacteristic,
      coefficientChecks,
      holds,
    },
    method: "exact cellular and homological Euler-characteristic comparison",
    assumptions: [
      "the finite canonical complex has chain groups only in dimensions 0 through 2",
      "Betti numbers come from the exact coefficient-domain computations shown alongside this check",
    ],
    sourceRevision: object.provenance.source.revision,
    algorithmVersion: TOPOLOGY_ALGEBRAIC_CONSISTENCY_VERSION,
    diagnostics: holds ? [] : coefficientChecks
      .filter((check) => !check.holds)
      .map((check) => ({
        code: "algebra/euler-homology-mismatch",
        severity: "error" as const,
        message: `${check.coefficientDomain} Betti Euler value ${check.homologyEulerCharacteristic} does not equal cellular Euler value ${cellularEulerCharacteristic}.`,
      })),
  });
};
