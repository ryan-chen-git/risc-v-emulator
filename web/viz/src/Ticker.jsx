// Logisim-evolution-style clock controls + recording timing diagram.
//
// The chronogram is a direct port of logisim-evolution's gui/chrono panel
// (github.com/logisim-evolution/logisim-evolution, GPL-3.0 — fine for this
// personal project): ChronoPanel constants (HEADER_HEIGHT=20, SIGNAL_HEIGHT=30,
// GAP=2, INITIAL_SPLIT=150), RightPanel's waveform painter (1-bit rails with
// fill under the high level, sloped transitions slope = tickWidth<12 ?
// tickWidth/3 : 4, value boxes with left-aligned text, red cursor line with
// yellow time label, zoom tickWidth = 20*1.15^(zoom-20) clamped 1..40,
// EXTRA_SPACE=40 beyond the last sample), and LeftPanel's name+value table
// showing each signal's value at the cursor. Like Logisim, the diagram only
// contains what has been recorded: it extends by one column per tick.
//
// Clock semantics per Simulator.java/Propagator.java: tick(1) = half cycle,
// frequency counts half-cycles, Clock output isLow = ((ticks+phase)%(hi+lo)) < lo.

import { useEffect, useRef, useState } from "react";
import { COLORS } from "./theme.js";

const HEADER_HEIGHT = 20, SIGNAL_HEIGHT = 30, GAP = 2, INITIAL_SPLIT = 150, EXTRA_SPACE = 40;
const TIMELINE_SPACING = 80;
const LANE_STEP = SIGNAL_HEIGHT + GAP;
const tickWidthOf = (zoom) => 20 * Math.pow(1.15, zoom - 20);
const slopeOf = (tw) => (tw < 12 ? tw / 3 : 4);

export const TICK_FREQUENCIES = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128];
export const fmtFreq = (f) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);

export function ClockFace({ high }) {
  return (
    <svg className={"clkface" + (high ? " high" : "")} viewBox="0 0 46 34" width="46" height="34">
      <rect x="1" y="1" width="44" height="32" rx="6" style={{ fill: high ? "#052E16" : "var(--panel)", stroke: high ? "#22C55E" : "var(--border-strong)" }} />
      <path d="M7,22 h6 v-10 h8 v10 h8 v-10 h6" fill="none" stroke={high ? "#4ADE80" : "#64748B"} strokeWidth="1.8" />
      <text x="23" y="31.5" textAnchor="middle" style={{ font: "700 7px JetBrains Mono, Consolas, monospace" }} fill={high ? "#4ADE80" : "#94A3B8"}>
        clk={high ? 1 : 0}
      </text>
    </svg>
  );
}

export function ClockPanel({ tick, maxTick, auto, freq, ticks, onHalf, onFull, onAutoToggle, onFreq, onReset }) {
  const cycle = Math.ceil(tick / 2), high = tick % 2 === 1;
  const row = cycle > 0 ? ticks[cycle - 1] : null;
  return (
    <div className="clockpanel">
      <ClockFace high={high} />
      <button onClick={onHalf} disabled={tick >= maxTick} title="Logisim: Simulate > Manual Tick Half Cycle (Ctrl+T) — key: T">
        ⎍ Tick Half Cycle
      </button>
      <button onClick={onFull} disabled={tick >= maxTick} title="Logisim: Simulate > Manual Tick Full Cycle (Ctrl+F9) — key: F">
        ⎍⎍ Tick Full Cycle
      </button>
      <button className={auto ? "primary" : ""} onClick={onAutoToggle} disabled={tick >= maxTick && !auto}
        title="Logisim: Simulate > Auto-Tick Enabled (Ctrl+K) — key: K">
        {auto ? "■ Auto-Tick Enabled" : "▶ Auto-Tick"}
      </button>
      <label className="freqlbl" title="Logisim: Simulate > Auto-Tick Frequency — counts half-cycles, so 1 Hz = 0.5 Hz full clock">
        <select value={freq} onChange={(e) => onFreq(+e.target.value)}>
          {TICK_FREQUENCIES.map((f) => <option key={f} value={f}>{fmtFreq(f)}</option>)}
        </select>
      </label>
      <button onClick={onReset} title="Logisim: Simulate > Reset Simulation (Ctrl+R) — key: R">⟲ Reset</button>
      <span className="clkstatus">
        {tick === 0
          ? "reset — tick the clock to begin"
          : <>tick {tick} · cycle {cycle}/{ticks.length} · clk {high ? "high" : "low"}{row && <> · <span className="asm-inline">{row.asm}</span> <span className="pc-inline">PC={row.pc}</span></>}</>}
      </span>
    </div>
  );
}

// Signal definitions: how to sample each lane at half-cycle h (1-based).
const laneDefs = (ticks) => {
  const rowOf = (h) => ticks[Math.ceil(h / 2) - 1];
  return [
    { key: "clk", oneBit: true, color: COLORS.pc, always: true, at: (h) => h % 2 },
    { key: "PC", color: COLORS.pc, always: true, at: (h) => rowOf(h).pc.replace(/^0x0+(?=.)/, "0x") },
    { key: "instr", color: COLORS.inst, always: true, at: (h) => rowOf(h).asm.split(" ")[0] },
    { key: "RegWEn", oneBit: true, color: COLORS.imm, always: true, at: (h) => rowOf(h).regwen },
    { key: "t0", color: COLORS.wb, always: true, at: (h) => rowOf(h).regs.t0 },
    { key: "t1", color: COLORS.reg, at: (h) => rowOf(h).regs.t1 },
    { key: "t2", color: COLORS.reg, at: (h) => rowOf(h).regs.t2 },
    { key: "a0", color: COLORS.mem, at: (h) => rowOf(h).regs.a0 },
  ];
};

// RightPanel-style 1-bit wave: rails, sloped transitions, fill under the high level.
function OneBitWave({ y, lane, tick, tw }) {
  const hi = y + GAP + 3, lo = y + SIGNAL_HEIGHT - GAP - 3;
  const slope = slopeOf(tw);
  let d = "", fills = [];
  let prev = null, runStart = null;
  for (let h = 1; h <= tick; h++) {
    const v = lane.at(h), yy = v ? hi : lo, x0 = (h - 1) * tw, x1 = h * tw;
    if (h === 1) d = `M${x0},${yy}`;
    else if (v !== prev) d += ` L${x0 + slope},${yy}`;
    d += ` L${x1},${yy}`;
    if (v && runStart === null) runStart = x0;
    if (!v && runStart !== null) { fills.push([runStart, x0]); runStart = null; }
    prev = v;
  }
  if (runStart !== null) fills.push([runStart, tick * tw]);
  return (
    <g>
      {fills.map(([a, b], i) => (
        <rect key={i} x={a} y={hi} width={b - a} height={lo - hi} fill={lane.color} opacity="0.12" />
      ))}
      <path d={d} fill="none" stroke={lane.color} strokeWidth="1.6" />
    </g>
  );
}

// RightPanel-style multi-bit wave: value boxes with sloped joints at changes.
function BusWave({ y, lane, tick, tw }) {
  const hi = y + GAP + 3, lo = y + SIGNAL_HEIGHT - GAP - 3, mid = y + SIGNAL_HEIGHT / 2;
  const slope = slopeOf(tw);
  const parts = [], texts = [];
  let runStart = 1;
  for (let h = 2; h <= tick + 1; h++) {
    if (h > tick || String(lane.at(h)) !== String(lane.at(runStart))) {
      const x0 = (runStart - 1) * tw, x1 = (h - 1) * tw;
      const openEnd = h > tick;   // still extending: leading edge is drawn square
      parts.push(
        `M${x0},${mid} L${x0 + slope},${hi} L${x1 - (openEnd ? 0 : slope)},${hi}` +
        (openEnd ? ` L${x1},${hi} L${x1},${lo}` : ` L${x1},${mid} L${x1 - slope},${lo}`) +
        ` L${x0 + slope},${lo} Z`
      );
      const label = String(lane.at(runStart));
      if (label.length * 6.2 <= x1 - x0 - 2 * slope - 4)   // skip labels the box cannot fit (chrono clips them anyway)
        texts.push(
          <text key={runStart} className="lane-val" x={x0 + slope + 3} y={mid + 3}>{label}</text>
        );
      runStart = h;
    }
  }
  return (
    <g>
      {parts.map((p, i) => <path key={i} d={p} className="busbox" stroke={lane.color} strokeWidth="1.1" />)}
      {texts}
    </g>
  );
}

export function Chronogram({ ticks, tick, onJump }) {
  const [zoom, setZoom] = useState(20);            // Logisim zoom 1..40, default 20
  const [cursorH, setCursorH] = useState(null);    // null = follow the leading edge
  const [shown, setShown] = useState({ t1: false, t2: false, a0: false });
  const scrollRef = useRef(null);

  const tw = tickWidthOf(zoom);
  const lanes = laneDefs(ticks).filter((l) => l.always || shown[l.key]);
  const H = lanes.length * LANE_STEP + 6;
  const W = Math.max(tick * tw + EXTRA_SPACE, 120);
  const cur = cursorH === null ? tick : Math.min(cursorH, tick);

  // follow the leading edge while recording (RightPanel keeps the cursor in view)
  useEffect(() => {
    if (cursorH === null && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [tick, zoom, cursorH]);
  useEffect(() => { if (tick === 0) setCursorH(null); }, [tick]);

  const clickToH = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.parentNode.scrollLeft * 0;
    return Math.max(1, Math.min(Math.round(x / tw), tick));
  };

  // cycle numbers spaced >= TIMELINE_SPACING px apart, like the chrono timeline
  const cycleW = 2 * tw;
  const labelEvery = Math.max(1, Math.ceil(TIMELINE_SPACING / cycleW));

  return (
    <div className="chronoblock">
      <div className="chronobar">
        <span className="chronotitle">Timing diagram</span>
        <button onClick={() => setZoom((z) => Math.max(1, z - 2))} title="zoom out (Logisim chronogram zoom)">−</button>
        <button onClick={() => setZoom((z) => Math.min(40, z + 2))} title="zoom in">+</button>
        <span className="zoomlbl">{tw.toFixed(0)} px/tick</span>
        {laneDefs(ticks).filter((l) => !l.always).map((l) => (
          <label key={l.key} className="lanepick">
            <input type="checkbox" checked={shown[l.key]} onChange={() => setShown((s) => ({ ...s, [l.key]: !s[l.key] }))} />
            {l.key}
          </label>
        ))}
        <span className="chronohint">
          {tick === 0 ? "tick the clock — each half-cycle records one column" : "click: inspect · double-click: jump the simulation there"}
        </span>
      </div>
      <div className="chronowrap">
        <table className="chrono-left" style={{ width: INITIAL_SPLIT }}>
          <thead><tr><th>Signal</th><th>Value</th></tr></thead>
          <tbody>
            {lanes.map((l) => (
              <tr key={l.key} style={{ height: LANE_STEP }}>
                <td style={{ color: l.color }}>{l.key}</td>
                <td className="lane-cellval">{tick === 0 ? "—" : String(l.at(Math.max(cur, 1)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="chrono-scroll" ref={scrollRef}>
          <svg
            className="chrono" width={W} height={HEADER_HEIGHT + H}
            onClick={(e) => { if (tick > 0) { const h = clickToH(e); setCursorH(h >= tick ? null : h); } }}
            onDoubleClick={(e) => { if (tick > 0) onJump(Math.ceil(clickToH(e) / 2)); }}
          >
            <g transform={`translate(0,${HEADER_HEIGHT})`}>
              {lanes.map((l, i) => (
                <rect key={l.key} x="0" y={i * LANE_STEP} width={W} height={SIGNAL_HEIGHT} style={{ fill: i % 2 ? "var(--lane-a)" : "var(--lane-b)" }} />
              ))}
              {ticks.slice(0, Math.ceil(tick / 2)).map((t, i) =>
                (t.cyc === 1 || t.cyc % labelEvery === 0) ? (
                  <line key={"g" + i} x1={i * cycleW} y1="0" x2={i * cycleW} y2={H - 6} style={{ stroke: "var(--grid)" }} />
                ) : null
              )}
              {lanes.map((l, i) => {
                const y = i * LANE_STEP;
                return l.oneBit
                  ? <OneBitWave key={l.key} y={y} lane={l} tick={tick} tw={tw} />
                  : <BusWave key={l.key} y={y} lane={l} tick={tick} tw={tw} />;
              })}
              {tick > 0 && cur > 0 && (
                <line className="curline" x1={cur * tw} y1="-3" x2={cur * tw} y2={H - 4} />
              )}
            </g>
            {ticks.slice(0, Math.ceil(tick / 2)).map((t, i) => {
              const lx = (i + 0.5) * cycleW;
              const chipX = Math.min(cur * tw + 3, W - 60);
              if (tick > 0 && cur > 0 && lx > chipX - 12 && lx < chipX + 66) return null;   // the cursor chip owns this strip
              return (t.cyc === 1 || t.cyc % labelEvery === 0) ? (
                <text key={i} className="lane-lbl" x={lx} y="13" textAnchor="middle">{t.cyc}</text>
              ) : null;
            })}
            {tick > 0 && cur > 0 && (
              <g transform={`translate(${Math.min(cur * tw + 3, W - 60)},2)`}>
                <rect className="curchip-bg" width="58" height="13" rx="3" />
                <text className="curlbl" x="29" y="9.5" textAnchor="middle">
                  cyc {Math.ceil(cur / 2)} {cur % 2 ? "hi" : "lo"} · t{cur}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
