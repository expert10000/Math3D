/* ----------------------------------------------------------------------------
   D3 global (no bundler needed)
---------------------------------------------------------------------------- */
declare const d3: any;

/* ----------------------------------------------------------------------------
   SIMPLE DEBUG (plain console.*)
---------------------------------------------------------------------------- */
export const log  = (...a: any[]) => console.log("[viz]",  ...a);
export const info = (...a: any[]) => console.info("[viz+]", ...a);
export const warn = (...a: any[]) => console.warn("[viz⚠]", ...a);
export const trace = (label: string, fn: () => void) => {
  const t = performance.now();
  console.log("[viz]", label, "start");
  try { return fn(); }
  finally { console.log("[viz]", label, (performance.now()-t).toFixed(1), "ms"); }
};

/* ----------------------------------------------------------------------------
   Rebind-safe event helper (fixes “second click not working”)
---------------------------------------------------------------------------- */
let __uid_seq = 0;
class Evt {
  private static ctrls: Record<string, AbortController> = {};
  private static key(trg: EventTarget, type: string, ns="") {
    const any = trg as any; if (!any.__uid) any.__uid = `u${++__uid_seq}`;
    return `${any.__uid}::${type}${ns?":"+ns:""}`;
  }
  static on(trg: EventTarget, type: string, h: EventListener, ns="") {
    const k = this.key(trg,type,ns); this.ctrls[k]?.abort();
    const ctl = new AbortController(); this.ctrls[k] = ctl;
    trg.addEventListener(type, h, {signal: ctl.signal});
  }
  static off(trg: EventTarget, type: string, ns="") {
    const k = this.key(trg,type,ns); this.ctrls[k]?.abort(); delete this.ctrls[k];
  }
}

/* ----------------------------------------------------------------------------
   Complex helpers
---------------------------------------------------------------------------- */
type C = { re: number; im: number };
const C = (re=0, im=0): C => ({ re, im });
const add  = (x: C, y: C): C => C(x.re + y.re, x.im + y.im);
const mul  = (x: C, y: C): C => C(x.re*y.re - x.im*y.im, x.re*y.im + x.im*y.re);
const abs2 = (z: C) => z.re*z.re + z.im*z.im;
const isFiniteC = (z: C) => Number.isFinite(z.re) && Number.isFinite(z.im);

const div = (x: C, y: C): C => {
  const d = y.re*y.re + y.im*y.im;
  if (d === 0) return C(NaN, NaN);
  return C((x.re*y.re + x.im*y.im)/d, (x.im*y.re - x.re*y.im)/d);
};

const mobiusSafe = (z: C, a: C, b: C, c: C, d: C, eps=1e-12): C => {
  const den = add(mul(c,z), d);
  if (abs2(den) < eps) return C(NaN, NaN);
  return div(add(mul(a,z), b), den);
};

/* ----------------------------------------------------------------------------
   Chebyshev
---------------------------------------------------------------------------- */
function chebyshevT(n: number, x: number): number {
  if (n===0) return 1; if (n===1) return x;
  let t0=1, t1=x; for (let k=2;k<=n;k++){ const t=2*x*t1-t0; t0=t1; t1=t; } return t1;
}
const chebZeros   = (n:number) => n>0? Array.from({length:n},(_,k)=>Math.cos((2*k+1)*Math.PI/(2*n))) : [];
const chebExtrema = (n:number) => Array.from({length:n+1},(_,k)=>({x:Math.cos(k*Math.PI/n), y:(k%2? -1:1)}));

/* ----------------------------------------------------------------------------
   DOM utils
---------------------------------------------------------------------------- */
const $in  = (id:string) => document.getElementById(id) as HTMLInputElement;
const $sel = (id:string) => document.getElementById(id) as HTMLSelectElement;
const $btn = (id:string) => document.getElementById(id) as HTMLButtonElement;

function pickInput(...ids:string[]): HTMLInputElement|null {
  for (const id of ids){ const n=document.getElementById(id); if(n instanceof HTMLInputElement) return n; }
  return null;
}
function pickTextarea(...ids:string[]): HTMLTextAreaElement|null {
  for (const id of ids){ const n=document.getElementById(id); if(n instanceof HTMLTextAreaElement) return n; }
  return null;
}
function pickSelect(...ids:string[]): HTMLSelectElement|null {
  for (const id of ids){ const n=document.getElementById(id); if(n instanceof HTMLSelectElement) return n; }
  return null;
}
const numOf = (n:HTMLInputElement|null, dflt:number) => {
  const v = parseFloat(n?.value ?? ""); return Number.isFinite(v) ? v : dflt;
};

/* ----------------------------------------------------------------------------
   Types
---------------------------------------------------------------------------- */
type MobiusParams = { a:C;b:C;c:C;d:C; R:number; step:number; circleR:number; samples:number };
type ChebParams   = { n:number; samples:number };

/* ----------------------------------------------------------------------------
   PlanePlot
---------------------------------------------------------------------------- */
class PlanePlot {
  private W=900; private H=320;
  private m = {top:18,right:18,bottom:28,left:36};
  public svg:any; public gContent:any; public zoom:any; private _sync=false;
  x!:any; y!:any;

  constructor(svg: SVGSVGElement) {
    this.svg = d3.select(svg).attr("viewBox",`0 0 ${this.W} ${this.H}`);
    this.gContent = this.svg.append("g").attr("class","content");
  }
  clear(){ this.gContent.selectAll("*").remove(); }
  clearHard(){
    this.svg.on('.zoom',null).on('.linked',null).interrupt();
    this.svg.selectAll("*").remove();
    this.gContent = this.svg.append("g").attr("class","content");
  }
  setExtent(R:number){
    this.x = d3.scaleLinear().domain([-R,R]).range([this.m.left, this.W-this.m.right]);
    this.y = d3.scaleLinear().domain([ R,-R]).range([this.m.top,  this.H-this.m.bottom]);
    info("setExtent", {R});
  }
  drawGrid(step:number,R:number){
    const g=this.gContent.append("g").attr("data-layer","grid");
    let v=0,h=0;
    for(let re=-R;re<=R+1e-9;re+=step){ g.append("line").attr("class","grid-line").attr("x1",this.x(re)).attr("y1",this.y(-R)).attr("x2",this.x(re)).attr("y2",this.y(R)); v++; }
    for(let im=-R;im<=R+1e-9;im+=step){ g.append("line").attr("class","grid-line").attr("x1",this.x(-R)).attr("y1",this.y(im)).attr("x2",this.x(R)).attr("y2",this.y(im)); h++; }
    log("grid-lines",{v,h,R,step});
    this.gContent.append("line").attr("class","axis-zero").attr("x1",this.x(-R)).attr("y1",this.y(0)).attr("x2",this.x(R)).attr("y2",this.y(0));
    this.gContent.append("line").attr("class","axis-zero").attr("x1",this.x(0)).attr("y1",this.y(-R)).attr("x2",this.x(0)).attr("y2",this.y(R));
  }
  path(points:[number,number][], cls:string){
    const bad = points.filter(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])).length;
    if (bad) warn(`path(${cls}) drop`, {bad,total:points.length}); else info(`path(${cls})`,{n:points.length});
    const line = d3.line().defined((p:[number,number]) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    this.gContent.append("path").attr("class",cls).attr("d",line(points))
      .attr("fill","none")
      .attr("stroke", cls==="mapped" ? "#0a66c2" : cls==="circle" ? "#d93" : "#222")
      .attr("stroke-width",1.5).attr("vector-effect","non-scaling-stroke");
  }
  caption(s:string){ this.gContent.append("text").attr("class","badge").attr("x",894).attr("y",314).attr("text-anchor","end").text(s); }
  pxpyToComplex(px:number,py:number):C {
    const t=d3.zoomTransform(this.svg.node() as SVGSVGElement);
    return C(this.x.invert((px-t.x)/t.k), this.y.invert((py-t.y)/t.k));
  }
  enableZoom(syncWith?:PlanePlot){
    const self=this;
    this.zoom = d3.zoom().scaleExtent([0.5,20])
      .filter((ev:any)=>(!ev.button||ev.type==="wheel"||ev.type==="touchstart"||ev.type==="touchmove"))
      .on("zoom", (ev:any)=>{
        self.gContent.attr("transform", ev.transform);
        if (syncWith && !self._sync) {
          try { self._sync=true; (syncWith as any).svg.call((syncWith as any).zoom.transform, ev.transform); }
          finally { self._sync=false; }
        }
      });
    (this.svg as any).call(this.zoom);
    Evt.on((this.svg as any).node(), "dblclick", ()=>{
      (self.svg as any).transition().duration(200).call(self.zoom.transform, d3.zoomIdentity);
      if (syncWith) (syncWith as any).svg.transition().duration(200).call((syncWith as any).zoom.transform, d3.zoomIdentity);
    },"zoomreset");
  }
}
// ----- Primitive mapping & wiring -----
const PRIM_BY_TEXT: Record<string, string> = {
  "vertical line": "vline",
  "horizontal line": "hline",
  "circle": "circle",
  "polyline": "poly",
  "ellipse": "ellipse",
  "spiral": "spiral",
  "parametric": "poly", // fallback (treat as poly) – adjust if you add a real parametric
};

function inferPrimKindFromText(btn: HTMLElement): string | null {
  const txt = (btn.textContent || "").toLowerCase();
  for (const key of Object.keys(PRIM_BY_TEXT)) {
    if (txt.includes(key)) return PRIM_BY_TEXT[key];
  }
  return null;
}

function wirePrimitivesPanel() {
  // Find likely container of the primitive list
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, li, .btn"));
  const primButtons = candidates.filter((el) =>
    /vertical line|horizontal line|circle|polyline|ellipse|spiral|parametric/i.test(el.textContent || "")
  );

  console.log("[viz] wirePrimitivesPanel → found", primButtons.length, "buttons");

  primButtons.forEach((btn, idx) => {
    const explicit = (btn as HTMLElement).getAttribute?.("data-prim");
    const inferred = inferPrimKindFromText(btn as HTMLElement);
    const kind = explicit || inferred;

    if (!kind) {
      console.warn("[viz] primitive button without recognizable kind", { idx, text: btn.textContent });
      return;
    }

    // store for later & log
    (btn as HTMLElement).setAttribute("data-prim", kind);
    console.log("[viz] BIND primitive", { idx, kind, text: (btn.textContent || "").trim() });

    Evt.on(
      btn,
      "click",
      () => {
        PRIM_KIND = kind;                       // keep global in sync
        if (el.primType) el.primType.value = kind;  // sync hidden/select if present
        console.log("[viz] EVT primitive →", kind);

        if (activeMode !== "transform") gotoMode("transform");
        else render("transform");
      },
      "primitive"
    );
  });
}

/* ----------------------------------------------------------------------------
   Curves & transforms
---------------------------------------------------------------------------- */
type Gamma = (t:number)=>C; type Transform = (z:C)=>C;

const lineVertical   = (x0:number,t0:number,t1:number):Gamma => t=>C(x0, t0+(t1-t)*0 + (t1-t0)*t);
const lineHorizontal = (y0:number,t0:number,t1:number):Gamma => t=>C(t0+(t1-t0)*t, y0);
const circleGamma    = (c:C, r:number):Gamma => t=>{ const th=2*Math.PI*t; return C(c.re + r*Math.cos(th), c.im + r*Math.sin(th)); };
const polylineGamma  = (pts:C[]):Gamma => {
  if (pts.length<=1) return _t => (pts[0]??C(0,0));
  return t => { const u=Math.min(1,Math.max(0,t))*(pts.length-1); const i=Math.floor(u), v=u-i; const a=pts[i], b=pts[Math.min(i+1,pts.length-1)];
    return C(a.re+v*(b.re-a.re), a.im+v*(b.im-a.im)); };
};

const T_translate = (dx:number,dy:number):Transform => z=>C(z.re+dx, z.im+dy);
const T_scale     = (s:number):Transform => z=>C(z.re*s, z.im*s);
const T_rotate    = (th:number):Transform => { const c=Math.cos(th), s=Math.sin(th); return z=>C(z.re*c - z.im*s, z.re*s + z.im*c); };
const T_invert    = (z:C):C => { const d=z.re*z.re+z.im*z.im; return d===0? C(NaN,NaN) : C(z.re/d, -z.im/d); };
const T_mobius    = (a:C,b:C,c:C,d:C):Transform => z=>mobiusSafe(z,a,b,c,d);

/* ----------------------------------------------------------------------------
   TransformLayer
---------------------------------------------------------------------------- */
class TransformLayer {
  constructor(private zPlot:PlanePlot, private wPlot:PlanePlot){}
  draw(gamma:Gamma, T:Transform, steps=400, clsZ="orig", clsW="mapped"){
    const zPts:[number,number][]=[], wPts:[number,number][]=[];
    let badW=0;
    for (let k=0;k<=steps;k++){
      const t=k/steps, z=gamma(t), w=T(z);
      zPts.push([this.zPlot.x(z.re), this.zPlot.y(z.im)]);
      if (isFiniteC(w)) wPts.push([this.wPlot.x(w.re), this.wPlot.y(w.im)]); else { wPts.push([NaN,NaN]); badW++; }
    }
    if (badW) warn("bad W points", {badW,steps});
    this.zPlot.path(zPts,clsZ); this.wPlot.path(wPts,clsW);
  }
}

/* ----------------------------------------------------------------------------
   Viewers
---------------------------------------------------------------------------- */
class MobiusViewer {
  private zCursor?:any; private wCursor?:any;
  constructor(private zPlot:PlanePlot, private wPlot:PlanePlot){}

  private cursors(){
    if (!this.zCursor){
      const g=(this as any).zPlot['gContent']; this.zCursor=g.append("g").style("pointer-events","none");
      this.zCursor.append("circle").attr("r",4).attr("class","cursorZ");
      this.zCursor.append("text").attr("dx",8).attr("dy",-8).attr("class","coord-badge");
    }
    if (!this.wCursor){
      const g=(this as any).wPlot['gContent']; this.wCursor=g.append("g").style("pointer-events","none");
      this.wCursor.append("circle").attr("r",4).attr("class","cursorW");
      this.wCursor.append("text").attr("dx",8).attr("dy",-8).attr("class","coord-badge");
    }
  }
  private setCursor(z:C,w:C){
    this.cursors();
    const zx=this.zPlot.x(z.re), zy=this.zPlot.y(z.im);
    this.zCursor.attr("transform",`translate(${zx},${zy})`);
    this.zCursor.select("text").text(`z=${z.re.toFixed(3)} ${z.im>=0?"+":"-"} ${Math.abs(z.im).toFixed(3)}i`);
    if (isFiniteC(w)){
      const wx=this.wPlot.x(w.re), wy=this.wPlot.y(w.im);
      this.wCursor.attr("transform",`translate(${wx},${wy})`);
      this.wCursor.select("text").text(`w=${w.re.toFixed(3)} ${w.im>=0?"+":"-"} ${Math.abs(w.im).toFixed(3)}i`);
      this.wCursor.select("circle").attr("display",null);
    } else {
      this.wCursor.select("text").text("w = ∞ (pole)");
      this.wCursor.select("circle").attr("display","none");
    }
  }

  render(p:MobiusParams){
    const {a,b,c,d,R,step,samples,circleR} = p;
    this.zPlot.clear(); this.wPlot.clear();
    this.zPlot.setExtent(R); this.wPlot.setExtent(R);
    this.zPlot.drawGrid(step,R); this.wPlot.drawGrid(step,R);

    const STEPS=Math.max(60, Math.min(800, samples));
    const draw = (mk:(t:number)=>C, t0:number,t1:number, clsZ:string,clsW:string)=>{
      const Z:[number,number][]=[], W:[number,number][]=[]; let drop=0;
      for(let k=0;k<=STEPS;k++){
        const t=t0+(t1-t0)*k/STEPS, z=mk(t), w=mobiusSafe(z,a,b,c,d);
        Z.push([this.zPlot.x(z.re), this.zPlot.y(z.im)]);
        if (isFiniteC(w)) W.push([this.wPlot.x(w.re), this.wPlot.y(w.im)]); else { W.push([NaN,NaN]); drop++; }
      }
      if (drop) warn("mobius drops", {clsW,drop});
      this.zPlot.path(Z,clsZ); this.wPlot.path(W,clsW);
    };

    for(let re=-R;re<=R+1e-9;re+=step) draw(t=>C(re,t), -R,R, "orig","mapped");
    for(let im=-R;im<=R+1e-9;im+=step) draw(t=>C(t,im), -R,R, "orig","mapped");

    const cSteps = Math.max(3, Math.floor(R/step));
    for(let r=step;r<=R+1e-9;r+=Math.max(step,R/cSteps))
      draw(th=>C(r*Math.cos(th), r*Math.sin(th)), 0, 2*Math.PI, "orig","mapped");

    draw(th=>C(circleR*Math.cos(th), circleR*Math.sin(th)), 0, 2*Math.PI, "circle","circle");

    this.wPlot.caption(`f(z)=((a)z+b)/((c)z+d)`);

    const zNode=(this as any).zPlot['svg'].node() as SVGSVGElement;
    const linkOn=(document.getElementById("linkHover") as HTMLInputElement|null)?.checked ?? true;
    if (linkOn){
      Evt.on(zNode,"mousemove",(ev:any)=>{
        const pt=d3.pointer(ev,zNode); const z=this.zPlot.pxpyToComplex(pt[0],pt[1]); const w=mobiusSafe(z,a,b,c,d);
        this.setCursor(z,w);
      },"linked");
      Evt.on(zNode,"mouseleave",()=>{ this.zCursor?.attr("display","none"); this.wCursor?.attr("display","none"); },"linked-off");
    } else {
      Evt.off(zNode,"mousemove","linked"); Evt.off(zNode,"mouseleave","linked-off");
    }
  }
}

class TransformViewer {
  private layer:TransformLayer;
  constructor(private zPlot:PlanePlot, private wPlot:PlanePlot){ this.layer=new TransformLayer(zPlot,wPlot); }
  render(R:number, step:number, samples:number, gamma:Gamma, T:Transform){
    this.zPlot.clear(); this.wPlot.clear();
    this.zPlot.setExtent(R); this.wPlot.setExtent(R);
    this.zPlot.drawGrid(step,R); this.wPlot.drawGrid(step,R);
    const STEPS=Math.max(240, Math.min(4096, samples));
    this.layer.draw(gamma, T, STEPS, "orig","mapped");
  }
}

class ChebyshevViewer {
  constructor(private zSvg:SVGSVGElement){}
  render(p:ChebParams){
    const W=900,H=320,m={top:18,right:18,bottom:28,left:36};
    const svg=d3.select(this.zSvg).attr("viewBox",`0 0 ${W} ${H}`); svg.selectAll("*").remove();
    const x=d3.scaleLinear().domain([-1,1]).range([m.left, W-m.right]);
    const y=d3.scaleLinear().domain([-1,1]).range([H-m.bottom, m.top]);
    svg.append("g").attr("transform",`translate(0,${y(0)})`).call(d3.axisBottom(x));
    svg.append("g").attr("transform",`translate(${x(0)},0)`).call(d3.axisLeft(y));
    const N=Math.max(128, Math.min(4096, p.samples)); const pts:[number,number][]= [];
    for(let i=0;i<=N;i++){ const xv=-1+2*i/N, yv=chebyshevT(p.n,xv); pts.push([x(xv), y(yv)]); }
    svg.append("path").attr("d", d3.line()(pts)).attr("fill","none").attr("stroke","#0a66c2").attr("stroke-width",1.5).attr("vector-effect","non-scaling-stroke");
    if (p.n>0){
      const zeros=chebZeros(p.n).map(v=>({x:v,y:0})), ext=chebExtrema(p.n);
      svg.append("g").selectAll("circle").data(zeros).join("circle").attr("cx",(d:any)=>x(d.x)).attr("cy",(d:any)=>y(d.y)).attr("r",3.2).attr("fill","#e66");
      svg.append("g").selectAll("rect").data(ext).join("rect").attr("x",(d:any)=>x(d.x)-3).attr("y",(d:any)=>y(d.y)-3).attr("width",6).attr("height",6).attr("fill","#3c8");
    }
    const wEl=document.getElementById("vizW"); if (wEl instanceof SVGSVGElement) d3.select(wEl).selectAll("*").remove();
  }
}

/* ----------------------------------------------------------------------------
   App state & helpers
---------------------------------------------------------------------------- */
const el = {
  mode: $sel("mode"),
  a_re: $in("a_re"), a_im: $in("a_im"), b_re: $in("b_re"), b_im: $in("b_im"),
  c_re: $in("c_re"), c_im: $in("c_im"), d_re: $in("d_re"), d_im: $in("d_im"),
  deg: $in("deg"), samples: document.getElementById("samples") as HTMLInputElement | null,
  extent: $in("extent"), step: $in("step"), circleR: $in("circleR"),
  btnReset: $btn("btnReset"), rerender: $btn("rerender"),
  svgZ: document.getElementById("vizZ") as unknown as SVGSVGElement,
  svgW: document.getElementById("vizW") as unknown as SVGSVGElement,

  // Transform controls (robust ids)
  primType: pickSelect("primType","primTypeHidden"),
  primX0: pickInput("primX0","x0"), primY0: pickInput("primY0","y0"),
  primCx: pickInput("primCx","cx"), primCy: pickInput("primCy","cy"),
  primR:  pickInput("primR","radius"),
  primPoly: pickTextarea("primPoly","polyline"),
  t_tx: $in("t_tx"), t_ty: $in("t_ty"), t_scale: $in("t_scale"), t_theta: $in("t_theta"),
  t_invert: document.getElementById("t_invert") as HTMLInputElement,
  t_applyMobius: document.getElementById("t_applyMobius") as HTMLInputElement,
  drawPrim: $btn("drawPrim"),
};
const getSamples = (fallback=800) => Math.min(4096, Math.max(60, Math.floor(Number(el.samples?.value)||fallback)));

function mobiusParams():MobiusParams{
  const p = {
    a:C(+el.a_re.value, +el.a_im.value),
    b:C(+el.b_re.value, +el.b_im.value),
    c:C(+el.c_re.value, +el.c_im.value),
    d:C(+el.d_re.value, +el.d_im.value),
    R: Math.max(1, +($in("extent").value) || 3),
    step: Math.max(0.1, +($in("step").value) || 1),
    circleR: Math.max(0.05, +($in("circleR").value) || 1.5),
    samples: Math.min(4096, Math.max(60, Math.floor(getSamples(800)||400))),
  };
  info("mobiusParams", p); return p;
}
function chebParams():ChebParams{
  const p = { n: Math.max(0, Math.floor(+($in("deg").value)||0)), samples: Math.min(4096, Math.max(64, Math.floor(+getSamples(800)||800))) };
  info("chebParams", p); return p;
}

/* ---------- Transform helpers ---------- */
let PRIM_KIND = "circle"; // default to circle (clear visual)
function parsePoly(text:string):C[] {
  const pts = text.split(/[\n;]+/g).map(s=>s.trim()).filter(Boolean).map(p=>{
    const m=p.match(/^\s*([+-]?\d*(?:\.\d+)?)\s*,\s*([+-]?\d*(?:\.\d+)?)\s*$/); if(!m) return null; return C(+m[1],+m[2]);
  }).filter((p:C|null):p is C => !!p);
  info("parsePoly",{count:pts.length,first:pts[0],last:pts[pts.length-1]}); return pts;
}
const ellipseGamma = (cx:number,cy:number,a:number,b:number,theta=0):Gamma => {
  const c=Math.cos(theta), s=Math.sin(theta);
  return t=>{ const th=2*Math.PI*t, ct=Math.cos(th), st=Math.sin(th);
    return C(cx + a*ct*c - b*st*s, cy + a*ct*s + b*st*c); };
};
const spiralGammaPerTurn = (a:number,g:number,turns=3):Gamma => {
  const k=Math.log(1+g)/(2*Math.PI);
  return t=>{ const th=2*Math.PI*turns*t, r=a*Math.exp(k*th); return C(r*Math.cos(th), r*Math.sin(th)); };
};
function makeGammaFromUI(R:number):Gamma{
  const kind = (el.primType?.value || PRIM_KIND || "circle").trim();
  const x0=numOf(el.primX0,0), y0=numOf(el.primY0,0), cx=numOf(el.primCx,0), cy=numOf(el.primCy,0);
  const rIn=numOf(el.primR,1), rr=(Number.isFinite(rIn)&&rIn>0)? rIn : 1;
  log("makeGamma",{kind,x0,y0,cx,cy,rr,R});

  switch(kind){
    case "vline":   return lineVertical(x0, -R, R);
    case "hline":   return lineHorizontal(y0, -R, R);
    case "poly": {
      const pts=parsePoly(el.primPoly?.value??""); return pts.length? polylineGamma(pts) : polylineGamma([C(-1,0), C(1,0)]);
    }
    case "ellipse": {
      const a=rr, b=Math.max(0.01, rr*0.65), th=+($in("t_theta").value)||0; return ellipseGamma(cx,cy,a,b,th);
    }
    case "spiral": {
      const a=Math.max(0.01, rr || 0.2); const gRaw=parseFloat(el.t_scale?.value??"0.05"); const g=Math.max(-0.9, Math.min(0.9, Number.isFinite(gRaw)?gRaw:0.05));
      return spiralGammaPerTurn(a,g,4);
    }
    case "circle": default:
      if (!(Number.isFinite(cx)&&Number.isFinite(cy)&&Number.isFinite(rr))) { warn("circle inputs invalid, using (0,0,1)",{cx,cy,rr}); return circleGamma(C(0,0),1); }
      return circleGamma(C(cx,cy), rr);
  }
}

/* Make left “Primitives” list work too (requires data-prim="circle" etc.) */
// Click spy: logs every click at capture phase (can't be swallowed)
document.addEventListener(
  "click",
  (ev) => {
    const t = ev.target as HTMLElement;
    const prim   = t.closest("[data-prim]")?.getAttribute("data-prim") || null;
    const preset = t.closest("[data-preset]")?.getAttribute("data-preset") || null;

    console.log("[viz] CLICK", {
      id: t.id || null,
      tag: t.tagName.toLowerCase(),
      cls: (t.className || "").toString(),
      text: (t.textContent || "").trim().slice(0, 60),
      prim,
      preset,
    });
  },
  true // capture phase
);

function readNum(id: string, dflt = 0): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return dflt;
  // tolerate blanks and comma decimal
  const s = (el.value ?? "").trim().replace(",", ".");
  const v = Number.parseFloat(s);
  return Number.isFinite(v) ? v : dflt;
}

function readGreenParams() {
  // ⚠️ use your actual element IDs here
  const xi = C(readNum("g_xi1", 0), readNum("g_xi2", 0));
  const L  = Math.max(0.2, readNum("g_L", 1.5));
  const N  = Math.max(11, Math.floor(readNum("g_n", 151)));
  return { kind: "rect_dirichlet", xi, L, N };
}

function makeTransformFromUI():Transform{
  const tx=+el.t_tx.value||0, ty=+el.t_ty.value||0, s=(+el.t_scale.value||1), th=(+el.t_theta.value||0);
  const parts:Transform[]=[T_translate(tx,ty), T_scale(s), T_rotate(th)];
  const inv=!!el.t_invert?.checked, app=!!el.t_applyMobius?.checked;
  if (inv) parts.push(T_invert);
  if (app){ const {a,b,c,d}=mobiusParams(); parts.push(T_mobius(a,b,c,d)); }
  info("transform-chain",{tx,ty,s,th,inv,app,len:parts.length});
  return (z:C)=>{ let cur=z; for(let i=0;i<parts.length;i++){ const before=cur; cur=parts[i](cur); if(!isFiniteC(cur)){ warn("transform NaN/Inf",{step:i,before,after:cur}); break; } } return cur; };
}

/* ----------------------------------------------------------------------------
   Tabs + state
---------------------------------------------------------------------------- */
type Mode = "mobius"|"chebyshev"|"transform"|"wiki"|"green";
let activeMode:Mode;
let tabEls:Partial<Record<Mode,HTMLButtonElement>> = {};
let panelEls:Partial<Record<Mode,HTMLElement>> = {};



// ---- module scope -----------------------------------------------------------
let GREEN_EPOCH = 0;

// ---- class -----------------------------------------------------------------
// ─── global epoch guard ────────────────────────────────────────────────


class GreenViewer {
  private svg: any;
  private lastEpoch = 0;

  constructor(private zPlot: PlanePlot) {
    this.svg = this.zPlot.svg;
  }

  /** Redraw the grid for given plane extent R and step size. */
  render(R: number, step: number) {
    this.lastEpoch = ++GREEN_EPOCH; // new epoch
    this.zPlot.clearHard();
    this.zPlot.setExtent(R);
    this.zPlot.drawGrid(step, R);
  }

  /** Draw the G-circles for Laplace-free Green function. */
  drawLaplaceFree(xi: C, L: number, rings = 12, steps = 720) {
    const myEpoch = this.lastEpoch;
    if (myEpoch !== GREEN_EPOCH) return; // prevent stale draw

    const g = this.zPlot.gContent;

    const margin = Math.max(1e-3, 0.02 * L);
    const xin = C(
      Math.min(L - margin, Math.max(-L + margin, xi.re)),
      Math.min(L - margin, Math.max(-L + margin, xi.im))
    );

    // mark ξ position
    g.append("circle")
      .attr("cx", this.zPlot.x(xin.re))
      .attr("cy", this.zPlot.y(xin.im))
      .attr("r", 4)
      .attr("fill", "#d33");

    // compute concentric radii
    const roomX = L - Math.abs(xin.re);
    const roomY = L - Math.abs(xin.im);
    const rMax = Math.max(0, Math.min(roomX, roomY) - margin);
    const rMin = Math.max(margin * 0.5, rMax / 300);
    const radii = Array.from({ length: rings }, (_, k) =>
      rMin * Math.pow(rMax / rMin, (k + 1) / rings)
    );

    // draw rings
    for (const r of radii) {
      const pts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const th = (2 * Math.PI * i) / steps;
        pts.push([
          this.zPlot.x(xin.re + r * Math.cos(th)),
          this.zPlot.y(xin.im + r * Math.sin(th)),
        ]);
      }
      this.zPlot.path(pts, "circle");
    }

    // update caption (after rings)
    this.svg.selectAll("text.badge").remove();
    this.zPlot.caption(
      `G-circles ξ=(${xin.re.toFixed(2)}, ${xin.im.toFixed(2)})`
    );

    console.log("[viz+] green/draw", { xi: xin, L, rings });
  }
}


/* ----------------------------------------------------------------------------
   GREEN viewer
---------------------------------------------------------------------------- */
class GreenViewer3 {
  constructor(private zPlot: PlanePlot) {}

  render(R: number, step: number) {
    this.zPlot.clearHard();
    this.zPlot.setExtent(R);
    this.zPlot.drawGrid(step, R);
    console.log("[viz] green/render", { R, step });
  }

  /** Concentric circles fully inside [-L,L]^2 around ξ */
  drawLaplaceFree(xi: C, L: number, rings = 12, steps = 720) {
    const g = (this as any).zPlot['gContent'];

    const margin = Math.max(1e-3, 0.02 * L);
    const xin = C(
      Math.min(L - margin, Math.max(-L + margin, xi.re)),
      Math.min(L - margin, Math.max(-L + margin, xi.im))
    );
    if (xin.re !== xi.re || xin.im !== xi.im) {
      console.warn("[viz] green/clamp ξ", { from: xi, to: xin, L, margin });
    }

    // mark ξ
    g.append("circle")
      .attr("cx", this.zPlot.x(xin.re))
      .attr("cy", this.zPlot.y(xin.im))
      .attr("r", 4)
      .attr("fill", "#d33");

    // radii
    const roomX = L - Math.abs(xin.re);
    const roomY = L - Math.abs(xin.im);
    const rMax = Math.max(0, Math.min(roomX, roomY) - margin);
    const rMin = Math.max(margin * 0.5, rMax / 300);

    if (!(rMax > rMin)) {
      console.warn("[viz] green/no-space", { L, xin, rMin, rMax });
      this.zPlot.caption("Green: ξ too close to boundary");
      return;
    }

    const radii = Array.from({ length: rings }, (_, k) =>
      rMin * Math.pow(rMax / rMin, (k + 1) / rings)
    );
    console.log("[viz] green/radii", { rings, rMin, rMax, radii: radii.map(r=>+r.toFixed(4)) });

    for (const r of radii) {
      const pts: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const th = (2 * Math.PI * i) / steps;
        const x = xin.re + r * Math.cos(th);
        const y = xin.im + r * Math.sin(th);
        pts.push([this.zPlot.x(x), this.zPlot.y(y)]);
      }
      this.zPlot.path(pts, "circle"); // logs point counts & drops
    }

    this.zPlot.caption(`G-circles ξ=(${xin.re.toFixed(2)}, ${xin.im.toFixed(2)})`);
  }
}

let greenViewer!:GreenViewer;

/* ---------- instances ---------- */
let zPlot!:PlanePlot; let wPlot!:PlanePlot;
let mobiusViewer!:MobiusViewer; let chebViewer!:ChebyshevViewer; let transformViewer!:TransformViewer;

/* ---------- rendering & mode switching ---------- */
function setPlotVisibility(mode:Mode){
  const wTitle = el.svgW.previousElementSibling as HTMLElement | null;
  const showW = (mode==="mobius" || mode==="transform");
  if (wTitle) wTitle.style.display = showW ? "" : "none";
  (el.svgW as any).style.display = showW ? "" : "none";
}
function clearSVGHard(svg:SVGSVGElement){
  const sel=d3.select(svg); sel.on('.zoom',null).on('.linked',null).interrupt(); sel.selectAll('*').remove();
}

function render(mode?:Mode){
  const m = mode ?? activeMode ?? "mobius";
  log("render", m);
  if (!zPlot || !wPlot) return;

  if (m==="chebyshev"){ clearSVGHard(el.svgZ); clearSVGHard(el.svgW); chebViewer.render(chebParams()); return; }
  if (m==="green"){
    clearSVGHard(el.svgZ);
    const R=Math.max(1, +($in("extent").value)||3);
    const step=Math.max(0.25, +($in("step").value)||1);
    greenViewer.render(R,step); return;
  }
  if (m==="wiki"){ clearSVGHard(el.svgZ); clearSVGHard(el.svgW); return; }

  zPlot.clearHard(); wPlot.clearHard();

  if (m==="transform"){
    const mp=mobiusParams();
    const gamma=makeGammaFromUI(mp.R);
    const T=makeTransformFromUI();
    // probes
    const probes=[0,0.25,0.5,0.75,1].map(t=>{ const z=gamma(t), w=T(z); const den=add(mul(mp.c,z), mp.d); return {t,z,w, poleDist:Math.sqrt(abs2(den))}; });
    info("transform-probes", probes);
    transformViewer.render(mp.R, mp.step, +getSamples(800)||800, gamma, T);
    return;
  }

  mobiusViewer.render(mobiusParams());
}

function currentMode():Mode{
  const h=(location.hash||"").toLowerCase();
  if (h.includes("cheb")) return "chebyshev";
  if (h.includes("trans")) return "transform";
  if (h.includes("wiki")) return "wiki";
  if (h.includes("green")) return "green";
  const v=(el.mode?.value as Mode)||"mobius";
  return (v==="chebyshev"||v==="transform"||v==="wiki"||v==="green")? v : "mobius";
}
function setActiveTab(m:Mode){
  (["mobius","chebyshev","transform","wiki","green"] as Mode[]).forEach(k=>{
    tabEls[k]?.classList.toggle("active", k===m);
    if (panelEls[k]) panelEls[k]!.hidden = (k!==m);
  });
}
function gotoMode(next:Mode){
  if (next===activeMode) return;
  log("gotoMode",{from:activeMode,to:next});
  activeMode=next; if (el.mode) el.mode.value=next; location.hash=`#${next}`;
  setActiveTab(next); setPlotVisibility(next);
  try{
    d3.select(el.svgZ).transition().duration(120).call((zPlot as any).zoom?.transform, d3.zoomIdentity);
    d3.select(el.svgW).transition().duration(120).call((wPlot as any).zoom?.transform, d3.zoomIdentity);
  }catch{}
  render(activeMode);
}

/* ---------- presets ---------- */
function applyPreset(name:string){
  const set=(id:string,v:number)=>{ $in(id).value=String(v); };
  log("preset", name);
  if (name==="identity"){ set("a_re",1);set("a_im",0);set("b_re",0);set("b_im",0);set("c_re",0);set("c_im",0);set("d_re",1);set("d_im",0); }
  else if (name==="flip"){ set("a_re",-1);set("a_im",0);set("b_re",0);set("b_im",0);set("c_re",0);set("c_im",0);set("d_re",1);set("d_im",0); }
  else if (name==="inversion"){ set("a_re",0);set("a_im",0);set("b_re",1);set("b_im",0);set("c_re",1);set("c_im",0);set("d_re",0);set("d_im",0); }
  else if (name==="rotate90"){ set("a_re",0);set("a_im",1);set("b_re",0);set("b_im",0);set("c_re",0);set("c_im",0);set("d_re",1);set("d_im",0); }
  else if (name==="translate" || name==="shift_1_i"){ set("a_re",1);set("a_im",0);set("b_re",1);set("b_im",1);set("c_re",0);set("c_im",0);set("d_re",1);set("d_im",0); }
  else if (name==="cayley"){ set("a_re",1);set("a_im",0);set("b_re",0);set("b_im",1);set("c_re",1);set("c_im",0);set("d_re",0);set("d_im",1); }
  else if (name==="halfplane_to_disk"){ set("a_re",0);set("a_im",-1);set("b_re",1);set("b_im",0);set("c_re",1);set("c_im",0);set("d_re",0);set("d_im",1); }
  else if (name==="rotate30"){ set("a_re",Math.cos(Math.PI/6)); set("a_im",Math.sin(Math.PI/6)); set("b_re",0);set("b_im",0);set("c_re",0);set("c_im",0);set("d_re",1);set("d_im",0); }
  else if (name==="scale2"){ set("a_re",2);set("a_im",0);set("b_re",0);set("b_im",0);set("c_re",0);set("c_im",0);set("d_re",1);set("d_im",0); }
  render(activeMode);
}
/* ---------- GREEN PANEL WIRING ---------- */

type GreenParams = {
  kind: "laplace_free";     // can extend later
  xi: C;                    // ξ = (xi1, xi2)
  L: number;                // extent
  N: number;                // grid resolution (for future kinds)
};

const greenEl = {
  kind: document.getElementById("g_kind") as HTMLSelectElement | null, // optional
  xi1:  document.getElementById("xi1") as HTMLInputElement | null,
  xi2:  document.getElementById("xi2") as HTMLInputElement | null,
  L:    document.getElementById("greenL") as HTMLInputElement | null,
  N:    document.getElementById("gridN") as HTMLInputElement | null,
  run:  document.getElementById("g_run") as HTMLButtonElement | null,   // “Compute”
  // view-side controls (already present)
  extent: $in("extent"),
  step:   $in("step"),
  circleR:$in("circleR"),
  rer:    $btn("rerender"),
};
/*
function readGreenParams(): GreenParams {
  const kind = (greenEl.kind?.value || "laplace_free") as GreenParams["kind"];
  const xi = C(
    parseFloat(greenEl.xi1?.value ?? "0") || 0,
    parseFloat(greenEl.xi2?.value ?? "0") || 0
  );
  const L = Math.max(0.25, parseFloat(greenEl.L?.value ?? "1.5") || 1.5);
  const Nraw = parseInt(greenEl.N?.value ?? "151", 10);
  const N = Number.isFinite(Nraw) && Nraw >= 17 ? Nraw | 1 : 151; // odd & ≥ 17
  console.log("[viz] green/read", { kind, xi, L, N });
  return { kind: "laplace_free", xi, L, N };
}
*/


function recompute(src: "button"|"input"|"enter" = "button") {
  const p = readGreenParams();
  const step = Math.max(0.25, readNum("step", 1));
  console.log("[viz] green/compute", { from: src, p, step });

  greenViewer.render(p.L, step);
  greenViewer.drawLaplaceFree(p.xi, p.L, 12, 720);
}

function wireGreenPanel() {
  const stepFromView = () =>
    Math.max(0.25, +( $in("step")?.value ?? "" ) || 1);

  const recompute = (from: string) => {
    const p = readGreenParams(); // <- your robust reader
    if (activeMode !== "green") gotoMode("green");
    const step = stepFromView();
    console.log("[viz] green/compute", { from, p, step });
    greenViewer.render(p.L, step);
    greenViewer.drawLaplaceFree(p.xi, p.L, 12, 720);
  };

  const rerenderView = (from: string) => {
    const R = Math.max(1, +( $in("extent")?.value ?? "" ) || 3);
    const step = stepFromView();
    console.log("[viz] green/view-rerender", { from, R, step });
    greenViewer.render(R, step);
  };

  // Buttons
  if (greenEl.run)
    Evt.on(greenEl.run, "click", () => recompute("button"), "green");
  if (greenEl.rer)
    Evt.on(greenEl.rer, "click", () => rerenderView("button"), "green");

  // Panel root (prefer explicit container if present)
  const panel =
    (document.getElementById("greenPanel") as HTMLElement | null) ??
    document.querySelector<HTMLElement>('[data-ctrl="green"]') ??
    document.body;

  // Debounced scheduler
  let deb: number | undefined;
  const schedule = (fn: () => void) => {
    if (deb) clearTimeout(deb);
    deb = window.setTimeout(fn, 160);
  };

  // Reactive inputs inside Green panel
  const onValueChange = (ev: Event) => {
    // Ensure event originates from within panel
    if (!panel.contains(ev.target as Node)) return;

    ev.stopPropagation();
    (ev as any).stopImmediatePropagation?.();

    const target = ev.target as (HTMLInputElement | HTMLSelectElement | null);
    const id = (target?.id ?? "").toLowerCase();
    const tag = (target?.tagName ?? "").toLowerCase();
    const val = (target as HTMLInputElement | HTMLSelectElement)?.value;

    console.log("[viz] green/input-like", { type: ev.type, id, tag, val });

    // Recompute for ξ, L, N, kind
    if (id === "g_xi1" || id === "g_xi2" || id === "g_l" || id === "g_n" || id === "g_kind") {
      schedule(() => recompute(ev.type));
      return;
    }

    // Light view re-render for extent/step/circle controls
    if (id.includes("extent") || id.includes("step") || id.includes("circle")) {
      schedule(() => rerenderView(ev.type));
    }
  };

  ["input", "change", "blur"].forEach((t) =>
    Evt.on(panel, t as any, onValueChange, "green-reactive")
  );

  // Enter-to-recompute (type-safe with narrowing)
Evt.on(
  panel,
  "keydown",
  (ev: Event) => {
    const e = ev as KeyboardEvent;     // narrow
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
      recompute("enter");
    }
  },
  "green-enter"
);


  console.log("[viz] green/wired (reactive)");
}



function wireGreenPanel3() {
  const stepFromView = () => Math.max(0.25, +($in("step").value) || 1);

  const recompute = (src: string) => {
    const p = readGreenParams();
    if (activeMode !== "green") gotoMode("green");
    const step = stepFromView();
    console.log("[viz] green/compute", { from: src, p, step });
    greenViewer.render(p.L, step);
    greenViewer.drawLaplaceFree(p.xi, p.L, 12, 720);
  };

  const rerenderView = (src: string) => {
    const R = Math.max(1, +($in("extent").value) || 3);
    const step = stepFromView();
    console.log("[viz] green/view-rerender", { from: src, R, step });
    greenViewer.render(R, step);
  };

  // debounce wrapper
  let t: number | undefined;
  const debounced = (fn: () => void, ms = 180) => {
    if (t) clearTimeout(t);
    t = window.setTimeout(fn, ms);
  };

  // Buttons
  if (greenEl.run)  Evt.on(greenEl.run, "click", () => recompute("button"), "green");
  if (greenEl.rer)  Evt.on(greenEl.rer, "click", () => rerenderView("button"), "green");

  // Panel root (be permissive)
  const panel =
    document.getElementById("greenPanel") ||
    document.querySelector<HTMLElement>('[data-ctrl="green"]') ||
    document.body;

  // Any value change inside the Green panel triggers recompute/rerender
  const onValueChange = (ev: Event) => {
    const el = ev.target as HTMLElement | null;
    if (!el) return;
    const id = (el.id || "").toLowerCase();
    const val = (el as HTMLInputElement).value;
    console.log("[viz] green/input-like", { type: ev.type, id, val });

    if (id.startsWith("g_") || id === "xi1" || id === "xi2" || id === "l" || id === "n") {
      debounced(() => recompute(ev.type));
    } else if (id.includes("extent") || id.includes("step") || id.includes("circle")) {
      debounced(() => rerenderView(ev.type));
    }
  };

  // Listen to all common “value changed” event types
  Evt.on(panel, "input",  onValueChange, "green-input");
  Evt.on(panel, "change", onValueChange, "green-change");
  Evt.on(panel, "blur",   onValueChange, "green-blur"); // for number inputs losing focus

  // Enter anywhere in the panel recomputes
  Evt.on(panel, "keydown", (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.key === "Enter") {
      console.log("[viz] green/enter");
      recompute("enter");
    }
  }, "green-enter");

  console.log("[viz] green/wired (reactive)", {
    run: !!greenEl.run, rer: !!greenEl.rer,
    panel: panel.id || panel.getAttribute?.("data-ctrl") || "(document)"
  });
}





function wireGreenPanel2() {
  // bind compute
  if (greenEl.run) {
    Evt.on(
      greenEl.run,
      "click",
      () => {
        const p = readGreenParams();
        if (activeMode !== "green") gotoMode("green");
        const step = Math.max(0.25, +($in("step").value) || 1);
        console.log("[viz] green/compute", { p, step });

        greenViewer.render(p.L, step);
        greenViewer.drawLaplaceFree(p.xi, p.L, 12, 720);
      },
      "green"
    );
  }

  // ENTER to compute from any input in Green panel
  [greenEl.kind, greenEl.xi1, greenEl.xi2, greenEl.L, greenEl.N].forEach((node) => {
    if (!node) return;
    Evt.on(
      node,
      "keydown",
      (ev: Event) => {
        const e = ev as KeyboardEvent;           // narrow safely
        if (typeof e.key === "string" && e.key === "Enter") {
          console.log("[viz] green/enter");
          greenEl.run?.click();
        }
      },
      "green"
    );
  });

  // view-side controls: re-render grid quickly
  if (greenEl.rer) {
    Evt.on(
      greenEl.rer,
      "click",
      () => {
        const R = Math.max(1, +($in("extent").value) || 3);
        const step = Math.max(0.25, +($in("step").value) || 1);
        console.log("[viz] green/view-rerender", { R, step });
        greenViewer.render(R, step);
      },
      "green"
    );
  }

  console.log("[viz] green/wired", {
    run: !!greenEl.run,
    inputs: ["kind", "xi1", "xi2", "L", "N"].filter((k) => (greenEl as any)[k]),
  });
}


/* ---------- init ---------- */
function init(){
  tabEls = {
    mobius: document.getElementById("tab-mobius") as HTMLButtonElement|undefined,
    chebyshev: document.getElementById("tab-chebyshev") as HTMLButtonElement|undefined,
    transform: document.getElementById("tab-transform") as HTMLButtonElement|undefined,
    wiki: document.getElementById("tab-wiki") as HTMLButtonElement|undefined,
    green: document.getElementById("tab-green") as HTMLButtonElement|undefined,
  };
  panelEls = {
    mobius: document.querySelector<HTMLElement>('[data-ctrl="mobius"]')||undefined,
    chebyshev: document.querySelector<HTMLElement>('[data-ctrl="chebyshev"]')||undefined,
    transform: document.querySelector<HTMLElement>('[data-ctrl="transform"]')||undefined,
    wiki: document.querySelector<HTMLElement>('[data-ctrl="wiki"]')||undefined,
    green: document.querySelector<HTMLElement>('[data-ctrl="green"]')||undefined,
  };

 wirePrimitivesPanel(); 

  if (tabEls.mobius)    Evt.on(tabEls.mobius, "click", ()=>gotoMode("mobius"), "tab");
  if (tabEls.chebyshev) Evt.on(tabEls.chebyshev, "click", ()=>gotoMode("chebyshev"), "tab");
  if (tabEls.transform) Evt.on(tabEls.transform, "click", ()=>gotoMode("transform"), "tab");
  if (tabEls.wiki)      Evt.on(tabEls.wiki, "click", ()=>gotoMode("wiki"), "tab");
  if (tabEls.green)     Evt.on(tabEls.green, "click", ()=>gotoMode("green"), "tab");

  zPlot = new PlanePlot(el.svgZ); wPlot = new PlanePlot(el.svgW);
  zPlot.enableZoom(wPlot); wPlot.enableZoom(zPlot);

  mobiusViewer    = new MobiusViewer(zPlot,wPlot);
  chebViewer      = new ChebyshevViewer(el.svgZ);
  transformViewer = new TransformViewer(zPlot,wPlot);
  greenViewer     = new GreenViewer(zPlot);


  


// ...existing control wiring...
wireGreenPanel();

  Evt.on(el.btnReset,"click",()=>applyPreset("identity"),"btn");
  Evt.on(el.rerender,"click",()=>{ log("rerender-click"); render(activeMode); },"btn");
  Evt.on(el.mode,"change",()=>gotoMode((el.mode.value as Mode)||"mobius"),"mode");
  Evt.on(el.drawPrim,"click",()=>{ log("drawPrim-click"); if(activeMode!=="transform") gotoMode("transform"); else render("transform"); },"btn");

  // Live updates (debounced)
  type Field = HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
  const raw: (HTMLElement|null)[] = [
    el.a_re, el.a_im, el.b_re, el.b_im, el.c_re, el.c_im, el.d_re, el.d_im,
    el.deg, el.samples, el.extent, el.step, el.circleR,
    el.primType, el.primX0, el.primY0, el.primCx, el.primCy, el.primR, el.primPoly,
    el.t_tx, el.t_ty, el.t_scale, el.t_theta, el.t_invert, el.t_applyMobius,
  ];
  const inputs:Field[] = raw.filter((n): n is Field => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement);
  let debounce:number|undefined; inputs.forEach(n=>{
    Evt.on(n,"input",()=>{ if(debounce) clearTimeout(debounce); debounce=window.setTimeout(()=>render(activeMode),100); },"change");
  });
  log("bind-inputs",{count:inputs.length});

  // Presets delegate
  Evt.on(document,"click",(ev:any)=>{
    const eln=(ev.target as HTMLElement)?.closest("[data-preset]") as HTMLElement|null;
    if (!eln) return; const name=eln.getAttribute("data-preset")||""; if (!name) return; applyPreset(name);
  },"presets");

  // Green compute (both ids supported)
  const btnA=document.getElementById("btnGreenCompute") as HTMLButtonElement|null;
  const btnB=document.getElementById("greenCompute") as HTMLButtonElement|null;
  const onGreen=()=>{
    if (activeMode!=="green") gotoMode("green");
    const xi=C(parseFloat(($in("xi1")?.value??"0"))||0, parseFloat(($in("xi2")?.value??"0"))||0);
    const L=parseFloat(($in("greenL")?.value??"1.5"))||1.5;
    const step=Math.max(0.25, +($in("step").value)||1);
    log("green-click",{xi,L,step});
    greenViewer.render(L,step); greenViewer.drawLaplaceFree(xi,L);
  };
  if (btnA) Evt.on(btnA,"click",onGreen,"green");
  if (btnB) Evt.on(btnB,"click",onGreen,"green");

  // initial mode
  activeMode = currentMode(); if (el.mode) el.mode.value=activeMode;
  setActiveTab(activeMode); setPlotVisibility(activeMode);

  applyPreset("identity"); render(activeMode);

  Evt.on(window,"hashchange",()=>{
    const h=location.hash.toLowerCase();
    if (h.includes("cheb")) gotoMode("chebyshev");
    else if (h.includes("trans")) gotoMode("transform");
    else if (h.includes("wiki")) gotoMode("wiki");
    else if (h.includes("green")) gotoMode("green");
    else gotoMode("mobius");
  },"hash");
}

document.addEventListener("DOMContentLoaded", ()=>{
  if (!('d3' in (window as any)) || !d3?.scaleLinear) { console.error("D3 not loaded."); return; }
  init();
});



