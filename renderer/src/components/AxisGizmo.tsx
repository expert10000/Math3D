// src/components/AxisGizmo.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type CameraView = "xy" | "xz" | "yz";
type AxisId = "x" | "y" | "z";

export interface AxisGizmoProps {
  size?: number;
  onSelectView?: (view: CameraView) => void;
  getMainCamera?: () => THREE.Camera | null;
}

const AXIS_COLOR: Record<AxisId, string> = {
  x: "#f44336",
  y: "#2ea043",
  z: "#2563eb",
};

const AXIS_TEXT_COLOR: Record<AxisId, string> = {
  x: "#8f1d13",
  y: "#175f27",
  z: "#1e3a8a",
};

type Axis2DState = Record<AxisId, { dirX: number; dirY: number; depth: number }>;

/**
 * 2D canvas gizmo:
 * - camera-aware axis orientation
 * - hover highlight to signal click affordance
 * - click axis => snap to XY/XZ/YZ view
 */
const AxisGizmo: React.FC<AxisGizmoProps> = ({ size = 110, onSelectView, getMainCamera }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getMainCameraRef = useRef<AxisGizmoProps["getMainCamera"] | undefined>(undefined);
  const onSelectViewRef = useRef<AxisGizmoProps["onSelectView"] | undefined>(undefined);
  const axis2DRef = useRef<Axis2DState | null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<AxisId | null>(null);
  const hoveredAxisRef = useRef<AxisId | null>(null);

  useEffect(() => {
    getMainCameraRef.current = getMainCamera;
  }, [getMainCamera]);

  useEffect(() => {
    onSelectViewRef.current = onSelectView;
  }, [onSelectView]);

  useEffect(() => {
    hoveredAxisRef.current = hoveredAxis;
  }, [hoveredAxis]);

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
    const axisRadius = radius * 0.88;
    const shellRadius = radius + 6;

    let frameId = 0;

    const drawArrow = (axis: AxisId, dirX: number, dirY: number, depth: number) => {
      const color = AXIS_COLOR[axis];
      const isHovered = hoveredAxisRef.current === axis;
      const depthFade = depth > 0 ? 0.55 : 1;
      const endX = cx + dirX * axisRadius;
      const endY = cy - dirY * axisRadius;

      ctx.save();
      ctx.globalAlpha = depthFade;
      ctx.strokeStyle = color;
      ctx.lineWidth = isHovered ? 3.5 : 2.25;
      if (isHovered) ctx.shadowColor = color;
      if (isHovered) ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();

      const len = Math.max(1e-6, Math.hypot(dirX, dirY));
      const ux = dirX / len;
      const uy = -dirY / len; // canvas y-axis is inverted
      const px = -uy;
      const py = ux;
      const tip = Math.max(7, radius * 0.12);
      const wing = Math.max(4, radius * 0.07);

      ctx.save();
      ctx.globalAlpha = depthFade;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - ux * tip + px * wing, endY - uy * tip + py * wing);
      ctx.lineTo(endX - ux * tip - px * wing, endY - uy * tip - py * wing);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(endX, endY, isHovered ? 4.2 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const labelDist = axisRadius + 13;
      const labelX = cx + dirX * labelDist;
      const labelY = cy - dirY * labelDist;

      ctx.save();
      ctx.beginPath();
      ctx.arc(labelX, labelY, isHovered ? 9.3 : 8.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
      ctx.strokeStyle = isHovered ? color : "rgba(124,135,151,0.52)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = AXIS_TEXT_COLOR[axis];
      ctx.font = "700 10px \"Avenir Next\", \"Segoe UI\", sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(axis.toUpperCase(), labelX, labelY + 0.5);
      ctx.restore();
    };

    const draw = () => {
      frameId = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, w, h);

      const panelGrad = ctx.createLinearGradient(0, 0, w, h);
      panelGrad.addColorStop(0, "#f4f8ff");
      panelGrad.addColorStop(1, "#e5edf9");
      ctx.fillStyle = panelGrad;
      ctx.fillRect(0, 0, w, h);

      const shellGrad = ctx.createRadialGradient(cx - radius * 0.42, cy - radius * 0.48, radius * 0.2, cx, cy, shellRadius);
      shellGrad.addColorStop(0, "#fcfeff");
      shellGrad.addColorStop(1, "#d9e4f4");
      ctx.beginPath();
      ctx.arc(cx, cy, shellRadius, 0, Math.PI * 2);
      ctx.fillStyle = shellGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, shellRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(123,141,166,0.62)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const getCam = getMainCameraRef.current;
      let qInv = new THREE.Quaternion();
      if (getCam) {
        const cam = getCam();
        if (cam) qInv = cam.quaternion.clone().invert();
      }

      const projectAxis = (vWorld: THREE.Vector3) => {
        const vCam = vWorld.clone().applyQuaternion(qInv);
        const planar = new THREE.Vector2(vCam.x, vCam.y);
        if (planar.lengthSq() < 1e-6) planar.set(0, 1);
        planar.normalize();
        return { dirX: planar.x, dirY: planar.y, depth: vCam.z };
      };

      const axisData: Axis2DState = {
        x: projectAxis(new THREE.Vector3(1, 0, 0)),
        y: projectAxis(new THREE.Vector3(0, 1, 0)),
        z: projectAxis(new THREE.Vector3(0, 0, 1)),
      };
      axis2DRef.current = axisData;

      const drawOrder = (["x", "y", "z"] as AxisId[]).sort((a, b) => axisData[a].depth - axisData[b].depth);
      for (const axis of drawOrder) {
        const data = axisData[axis];
        drawArrow(axis, data.dirX, data.dirY, data.depth);
      }

      const hubGrad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, radius * 0.2);
      hubGrad.addColorStop(0, "#f8fbff");
      hubGrad.addColorStop(1, "#7d93b4");
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = hubGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(54,72,97,0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(frameId);
  }, [size]);

  const pickAxis = (event: React.PointerEvent<HTMLCanvasElement>): AxisId | null => {
    const canvas = canvasRef.current;
    const axes = axis2DRef.current;
    if (!canvas || !axes) return null;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    const dx = x - cx;
    const dy = cy - y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < canvas.width * 0.13) return null;

    const clickX = dx / dist;
    const clickY = dy / dist;
    let bestAxis: AxisId | null = null;
    let bestScore = 0.35;
    for (const axis of ["x", "y", "z"] as AxisId[]) {
      const score = Math.abs(clickX * axes[axis].dirX + clickY * axes[axis].dirY);
      if (score > bestScore) {
        bestScore = score;
        bestAxis = axis;
      }
    }
    return bestAxis;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setHoveredAxis(pickAxis(event));
  };

  const handlePointerLeave = () => {
    setHoveredAxis(null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const axis = pickAxis(event);
    if (!axis) return;

    const cb = onSelectViewRef.current;
    if (!cb) return;
    event.preventDefault();

    if (axis === "z") cb("xy");
    else if (axis === "y") cb("xz");
    else cb("yz");
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      style={{
        display: "block",
        width: size,
        height: size,
        cursor: "pointer",
        borderRadius: 8,
        border: "1px solid rgba(124,139,160,0.55)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 6px 14px rgba(32,45,67,0.16)",
      }}
    />
  );
};

export default AxisGizmo;
