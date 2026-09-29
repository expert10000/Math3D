import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createGraph2DAnimationPlan, graph2DAnimationFrame, Graph2DAnimationPlayer, Graph2DAnimationExportBuilder,
  graph2DParameterDraftFromFields, graph2DParameterFields, graph2DParameterNumber, getGraph2DInteractivePresetGuidance, graph2DPublicationTableAllowance, quantizeGraph2DParameterValue,
  type Graph2DDocument, type Graph2DParameterAction, type Graph2DParameterFields, type Graph2DParameterControl } from "@math3d/core";
import { mobileGraphPointTables } from "./services/mobileGraphPointTables";
import { saveMobileGraphPublication, shareMobileGraphPublication } from "./services/mobileGraphPublicationService";

function ParameterSlider({ name, control, value, disabled, onChange }: { name: string; control: Graph2DParameterControl; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [width, setWidth] = useState(200);
  const move = (x: number) => { if (!disabled) onChange(quantizeGraph2DParameterValue(control, control.min + Math.max(0, Math.min(1, x / width)) * (control.max - control.min))); };
  return <View style={{ height: 44, justifyContent: "center" }} accessibilityRole="adjustable" accessibilityLabel={`${name} slider`}
    accessibilityState={{ disabled }} accessibilityValue={{ min: control.min, max: control.max, now: value, text: `${value} ${control.unit}` }}
    accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={event => {
      if (!disabled) onChange(quantizeGraph2DParameterValue(control, value + (event.nativeEvent.actionName === "increment" ? control.step : -control.step))); }}
    onLayout={event => setWidth(Math.max(1, event.nativeEvent.layout.width))}
    onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled}
    onResponderGrant={event => move(event.nativeEvent.locationX)} onResponderMove={event => move(event.nativeEvent.locationX)}>
    <View pointerEvents="none" style={{ height: 4, backgroundColor: "#94a3b8" }} />
    <View pointerEvents="none" style={{ position: "absolute", left: Math.max(0, Math.min(width - 20, (value - control.min) / (control.max - control.min) * (width - 20))), width: 20, height: 20, borderRadius: 10, backgroundColor: disabled ? "#94a3b8" : "#1d4ed8" }} />
  </View>;
}
export function MobileGraphParametersPanel({ document, onPreview, onCommit, settled, samplingError }: {
  document: Graph2DDocument; onPreview: (values: Record<string, number> | null) => void; onCommit: (action: Graph2DParameterAction) => void;
  settled: boolean; samplingError?: string;
}) {
  const configured = document.source.variables.filter(p => p.control);
  const guidance = getGraph2DInteractivePresetGuidance(document);
  const recommendedAnimation = () => ({ parameter: guidance?.animation.parameter ?? configured[0]?.name ?? "",
    from: String(guidance?.animation.from ?? configured[0]?.control?.min ?? -5), to: String(guidance?.animation.to ?? configured[0]?.control?.max ?? 5),
    frames: String(guidance?.animation.frames ?? 21), fps: String(guidance?.animation.fps ?? 10) });
  const [edit, setEdit] = useState<{ name?: string; fields: Graph2DParameterFields } | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string; value?: number } | null>(null);
  const [animation, setAnimation] = useState(recommendedAnimation);
  const [index, setIndex] = useState<number | null>(null), [running, setRunning] = useState(false), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const player = useRef(new Graph2DAnimationPlayer(setTimeout, h => clearTimeout(h as ReturnType<typeof setTimeout>)));
  const generation = useRef(0), mounted = useRef(true), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useRef<"idle" | "preparing" | "native">("idle");
  const stop = () => { player.current.stop(); setRunning(false); };
  const cancelExport = () => { generation.current++; phase.current = "idle"; if (timer.current) clearTimeout(timer.current); timer.current = null; if (mounted.current) setBusy(false); };
  useLayoutEffect(() => { mounted.current = true;
    const listener = AppState.addEventListener("change", state => { if (state !== "active") {
      stop(); setPreview(null); setIndex(null); onPreview(null);
      // Native pickers/share sheets may themselves background the app. Their user intent can finish;
      // source/view replacement, explicit Cancel and unmount still invalidate the generation.
      if (phase.current === "preparing") cancelExport();
    } });
    const pressure = AppState.addEventListener("memoryWarning", () => { stop(); cancelExport(); });
    return () => { mounted.current = false; player.current.stop(); cancelExport(); listener.remove(); pressure.remove(); };
  }, []);
  useEffect(() => { if (running && index !== null) { if (samplingError) { stop(); setMessage(samplingError); } else if (settled) player.current.settled(index); } }, [index, running, settled, samplingError]);
  useEffect(() => { stop(); cancelExport(); }, [animation]);
  const safely = (action: () => void) => { setMessage(""); try { action(); } catch (error) { stop(); setMessage((error as Error).message); } };
  const scrub = (name: string, text: string) => { stop(); setIndex(null); setPreview({ name, text }); safely(() => {
    const value = graph2DParameterNumber(text); onPreview({ [name]: value }); setPreview({ name, text, value }); }); };
  const plan = () => createGraph2DAnimationPlan(document, { parameter: animation.parameter, from: graph2DParameterNumber(animation.from),
    to: graph2DParameterNumber(animation.to), frames: graph2DParameterNumber(animation.frames), fps: graph2DParameterNumber(animation.fps) });
  const play = () => safely(() => { const recipe = plan(); setRunning(true); player.current.start(recipe, i => {
    const frame = graph2DAnimationFrame(document, recipe, i); setIndex(i); setPreview({ name: recipe.parameter, text: String(frame.value), value: frame.value }); onPreview({ [recipe.parameter]: frame.value });
  }, () => setRunning(false)); });
  const exportFrames = (share: boolean, format: "html" | "csv") => {
    if (busy || AppState.currentState !== "active") return;
    try {
      const recipe = plan(); stop(); cancelExport(); const token = ++generation.current;
      const current = () => mounted.current && generation.current === token;
      const builder = new Graph2DAnimationExportBuilder({ plan: recipe, publication: { document, size: { width: 640, height: 480 },
        pointTables: Object.fromEntries(document.source.objects.flatMap(o => o.kind === "point-series" && o.table.rowCount <= graph2DPublicationTableAllowance(document) && document.display.objects.some(s => s.objectId === o.id && s.visible)
          ? [[o.table.id, mobileGraphPointTables.resolve(o.table)]] : [])) } });
      phase.current = "preparing"; setBusy(true); setMessage("Preparing frame sequence…");
      const started = Date.now();
      const advance = () => {
        timer.current = null; if (!current()) return;
        try {
          if (Date.now() - started > 45000) throw new Error("Frame export exceeded 45 seconds. Reduce frames or visible objects.");
          builder.appendNext(); setMessage(`Exporting frame ${builder.progress} / ${recipe.frames}…`);
          if (!builder.complete) { timer.current = setTimeout(advance, 0); return; }
          const artifact = builder.finish().find(o => o.format === format)!;
          phase.current = "native";
          void (async () => {
            try { if (share) { await shareMobileGraphPublication(artifact, current); if (current()) setMessage("Frame share sheet closed."); }
              else { const result = await saveMobileGraphPublication(artifact, current); if (current()) setMessage(result.status === "saved" ? `Saved and verified ${result.fileName}` : "Frame export cancelled."); } }
            catch (error) { if (current()) setMessage((error as Error).message); }
            finally { if (current()) { phase.current = "idle"; setBusy(false); } }
          })();
        } catch (error) { if (current()) { phase.current = "idle"; setBusy(false); setMessage((error as Error).message); } }
      };
      timer.current = setTimeout(advance, 50);
    } catch (error) { cancelExport(); setMessage((error as Error).message); }
  };
  const button = (label: string, action: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} style={s.button} onPress={action}><Text style={{ color: disabled ? "#94a3b8" : "#1d4ed8" }}>{label}</Text></Pressable>;
  return <View style={s.panel} testID="mobile-graph-parameters"><Text accessibilityRole="header" style={s.title}>Parameters</Text>
    <Text>Sliders and animation preview only. Apply commits one value; Cancel restores source. Units are labels, not conversions.</Text>
    {guidance && <View accessibilityLabel="Interactive recipe guidance"><Text>Matches {guidance.title}</Text><Text>{guidance.description}</Text>
      <Text>Suggestions match current source, not stored origin. Editing expressions, domains or controls removes hints.</Text></View>}
    {!configured.length && <Text>Configure an existing variable or add a parameter; use its name in a function, for example a*x.</Text>}
    {document.source.variables.map(p => <View key={p.name}><Text>{p.name} = {p.value} {p.control?.unit}</Text>
      {guidance?.parameters.filter(hint => hint.name === p.name).map(hint => <View key={hint.name}><Text>{hint.hint} Default {hint.defaultValue}.</Text>
        {button(`Preview default ${p.name}`, () => scrub(p.name, String(hint.defaultValue)), running || busy)}</View>)}
      {p.control && <><ParameterSlider name={p.name} control={p.control} value={preview?.name === p.name && preview.value !== undefined ? preview.value : p.value}
        disabled={running || busy} onChange={value => scrub(p.name, String(value))} />
        <Text>{p.name} preview value · range {p.control.min}…{p.control.max}, step {p.control.step}</Text>
        <TextInput accessibilityLabel={`${p.name} preview value`} style={s.input} value={preview?.name === p.name ? preview.text : String(p.value)} editable={!running && !busy} onChangeText={text => scrub(p.name, text)} /></>}
      <View style={s.row}>{button(`Configure ${p.name}`, () => setEdit({ name: p.name, fields: graph2DParameterFields(p) }), running || busy)}
        {button(`Delete ${p.name}`, () => safely(() => onCommit({ type: "parameter-delete", name: p.name })), running || busy)}</View>
    </View>)}
    {button("Add parameter", () => setEdit({ fields: graph2DParameterFields() }), document.source.variables.length >= 16 || running || busy)}
    {edit && <View>{(Object.keys(edit.fields) as (keyof Graph2DParameterFields)[]).map(key => <View key={key}><Text>Parameter {key}</Text>
      <TextInput accessibilityLabel={`Parameter ${key}`} autoCapitalize="none" style={s.input} value={edit.fields[key]} maxLength={key === "name" ? 32 : 64}
        editable={key !== "name" || !edit.name} onChangeText={text => setEdit({ ...edit, fields: { ...edit.fields, [key]: text } })} /></View>)}
      {button("Save parameter", () => safely(() => { const draft = graph2DParameterDraftFromFields(edit.fields); onCommit(edit.name ? { type: "parameter-configure", name: edit.name, draft } : { type: "parameter-create", draft }); }))}
      {button("Cancel configuration", () => setEdit(null))}</View>}
    <Text accessibilityRole="header" style={s.title}>Deterministic animation</Text>
    {guidance && button("Reset recommended animation", () => { stop(); setPreview(null); setIndex(null); onPreview(null); setAnimation(recommendedAnimation()); }, busy)}
    <Text>Animated parameter: {animation.parameter || "Configure a parameter first"}</Text>
    <View style={s.row}>{configured.map(p => button(`Animate ${p.name}`, () => setAnimation({ ...animation, parameter: p.name, from: String(p.control!.min), to: String(p.control!.max) }), busy))}</View>
    {(["from", "to", "frames", "fps"] as const).map(key => <View key={key}><Text>Animation {key}</Text><TextInput accessibilityLabel={`Animation ${key}`} style={s.input}
      value={animation[key]} editable={!busy} onChangeText={text => setAnimation({ ...animation, [key]: text })} /></View>)}
    <View style={s.row}>{button("Play animation", play, !configured.length || running || busy)}{button("Stop animation", stop, !running)}</View>
    <Text accessibilityLiveRegion="polite">{index === null ? "No active frame" : `Frame ${index + 1} / ${animation.frames}`} · nominal fps; slower sampling waits.</Text>
    <Text>640 × 480 SVG frame report and CSV manifest; not MP4/GIF. Shared approximate sampling; analysis is not recomputed. Native cancellation is cooperative between frames.</Text>
    <View style={s.row}>{(["html", "csv"] as const).flatMap(format => [button(`Save frame ${format === "html" ? "report" : "manifest"}`, () => exportFrames(false, format), !configured.length || busy),
      button(`Share frame ${format === "html" ? "report" : "manifest"}`, () => exportFrames(true, format), !configured.length || busy)])}</View>
    {busy && button("Cancel frame export", () => { cancelExport(); setMessage("Frame export cancelled."); })}
    <View style={s.row}>{button("Apply preview value", () => safely(() => { if (preview?.value !== undefined) onCommit({ type: "parameter-value", name: preview.name, value: preview.value }); }), running || busy || preview?.value === undefined)}
      {button("Cancel preview", () => { stop(); setIndex(null); setPreview(null); onPreview(null); })}</View>
    <Text accessibilityLiveRegion="polite">{message}</Text>
  </View>;
}
const s = StyleSheet.create({ panel: { padding: 12, gap: 8 }, title: { fontSize: 18, fontWeight: "600" }, row: { flexDirection: "row", flexWrap: "wrap" },
  button: { minWidth: 44, minHeight: 44, padding: 10, justifyContent: "center" }, input: { minHeight: 44, padding: 8, borderWidth: 1, borderColor: "#64748b", backgroundColor: "white" } });
