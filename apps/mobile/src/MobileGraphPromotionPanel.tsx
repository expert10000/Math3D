import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { promoteGraph2DToCurve, revolveGraph2DProfile, extrudeGraph2DProfile, evaluateGraph2DPromotionGeometry,
  graph2DPromotionStatus, isGraph2DPromotionTargetEdited, type Graph2DDocument, type Graph2DAnyPromotion, type Graph2DExtrudeOptions } from "@math3d/core";
import { projectMobilePromotion } from "./viewer/mobilePromotionProjection";

const Geometry = ({ promotion }: { promotion: Graph2DAnyPromotion }) => {
  const [size, setSize] = useState({ width: 300, height: 180 }), [angle, setAngle] = useState(Math.PI / 4);
  const preview = useMemo(() => { try { return { lines: projectMobilePromotion(promotion.document, size, angle), error: "" }; }
    catch (error) { return { lines: [], error: (error as Error).message }; } }, [promotion.document, size, angle]);
  return <View><View testID="mobile-promotion-geometry" accessibilityLabel="Bounded 3D wireframe preview" style={{ height: 180, overflow: "hidden", backgroundColor: "#eaf2fa" }}
    onLayout={(event) => setSize(event.nativeEvent.layout)}>{preview.lines.map(({ a, b, color, width }, index) => <View key={index} pointerEvents="none" style={{ position: "absolute",
      left: (a.x + b.x) / 2 - Math.hypot(b.x - a.x, b.y - a.y) / 2, top: (a.y + b.y) / 2 - width / 2,
      width: Math.hypot(b.x - a.x, b.y - a.y), height: width, backgroundColor: color, transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }] }} />)}</View>
    {preview.error ? <Text accessibilityRole="alert">Preview unavailable: {preview.error}</Text> : <Text>Approximate 3D wireframe · at most 768 line Views</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="Rotate 3D preview" style={{ minHeight: 44, padding: 10 }} onPress={() => setAngle(angle + Math.PI / 6)}><Text>Rotate 3D preview</Text></Pressable>
  </View>;
};

export const MobileGraphPromotionPanel = ({ document, promotions, onCreate, onLocate }: { document: Graph2DDocument;
  promotions: readonly Graph2DAnyPromotion[]; onCreate: (promotion: Graph2DAnyPromotion) => Promise<boolean>; onLocate: (id: string) => void }) => {
  const [operation, setOperation] = useState<"curve" | "revolve" | "extrude">("curve");
  const [axis, setAxis] = useState<"x" | "y">("x"), [orientation, setOrientation] = useState<"positive" | "negative">("positive");
  const [angleMin, setAngleMin] = useState("0"), [angleMax, setAngleMax] = useState(String(2 * Math.PI));
  const [direction, setDirection] = useState("0,0,1"), [length, setLength] = useState("3"), [caps, setCaps] = useState<Graph2DExtrudeOptions["caps"]>("none");
  const [preview, setPreview] = useState<Graph2DAnyPromotion | null>(null), [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const source = document.source.objects.find((object) => object.id === document.selection.objectId);
  const allowed = source?.kind === "explicit-cartesian" || source?.kind === "parametric";
  const current = preview && preview.trace.sourceObjectId === source?.id && graph2DPromotionStatus(preview, document) === "current" ? preview : null;
  const button = (label: string, action: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
    disabled={disabled} accessibilityState={{ disabled }} onPress={action} style={{ minHeight: 44, padding: 10 }}><Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  const update = (action: () => void) => { setPreview(null); setError(""); action(); };
  const field = (label: string, value: string, change: (value: string) => void) => <View><Text>{label}</Text><TextInput accessibilityLabel={label} value={value}
    autoCapitalize="none" autoCorrect={false} maxLength={160} onChangeText={(text) => update(() => change(text))} style={{ minHeight: 44, padding: 8, borderWidth: 1, borderColor: "#94a3b8" }} /></View>;
  const number = (raw: string) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) ? Number(raw) : NaN;
  const capModes = ["none", "start", "end", "both"] as const;
  return <View testID="mobile-graph-promotions"><Text>Curve and Surface promotion</Text>
    <Text>Local bounded preview and ordinary portable documents. No browser worker or advanced Curve/Surface compute is available here; use desktop for those analyses and regeneration/fork. Create saves the Graph and target together.</Text>
    {allowed ? <><Text>Profile: {source.label} · {source.domain.min} to {source.domain.max}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{(["curve", "revolve", "extrude"] as const).map((value) => button(`${value}${value === operation ? " ✓" : ""}`, () => update(() => setOperation(value))))}</View>
      {operation === "revolve" && <>{button(`Revolution axis: ${axis}`, () => update(() => setAxis(axis === "x" ? "y" : "x")))}
        {button(`Orientation: ${orientation}`, () => update(() => setOrientation(orientation === "positive" ? "negative" : "positive")))}
        {field("Angle minimum radians", angleMin, setAngleMin)}{field("Angle maximum radians", angleMax, setAngleMax)}</>}
      {operation === "extrude" && <>{field("Extrusion direction x,y,z", direction, setDirection)}{field("Extrusion length", length, setLength)}
        {button(`Caps: ${caps}`, () => update(() => setCaps(capModes[(capModes.indexOf(caps) + 1) % capModes.length]!)))}</>}
      {button("Preview promotion", () => { try {
        const values = direction.split(",").map(number); if (operation === "extrude" && values.length !== 3) throw new TypeError("Enter three direction components.");
        const next = operation === "curve" ? promoteGraph2DToCurve(document, source.id) : operation === "revolve" ? revolveGraph2DProfile(document, source.id,
          { axis, orientation, angleMin: number(angleMin), angleMax: number(angleMax) }) : extrudeGraph2DProfile(document, source.id,
          { direction: values as [number, number, number], length: number(length), caps });
        evaluateGraph2DPromotionGeometry(next.document); setPreview(next); setTarget(null); setError("");
      } catch (caught) { setPreview(null); setError((caught as Error).message); } }, saving)}
    </> : <Text>Select an explicit or parametric graph profile to promote. Other kinds are not supported by the shared promotion contract.</Text>}
    {preview && !current && <Text>Preview is stale or another profile is selected. Preview again.</Text>}
    {current && <><Geometry promotion={current} />{button(saving ? "Creating…" : "Create and open target", () => {
      setSaving(true); void onCreate(current).then((saved) => { if (saved) { setPreview(null); setTarget(current.document.identity.id); } })
        .catch((caught: Error) => setError(caught.message)).finally(() => setSaving(false));
    }, saving)}{button("Cancel promotion preview", () => setPreview(null), saving)}</>}
    {error && <Text accessibilityRole="alert">{error}</Text>}
    {promotions.map((promotion) => <View key={promotion.document.identity.id}><Text>{promotion.document.metadata.title} · {graph2DPromotionStatus(promotion, document)}{isGraph2DPromotionTargetEdited(promotion) ? " · target edited" : ""}</Text>
      {button(`Locate target ${promotion.document.metadata.title}`, () => { setPreview(null); setTarget(promotion.document.identity.id); })}
      {button(`Locate source ${promotion.document.metadata.title}`, () => onLocate(promotion.trace.sourceObjectId))}
      {target === promotion.document.identity.id && <Geometry promotion={promotion} />}
    </View>)}
  </View>;
};
