import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import data from "./datapath.json";
import { ClockPanel, Chronogram } from "./Ticker.jsx";
import { COLORS, LEGEND } from "./theme.js";
import "./App.css";

const NS = "http://www.w3.org/2000/svg";

const CYCLE = 6;
const frame = data.frames[CYCLE];
const MAXT = data.ticks.length * 2;   // two half-cycles per recorded cycle

// A stage is a list of hops. Each hop rides one wire (or a fractional sub-range of it,
// for shared bus segments). `after` names the wire of an earlier hop in the same stage:
// this hop starts the moment that hop's head passes this hop's start point (a branch),
// or hands the dot off if the junction is at the parent's end (a continuation).
const STAGES = [
  { label: "fetch the instruction (PC drives IMEM and the +4 adder)",
    hops: [{ w: 1, to: 33 / 416 }, { w: 3, after: 1 }, { w: 2, after: 1 }] },   // w1's first 33px is the shared PC stem
  { label: "decode (the instruction fields fan out to the register file, immediate generator, and control)",
    hops: [{ w: 13 }, { w: 14, after: 13 }, { w: 15, after: 14 }, { w: 17, after: 14 }] },
  { label: "read register rs1 and build the immediate",
    hops: [{ w: 18 }, { w: 23 }] },
  { label: "feed both operands into the ALU",
    hops: [{ w: 24 }, { w: 25 }] },
  { label: "the ALU result rides the result bus to the writeback mux",
    hops: [{ w: 11 }, { w: 8, from: 584 / 699, to: 1, after: 11 }, { w: 10, after: 8 }] },
  { label: "write the result back into the register file",
    hops: [{ w: 27 }] },
  { label: "PC+4 becomes the next PC (PCSel selects PC+4)",
    hops: [{ w: 4 }, { w: 5, from: 117 / 683, to: 0, after: 4 }, { w: 6, after: 5 }, { w: 0, after: 6, label: false }] },   // w0's value would poke into the PC box; w6 already carried it
];

const SPEED = 240;               // px/s along the wire; ease is linear so time maps to distance
const MAX_RIDE = 2.8;
const APPEAR = 0.15, DWELL = 0.3;

const sigVal = {};
for (const [idx, v] of Object.entries(frame.vals)) sigVal[data.wires[idx]?.sig] = v;

const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const urlTick = urlParams.get("tick");

export default function App() {
  const hostRef = useRef(null);
  const [replay, setReplay] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  // clock-stepping state (Logisim semantics: tick counter of half-cycles, odd = clk high)
  const [clockActive, setClockActive] = useState(urlTick !== null);
  const [tick, setTick] = useState(urlTick !== null ? Math.max(0, Math.min(parseInt(urlTick) || 0, MAXT)) : 0);
  const [auto, setAuto] = useState(false);
  const [freq, setFreq] = useState(1);   // Hz of half-cycles, Logisim default
  const clockRef = useRef(clockActive);
  clockRef.current = clockActive;

  // entrance stagger (ui-ux-pro-max Standard-motion preset), skipped for reduced-motion users
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(".app header, .app .stage, .app .chronoblock, .app .legend", {
      opacity: 0, y: 16, scale: 0.995, duration: 0.4,
      stagger: { each: 0.06, from: "start" }, ease: "back.out(1.4)", clearProps: "all",
    });
  }, {});

  const clearAnim = (svg) => {
    svg.querySelectorAll(".wire.on").forEach((w) => w.classList.remove("on"));
    svg.querySelectorAll(".token, .trace, .sval").forEach((t) => t.remove());
  };

  // Collision-aware label placement: try small offsets until the label clears every
  // other text bbox (user-space coords; token texts are offset by their <g> translate).
  const NUDGES = [[0, 0], [0, -9], [0, 9], [11, 0], [-11, 0], [11, -9], [-11, -9], [11, 9], [-11, 9], [0, -18], [18, 0]];
  const isShown = (el) => {   // inline-opacity check: hidden tokens must not block label placement
    for (let n = el; n && n.tagName !== "svg"; n = n.parentNode) {
      const o = n.style?.opacity;
      if (o !== "" && o !== undefined && +o < 0.05) return false;
    }
    return true;
  };
  const textBoxes = (svg, skip) =>
    [...svg.querySelectorAll("text")].filter((x) => x !== skip && x.textContent.trim() && isShown(x)).map((x) => {
      const bb = x.getBBox();
      const gm = (x.parentNode.getAttribute?.("transform") || "").match(/translate\(([-\d.]+),([-\d.]+)\)/);
      return gm ? { x: bb.x + +gm[1], y: bb.y + +gm[2], width: bb.width, height: bb.height } : bb;
    });
  const collide = (a, b) =>
    a.x < b.x + b.width + 1 && b.x < a.x + a.width + 1 && a.y < b.y + b.height + 1 && b.y < a.y + a.height + 1;
  const nudgeClear = (svg, t, tx = 0, ty = 0, extra = []) => {
    const boxes = [...textBoxes(svg, t), ...extra];
    const bx = +t.getAttribute("x"), by = +t.getAttribute("y");
    for (const [dx, dy] of NUDGES) {
      t.setAttribute("x", bx + dx); t.setAttribute("y", by + dy);
      const bb = t.getBBox();
      const abs = { x: bb.x + tx, y: bb.y + ty, width: bb.width, height: bb.height };
      if (!boxes.some((o) => collide(abs, o))) return t.getBBox();
    }
    t.setAttribute("x", bx); t.setAttribute("y", by);   // no clear spot: keep the original
    return t.getBBox();
  };
  const nudgeTokenLabel = (svg, g) => {
    const t = g.querySelector("text");
    const m = (g.getAttribute("transform") || "").match(/translate\(([-\d.]+),([-\d.]+)\)/);
    if (t && m) nudgeClear(svg, t, +m[1], +m[2]);
  };

  // ---- guided story of cycle 6 (GSAP) ----
  useGSAP(() => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;
    if (clockRef.current) return;                 // clock mode owns the diagram
    clearAnim(svg);
    setStageLabel("");

    const tl = gsap.timeline();
    const settled = [];          // tokens from finished stages; dimmed when the next stage starts
    const sched = [];
    let at = 0;

    STAGES.forEach((stage, si) => {
      tl.call(() => setStageLabel(`${si + 1}. ${stage.label}`), [], at);
      if (settled.length) tl.to(settled.slice(), { opacity: 0.45, duration: 0.25, ease: "none" }, at);

      const built = {};          // wire idx -> hop record, for `after` lookups
      let stageEnd = at;

      stage.hops.forEach((hop) => {
        const wire = svg.querySelector("#w" + hop.w);
        if (!wire) return;
        const meta = data.wires[hop.w] || {};
        const color = COLORS[meta.color] || "#57606a";
        const L = wire.getTotalLength();
        const a = (hop.from ?? 0) * L, b = (hop.to ?? 1) * L;
        const sub = Math.abs(b - a);
        const parent = hop.after != null ? built[hop.after] : null;
        const dur = Math.min(MAX_RIDE, Math.max(sub / SPEED, parent ? 0.15 : 0.35));
        const startPt = wire.getPointAtLength(a);

        let rideStart = at + APPEAR;
        let continuation = false;
        if (parent) {
          // project this hop's start onto the parent's sub-range: the head passes it at that fraction
          let best = 0, bd = Infinity;
          for (let i = 0; i <= 100; i++) {
            const s = i / 100;
            const pt = parent.wire.getPointAtLength(parent.a + (parent.b - parent.a) * s);
            const d = Math.hypot(pt.x - startPt.x, pt.y - startPt.y);
            if (d < bd) { bd = d; best = s; }
          }
          rideStart = parent.rideStart + best * parent.dur;
          continuation = best > 0.98;
        }

        // colored trail: dash pattern paints exactly the travelled sub-range of the path
        const trace = wire.cloneNode(false);
        trace.removeAttribute("id");
        trace.setAttribute("class", "trace");
        trace.style.stroke = color;
        trace.style.strokeDasharray = `0 ${L} 0 0`;
        wire.parentNode.insertBefore(trace, wire.nextSibling);

        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", "token");
        g.setAttribute("data-wire", hop.w);
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("r", "5");
        dot.setAttribute("fill", color);
        g.appendChild(dot);
        let val = hop.label === false || meta.sig === "inst" ? null : sigVal[meta.sig];
        if (val && parent && !continuation && parent.val === val) val = null;   // a branch repeating its parent's value would only collide with port labels
        if (val) {
          const t = document.createElementNS(NS, "text");
          t.setAttribute("x", "9");
          t.setAttribute("y", "3.5");
          t.setAttribute("fill", color);
          t.setAttribute("class", "tokval");
          t.textContent = val;
          g.appendChild(t);
        }
        svg.appendChild(g);

        const place = (p) => {
          const pos = a + (b - a) * p;
          const pt = wire.getPointAtLength(pos);
          g.setAttribute("transform", `translate(${pt.x.toFixed(2)},${pt.y.toFixed(2)})`);
          const lo = Math.min(a, pos), hi = Math.max(a, pos);
          trace.style.strokeDasharray = `0 ${lo.toFixed(1)} ${(hi - lo).toFixed(1)} ${L}`;
        };
        place(0);
        g.style.opacity = "0";

        if (parent) {
          tl.set(g, { opacity: 1 }, rideStart);                       // spawn as the parent head passes
          if (continuation) {
            tl.set(parent.g, { opacity: 0 }, rideStart);              // seamless hand-off of the dot
            const i = settled.indexOf(parent.g);
            if (i >= 0) settled.splice(i, 1);                         // a hidden token must never be re-dimmed visible
          }
        } else {
          tl.to(g, { opacity: 1, duration: APPEAR, ease: "none" }, rideStart - APPEAR);
        }

        const proxy = { p: 0 };
        tl.to(proxy, { p: 1, duration: dur, ease: "none", onUpdate: () => place(proxy.p) }, rideStart);
        const full = (hop.from ?? 0) === 0 && (hop.to ?? 1) === 1;
        if (full) tl.call(() => { wire.classList.add("on"); trace.remove(); }, [], rideStart + dur);
        if (val) tl.call(() => nudgeTokenLabel(svg, g), [], rideStart + dur);   // parked labels must not collide with port text
        tl.to(dot, { attr: { r: 7 }, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.in" }, rideStart + dur - 0.04);
        settled.push(g);

        built[hop.w] = { rideStart, dur, a, b, wire, g, val };
        stageEnd = Math.max(stageEnd, rideStart + dur);
      });

      sched.push({ at, end: stageEnd });
      at = stageEnd + DWELL;
    });

    tl.call(() => setStageLabel("done"), [], at);
    if (typeof window !== "undefined") {
      window.__tl = tl; window.__sched = sched;
      window.__setTick = (t) => { setAuto(false); setClockActive(true); setTick(Math.max(0, Math.min(t, MAXT))); };   // dev/test hook
      const seek = urlParams.get("seek");   // ?seek=2.5 freezes the timeline there (debug/screenshots)
      if (seek !== null) { tl.pause(0); tl.time(Math.min(parseFloat(seek) || 0, tl.duration()), false); }   // false: fire calls along the way
    }
  }, { dependencies: [replay], scope: hostRef });

  // ---- clock mode: static render of the current cycle (Logisim-style instant propagation) ----
  useEffect(() => {
    if (!clockActive) return;
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;
    window.__tl?.pause();
    clearAnim(svg);
    setStageLabel("");
    const cycle = Math.ceil(tick / 2);
    const fr = data.frames[cycle];
    if (!fr) return;
    fr.on.forEach((i) => svg.querySelector("#w" + i)?.classList.add("on"));
    const placed = [];
    Object.entries(fr.vals).forEach(([i, v]) => {
      const meta = data.wires[i];
      if (!meta?.vp) return;
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", meta.vp[0]);
      t.setAttribute("y", meta.vp[1]);
      t.setAttribute("fill", COLORS[meta.color] || "#57606a");
      t.setAttribute("class", "sval");
      t.textContent = v;
      svg.appendChild(t);
      placed.push(nudgeClear(svg, t, 0, 0, placed));
    });
  }, [clockActive, tick]);

  // ---- auto-tick at freq Hz of HALF-cycles (Logisim counts half-cycles). Paced against a
  // wall-clock deadline like Logisim's SimThread (lastTick + autoTickNanos), so browser
  // timer throttling only batches ticks instead of slowing the clock. ----
  useEffect(() => {
    if (!auto || !clockActive) return;
    const start = performance.now();
    let emitted = 0;
    const id = setInterval(() => {
      const due = Math.floor(((performance.now() - start) * freq) / 1000);
      if (due > emitted) {
        const add = due - emitted;
        emitted = due;
        setTick((t) => Math.min(t + add, MAXT));
      }
    }, Math.max(1000 / freq, 16));
    return () => clearInterval(id);
  }, [auto, freq, clockActive]);
  useEffect(() => { if (auto && tick >= MAXT) setAuto(false); }, [auto, tick]);

  const enterClock = (fn) => { setClockActive(true); setTick(fn); };
  const tickHalf = () => enterClock((t) => Math.min((clockRef.current ? t : 0) + 1, MAXT));
  const tickFull = () => enterClock((t) => Math.min((clockRef.current ? t : 0) + 2, MAXT));
  const resetSim = () => { setAuto(false); enterClock(() => 0); };
  const jumpTo = (cyc) => enterClock(() => Math.min(cyc * 2 - 1, MAXT));
  const playStory = () => { setAuto(false); setClockActive(false); setTick(0); setReplay((r) => r + 1); };

  // keyboard: T half, F full, K auto-tick, R reset (Logisim uses Ctrl+T/Ctrl+F9/Ctrl+K/Ctrl+R,
  // but browsers reserve those, so bare keys stand in)
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(input|select|textarea)$/i.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "t") tickHalf();
      else if (k === "f") tickFull();
      else if (k === "k") { setClockActive(true); setAuto((a) => !a); }
      else if (k === "r") resetSim();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header>
        <div className="titlebar">
          <h1>one instruction through the datapath</h1>
          <span className="sub">react + gsap</span>
        </div>
        <div className="bar">
          <button className="primary" onClick={playStory}>replay cycle 6 story</button>
          <span className="asm">{frame.asm}</span>
          <a className="navlink" style={{ marginLeft: "auto" }} href="/?view=arch">how it works &rarr;</a>
        </div>
        <ClockPanel
          tick={tick} maxTick={MAXT} auto={auto} freq={freq} ticks={data.ticks}
          onHalf={tickHalf} onFull={tickFull}
          onAutoToggle={() => { setClockActive(true); setAuto((a) => !a); }}
          onFreq={setFreq} onReset={resetSim}
        />
        <div className="stagebar">{clockActive ? "" : stageLabel}</div>
      </header>
      <div className="stage" ref={hostRef} dangerouslySetInnerHTML={{ __html: data.svg }} />
      <Chronogram ticks={data.ticks} tick={clockActive ? tick : 0} onJump={jumpTo} />
      <div className="legend">
        {Object.entries(LEGEND).map(([k, label]) => (
          <span key={k}><i style={{ background: COLORS[k] }} />{label}</span>
        ))}
      </div>
    </div>
  );
}
