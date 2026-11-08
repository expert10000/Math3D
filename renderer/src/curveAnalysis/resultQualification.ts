import type { CanonicalCurveDefinition } from "./contracts";
import type { CurveResultCard } from "./resultLifecycle";

export type CurveResultQualification = Readonly<{
  status: "current" | "historical" | "unavailable";
  claim: string;
  verification: string;
  reason: string;
  canPublish: boolean;
}>;

/** Keeps a Curve card's sampled claim separate from its lifecycle and source identity. */
export const qualifyCurveResult = (card: CurveResultCard,
  definition: CanonicalCurveDefinition): CurveResultQualification => {
  const claim = card.series ? "Sampled Curve result" : "Recorded Curve result";
  const verification = card.series
    ? "No independent mathematical check; sampled values have no proven error bound."
    : "No independent mathematical check in this view.";
  if (card.identity.curveId !== definition.identity.curveId ||
      card.identity.curveRevision !== definition.identity.curveRevision)
    return { status: "historical", claim, verification,
      reason: "This result belongs to another Curve revision; retained values are historical.", canPublish: false };
  if (card.state !== "ready" || card.dependencies.some(dependency => dependency.state !== "ready"))
    return { status: "unavailable", claim, verification,
      reason: `The result or a dependency is ${card.state === "ready" ? "not ready" : card.state}.`,
      canPublish: false };
  return { status: "current", claim, verification,
    reason: "The result and dependencies match the current Curve revision.", canPublish: true };
};
