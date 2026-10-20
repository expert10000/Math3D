import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { Graph2DFunctionName } from "@math3d/core";
import { previewGraph2DFormula, type FormulaPreview, type FormulaPreviewContext, type FormulaPreviewMode,
  type FormulaRange } from "./graph2dFormulaPreview";

type Props = { label: string; ariaLabel: string; value: string; onChange: (value: string) => void; suffix?: string;
  variables?: readonly string[]; axes?: readonly [string] | readonly [string, string];
  ranges?: readonly [FormulaRange, FormulaRange?]; parameterValues?: Readonly<Record<string, number>>;
  previewMode?: FormulaPreviewMode; previewContext?: FormulaPreviewContext };

const basicFunctions = [
  { label: "sin", name: "sin" }, { label: "cos", name: "cos" }, { label: "tg", name: "tan" },
  { label: "exp", name: "exp" }, { label: "√", name: "sqrt" }, { label: "abs", name: "abs" },
  { label: "ln", name: "ln" }, { label: "log", name: "log" },
] as const;
export const graph2DFormulaFunctionGroups = [
  { title: "Everyday", functions: basicFunctions },
  { title: "Inverse and reciprocal trig", functions: [
    { label: "asin", name: "asin" }, { label: "acos", name: "acos" }, { label: "atan", name: "atan" },
    { label: "sec", name: "sec" }, { label: "csc", name: "csc" }, { label: "cot", name: "cot" },
  ] },
  { title: "Hyperbolic", functions: [
    { label: "sinh", name: "sinh" }, { label: "cosh", name: "cosh" }, { label: "tanh", name: "tanh" },
    { label: "asinh", name: "asinh" }, { label: "acosh", name: "acosh" }, { label: "atanh", name: "atanh" },
  ] },
  { title: "Numbers and special", functions: [
    { label: "cbrt", name: "cbrt" }, { label: "log₂", name: "log2" }, { label: "sinc", name: "sinc" },
    { label: "sign", name: "sign" }, { label: "floor", name: "floor" }, { label: "ceil", name: "ceil" },
    { label: "round", name: "round" }, { label: "trunc", name: "trunc" },
  ] },
] as const satisfies readonly { title: string; functions: readonly { label: string; name: Graph2DFunctionName }[] }[];
const constants = [
  { label: "π", text: "pi" }, { label: "e", text: "e" }, { label: "τ", text: "tau" },
] as const;
const operators = [
  { label: "+", text: "+" }, { label: "−", text: "-" }, { label: "×", text: "*" },
  { label: "÷", text: "/" }, { label: "^", text: "^" }, { label: "(", text: "(" }, { label: ")", text: ")" },
] as const;
const defaultVariables = ["x"] as const;
const defaultAxes = ["x"] as const;

export function insertGraph2DFormulaFunction(value: string, start: number, end: number, name: string) {
  const selected = value.slice(start, end);
  const replacement = `${name}(${selected})`;
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    cursor: start + name.length + 1 + selected.length,
  };
}

const formatValue = (value: number | null) => value === null ? "undefined" :
  Math.abs(value) < 1e-10 ? "0" : Number(value.toPrecision(4)).toString();

function FormulaPreviewInspector({ preview }: { preview: FormulaPreview }) {
  const status = preview.kind === "error" ? preview.source === "parser" ? "Invalid expression" : "Domain or sampling error" :
    "incomplete" in preview && preview.incomplete ? "Incomplete" : "Valid in sampled domain";
  const sampling = preview.kind === "contour" ? `${preview.samplesEvaluated} evaluations · ${preview.refinedCells} refined cells` :
    preview.kind === "diagram" ? `${preview.samplesEvaluated} evaluations` :
      preview.kind === "curve" ? `${preview.points.length} evaluations` :
        preview.kind === "field" ? `${preview.cells.length * preview.cells[0]!.length} evaluations` : "Unavailable";
  const viewport = preview.kind === "curve" ? `${preview.axis}: ${formatValue(preview.range.min)} to ${formatValue(preview.range.max)}` :
    "ranges" in preview ? preview.axes.map((axis, index) =>
      `${axis}: ${formatValue(preview.ranges[index]!.min)} to ${formatValue(preview.ranges[index]!.max)}`).join(" · ") : "Unavailable";
  return <section className="graph2d-preview-inspector" aria-label="Preview diagnostics">
    <h4>Preview Inspector</h4>
    <dl>
      <dt>Expression</dt><dd>{status}</dd>
      {preview.kind === "contour" && <>
        <dt>Contour</dt><dd>{preview.closedBranches} closed · {preview.openBranches} open · {preview.clippedBranches} clipped
          {preview.unresolvedCells > 0 ? ` · ${preview.unresolvedCells} uncertain cells` : ""}</dd>
        <dt>Components</dt><dd>{preview.segments.length} sampled {preview.segments.length === 1 ? "branch" : "branches"}</dd>
        <dt>Ambiguity</dt><dd>{preview.ambiguousCells} ambiguous cells · {preview.zeroCandidates} possible zero/tangency points</dd>
      </>}
      <dt>Sampling</dt><dd>{sampling}</dd>
      <dt>Error estimate</dt><dd>{preview.kind === "contour" && preview.resolutionPx > 0 ?
        `Cell resolution ≤ ${formatValue(preview.resolutionPx)} px; numerical error unbounded` : "Not estimated"}</dd>
      <dt>Viewport</dt><dd>{viewport}</dd>
      <dt>Performance</dt><dd>{preview.durationMs === undefined ? "Unavailable" :
        `${Math.max(0.1, Number(preview.durationMs.toFixed(1)))} ms`}</dd>
    </dl>
    {preview.kind === "contour" && <small>Contour topology is sampled. The interval screen covers supported algebraic expressions;
      unresolved cells and singularities need closer inspection.</small>}
  </section>;
}

function FormulaPreviewPanel({ preview, source, onLocateError }: { preview: FormulaPreview; source: string;
  onLocateError: (start: number, end: number) => void }) {
  if (preview.kind === "error") return <section className="graph2d-formula-preview" aria-label="Formula preview">
    <h3>Live preview</h3><p className="graph2d-formula-preview-error" role="status">{preview.message}</p>
    {preview.source === "parser" ? <><small>Syntax error at line {source.slice(0, preview.start).split("\n").length},
      column {source.slice(0, preview.start).split("\n").at(-1)!.length + 1}.</small>
      <button type="button" onClick={() => onLocateError(preview.start, preview.end)}>Go to error</button>
      <small>Correct the formula to see a preview and enable Apply.</small></> :
      <small>The expression can still be applied; review its domain before saving.</small>}
    <FormulaPreviewInspector preview={preview} />
  </section>;
  if (preview.kind === "curve") {
    const span = preview.max - preview.min || 2;
    const max = preview.max === preview.min ? preview.max + 1 : preview.max;
    let previous = false;
    const path = preview.points.map((value, index) => {
      if (value === null) { previous = false; return ""; }
      const point = `${10 + index * 340 / (preview.points.length - 1)},${10 + (max - value) * 170 / span}`;
      const command = `${previous ? "L" : "M"}${point}`;
      previous = true;
      return command;
    }).join(" ");
    return <section className="graph2d-formula-preview" aria-label="Formula preview">
      <h3>Live preview</h3><p className="graph2d-formula-preview-ok">Valid expression</p>
      <svg viewBox="0 0 360 190" role="img" aria-label={`Sampled values across ${preview.axis} range`}>
        <rect x="0" y="0" width="360" height="190" rx="8" className="graph2d-formula-preview-bg" />
        <path d={path} className="graph2d-formula-preview-curve" />
      </svg>
      <div className="graph2d-formula-preview-axis"><span>{preview.axis} = {formatValue(preview.range.min)}</span>
        <span>{preview.axis} = {formatValue(preview.range.max)}</span></div>
      <small>At midpoint: {formatValue(preview.midpoint)} · sampled range {formatValue(preview.min)} to {formatValue(preview.max)}</small>
      {preview.invalidSamples > 0 && <small className="graph2d-formula-preview-warning">{preview.invalidSamples} sampled value(s) are undefined; gaps are omitted.</small>}
      <small>Preview samples this formula only; Review the graph editor before saving.</small>
      <FormulaPreviewInspector preview={preview} />
    </section>;
  }
  if (preview.kind === "contour") {
    const [xRange, yRange] = preview.ranges;
    const [horizontal, vertical] = preview.axes;
    const x = (value: number) => 10 + (value - xRange.min) * 340 / (xRange.max - xRange.min);
    const y = (value: number) => 180 - (value - yRange.min) * 170 / (yRange.max - yRange.min);
    return <section className="graph2d-formula-preview" aria-label="Formula preview">
      <h3>Live preview · F({horizontal},{vertical}) = 0</h3>
      <p className="graph2d-formula-preview-ok">Valid expression</p>
      <svg viewBox="0 0 360 190" role="img" aria-label={`Zero contour preview across ${horizontal}, ${vertical}`}>
        <rect x="0" y="0" width="360" height="190" rx="8" className="graph2d-formula-preview-bg" />
        {xRange.min < 0 && xRange.max > 0 && <path d={`M${x(0)} 10V180`} className="graph2d-formula-preview-axis-line" />}
        {yRange.min < 0 && yRange.max > 0 && <path d={`M10 ${y(0)}H350`} className="graph2d-formula-preview-axis-line" />}
        {preview.segments.map((segment, index) => <path key={index}
          d={segment.map((point, at) => `${at ? "L" : "M"}${x(point.x)} ${y(point.y)}`).join(" ")}
          className="graph2d-formula-preview-curve" />)}
      </svg>
      <div className="graph2d-formula-preview-axis"><span>{horizontal}: {formatValue(xRange.min)} to {formatValue(xRange.max)}</span>
        <span>{vertical}: {formatValue(yRange.min)} to {formatValue(yRange.max)}</span></div>
      {!preview.segments.length && !preview.incomplete && <small>No zero contour found in this preview domain.</small>}
      {preview.incomplete && <small className="graph2d-formula-preview-warning">Preview reached its work limit; the contour may be incomplete.</small>}
      {preview.invalidSamples > 0 && <small className="graph2d-formula-preview-warning">{preview.invalidSamples} sampled value(s) are undefined; affected contour cells are omitted.</small>}
      <small>{preview.samplesEvaluated} bounded samples · Review the graph editor before saving.</small>
      <FormulaPreviewInspector preview={preview} />
    </section>;
  }
  if (preview.kind === "diagram") {
    const [xRange, yRange] = preview.ranges;
    const [horizontal, vertical] = preview.axes;
    const x = (value: number) => 10 + (value - xRange.min) * 340 / (xRange.max - xRange.min);
    const y = (value: number) => 180 - (value - yRange.min) * 170 / (yRange.max - yRange.min);
    const path = (segment: readonly Readonly<{ x: number; y: number }>[]) =>
      segment.map((point, at) => `${at ? "L" : "M"}${x(point.x)} ${y(point.y)}`).join(" ");
    const title = preview.mode === "slope-field" ? "Local slope directions" :
      preview.mode === "inequality" ? "Combined inequality region" :
      preview.mode === "time-ode" ? "Solution from initial value" : "Phase directions and orbits";
    return <section className="graph2d-formula-preview" aria-label="Formula preview">
      <h3>Live preview · {title}</h3><p className="graph2d-formula-preview-ok">Valid expression</p>
      <svg viewBox="0 0 360 190" role="img" aria-label={`${title} across ${horizontal}, ${vertical}`}>
        <rect x="0" y="0" width="360" height="190" rx="8" className="graph2d-formula-preview-bg" />
        {preview.fills.map((fill, index) => <rect key={index} x={x(fill.xMin)} y={y(fill.yMax)}
          width={x(fill.xMax) - x(fill.xMin)} height={y(fill.yMin) - y(fill.yMax)}
          className="graph2d-formula-preview-fill" />)}
        {xRange.min < 0 && xRange.max > 0 && <path d={`M${x(0)} 10V180`} className="graph2d-formula-preview-axis-line" />}
        {yRange.min < 0 && yRange.max > 0 && <path d={`M10 ${y(0)}H350`} className="graph2d-formula-preview-axis-line" />}
        {preview.fieldSegments.map((segment, index) => <path key={`field-${index}`} d={path(segment)}
          className="graph2d-formula-preview-field-line" />)}
        {preview.segments.map((segment, index) => <path key={`line-${index}`} d={path(segment)}
          className="graph2d-formula-preview-curve" />)}
        {preview.strictSegments.map((segment, index) => <path key={`strict-${index}`} d={path(segment)}
          className="graph2d-formula-preview-strict-line" />)}
        {preview.seeds.map((seed, index) => <circle key={`seed-${index}`} cx={x(seed.x)} cy={y(seed.y)} r="4"
          className="graph2d-formula-preview-seed" />)}
      </svg>
      <div className="graph2d-formula-preview-axis"><span>{horizontal}: {formatValue(xRange.min)} to {formatValue(xRange.max)}</span>
        <span>{vertical}: {formatValue(yRange.min)} to {formatValue(yRange.max)}</span></div>
      {preview.note && <small>{preview.note}</small>}
      {!preview.segments.length && !preview.fieldSegments.length && !preview.fills.length && !preview.seeds.length && !preview.incomplete &&
        <small>No visible result in this preview domain.</small>}
      {preview.incomplete && <small className="graph2d-formula-preview-warning">Preview is incomplete; check work limits and undefined samples.</small>}
      {preview.invalidSamples > 0 && <small className="graph2d-formula-preview-warning">{preview.invalidSamples} sampled value(s) are undefined.</small>}
      <small>{preview.samplesEvaluated} bounded samples · Review the graph editor before saving.</small>
      <FormulaPreviewInspector preview={preview} />
    </section>;
  }
  const [horizontal, vertical] = preview.axes;
  return <section className="graph2d-formula-preview" aria-label="Formula preview">
    <h3>Live preview</h3><p className="graph2d-formula-preview-ok">Valid expression</p>
    <div className="graph2d-formula-field-grid" role="img"
      aria-label={`Sampled ${horizontal}, ${vertical} value map; blue is positive, rose is negative`}>
      {preview.cells.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
        const intensity = value === null ? 0 : Math.min(0.8, 0.12 + 0.68 * Math.abs(value) / (preview.maxAbs || 1));
        const background = value === null ? "transparent" : value > 0 ? `rgba(37,99,235,${intensity})` :
          value < 0 ? `rgba(225,29,72,${intensity})` : "rgba(100,116,139,.25)";
        const x = preview.ranges[0].min + (preview.ranges[0].max - preview.ranges[0].min) * columnIndex / 4;
        const y = preview.ranges[1].max - (preview.ranges[1].max - preview.ranges[1].min) * rowIndex / 4;
        return <span key={`${rowIndex}-${columnIndex}`}
          title={`${horizontal}=${formatValue(x)}, ${vertical}=${formatValue(y)}: ${formatValue(value)}`}
          style={{ backgroundColor: background, color: intensity > .55 ? "#fff" : undefined }}>{formatValue(value)}</span>;
      }))}
    </div>
    <div className="graph2d-formula-preview-axis"><span>{horizontal}: {formatValue(preview.ranges[0].min)} to {formatValue(preview.ranges[0].max)}</span>
      <span>{vertical}: {formatValue(preview.ranges[1].min)} to {formatValue(preview.ranges[1].max)}</span></div>
    <small>Blue: positive · rose: negative · gray: zero. At midpoint: {formatValue(preview.midpoint)}</small>
    {preview.invalidSamples > 0 && <small className="graph2d-formula-preview-warning">{preview.invalidSamples} sampled value(s) are undefined.</small>}
    <small>Preview samples this formula only; Review the graph editor before saving.</small>
    <FormulaPreviewInspector preview={preview} />
  </section>;
}

export function Graph2DFormulaInput({ label, ariaLabel, value, onChange, suffix,
  variables = defaultVariables, axes = defaultAxes, ranges, parameterValues, previewMode = "values",
  previewContext }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretMirrorRef = useRef<HTMLDivElement>(null);
  const caretAnchorRef = useRef<HTMLSpanElement>(null);
  const caretViewportRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialCaretRef = useRef(0);
  const [expandedValue, setExpandedValue] = useState<string | null>(null);
  const [functionQuery, setFunctionQuery] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const isExpanded = expandedValue !== null;
  const preview = useMemo(() => expandedValue === null ? null :
    previewGraph2DFormula(expandedValue, variables, axes, parameterValues, ranges, previewMode, previewContext),
  [expandedValue, variables, axes, parameterValues, ranges, previewMode, previewContext]);
  const updateCaretPosition = () => {
    const textarea = textareaRef.current;
    const mirror = caretMirrorRef.current;
    const anchor = caretAnchorRef.current;
    const viewport = caretViewportRef.current;
    const caret = caretRef.current;
    if (!textarea || !mirror || !anchor || !viewport || !caret) return;
    if (document.activeElement !== textarea || textarea.selectionStart !== textarea.selectionEnd) {
      caret.style.display = "none";
      return;
    }
    // The mirror has the textarea's usable width, padding and font, so its zero-width
    // anchor follows the same line wrapping as the text being edited.
    mirror.style.width = `${textarea.clientWidth}px`;
    const anchorRect = anchor.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const left = anchorRect.left - viewportRect.left - textarea.scrollLeft;
    const top = anchorRect.top - viewportRect.top - textarea.scrollTop;
    const height = anchorRect.height || parseFloat(getComputedStyle(textarea).lineHeight);
    caret.style.left = `${left}px`;
    caret.style.top = `${top}px`;
    caret.style.height = `${height}px`;
    caret.style.display = "block";
  };
  useLayoutEffect(() => {
    if (!isExpanded) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(initialCaretRef.current, initialCaretRef.current);
    setSelection({ start: initialCaretRef.current, end: initialCaretRef.current });
  }, [isExpanded]);
  useLayoutEffect(() => {
    if (isExpanded) updateCaretPosition();
  }, [isExpanded, expandedValue, selection]);
  useLayoutEffect(() => {
    if (!isExpanded || !textareaRef.current) return;
    const observer = new ResizeObserver(updateCaretPosition);
    observer.observe(textareaRef.current);
    document.addEventListener("selectionchange", updateCaretPosition);
    return () => {
      observer.disconnect();
      document.removeEventListener("selectionchange", updateCaretPosition);
    };
  }, [isExpanded]);
  const updateSelection = () => {
    const textarea = textareaRef.current;
    if (textarea) setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  };
  const insert = (name: string) => {
    const input = inputRef.current;
    if (!input) return;
    const active = document.activeElement === input;
    const start = active ? input.selectionStart ?? value.length : value.length;
    const end = active ? input.selectionEnd ?? start : start;
    const next = insertGraph2DFormulaFunction(value, start, end, name);
    onChange(next.value);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(next.cursor, next.cursor); });
  };
  const insertExpanded = (text: string, functionCall = false) => {
    const textarea = textareaRef.current;
    if (!textarea || expandedValue === null) return;
    const start = textarea.selectionStart, end = textarea.selectionEnd;
    const next = functionCall ? insertGraph2DFormulaFunction(expandedValue, start, end, text) :
      { value: expandedValue.slice(0, start) + text + expandedValue.slice(end), cursor: start + text.length };
    setExpandedValue(next.value);
    setSelection({ start: next.cursor, end: next.cursor });
    requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(next.cursor, next.cursor); });
  };
  const closeExpanded = () => {
    setExpandedValue(null);
    requestAnimationFrame(() => expandButtonRef.current?.focus());
  };
  const applyExpanded = () => {
    if (expandedValue === null || preview?.kind === "error" && preview.source === "parser") return;
    onChange(expandedValue.replace(/\s*[\r\n]+\s*/g, " "));
    closeExpanded();
  };
  const locateError = (start: number, end: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start, Math.max(start + 1, end));
    updateSelection();
  };
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeExpanded(); return; }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); applyExpanded(); return; }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>("textarea, button");
    if (!controls?.length) return;
    const first = controls[0]!, last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const beforeCaret = (expandedValue ?? "").slice(0, selection.start);
  const line = beforeCaret.split("\n").length;
  const column = beforeCaret.length - beforeCaret.lastIndexOf("\n");
  return <div className="graph2d-formula-input">
    <label>{label} <input ref={inputRef} aria-label={ariaLabel} value={value} spellCheck={false}
      onChange={event => onChange(event.target.value)} />{suffix}</label>
    <div className="graph2d-formula-buttons" role="group" aria-label="Formula functions">
      {basicFunctions.map(({ label: buttonLabel, name }) => <button key={name} type="button" title={`Insert ${name}(…)`}
        onMouseDown={event => event.preventDefault()} onClick={() => insert(name)}>{buttonLabel}</button>)}
    </div>
    <button ref={expandButtonRef} className="graph2d-formula-expand" type="button" onClick={() => {
      initialCaretRef.current = inputRef.current?.selectionStart ?? value.length;
      setFunctionQuery("");
      setExpandedValue(value);
    }}>Expand formula</button>
    {isExpanded && createPortal(<div className="graph2d-formula-overlay">
      <div ref={dialogRef} className="graph2d-formula-dialog" role="dialog" aria-modal="true"
        aria-label={`Edit ${ariaLabel}`} onKeyDown={handleDialogKeyDown}>
        <header><div><h2>Edit {label} formula</h2><p>Write and preview the expression before applying it to the Graph editor.</p></div>
          <button type="button" aria-label="Close formula editor" onClick={closeExpanded}>×</button></header>
        <div className="graph2d-formula-dialog-body">
          <div className="graph2d-formula-composer">
            <label>{label}<span className="graph2d-formula-textarea-wrap">
              <textarea ref={textareaRef} aria-label={`${ariaLabel} expanded`} rows={6}
                aria-invalid={preview?.kind === "error" && preview.source === "parser"}
                value={expandedValue} spellCheck={false} wrap="soft" onSelect={() => { updateSelection(); updateCaretPosition(); }}
                onFocus={updateCaretPosition} onBlur={updateCaretPosition} onScroll={updateCaretPosition}
                onChange={event => { setExpandedValue(event.target.value); updateSelection(); }} />
              <span ref={caretMirrorRef} className="graph2d-formula-caret-mirror" aria-hidden="true">
                {expandedValue.slice(0, selection.start)}<span ref={caretAnchorRef}>{"\u200b"}</span>
                {expandedValue.slice(selection.start)}
              </span>
              <span ref={caretViewportRef} className="graph2d-formula-caret-viewport" aria-hidden="true">
                <span ref={caretRef} className="graph2d-formula-visible-caret" />
              </span>
            </span></label>
            <div className="graph2d-formula-editor-status"><span>Ln {line}, Col {column}</span>
              <span>{selection.end > selection.start ? `${selection.end - selection.start} selected` : "Caret ready"}</span>
              <span>{expandedValue.length} characters</span></div>
            <section className="graph2d-formula-palette" aria-label="Formula keypad">
              <h3>Functions</h3>
              <label className="graph2d-formula-function-search">Find function
                <input type="search" value={functionQuery} aria-label="Find formula function"
                  onChange={event => setFunctionQuery(event.target.value)} placeholder="Search 28 functions" /></label>
              <div role="group" aria-label="Expanded formula functions" className="graph2d-formula-function-groups">
              {graph2DFormulaFunctionGroups.map(group => {
                const matches = group.functions.filter(item =>
                  item.name.includes(functionQuery.trim().toLowerCase()) || item.label.toLowerCase().includes(functionQuery.trim().toLowerCase()));
                return matches.length ? <div key={group.title} className="graph2d-formula-function-group">
                  <h4>{group.title}</h4>
                  <div className="graph2d-formula-buttons" role="group" aria-label={`${group.title} formula functions`}>
                    {matches.map(({ label: buttonLabel, name }) => <button key={name} type="button" title={`Insert ${name}(…)`}
                      onMouseDown={event => event.preventDefault()} onClick={() => insertExpanded(name, true)}>{buttonLabel}</button>)}
                  </div>
                </div> : null;
              })}
              {graph2DFormulaFunctionGroups.every(group => !group.functions.some(item =>
                item.name.includes(functionQuery.trim().toLowerCase()) || item.label.toLowerCase().includes(functionQuery.trim().toLowerCase()))) &&
                <p>No matching functions.</p>}
              </div>
              <h3>Operators and constants</h3>
              <div className="graph2d-formula-buttons" role="group" aria-label="Formula operators and constants">
                {[...operators, ...constants, ...variables.filter(name => name !== "pi" && name !== "e" && name !== "tau")
                  .map(name => ({ label: name === "theta" ? "θ" : name, text: name }))].map(({ label: buttonLabel, text }) =>
                  <button key={`${buttonLabel}-${text}`} type="button" title={`Insert ${text}`}
                    onMouseDown={event => event.preventDefault()} onClick={() => insertExpanded(text)}>{buttonLabel}</button>)}
              </div>
            </section>
            <p className="graph2d-formula-hint">Select an expression to wrap it in a function. Line breaks become spaces on Apply.</p>
          </div>
          {preview && <FormulaPreviewPanel preview={preview} source={expandedValue} onLocateError={locateError} />}
        </div>
        <div className="graph2d-formula-dialog-actions">
          <span>Esc: cancel · Ctrl+Enter: apply</span>
          <button type="button" onClick={closeExpanded}>Cancel</button>
          <button type="button" onClick={applyExpanded}
            disabled={preview?.kind === "error" && preview.source === "parser"}>Apply formula</button>
        </div>
      </div>
    </div>, document.body)}
  </div>;
}
