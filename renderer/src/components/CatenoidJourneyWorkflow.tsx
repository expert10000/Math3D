import type { KeyboardEvent } from "react";

export const CATENOID_JOURNEY_STEPS = [
  ["study", "Study"], ["curvature", "Curvature"],
  ["comparison", "Comparison"], ["workbook", "Workbook"],
] as const;

export type CatenoidJourneyStep = typeof CATENOID_JOURNEY_STEPS[number][0];

type Props = Readonly<{
  activeStep: CatenoidJourneyStep;
  onSelect: (step: CatenoidJourneyStep) => void;
  documentView?: boolean;
}>;

export function CatenoidJourneyWorkflow({ activeStep, onSelect, documentView = false }: Props) {
  const onStepKeyDown = (event: KeyboardEvent<HTMLButtonElement>, step: CatenoidJourneyStep) => {
    if (documentView) return;
    const order = CATENOID_JOURNEY_STEPS.map(([id]) => id);
    const index = order.indexOf(step);
    const next = event.key === "ArrowRight" ? order[(index + 1) % order.length] :
      event.key === "ArrowLeft" ? order[(index + order.length - 1) % order.length] :
      event.key === "Home" ? order[0] : event.key === "End" ? order[order.length - 1] : null;
    if (next) {
      event.preventDefault();
      onSelect(next);
      window.document.getElementById(`catenoid-flow-tab-${next}`)?.focus();
    }
  };
  const Tag = documentView ? "nav" : "div";
  return <Tag className="catenoid-journey-tabs" role={documentView ? undefined : "tablist"}
    aria-label={documentView ? "Catenoid evidence journey workflow" : "Catenoid journey workflow"}
    data-testid={documentView ? "catenoid-document-workflow" : undefined}>
    <strong className="catenoid-journey-workflow-label" aria-hidden="true">Workflow</strong>
    {CATENOID_JOURNEY_STEPS.map(([id, label], index) =>
      <span className="catenoid-journey-step" key={id}>
        {index > 0 && <span className="catenoid-journey-arrow" aria-hidden="true">→</span>}
        <button type="button" role={documentView ? undefined : "tab"}
          id={documentView ? undefined : `catenoid-flow-tab-${id}`}
          data-testid={`${documentView ? "catenoid-document-step" : "catenoid-flow-tab"}-${id}`}
          aria-current={documentView && activeStep === id ? "step" : undefined}
          aria-selected={documentView ? undefined : activeStep === id}
          aria-controls={documentView ? undefined : "catenoid-flow-panel"}
          tabIndex={documentView || activeStep === id ? 0 : -1}
          onClick={() => onSelect(id)} onKeyDown={event => onStepKeyDown(event, id)}>
          {index + 1} {label}
        </button>
      </span>)}
  </Tag>;
}

export type CatenoidSurfaceStep = "surface" | "analysis" | "curvature" | "compute";

type SurfaceSubflowProps = Readonly<{
  activeStep: CatenoidSurfaceStep;
  computeState: "unavailable" | "ready" | "running" | "computed" | "failed";
  onSelect: (step: CatenoidSurfaceStep) => void;
}>;

const SURFACE_STEPS: ReadonlyArray<readonly [CatenoidSurfaceStep, string]> = [
  ["surface", "Surface"], ["analysis", "Analysis"],
  ["curvature", "Curvature field"], ["compute", "Compute"],
];

export function CatenoidSurfaceSubflow({ activeStep, computeState, onSelect }: SurfaceSubflowProps) {
  const computeLabel = computeState === "running" ? "Computing…" :
    computeState === "computed" ? "Recompute" :
    computeState === "failed" ? "Retry Compute" : "Compute";
  const status = computeState === "computed" ? "Curvature result ready. Continue with 3 Comparison." :
    computeState === "running" ? "Curvature computation in progress." :
    computeState === "unavailable" ? "This Surface source is unavailable for curvature computation." :
    computeState === "failed" ? "Curvature computation failed. Review the Surface result and retry." :
    "Compute curvature, then continue with 3 Comparison.";
  return <div className="catenoid-surface-subflow" data-testid="catenoid-surface-subflow">
    <nav className="catenoid-surface-steps" aria-label="Surface curvature subflow">
      <strong className="catenoid-surface-label" aria-hidden="true">Surface flow</strong>
      {SURFACE_STEPS.map(([id, label], index) =>
        <span className="catenoid-journey-step" key={id}>
          {index > 0 && <span className="catenoid-journey-arrow" aria-hidden="true">→</span>}
          <button type="button" data-testid={`catenoid-surface-step-${id}`}
            aria-current={activeStep === id ? "step" : undefined}
            disabled={id === "compute" && (computeState === "unavailable" || computeState === "running")}
            onClick={() => onSelect(id)}>
            {index + 1} {id === "compute" ? computeLabel : label}
          </button>
        </span>)}
    </nav>
    <p className="catenoid-surface-status" role="status">{status}</p>
  </div>;
}
