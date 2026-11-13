import { hasPackagedScientificField, readPackagedScientificField, parseMath3DProject,
  type Math3DProject, type ScientificProjectResourceReader, type VectorField3DDocument } from "@math3d/core";
import { loadProjectResources } from "../projects/projectResourceArchive";
import { projectPayloadKey } from "../projects/projectLibrary";

type NativeVerifier = NonNullable<Window["scientificScenes"]>;
export type ScientificVectorSourceVerifier = Pick<NativeVerifier,
  "openGraphDatasetReference" | "previewVectorVolume" | "closeGraphDataset"> & Partial<NativeVerifier>;
export type ProjectScientificSourceContext = {
  project: Math3DProject; resources?: ScientificProjectResourceReader;
};

/** Project-owned bytes are read from the existing archive. No global source registry or native shim. */
export function projectScientificSourceVerifier(document: VectorField3DDocument,
  context?: ProjectScientificSourceContext, native?: ScientificVectorSourceVerifier): ScientificVectorSourceVerifier | undefined {
  if (!context || document.source.field.kind !== "scientific-bundle") return native;
  const field = document.source.field;
  const reader = async (): Promise<ScientificProjectResourceReader> => {
    if (context.resources) return context.resources;
    if (typeof localStorage === "undefined" || typeof indexedDB === "undefined") return () => null;
    // A newly pinned baseline can share the current saved source bytes before
    // Save updates the archive's ownership descriptors for the next Project.
    const raw = localStorage.getItem(projectPayloadKey(context.project.identity.id));
    const owner = raw ? parseMath3DProject(raw) : context.project;
    const resources = await loadProjectResources(owner);
    return item => resources.bytes(item);
  };
  let packagedSource = false;
  return {
    ...native,
    openGraphDatasetReference: async request => {
      if (request.sceneFingerprint === field.references[0].sceneFingerprint) {
        const bytes = await reader();
        if (packagedSource || hasPackagedScientificField(document, bytes)) {
          const transfer = readPackagedScientificField(document, bytes);
          packagedSource = true;
          return { ok: true, source: { manifestJson: transfer.manifestJson, fingerprint: transfer.fingerprint,
            locator: field.references[0].locator, datasets: field.references.map(reference => ({
              datasetId: reference.datasetId, component: reference.component,
              shape: [...reference.shape] as [number, number, number] })) } };
        }
      }
      if (!native?.openGraphDatasetReference) throw new TypeError("Scientific source verifier is unavailable. Import a self-contained Project package to use this field in the browser.");
      return native.openGraphDatasetReference(request);
    },
    previewVectorVolume: async request => {
      if (request.fingerprint === field.references[0].sceneFingerprint && request.datasetId === field.references[0].datasetId) {
        const bytes = await reader();
        if (packagedSource || hasPackagedScientificField(document, bytes)) {
          if (request.components.some((component, index) => component !== field.references[index].component))
            throw new TypeError("Packaged vector components do not match the requested source.");
          return [...readPackagedScientificField(document, bytes, request.sampleLimit).volumes];
        }
      }
      if (!native?.previewVectorVolume) throw new TypeError("Required packaged scientific source data is missing.");
      return native.previewVectorVolume(request);
    },
    closeGraphDataset: async fingerprint => packagedSource && fingerprint === field.references[0].sceneFingerprint
      ? true : native ? native.closeGraphDataset(fingerprint) : true,
  };
}
