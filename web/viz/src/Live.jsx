// Live mode: type RISC-V, step one instruction per cycle through the datapath,
// watch registers update. Editor shows debugger-style markers: ▶ executing line,
// ▷ next line (where PC goes).

import { useEffect, useRef, useState } from "react";
import data from "./datapath.json";
import { COLORS, LEGEND } from "./theme.js";
import { assemble, Sim, ABI, hex, formatValue } from "./sim.js";
import { runCycle, clearAnim } from "./anim.js";
import AsmEditor from "./AsmEditor.jsx";
import "./App.css";

const DEMO = `# type RISC-V, press Load, then Step
addi t0, zero, 5
addi t1, zero, 7
add  t2, t0, t1
sw   t2, 0(sp)
lw   a0, 0(sp)
beq  a0, t2, done
addi a1, zero, 99
done: addi a1, zero, 1`;

// Register view ported from Venus (kvakil/venus Renderer.kt + index.html, MIT):
// "abi (xN)" labels, editable value inputs (blur commits), a Hex/Decimal/
// Unsigned/ASCII display selector, and a sticky is-modified mark on the most
// recently written register.
const fmtReg = (v, type) => formatValue(v, type, true);   // padded panel form; the same selector drives the diagram
const parseRegInput = (str) => {
  const s = str.trim();
  if (/^-?0x/i.test(s)) return parseInt(s, 16) | 0;
  const v = parseInt(s, 10);
  return Number.isNaN(v) ? null : v | 0;
};

function RegPanel({ regs, pc, cycle, lastWrite, flashKey, onEdit, editable, displayType, onDisplayChange }) {
  const commit = (i, el) => {
    const v = parseRegInput(el.value);
    if (v === null || !onEdit || !onEdit(i, v)) el.value = fmtReg(regs[i], displayType);   // revert bad/blocked edits
    else el.value = fmtReg(v, displayType);   // canonicalize even when the value is unchanged (no remount happens then)
  };
  return (
    <div className="regpanel">
      <div className="regmeta">
        <span>PC <b className="mono">{fmtReg(pc, displayType)}</b></span>
        <span>cycle <b>{cycle}</b></span>
        <label className="dispsel">
          Display
          <select value={displayType} onChange={(e) => onDisplayChange(e.target.value)}>
            {["Hex", "Decimal", "Unsigned", "ASCII"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="reggrid">
        {ABI.map((name, i) => (
          <div
            key={`${i}-${displayType}-${regs[i]}-${i === lastWrite ? flashKey : ""}`}
            className={"regcell" + (i === lastWrite ? " is-modified flash" : "")}
            title={`x${i} = ${regs[i]} (signed) / ${regs[i] >>> 0} (unsigned)`}
          >
            <label className="regname" htmlFor={`reg-${i}-val`}>{i === 0 ? "zero" : `${name} (x${i})`}</label>
            <input
              id={`reg-${i}-val`}
              className="regval mono"
              spellCheck="false"
              disabled={!editable || i === 0}
              defaultValue={fmtReg(regs[i], displayType)}
              onBlur={(e) => commit(i, e.target)}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Live() {
  const hostRef = useRef(null);
  const simRef = useRef(null);
  const runningRef = useRef(false);
  const stepTimerRef = useRef(null);
  const animateRef = useRef(true);   // chained steps must see the CURRENT toggle, not a stale closure
  const [code, setCode] = useState(DEMO);
  const [program, setProgram] = useState(null);      // {words, lineOf, srcOf}
  const [errors, setErrors] = useState([]);
  const [regs, setRegs] = useState(new Int32Array(32));
  const [pc, setPc] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [lastWrite, setLastWrite] = useState(-1);
  const [flashKey, setFlashKey] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [curLine, setCurLine] = useState(-1);        // ▶ executing
  const [nextLine, setNextLine] = useState(-1);      // ▷ next
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [animate, setAnimate] = useState(true);
  animateRef.current = animate;
  const displayRef = useRef("Hex");
  const [displayType, setDisplayType] = useState("Hex");
  displayRef.current = displayType;

  const svg = () => hostRef.current?.querySelector("svg");
  const snapshot = (sim) => { setRegs(new Int32Array(sim.regs)); setPc(sim.pc); setCycle(sim.cycle); };

  const load = () => {
    stop();
    const res = assemble(code);
    setErrors(res.errors);
    window.__tl?.kill();
    if (svg()) clearAnim(svg());
    setStageLabel("");
    setLastWrite(-1);
    setCurLine(-1);
    setBusy(false);   // a killed timeline never fires onDone
    if (res.errors.length || res.words.length === 0) { simRef.current = null; setProgram(null); setNextLine(-1); return; }
    setProgram(res);
    const sim = new Sim(res.words);
    simRef.current = sim;
    snapshot(sim);
    setNextLine(res.lineOf[0]);
  };

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
    if (stepTimerRef.current) { clearTimeout(stepTimerRef.current); stepTimerRef.current = null; }
  };

  const stepOnce = (chain) => {
    const sim = simRef.current;
    if (chain && !runningRef.current) return;      // Stop/Reset/Load cancelled this chain
    if (!sim || busy || sim.done()) { stop(); return; }
    let rec;
    try { rec = sim.step(); }
    catch (e) { setStageLabel(String(e.message)); stop(); return; }
    setBusy(true);
    setCurLine(program.lineOf[rec.pc / 4] ?? -1);
    setNextLine(sim.done() ? -1 : program.lineOf[sim.pc / 4] ?? -1);
    runCycle(svg(), rec, {
      display: displayRef.current,
      timeScale: animateRef.current ? 1 : 25,
      onLabel: setStageLabel,
      onDone: () => {
        snapshot(sim);
        if (rec.regWrite) { setLastWrite(rec.regWrite.rd); setFlashKey((k) => k + 1); }
        setBusy(false);
        if (sim.done()) { setStageLabel((s) => s + "  ·  program finished"); stop(); return; }
        if (chain && runningRef.current) stepTimerRef.current = setTimeout(() => stepOnce(true), 350);
      },
    });
  };

  const run = () => {
    if (running) { stop(); return; }
    runningRef.current = true;
    setRunning(true);
    stepOnce(true);
  };

  const reset = () => {
    stop();
    if (!program) return;
    window.__tl?.kill();
    const sim = new Sim(program.words);
    simRef.current = sim;
    if (svg()) clearAnim(svg());
    snapshot(sim);
    setBusy(false);   // a killed timeline never fires onDone
    setStageLabel("");
    setLastWrite(-1);
    setCurLine(-1);
    setNextLine(program.lineOf[0]);
  };

  // ?auto=N: load the demo and step N cycles (screenshot/QC harness)
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("auto");
    if (n === null) return;
    const t1 = setTimeout(() => document.querySelector(".cardbar button")?.click(), 250);
    const timers = [t1];
    for (let i = 0; i < +n; i++)
      timers.push(setTimeout(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Step"))?.click(), 600 + i * 9000));
    return () => timers.forEach(clearTimeout);
  }, []);


  return (
    <div className="app live">
      <header>
        <div className="titlebar">
          <h1>live datapath — one instruction per cycle</h1>
          <span className="sub">your code, executing on the single-cycle machine</span>
        </div>
        <div className="bar">
          <a className="navlink" href="/?view=replay">circuit replay &rarr;</a>
          <a className="navlink" href="/?view=arch">how it works &rarr;</a>
        </div>
      </header>

      <div className="live-grid">
        <div className="live-top">
          <div className="stage" ref={hostRef} dangerouslySetInnerHTML={{ __html: data.svg }} />
          <div className="legend">
            {Object.entries(LEGEND).map(([k, label]) => (
              <span key={k}><i style={{ background: COLORS[k] }} />{label}</span>
            ))}
          </div>
        </div>

        <div className="live-bottom">
        <div className="live-left">
          <div className="card">
            <div className="cardbar">
              <span className="cardtitle">code</span>
              <button className="primary" onClick={load}>Load ⏎</button>
            </div>
            <AsmEditor
              value={code}
              curLine={curLine}
              nextLine={nextLine}
              errors={errors}
              onChange={(v) => { setCode(v); setProgram(null); simRef.current = null; setCurLine(-1); setNextLine(-1); setErrors([]); }}
            />
            {errors.length > 0 && (
              <div className="asmerrors">
                {errors.map((e, i) => <div key={i}>line {e.line}: {e.message}</div>)}
              </div>
            )}
          </div>

          <div className="livecontrols">
            <button onClick={() => stepOnce(false)} disabled={!program || busy || running} title="execute one instruction (one full cycle)">
              ⏵ Step Cycle
            </button>
            <button className={running ? "primary" : ""} onClick={run} disabled={!program || (busy && !running)}>
              {running ? "■ Stop" : "▶ Run"}
            </button>
            <button onClick={reset} disabled={!program}>⟲ Reset</button>
            <label className="lanepick" title="uncheck for instant stepping">
              <input type="checkbox" checked={animate} onChange={() => setAnimate((a) => !a)} /> animate
            </label>
          </div>
          <div className="stagebar">{stageLabel || (program ? "loaded — Step to execute the first instruction" : "edit code, then press Load")}</div>
        </div>

        <RegPanel
          regs={regs} pc={pc} cycle={cycle} lastWrite={lastWrite} flashKey={flashKey}
          displayType={displayType} onDisplayChange={setDisplayType}
          editable={!!program && !busy && !running}
          onEdit={(i, v) => {                    // Venus's saveRegister: blur commits into the sim
            const sim = simRef.current;
            if (!sim || busy || running || i === 0) return false;
            sim.regs[i] = v;
            setRegs(new Int32Array(sim.regs));
            return true;
          }}
        />
        </div>
      </div>
    </div>
  );
}
