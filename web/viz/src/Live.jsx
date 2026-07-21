// Live mode: type RISC-V, step one instruction per cycle through the datapath,
// watch registers update. Editor shows debugger-style markers: ▶ executing line,
// ▷ next line (where PC goes).

import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";   // the splitter Overleaf's editor uses
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

// The demo game, written against the MMIO device page: KEYS (held-key bitmask:
// 1 up · 2 down · 4 left · 8 right · 16 A · 32 B), TIME_MS (ms since load),
// FRAME (write = frame complete), FB_BASE (32x32 words of 0x00RRGGBB).
// Poll-only — a single-cycle CPU has no interrupts.
const GAME_SRC = `# ── demo game: dot mover ──
# move the green dot with the arrow keys (or WASD).
# the screen is a 32x32 framebuffer at FB_BASE, one
# word per pixel (0x00RRGGBB); KEYS is a bitmask of
# held keys. switch to the display tab and press Run.

main:   li   s0, KEYS
        li   s1, FB_BASE
        li   s2, 15            # x
        li   s3, 15            # y

loop:   slli t0, s3, 5         # erase: FB + (y*32+x)*4
        add  t0, t0, s2
        slli t0, t0, 2
        add  t0, t0, s1
        sw   zero, 0(t0)

        lw   t1, 0(s0)         # poll KEYS
        andi t2, t1, 1
        beqz t2, dn
        addi s3, s3, -1        # up
dn:     andi t2, t1, 2
        beqz t2, lf
        addi s3, s3, 1         # down
lf:     andi t2, t1, 4
        beqz t2, rt
        addi s2, s2, -1        # left
rt:     andi t2, t1, 8
        beqz t2, wrap
        addi s2, s2, 1         # right
wrap:   andi s2, s2, 31        # torus: wrap at the edges
        andi s3, s3, 31

        slli t0, s3, 5         # draw the dot
        add  t0, t0, s2
        slli t0, t0, 2
        add  t0, t0, s1
        li   t3, 0x22c55e      # green
        sw   t3, 0(t0)

        addi t3, zero, 1       # FRAME: frame complete
        sw   t3, 16(s0)

        lw   t4, 8(s0)         # pace ~15 fps off TIME_MS
pace:   lw   t5, 8(s0)
        sub  t6, t5, t4
        addi t6, t6, -66
        blt  t6, zero, pace
        j    loop`;

// The game screen: a canvas painted every animation frame straight from the
// sim's framebuffer. 32x32 backing store, CSS-scaled with pixelated rendering.
function GameScreen({ simRef }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const img = ctx.createImageData(32, 32);
    img.data.fill(255);                       // alpha; rgb overwritten each paint
    let raf;
    const paint = () => {
      const fb = simRef.current?.fb;
      if (fb) {
        for (let i = 0; i < fb.length; i++) {
          const p = fb[i];
          img.data[i * 4] = (p >>> 16) & 255;
          img.data[i * 4 + 1] = (p >>> 8) & 255;
          img.data[i * 4 + 2] = p & 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [simRef]);
  return <canvas ref={canvasRef} className="gamescreen" width={32} height={32} />;
}

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

// Live DMEM view (Hines-simulator style: sparse memory, only touched words shown,
// zero runs implicitly collapsed by sparseness). Follows the Display selector.
function MemPanel({ rows, lastAddr, flashKey, displayType }) {
  return (
    <div className="regpanel mempanel">
      <div className="regmeta">
        <span>Memory <b>{rows.length ? `${rows.length} word${rows.length > 1 ? "s" : ""}` : ""}</b></span>
      </div>
      {rows.length === 0 ? (
        <div className="memempty">nothing stored yet — run a sw/sb/sh</div>
      ) : (
        <div className="memrows">
          {rows.map(({ addr, val }, i) => {
            const gap = i > 0 && addr - rows[i - 1].addr > 4;
            return (
              <div key={`${addr}-${val}-${addr === lastAddr ? flashKey : ""}`}>
                {gap && <div className="memgap">⋯</div>}
                <div className={"regcell" + (addr === lastAddr ? " is-modified flash" : "")}>
                  <span className="regname">{hex(addr)}</span>
                  <span className="regval mono">{fmtReg(val, displayType)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [memRows, setMemRows] = useState([]);
  const [lastMemAddr, setLastMemAddr] = useState(-1);
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
  const [screen, setScreen] = useState("diagram");   // "diagram" | "display"
  const screenRef = useRef("diagram");
  screenRef.current = screen;
  const keysRef = useRef(0);                         // held-key bitmask for MMIO KEYS
  const turboRafRef = useRef(0);

  const svg = () => hostRef.current?.querySelector("svg");
  const snapshot = (sim) => {
    setRegs(new Int32Array(sim.regs));
    setPc(sim.pc);
    setCycle(sim.cycle);
    const words = new Map();
    for (const a of sim.mem.keys()) {
      const w = (a & ~3) >>> 0;
      if (!words.has(w)) words.set(w, sim.loadMem(w, 4, false));
    }
    setMemRows([...words.entries()].sort((x, y) => (x[0] >>> 0) - (y[0] >>> 0)).map(([addr, val]) => ({ addr, val })));
  };

  const load = (srcArg) => {
    stop();
    const res = assemble(typeof srcArg === "string" ? srcArg : code);
    setErrors(res.errors);
    window.__tl?.kill();
    if (svg()) clearAnim(svg());
    setStageLabel("");
    setLastWrite(-1);
    setLastMemAddr(-1);
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
    if (turboRafRef.current) { cancelAnimationFrame(turboRafRef.current); turboRafRef.current = 0; }
  };

  const loadGame = () => {
    setCode(GAME_SRC);
    load(GAME_SRC);
    setScreen("display");
  };

  const switchScreen = (s) => {
    if (s === screen) return;
    stop();                          // switching views pauses a run; Run resumes in the new mode
    setScreen(s);
  };

  const stepOnce = (chain) => {
    const sim = simRef.current;
    if (chain && !runningRef.current) return;      // Stop/Reset/Load cancelled this chain
    if (!sim || busy || sim.done()) { stop(); return; }
    let rec;
    try { rec = sim.step(); }
    catch (e) { setStageLabel(String(e.message)); stop(); return; }
    if (screenRef.current === "display") {           // diagram hidden: apply instantly, no animation
      setCurLine(program.lineOf[rec.pc / 4] ?? -1);
      setNextLine(sim.done() ? -1 : program.lineOf[sim.pc / 4] ?? -1);
      snapshot(sim);
      if (rec.regWrite) { setLastWrite(rec.regWrite.rd); setFlashKey((k) => k + 1); }
      if (rec.memWrite) { setLastMemAddr((rec.memWrite.addr & ~3) >>> 0); setFlashKey((k) => k + 1); }
      setStageLabel(`cycle ${sim.cycle}: ${program.srcOf?.[rec.pc / 4] ?? ""}`);
      if (sim.done()) { setStageLabel((s) => s + "  ·  program finished"); stop(); return; }
      if (chain && runningRef.current) stepTimerRef.current = setTimeout(() => stepOnce(true), 40);
      return;
    }
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
        if (rec.memWrite) { setLastMemAddr((rec.memWrite.addr & ~3) >>> 0); setFlashKey((k) => k + 1); }
        setBusy(false);
        if (sim.done()) { setStageLabel((s) => s + "  ·  program finished"); stop(); return; }
        if (chain && runningRef.current) stepTimerRef.current = setTimeout(() => stepOnce(true), 350);
      },
    });
  };

  // Turbo run for the game screen: thousands of cycles per animation frame, no
  // per-cycle animation. Panels refresh a few times a second; the canvas paints
  // itself from sim.fb every frame.
  const turboRun = () => {
    let tick = 0;
    const frame = () => {
      if (!runningRef.current) return;
      const sim = simRef.current;
      if (!sim || sim.done()) { stop(); return; }
      sim.keys = keysRef.current;
      try { let n = 0; while (n++ < 5000 && !sim.done()) sim.step(); }
      catch (e) { setStageLabel(String(e.message)); snapshot(sim); stop(); return; }
      if ((tick = (tick + 1) & 7) === 0) {
        snapshot(sim);
        setStageLabel(`running — cycle ${sim.cycle} · frame ${sim.frames}`);
      }
      if (sim.done()) {
        snapshot(sim);
        setStageLabel(`program finished — cycle ${sim.cycle}`);
        stop();
        return;
      }
      turboRafRef.current = requestAnimationFrame(frame);
    };
    frame();
  };

  const run = () => {
    if (running) { stop(); return; }
    runningRef.current = true;
    setRunning(true);
    if (screenRef.current === "display") turboRun();
    else stepOnce(true);
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
    setLastMemAddr(-1);
    setCurLine(-1);
    setNextLine(program.lineOf[0]);
  };

  // While the game screen is up, held keys feed the MMIO KEYS register.
  // Typing in the editor/panels must not move the sprite (or get swallowed).
  useEffect(() => {
    if (screen !== "display") return;
    const BITS = { ArrowUp: 1, KeyW: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 4, KeyA: 4, ArrowRight: 8, KeyD: 8, Space: 16, KeyZ: 16, KeyX: 32 };
    const hit = (e) => {
      if (e.target.closest?.(".cm-editor, input, select, textarea, button")) return 0;
      const b = BITS[e.code];
      if (b) e.preventDefault();
      return b || 0;
    };
    const down = (e) => { keysRef.current |= hit(e); if (simRef.current) simRef.current.keys = keysRef.current; };
    const up = (e) => { keysRef.current &= ~hit(e); if (simRef.current) simRef.current.keys = keysRef.current; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keysRef.current = 0;
      if (simRef.current) simRef.current.keys = 0;
    };
  }, [screen]);

  // ?auto=N: load the demo and step N cycles (screenshot/QC harness)
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("auto");
    if (n === null) return;
    const t1 = setTimeout(() => document.querySelector(".live-side .cardbar button.primary")?.click(), 250);
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
        <div className="live-split">
        <PanelGroup direction="horizontal" autoSaveId="datapath-split">
          <Panel defaultSize={66} minSize={40}>
            <div className="live-left">
              <div className="cardbar">
                <span className="cardtitle">single-cycle datapath</span>
                <div className="segtoggle" role="tablist" aria-label="left pane view">
                  <button className={screen === "diagram" ? "on" : ""} onClick={() => switchScreen("diagram")}>diagram</button>
                  <button className={screen === "display" ? "on" : ""} onClick={() => switchScreen("display")}>display</button>
                </div>
              </div>
              {/* the diagram stays mounted while hidden: the anim engine needs live SVG geometry */}
              <div className={"live-diagram" + (screen === "display" ? " is-off" : "")}>
                <div className="stage" ref={hostRef} dangerouslySetInnerHTML={{ __html: data.svg }} />
                <div className="legend">
                  {Object.entries(LEGEND).map(([k, label]) => (
                    <span key={k}><i style={{ background: COLORS[k] }} />{label}</span>
                  ))}
                </div>
              </div>
              {screen === "display" && (
                <div className="live-display">
                  <GameScreen simRef={simRef} />
                  <div className="gamehint">
                    32×32 framebuffer at <span className="mono">FB_BASE</span> · arrows / WASD move · Z = A · X = B
                    {!program && <> · press <b>🎮 Game</b> then <b>Run</b></>}
                  </div>
                </div>
              )}
            </div>
          </Panel>
          <PanelResizeHandle className="splitter" />
          <Panel defaultSize={34} minSize={22}>
            <div className="live-side">
              <div className="cardbar">
                <span className="cardtitle">code</span>
                <div className="cardbtns">
                  <button onClick={loadGame} title="load the demo game — it runs on the display screen">🎮 Game</button>
                  <button className="primary" onClick={load}>Load ⏎</button>
                </div>
              </div>
              <AsmEditor
                value={code}
                height="100%"
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
          </Panel>
        </PanelGroup>
        </div>

        <div className="live-panels">
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
          <MemPanel rows={memRows} lastAddr={lastMemAddr} flashKey={flashKey} displayType={displayType} />
        </div>
      </div>
    </div>
  );
}
