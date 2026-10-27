import { useEffect, useState } from "react";
import { sampleVectorField3DProbe,
  verifyVectorField3DVolumes, type VectorField3DDocument } from "@math3d/core";
import { linkedFieldPointStatus, sampleLinkedFieldVolume,
  type LinkedExplorerProbe } from "./linkedFieldProbe";

type ProbeValue = Readonly<{ values: readonly number[]; names: readonly string[];
  unit: string; source: string; hashes: readonly string[]; method: string }>;

export function LinkedExplorerVectorProbe({ document, linkedProbe }: {
  document: VectorField3DDocument; linkedProbe: LinkedExplorerProbe | null;
}) {
  const [value, setValue] = useState<ProbeValue | null>(null);
  const [status, setStatus] = useState("Select a linked physical point.");
  const field = document.source.field;
  const axes = field.kind === "scientific-bundle" ? field.references[0].axes.map((axis, index) =>
    ({ ...axis, count: field.references[0].shape[index]! })) : document.source.axes.map(axis =>
    ({ name: axis.label, unit: axis.unit, origin: axis.min,
      spacing: (axis.max - axis.min) / 31, count: 32 }));
  const pointState = linkedProbe ? linkedFieldPointStatus(linkedProbe.point, axes,
    linkedProbe.units) : null;
  useEffect(() => {
    let active = true;
    let fingerprint: string | null = null;
    setValue(null);
    if (!linkedProbe) { setStatus("Select a linked physical point."); return; }
    if (pointState === "outside") { setStatus("Linked point is outside this field domain. No value is shown."); return; }
    if (pointState === "incompatible-units") {
      setStatus("Linked point uses incompatible coordinate units. Select a point in this field to compare values.");
      return;
    }
    setStatus("Verifying source samples for linked point…");
    void (async () => {
      try {
        if (field.kind === "expressions") {
          const result = sampleVectorField3DProbe(document, linkedProbe.point);
          if (active) { setValue({ values: result.vector, names: ["P", "Q", "R"],
            unit: result.componentUnits[0], source: document.metadata.title,
            hashes: [], method: "analytic value" }); setStatus("Analytic value ready"); }
          return;
        }
        const bridge = window.scientificScenes;
        if (!bridge?.openGraphDatasetReference || !bridge.previewVectorVolume)
          throw new Error("Scientific probe requires the desktop source verifier.");
        const references = field.references;
        const opened = await bridge.openGraphDatasetReference({ locator: references[0].locator,
          sceneFingerprint: references[0].sceneFingerprint });
        if (!opened.ok) throw new Error(`Saved source ${opened.status}: ${opened.error}`);
        fingerprint = opened.source.fingerprint;
        const transferred = await bridge.previewVectorVolume({ fingerprint,
          datasetId: references[0].datasetId,
          components: references.map(reference => reference.component) as [string, string, string] });
        const verified = verifyVectorField3DVolumes(document, opened.source.manifestJson,
          fingerprint, transferred);
        const values = verified.map(volume => sampleLinkedFieldVolume(volume,
          axes, linkedProbe.point));
        if (active) { setValue({ values, names: references.map(reference => reference.component),
          unit: field.componentUnits[0], source: `${references[0].sceneId} / ${references[0].datasetId}`,
          hashes: verified.map(volume => volume.sampleSha256),
          method: "trilinear interpolation on verified bounded samples" });
          setStatus("Verified linked point"); }
      } catch (error) {
        if (active) { setValue(null); setStatus(`Linked point withheld: ${error instanceof Error ?
          error.message : String(error)}`); }
      } finally {
        if (fingerprint) await window.scientificScenes?.closeGraphDataset(fingerprint);
      }
    })();
    return () => { active = false; };
  }, [document.identity.id, document.identity.structuralHash,
    linkedProbe?.point[0], linkedProbe?.point[1], linkedProbe?.point[2],
    linkedProbe?.units[0], linkedProbe?.units[1], linkedProbe?.units[2]]);
  return <div role="status" data-testid="scientific-explorer-linked-vector-probe">
    <p>{status}</p>
    {value && <><p>{value.names.map((name, index) =>
      `${name} = ${value.values[index]!.toPrecision(7)} ${value.unit}`).join(" · ")}</p>
      <small>{value.method} · source {value.source}
        {value.hashes.length > 0 && ` · verified samples ${value.hashes.join(" · ")}`}</small></>}
  </div>;
}
