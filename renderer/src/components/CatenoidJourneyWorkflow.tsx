import type { KeyboardEvent } from "react";

export const CATENOID_JOURNEY_STEPS = [
  ["study", "Study"], ["curvature", "Curvature"],
  ["comparison", "Comparison"], ["workbook", "Workbook"],
] as const;

export type CatenoidJourneyStep = typeof CATENOID_JOURNEY_STEPS[number][0];

export type CatenoidJourneySubstep = "open" | "sources" | "surface" | "analysis" | "curvature" | "compute" |
  "inspect" | "publish" | "review" | "save";

const JOURNEY_SUBFLOWS: Record<CatenoidJourneyStep, Readonly<{
  title: string; steps: readonly Readonly<{ id: CatenoidJourneySubstep; label: string; detail: string }>[];
}>> = {
  study: { title: "Study subflow", steps: [
    { id: "open", label: "Open Study", detail: "Open the saved Study layout and its linked documents." },
    { id: "sources", label: "Source panes", detail: "Inspect the exact Surface and Mesh references in the Study." },
  ] },
  curvature: { title: "Curvature subflow", steps: [
    { id: "surface", label: "Surface", detail: "Open the saved catenoid source and 3D viewer." },
    { id: "analysis", label: "Analysis", detail: "Open differential geometry tools on the saved Surface." },
    { id: "curvature", label: "Curvature field", detail: "Choose the field and show its compute controls." },
    { id: "compute", label: "Compute", detail: "Calculate and display curvature when Surface samples are ready." },
  ] },
  comparison: { title: "Comparison subflow", steps: [
    { id: "inspect", label: "Inspect pair", detail: "View the saved Surface and Mesh together before publication." },
    { id: "publish", label: "Publish ridge", detail: "Choose a ridge and Mesh to record checked comparison evidence." },
  ] },
  workbook: { title: "Workbook subflow", steps: [
    { id: "review", label: "Review", detail: "Open the Workbook created by the checked comparison." },
    { id: "save", label: "Save Project", detail: "Keep the staged Curve, result and Workbook in the Project." },
  ] },
};

export function CatenoidJourneySubflowTabs({ mainStep, activeSubstep, onSelect }: {
  mainStep: CatenoidJourneyStep; activeSubstep: CatenoidJourneySubstep;
  onSelect: (substep: CatenoidJourneySubstep) => void;
}) {
  const subflow = JOURNEY_SUBFLOWS[mainStep];
  const selected = subflow.steps.find(step => step.id === activeSubstep) ?? subflow.steps[0]!;
  return <section className="catenoid-context-subflow" data-testid="catenoid-context-subflow" data-main-step={mainStep}>
    <nav className="catenoid-context-subflow-steps" aria-label={subflow.title}>
      <strong>{subflow.title}</strong>
      {subflow.steps.map((step, index) => <span className="catenoid-journey-step" key={step.id}>
        {index > 0 && <span className="catenoid-journey-arrow" aria-hidden="true">→</span>}
        <button type="button" data-testid={`catenoid-project-substep-${step.id}`}
          aria-current={selected.id === step.id ? "step" : undefined}
          onClick={() => onSelect(step.id)}>{index + 1} {step.label}</button>
      </span>)}
    </nav>
    <p role="status">{selected.detail}</p>
  </section>;
}

type Props = Readonly<{
  activeStep: CatenoidJourneyStep;
  onSelect: (step: CatenoidJourneyStep) => void;
  documentView?: boolean;
  onClear?: () => void;
}>;

export function CatenoidJourneyWorkflow({ activeStep, onSelect, documentView = false, onClear }: Props) {
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
    {onClear && <button type="button" className="catenoid-journey-clear" data-testid="catenoid-document-clear-journey"
      title="Close this guide; saved Project evidence is kept." onClick={onClear}>Clear journey</button>}
  </Tag>;
}

export type CatenoidSurfaceStep = "surface" | "analysis" | "curvature" | "compute";

type SurfaceSubflowProps = Readonly<{
  activeStep: CatenoidSurfaceStep;
  computeState: "preparing" | "unavailable" | "ready" | "running" | "computed" | "failed";
  onSelect: (step: CatenoidSurfaceStep) => void;
  onRetrySamples?: () => void;
  savedMesh?: Readonly<{ title: string; count: number; onOpen: () => void }>;
}>;

const SURFACE_STEPS: ReadonlyArray<readonly [CatenoidSurfaceStep, string]> = [
  ["surface", "Surface"], ["analysis", "Analysis"],
  ["curvature", "Curvature field"], ["compute", "Compute"],
];

export function CatenoidSurfaceSubflow({ activeStep, computeState, onSelect, onRetrySamples, savedMesh }: SurfaceSubflowProps) {
  const computeLabel = computeState === "running" ? "Computing…" :
    computeState === "preparing" ? "Preparing…" :
    computeState === "computed" ? "Recompute" :
    computeState === "failed" ? "Retry Compute" : "Compute";
  const computeStatus = computeState === "computed" ? "Curvature result ready. Continue with 3 Comparison." :
    computeState === "running" ? "Curvature computation in progress." :
    computeState === "preparing" ? "Sampling the saved Surface for curvature. The 3D Surface remains available; retry samples if this does not finish." :
    computeState === "unavailable" ? "This Surface source is unavailable for curvature computation." :
    computeState === "failed" ? "Curvature computation failed. Review the Surface result and retry." :
    "Compute curvature, then continue with 3 Comparison.";
  const status = activeStep === "surface" ? "Saved catenoid source open in the left panel; the 3D Surface is in the viewer. Choose Analysis next." :
    activeStep === "analysis" ? "Differential geometry tools open in the left panel. Choose Curvature field next." :
    activeStep === "curvature" && computeState === "ready" ? "Curvature field open in the left panel. Choose Compute to calculate and display K." :
    computeStatus;
  return <div className="catenoid-surface-subflow" data-testid="catenoid-surface-subflow">
    <nav className="catenoid-surface-steps" aria-label="Surface curvature subflow">
      <strong className="catenoid-surface-label" aria-hidden="true">Surface flow</strong>
      {SURFACE_STEPS.map(([id, label], index) =>
        <span className="catenoid-journey-step" key={id}>
          {index > 0 && <span className="catenoid-journey-arrow" aria-hidden="true">→</span>}
          <button type="button" data-testid={`catenoid-surface-step-${id}`}
            aria-current={activeStep === id ? "step" : undefined}
            onClick={() => onSelect(id)}>
            {index + 1} {id === "compute" ? computeLabel : label}
          </button>
        </span>)}
    </nav>
    <div className="catenoid-surface-footer">
      <p className="catenoid-surface-status" role="status">{status}</p>
      {(computeState === "preparing" || computeState === "unavailable") && onRetrySamples &&
        <button type="button" data-testid="catenoid-surface-retry-samples" onClick={onRetrySamples}>Retry Surface samples</button>}
      {savedMesh && <button type="button" data-testid="catenoid-surface-open-mesh"
        title={savedMesh.title} onClick={savedMesh.onOpen}>Open saved Mesh{savedMesh.count > 1 ? ` (${savedMesh.count})` : ""}</button>}
    </div>
  </div>;
}
