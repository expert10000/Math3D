import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Bounds } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute, DoubleSide, Line, LineBasicMaterial } from "three";
import { evaluateGraph2DPromotionGeometry, type PromotionGeometry, type CurveDocument, type SurfaceDocument } from "@math3d/core";

function Geometry({ evaluated, onRender }: { evaluated: PromotionGeometry; onRender: () => void }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(evaluated.positions, 3));
    if (evaluated.kind === "surface") { result.setIndex([...evaluated.indices]); result.computeVertexNormals(); }
    return result;
  }, [evaluated]);
  const line = useMemo(() => new Line(geometry, new LineBasicMaterial({ color: "#2563eb" })), [geometry]);
  useEffect(() => () => { geometry.dispose(); line.material.dispose(); }, [geometry, line]);
  return <Bounds fit clip observe margin={1.25}>
    {evaluated.kind === "surface" ? <mesh geometry={geometry} onAfterRender={onRender}><meshStandardMaterial color="#60a5fa" side={DoubleSide} /></mesh> :
      <primitive object={line} onAfterRender={onRender} />}
  </Bounds>;
}

export function PromotionGeometryView({ document }: { document: CurveDocument | SurfaceDocument }) {
  const root = useRef<HTMLDivElement>(null);
  const preview = useMemo(() => {
    try { return { geometry: evaluateGraph2DPromotionGeometry(document), error: null }; }
    catch (error) { return { geometry: null, error: (error as Error).message }; }
  }, [document]);
  useLayoutEffect(() => { if (root.current) root.current.dataset.rendered = "false"; }, [preview]);
  const markRendered = () => { if (root.current?.dataset.rendered !== "true" && root.current) root.current.dataset.rendered = "true"; };
  return <div ref={root} style={{ minHeight: 260, height: "100%", display: "flex", minWidth: 0 }} data-testid="promotion-geometry" aria-label="Promoted geometry preview">
    {preview.geometry ? <Canvas style={{ minHeight: 260, flex: 1 }} camera={{ position: [8, 6, 10] }}><ambientLight intensity={1.5} /><directionalLight position={[5, 8, 4]} intensity={2} />
      <Geometry evaluated={preview.geometry} onRender={markRendered} /><OrbitControls makeDefault /></Canvas> : <p role="alert">Preview unavailable: {preview.error}</p>}
  </div>;
}
