import { useEffect, useState } from "react";
import { defaultVectorField3DWorkspace, sampleVectorField3DDerivedSlice,
  sampleVectorField3DSlice, type VectorField3DDocument,
  type VectorField3DSliceArtifact } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer, SCIENTIFIC_FIELD_REVERIFY_EVENT } from
  "../vectorfield3d/loadVerifiedVectorFieldTransfer";
import { VectorField3DSliceView } from "../vectorfield3d/VectorField3DSliceView";

/** Reopens a Study's Field Explorer plane only after the desktop source verifier succeeds. */
export function StudyVectorFieldPanePreview({ document }: { document: VectorField3DDocument }) {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "withheld"; slice?: VectorField3DSliceArtifact; reason?: string;
  }>({ status: "loading" });
  useEffect(() => {
    let active = true, request = 0;
    const load = async () => {
      const token = ++request;
      setState({ status: "loading" });
      try {
        const workspace = document.workspace ?? defaultVectorField3DWorkspace(document.source);
        const axis = workspace.selectedLayer === "xz" ? 1 : workspace.selectedLayer === "yz" ? 0 : 2;
        const transfer = document.source.field.kind === "scientific-bundle" ?
          await loadVerifiedVectorFieldTransfer(document) : undefined;
        const slice = workspace.sliceChannel === "component" ?
          sampleVectorField3DSlice(document, axis, workspace.sliceCoordinates[axis], transfer) :
          sampleVectorField3DDerivedSlice(document, axis, workspace.sliceCoordinates[axis],
            workspace.sliceChannel, transfer);
        if (active && token === request) setState({ status: "ready", slice });
      } catch (error) {
        if (active && token === request) setState({ status: "withheld", reason: (error as Error).message });
      }
    };
    void load();
    window.addEventListener(SCIENTIFIC_FIELD_REVERIFY_EVENT, load);
    return () => { active = false; window.removeEventListener(SCIENTIFIC_FIELD_REVERIFY_EVENT, load); };
  }, [document]);
  if (state.status !== "ready" || !state.slice) return <p role="status"
    data-testid="project-study-field-source-status">{state.status === "loading" ?
      "Verifying saved Field Explorer source…" : `Field Explorer values withheld: ${state.reason}`}</p>;
  return <div data-testid="project-study-field-slice" style={{ height: "100%", overflow: "auto" }}>
    <VectorField3DSliceView document={document} slice={state.slice} />
  </div>;
}
