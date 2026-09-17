// src/components/AxisGizmo.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { CameraOrientation } from "./cameraOrientation";

export type CameraView = CameraOrientation;
type AxisId = "x" | "y" | "z";
type AxisDirection = `${AxisId}+` | `${AxisId}-`;
type GizmoTarget = AxisDirection | "center";

export interface AxisGizmoProps {
  size?: number;
  activeView?: CameraView | "free";
  onSelectView?: (view: CameraView) => void;
  onFitScene?: () => void;
  onOrbit?: (deltaX: number, deltaY: number) => void;
  getMainCamera?: () => THREE.Camera | null;
}

const AXIS_COLOR: Record<AxisId, string> = { x: "#e84a45", y: "#2ea043", z: "#3b72e8" };
const AXIS_TEXT_COLOR: Record<AxisId, string> = { x: "#8f1d13", y: "#175f27", z: "#1e3a8a" };
const VIEW_BY_DIRECTION: Record<AxisDirection, CameraView> = {
  "x+": "yz", "x-": "yzNeg", "y+": "xz", "y-": "xzNeg", "z+": "xy", "z-": "xyNeg",
};
const DIRECTION_LABEL: Record<AxisDirection, string> = {
  "x+": "+X · Right", "x-": "−X · Left", "y+": "+Y · Top", "y-": "−Y · Bottom", "z+": "+Z · Front", "z-": "−Z · Back",
};
type Axis2DState = Record<AxisId, { dirX: number; dirY: number; depth: number }>;

const activeTargetForView = (view: AxisGizmoProps["activeView"]): GizmoTarget | null => {
  if (!view || view === "free") return null;
  if (view === "iso") return "center";
  return (Object.entries(VIEW_BY_DIRECTION).find(([, candidate]) => candidate === view)?.[0] as AxisDirection | undefined) ?? null;
};

/** Camera-aware orientation control with six snap targets, an isometric home, and direct orbit drag. */
const AxisGizmo: React.FC<AxisGizmoProps> = ({
  size = 110,
  activeView = "free",
  onSelectView,
  onFitScene,
  onOrbit,
  getMainCamera,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getMainCameraRef = useRef<AxisGizmoProps["getMainCamera"]>();
  const onSelectViewRef = useRef<AxisGizmoProps["onSelectView"]>();
  const onFitSceneRef = useRef<AxisGizmoProps["onFitScene"]>();
  const onOrbitRef = useRef<AxisGizmoProps["onOrbit"]>();
  const activeViewRef = useRef<AxisGizmoProps["activeView"]>(activeView);
  const axis2DRef = useRef<Axis2DState | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<GizmoTarget | null>(null);
  const hoveredTargetRef = useRef<GizmoTarget | null>(null);

  useEffect(() => { getMainCameraRef.current = getMainCamera; }, [getMainCamera]);
  useEffect(() => { onSelectViewRef.current = onSelectView; }, [onSelectView]);
  useEffect(() => { onFitSceneRef.current = onFitScene; }, [onFitScene]);
  useEffect(() => { onOrbitRef.current = onOrbit; }, [onOrbit]);
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);
  useEffect(() => { hoveredTargetRef.current = hoveredTarget; }, [hoveredTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const radius = Math.min(w, h) * 0.4;
    const axisRadius = radius * 0.82;
    const shellRadius = radius + 5;
    let frameId = 0;

    const drawDirection = (axis: AxisId, sign: 1 | -1, data: Axis2DState[AxisId]) => {
      const direction = `${axis}${sign > 0 ? "+" : "-"}` as AxisDirection;
      const hovered = hoveredTargetRef.current === direction;
      const active = activeTargetForView(activeViewRef.current) === direction;
      const depthFade = (sign > 0 ? data.depth : -data.depth) > 0 ? 0.54 : 1;
      const dirX = data.dirX * sign;
      const dirY = data.dirY * sign;
      const endX = cx + dirX * axisRadius;
      const endY = cy - dirY * axisRadius;
      const color = AXIS_COLOR[axis];
      ctx.save();
      ctx.globalAlpha = active ? 1 : depthFade;
      ctx.strokeStyle = color;
      ctx.lineWidth = active || hovered ? 3.6 : 2.05;
      ctx.setLineDash(sign > 0 ? [] : [3, 2]);
      if (hovered || active) { ctx.shadowColor = color; ctx.shadowBlur = active ? 10 : 7; }
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore();

      const len = Math.max(1e-6, Math.hypot(dirX, dirY));
      const ux = dirX / len;
      const uy = -dirY / len;
      const px = -uy;
      const py = ux;
      const tip = Math.max(7, radius * 0.12);
      const wing = Math.max(4, radius * 0.067);
      ctx.save(); ctx.globalAlpha = active ? 1 : depthFade; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(endX, endY); ctx.lineTo(endX - ux * tip + px * wing, endY - uy * tip + py * wing); ctx.lineTo(endX - ux * tip - px * wing, endY - uy * tip - py * wing); ctx.closePath(); ctx.fill(); ctx.restore();

      const labelDistance = axisRadius + 13;
      const labelX = cx + dirX * labelDistance;
      const labelY = cy - dirY * labelDistance;
      ctx.save(); ctx.beginPath(); ctx.arc(labelX, labelY, active || hovered ? 10.2 : 8.7, 0, Math.PI * 2);
      ctx.fillStyle = active ? color : "rgba(255,255,255,0.96)"; ctx.fill();
      ctx.strokeStyle = active || hovered ? color : "rgba(124,135,151,0.52)"; ctx.lineWidth = active ? 1.6 : 1; ctx.stroke();
      ctx.fillStyle = active ? "#ffffff" : AXIS_TEXT_COLOR[axis]; ctx.font = "700 9px \"Avenir Next\", \"Segoe UI\", sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`${sign > 0 ? "+" : "−"}${axis.toUpperCase()}`, labelX, labelY + 0.5); ctx.restore();
    };

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      const panelGrad = ctx.createLinearGradient(0, 0, w, h);
      panelGrad.addColorStop(0, "#f4f8ff"); panelGrad.addColorStop(1, "#e5edf9"); ctx.fillStyle = panelGrad; ctx.fillRect(0, 0, w, h);
      const shellGrad = ctx.createRadialGradient(cx - radius * 0.42, cy - radius * 0.48, radius * 0.2, cx, cy, shellRadius);
      shellGrad.addColorStop(0, "#fcfeff"); shellGrad.addColorStop(1, "#d9e4f4"); ctx.beginPath(); ctx.arc(cx, cy, shellRadius, 0, Math.PI * 2); ctx.fillStyle = shellGrad; ctx.fill(); ctx.strokeStyle = "rgba(123,141,166,0.62)"; ctx.lineWidth = 1; ctx.stroke();

      let qInv = new THREE.Quaternion();
      const cam = getMainCameraRef.current?.();
      if (cam) qInv = cam.quaternion.clone().invert();
      const projectAxis = (vWorld: THREE.Vector3) => {
        const vCam = vWorld.clone().applyQuaternion(qInv);
        const planar = new THREE.Vector2(vCam.x, vCam.y);
        // An axis pointing directly at the camera has no screen-space direction.
        // Give it a stable diagonal marker instead of stacking it on another axis.
        if (planar.lengthSq() < 1e-6) {
          if (vWorld.x) planar.set(1, 0);
          else if (vWorld.y) planar.set(0, 1);
          else planar.set(-0.72, 0.72);
        }
        planar.normalize();
        return { dirX: planar.x, dirY: planar.y, depth: vCam.z };
      };
      const axisData: Axis2DState = { x: projectAxis(new THREE.Vector3(1, 0, 0)), y: projectAxis(new THREE.Vector3(0, 1, 0)), z: projectAxis(new THREE.Vector3(0, 0, 1)) };
      axis2DRef.current = axisData;
      const drawOrder = (["x", "y", "z"] as AxisId[]).sort((a, b) => axisData[a].depth - axisData[b].depth);
      for (const axis of drawOrder) { drawDirection(axis, -1, axisData[axis]); drawDirection(axis, 1, axisData[axis]); }

      const centerActive = activeTargetForView(activeViewRef.current) === "center";
      const centerHovered = hoveredTargetRef.current === "center";
      const hubGrad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, radius * 0.2);
      hubGrad.addColorStop(0, centerActive ? "#ffffff" : "#f8fbff"); hubGrad.addColorStop(1, centerActive ? "#2563eb" : "#7d93b4");
      ctx.beginPath(); ctx.arc(cx, cy, radius * 0.13 + (centerHovered ? 1 : 0), 0, Math.PI * 2); ctx.fillStyle = hubGrad; ctx.fill();
      ctx.strokeStyle = centerActive || centerHovered ? "#2563eb" : "rgba(54,72,97,0.55)"; ctx.lineWidth = centerActive ? 1.8 : 1; ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, [size]);

  const pickTarget = (event: React.PointerEvent<HTMLCanvasElement>): GizmoTarget | null => {
    const canvas = canvasRef.current;
    const axes = axis2DRef.current;
    if (!canvas || !axes) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const radius = Math.min(canvas.width, canvas.height) * 0.4;
    if (Math.hypot(x - cx, y - cy) <= radius * 0.22) return "center";
    const axisRadius = radius * 0.82;
    let bestTarget: AxisDirection | null = null;
    let bestDistance = Math.max(11, radius * 0.2);
    for (const axis of ["x", "y", "z"] as AxisId[]) for (const sign of [1, -1] as const) {
      const distance = Math.hypot(x - (cx + axes[axis].dirX * sign * axisRadius), y - (cy - axes[axis].dirY * sign * axisRadius));
      if (distance < bestDistance) { bestDistance = distance; bestTarget = `${axis}${sign > 0 ? "+" : "-"}` as AxisDirection; }
    }
    return bestTarget;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 1) drag.moved = true;
      if (drag.moved) onOrbitRef.current?.(dx, dy);
      drag.x = event.clientX; drag.y = event.clientY;
      return;
    }
    setHoveredTarget(pickTarget(event));
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; };
  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current; dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId || drag.moved) return;
    const target = pickTarget(event);
    if (target === "center") onSelectViewRef.current?.("iso");
    else if (target) onSelectViewRef.current?.(VIEW_BY_DIRECTION[target]);
  };
  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (pickTarget(event as unknown as React.PointerEvent<HTMLCanvasElement>) === "center") onFitSceneRef.current?.();
  };
  const tooltip = hoveredTarget === "center" ? "Isometric home · double-click to fit scene" : hoveredTarget ? `${DIRECTION_LABEL[hoveredTarget]} · snap view` : "Drag to orbit · click an axis to snap · center for isometric";

  return <canvas ref={canvasRef} width={size} height={size} onPointerMove={handlePointerMove} onPointerLeave={() => setHoveredTarget(null)} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onDoubleClick={handleDoubleClick} title={tooltip} aria-label="Camera orientation control. Drag to orbit, click an axis direction to snap, or click the center for isometric view." style={{ display: "block", width: size, height: size, cursor: hoveredTarget ? "pointer" : "grab", borderRadius: 8, border: "1px solid rgba(124,139,160,0.55)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 6px 14px rgba(32,45,67,0.16)" }} />;
};

export default AxisGizmo;
