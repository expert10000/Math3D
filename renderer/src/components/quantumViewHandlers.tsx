import React from "react";
import { QuantumFieldSlice, type QuantumField } from "./QuantumFieldSlice";
import { QuantumFieldSurface } from "./QuantumFieldSurface";
import { QuantumFieldVolume } from "./QuantumFieldVolume";

export type QuantumViewRequest = "geometry" | "slice" | "surface" | "volume";
export type QuantumSceneCapabilities = {
  fields: readonly QuantumField[];
  hasGeometry: boolean;
  hasBands: boolean;
  hasLattice: boolean;
  hasTrajectory: boolean;
};
export type QuantumViewContext = {
  fingerprint: string;
  resultSha256: string;
  fields: QuantumField[];
  axes: [string, string, string];
  units: [string, string, string];
  camera: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } } | undefined;
  geometry: React.ReactNode;
};
export type QuantumViewHandler = {
  id: string;
  request: QuantumViewRequest;
  accepts: (capabilities: QuantumSceneCapabilities) => boolean;
  render: (context: QuantumViewContext) => React.ReactNode;
};

const geometry = (context: QuantumViewContext) => context.geometry;
/** Ordered semantic routes. New dataset views register here, without changing the preview. */
export const quantumViewHandlers: readonly QuantumViewHandler[] = [
  { id: "bands/v1", request: "geometry", accepts: caps => caps.hasGeometry && caps.hasBands, render: geometry },
  { id: "lattice/v1", request: "geometry", accepts: caps => caps.hasGeometry && caps.hasLattice, render: geometry },
  { id: "trajectory/v1", request: "geometry", accepts: caps => caps.hasGeometry && caps.hasTrajectory, render: geometry },
  { id: "geometry/v1", request: "geometry", accepts: caps => caps.hasGeometry, render: geometry },
  { id: "field-slice/v1", request: "slice", accepts: caps => caps.fields.length > 0,
    render: ctx => <QuantumFieldSlice fingerprint={ctx.fingerprint} fields={ctx.fields} axes={ctx.axes} units={ctx.units} /> },
  { id: "field-surface/v1", request: "surface", accepts: caps => caps.fields.some(field => field.kind === "complex-field"),
    render: ctx => <QuantumFieldSurface fingerprint={ctx.fingerprint} resultSha256={ctx.resultSha256} fields={ctx.fields} camera={ctx.camera} /> },
  { id: "field-volume/v1", request: "volume", accepts: caps => caps.fields.length > 0,
    render: ctx => <QuantumFieldVolume fingerprint={ctx.fingerprint} fields={ctx.fields} /> },
];

export function negotiateQuantumView(request: QuantumViewRequest, capabilities: QuantumSceneCapabilities,
  handlers: readonly QuantumViewHandler[] = quantumViewHandlers): QuantumViewHandler | null {
  return handlers.find(handler => handler.request === request && handler.accepts(capabilities)) ?? null;
}

class QuantumViewBoundary extends React.Component<{ handlerId: string; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    return this.state.error ? <p role="alert" data-testid="quantum-view-error" style={{ padding: 20 }}>
      {this.props.handlerId} could not display this verified scene: {this.state.error}
    </p> : this.props.children;
  }
}

function QuantumHandlerContent({ handler, context }: { handler: QuantumViewHandler; context: QuantumViewContext }) {
  return <>{handler.render(context)}</>;
}

/** A keyed boundary releases each handler's component resources when the route changes. */
export function QuantumViewHost({ request, capabilities, context }: {
  request: QuantumViewRequest; capabilities: QuantumSceneCapabilities; context: QuantumViewContext;
}) {
  const handler = negotiateQuantumView(request, capabilities);
  if (!handler) return <p role="alert" data-testid="quantum-view-unavailable" style={{ padding: 20 }}>
    No compatible {request} handler for this verified scene.
  </p>;
  return <QuantumViewBoundary key={`${context.fingerprint}:${handler.id}`} handlerId={handler.id}>
    <QuantumHandlerContent handler={handler} context={context} />
  </QuantumViewBoundary>;
}
