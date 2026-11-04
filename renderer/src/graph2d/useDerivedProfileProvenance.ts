import { useEffect, useMemo, useRef, useState } from "react";
import { buildDerivedProfileProvenance, type DerivedProfileProvenance,
  type DerivedFieldProfileResult, type Math3DProject, type VectorField3DDocument,
  type VerifiedVectorFieldTransfer } from "@math3d/core";
import { createDerivedFieldProfileJob } from "@math3d/kernel";
import { loadVerifiedVectorFieldTransfer } from "../vectorfield3d/loadVerifiedVectorFieldTransfer";

export function useDerivedProfileProvenance(project: Math3DProject | null | undefined) {
  const projectRef = useRef(project);
  projectRef.current = project;
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const verifiedBundles = useRef(new Set<string>());
  const sourceKey = (source: VectorField3DDocument) =>
    `${source.identity.id}:${source.identity.revision}:${source.identity.structuralHash}`;
  const verifySource = (source: VectorField3DDocument) =>
    source.source.field.kind === "expressions" || verifiedBundles.current.has(sourceKey(source));
  const loadBundle = async (source: VectorField3DDocument): Promise<VerifiedVectorFieldTransfer> => {
    try {
      const transfer = await loadVerifiedVectorFieldTransfer(source);
      verifiedBundles.current.add(sourceKey(source));
      return transfer;
    } catch (cause) { verifiedBundles.current.delete(sourceKey(source)); throw cause; }
  };
  const job = useMemo(() => createDerivedFieldProfileJob({ project: () => {
    if (!projectRef.current) throw new TypeError("No active Project.");
    return projectRef.current;
  }, verifySource, loadBundle }), [project?.identity.id]);
  useEffect(() => () => job.dispose(), [job]);
  useEffect(() => {
    let active = true;
    const reverifyOnFocus = async () => {
      const current = projectRef.current;
      const sources = current?.workspace.entries.filter(item => item.module === "vector3d" &&
        item.checkpoint.format === "math3d.vector-field3d-document" &&
        item.checkpoint.source.field.kind === "scientific-bundle" &&
        current.workspace.derivedFields?.some(field => field.input.documentId ===
          item.expected.id)).map(item => item.checkpoint as VectorField3DDocument) ?? [];
      await Promise.allSettled(sources.map(loadBundle));
      if (active) setVersion(value => value + 1);
    };
    window.addEventListener("focus", reverifyOnFocus);
    return () => { active = false; window.removeEventListener("focus", reverifyOnFocus); };
  }, [project?.identity.id]);
  const records = useMemo(() => {
    if (!project) return [] as DerivedProfileProvenance[];
    return (project.workspace.derivedFields ?? []).flatMap(field => {
      if (field.operation.kind !== "line-profile") return [];
      try { return [buildDerivedProfileProvenance(project, field.identity.id,
        { verifySource, result: job.read(field.identity.id) })]; }
      catch { return []; }
    });
  }, [project, job, version]);
  const compute = async (id: string): Promise<DerivedFieldProfileResult | null> => {
    if (busyId) return null;
    setBusyId(id); setError(""); setProgress("");
    try {
      const current = projectRef.current;
      const profile = current?.workspace.derivedFields?.find(item => item.identity.id === id);
      const plane = current?.workspace.derivedFields?.find(item =>
        item.identity.id === profile?.input.documentId);
      const magnitude = current?.workspace.derivedFields?.find(item =>
        item.identity.id === plane?.input.documentId);
      const source = current?.workspace.entries.find(item => item.module === "vector3d" &&
        item.expected.id === magnitude?.input.documentId)?.checkpoint;
      if (source?.format === "math3d.vector-field3d-document" &&
          source.source.field.kind === "scientific-bundle") await loadBundle(source);
      const outcome = await job.submit(id, { onProgress: (completed, total) =>
        setProgress(`${completed}/${total} samples computed`) }).promise;
      if (outcome.publication !== "published")
        setError(`Profile result withheld: ${outcome.publication}.`);
      return outcome.publication === "published" ? outcome.result : null;
    } catch (cause) { setError(String((cause as Error).message ?? cause)); return null; }
    finally { setBusyId(null); setVersion(current => current + 1); }
  };
  return { records, compute, read: (id: string) => job.read(id), verifySource,
    busyId, progress, error };
}
