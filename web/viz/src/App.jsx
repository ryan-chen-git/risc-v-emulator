import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import data from "./datapath.json";
import { ClockPanel, Chronogram } from "./Ticker.jsx";
import { COLORS, LEGEND } from "./theme.js";
import { runStages, clearAnim, nudgeClear } from "./anim.js";
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
  { label: "fetch — PC drives IMEM and, in parallel, the +4 adder; PC+4 runs ahead to the PCSel mux",
    hops: [{ w: 1, to: 33 / 416 }, { w: 3, after: 1 }, { w: 2, after: 1 },              // w1's first 33px is the shared PC stem
           { w: 4, after: 2 }, { w: 5, from: 117 / 683, to: 0, after: 4 }, { w: 6, after: 5 }] },   // the +4 result is combinational: it flows during fetch, not after writeback
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
  { label: "rising edge — PCSel selects PC+4 and the PC latches 0x00000014",
    hops: [{ w: 0, label: false }] },   // only the latch happens now; PC+4 arrived at the mux back in fetch
];

const sigVal = {};
for (const [idx, v] of Object.entries(frame.vals)) sigVal[data.wires[idx]?.sig] = v;
sigVal.inst = null;   // instruction hex is too long to ride a token

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

  // ---- guided story of cycle 6 (shared engine in anim.js) ----
  useGSAP(() => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg) return;
    if (clockRef.current) return;                 // clock mode owns the diagram
    setStageLabel("");

    const { tl } = runStages(svg, STAGES, sigVal, {
      onLabel: setStageLabel,
      onDone: () => setStageLabel("done"),
    });
    if (typeof window !== "undefined") {
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
          <a className="navlink" style={{ marginLeft: "auto" }} href="/">&larr; live mode</a>
          <a className="navlink" href="/?view=arch">how it works &rarr;</a>
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
