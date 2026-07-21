// Cycle animation engine: builds a stage plan from a live Sim cycle record and
// rides tokens through the datapath SVG. Extracted/generalized from the story
// mode's hop system: hops ride wires or fractional sub-ranges; `after` chains a
// hop to spawn when the parent's head passes its start (branch) or hand the dot
// off (continuation).

import { gsap } from "gsap";
import data from "./datapath.json";
import { COLORS } from "./theme.js";
import { hex, formatValue } from "./sim.js";

const NS = "http://www.w3.org/2000/svg";
const SPEED = 240, MAX_RIDE = 2.8, APPEAR = 0.15, DWELL = 0.3;

// headless QC (?auto=N) fast-forwards via --virtual-time-budget; lag smoothing
// would clamp those giant frame deltas to 33ms and freeze the timeline early
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("auto"))
  gsap.ticker.lagSmoothing(0);

// geometry fractions on shared wires (from references/datapath-signals.md)
const F = {
  pcStem: 33 / 416,        // w1: PC out -> first junction
  trunkOffIMEM: 23 / 69.5, // w13: IMEM -> trunk junction
  aluBusRight: 584 / 699,  // w8: ALU rise point -> right end
  pcp4BusTap: 117 / 683,   // w5: +4 tap point on the PC+4 bus
  rd1Comp: (383 - 348) / 140,   // w18: rdata1 -> BranchComp tap
  rd2Comp: (383 - 348) / 140,   // w20: rdata2 -> BranchComp tap
  rd2Dmem: (470 - 348) / 140,   // w20: rdata2 -> DMEM wdata tap
  aluOutStem: 22 / 167,         // w11: ALU face -> the output junction (shared by w12 and the rise)
};

// display: the register viewer's Display selector value — every value on the
// diagram follows it (Hex/Decimal/Unsigned/ASCII), compact form.
export function buildStages(rec, display = "Hex") {
  const c = rec.ctrl, cls = rec.cls;
  const stages = [];
  const fmt = (v) => formatValue(v, display);

  stages.push({
    label: `fetch — PC ${fmt(rec.pc)} drives IMEM and, in parallel, the +4 adder`,
    hops: [{ w: 1, to: F.pcStem }, { w: 3, after: 1 }, { w: 2, after: 1 },
           // the +4 adder is combinational: PC+4 flows to the PCSel mux during fetch
           { w: 4, after: 2 }, { w: 5, from: F.pcp4BusTap, to: 0, after: 4 }, { w: 6, after: 5 }],
  });

  const decodeHops = [{ w: 13, to: c.RegWEn ? 1 : F.trunkOffIMEM }, { w: 14, after: 13 }];
  const parts = [];
  if (c.RegWEn) parts.push("rd");
  if (rec.usesRs1) { decodeHops.push({ w: 15, after: 14 }); parts.push("rs1"); }
  if (rec.usesRs2) { decodeHops.push({ w: 16, after: 14 }); parts.push("rs2"); }
  if (c.ImmSel !== "-") { decodeHops.push({ w: 17, after: 14 }); parts.push(`imm[${c.ImmSel}]`); }
  stages.push({ label: `decode — ${hex(rec.inst)} fans out to ${parts.join(", ")} and control`, hops: decodeHops });

  const readHops = [];
  const readParts = [];
  if (cls === "branch") {
    readHops.push({ w: 18, to: F.rd1Comp }, { w: 19, after: 18 }, { w: 20, to: F.rd2Comp }, { w: 21, after: 20 });
    readParts.push(`compare rs1=${fmt(rec.vals.rd1)} vs rs2=${fmt(rec.vals.rd2)} (BrEq=${c.BrEq}, BrLT=${c.BrLT})`);
  } else {
    if (rec.usesRs1 && c.ASel === 0) { readHops.push({ w: 18 }); readParts.push(`rs1 = ${fmt(rec.vals.rd1)}`); }
    if (rec.usesRs2 && c.BSel === 0) { readHops.push({ w: 20 }); readParts.push(`rs2 = ${fmt(rec.vals.rd2)}`); }
  }
  if (c.ASel === 1) { readHops.push({ w: 1, from: F.pcStem, to: 1 }); readParts.push(`A ← PC (ASel=1)`); }
  if (c.ImmSel !== "-" && c.BSel === 1) { readHops.push({ w: 23 }); readParts.push(`imm = ${fmt(rec.vals.imm)}`); }
  if (readHops.length) stages.push({ label: `operands — ${readParts.join(" · ")}`, hops: readHops });

  stages.push({
    label: cls === "lui"
      ? `execute — ALU passes the immediate through: ${fmt(rec.vals.ALU)}`
      : `execute — ALU ${c.ALUSel}: ${fmt(rec.vals.A)} ${aluGlyph(c.ALUSel)} ${fmt(rec.vals.B)} = ${fmt(rec.vals.ALU)}`,
    hops: cls === "lui" ? [{ w: 25 }] : [{ w: 24 }, { w: 25 }],   // lui ignores A; a garbage token would mislead
  });

  if (cls === "store")
    stages.push({
      label: `memory — store ${fmt(rec.vals.rd2)} to ${fmt(rec.memWrite.addr)}`,
      hops: [{ w: 11, to: F.aluOutStem }, { w: 12, after: 11 }, { w: 20, to: F.rd2Dmem }, { w: 22, after: 20 }],
    });
  if (cls === "load")
    stages.push({
      label: `memory — read ${fmt(rec.vals.ALU)} → ${fmt(rec.vals.mem)}`,
      hops: [{ w: 11, to: F.aluOutStem }, { w: 12, after: 11 }],
    });

  if (c.RegWEn) {
    const wb =
      c.WBSel === 0 ? [{ w: 26 }, { w: 27, after: 26 }]
      : c.WBSel === 2 ? [{ w: 4 }, { w: 5, from: F.pcp4BusTap, to: 1, after: 4 }, { w: 7, after: 5 }, { w: 27, after: 7 }]
      : [{ w: 11 }, { w: 8, from: F.aluBusRight, to: 1, after: 11 }, { w: 10, after: 8 }, { w: 27, after: 10 }];
    const src = c.WBSel === 0 ? "memory" : c.WBSel === 2 ? "PC+4 (link)" : "ALU";
    stages.push({ label: `writeback — x${rec.fields.rd} ← ${fmt(rec.vals.wdata)} from ${src}`, hops: wb });
  }

  // PC+4 already reached the PCSel mux during fetch; the final stage is the mux
  // choice + the rising-edge latch (plus the ALU-target route when PCSel=1,
  // which could only settle after execute).
  const pcHops = c.PCSel === 1
    ? [{ w: 11 }, { w: 8, from: F.aluBusRight, to: 0, after: 11 }, { w: 9, after: 8 }, { w: 0, after: 9, label: false }]
    : [{ w: 0, label: false }];
  stages.push({
    label: c.PCSel === 1
      ? `rising edge — PCSel selects the ${cls === "branch" ? "taken-branch" : cls} target; PC latches ${fmt(rec.nextPc)}`
      : `rising edge — PCSel keeps PC+4${cls === "branch" ? " (branch not taken)" : ""}; PC latches ${fmt(rec.nextPc)}`,
    hops: pcHops,
  });
  return stages;
}

const aluGlyph = (op) => ({ add: "+", sub: "-", and: "&", or: "|", xor: "^", sll: "<<", srl: ">>>", sra: ">>", slt: "<s", sltu: "<u", copyB: "pass" }[op] || op);

// value shown riding each signal — all follow the register viewer's Display choice
function sigValues(rec, display = "Hex") {
  const v = rec.vals;
  const fmt = (x) => formatValue(x, display);
  return {
    NextPC: fmt(v.NextPC), PC: fmt(v.PC), PCp4: fmt(v.PCp4), inst: null,
    rd1: fmt(v.rd1), rd2: fmt(v.rd2), imm: fmt(v.imm),
    A: fmt(v.A), B: fmt(v.B), ALU: fmt(v.ALU),
    mem: fmt(v.mem), wdata: fmt(v.wdata),
  };
}

export function clearAnim(svg) {
  svg.querySelectorAll(".wire.on").forEach((w) => w.classList.remove("on"));
  svg.querySelectorAll(".token, .trace, .sval, .ctlval").forEach((t) => t.remove());
}

// Control-signal values under the bottom bar, revealed when they become causally
// valid: most at decode (control unit output), BrEq/BrLT when the comparator
// compares, PCSel at the rising edge (it depends on the branch outcome).
function addCtlValues(svg, tl, rec, sched, stages) {
  const c = rec.ctrl;
  const vals = {
    "PCSel": String(c.PCSel), "inst[31:0]": "0x" + (rec.inst >>> 0).toString(16),
    "RegWEn": String(c.RegWEn), "ImmSel": c.ImmSel,
    "BrUn": String(c.BrUn), "BrEq": String(c.BrEq), "BrLT": String(c.BrLT),
    "BSel": String(c.BSel), "ASel": String(c.ASel), "ALUSel": c.ALUSel,
    "MemRW": c.MemRW, "WBSel": String(c.WBSel),
  };
  const decodeEnd = sched[1]?.end ?? 0;
  const opIdx = stages.findIndex((s) => s.label.startsWith("operands"));
  const compareTime = rec.cls === "branch" && opIdx >= 0 ? sched[opIdx].end : decodeEnd;
  const edgeAt = sched[sched.length - 1]?.at ?? decodeEnd;
  const timeFor = (k) => (k === "PCSel" ? edgeAt : k === "BrEq" || k === "BrLT" ? compareTime : decodeEnd);
  for (const lbl of svg.querySelectorAll("text.ctl")) {
    const key = lbl.textContent.trim();
    if (!(key in vals)) continue;
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", lbl.getAttribute("x"));
    t.setAttribute("y", "452");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "ctlval" + (vals[key] === "-" ? " off" : ""));
    t.textContent = vals[key];
    t.style.opacity = "0";
    svg.appendChild(t);
    tl.to(t, { opacity: 1, duration: 0.25, ease: "none" }, timeFor(key));
  }
}

// label collision helpers (visible text only)
const isShown = (el) => {
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
const NUDGES = [[0, 0], [0, -9], [0, 9], [11, 0], [-11, 0], [11, -9], [-11, -9], [11, 9], [-11, 9], [0, -18], [18, 0]];

// Try offset candidates until the label clears every visible text bbox; returns
// the label's final local bbox so callers can accumulate placed boxes.
export const nudgeClear = (svg, t, tx = 0, ty = 0, extra = []) => {
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
export const nudgeTokenLabel = (svg, g) => {
  const t = g.querySelector("text");
  const m = (g.getAttribute("transform") || "").match(/translate\(([-\d.]+),([-\d.]+)\)/);
  if (t && m) nudgeClear(svg, t, +m[1], +m[2]);
};

// Run a stage plan (the shared engine behind Live's runCycle and the replay
// view's story mode). Returns { tl, sched } — sched has per-stage {at, end}
// used by the ?seek QC harness.
export function runStages(svg, stages, sigVal, { onLabel, onDone, timeScale = 1 } = {}) {
  clearAnim(svg);

  const tl = gsap.timeline();
  const settled = [];
  const sched = [];
  let at = 0;

  stages.forEach((stage, si) => {
    if (onLabel) tl.call(() => onLabel(`${si + 1}. ${stage.label}`), [], at);
    if (settled.length) tl.to(settled.slice(), { opacity: 0.45, duration: 0.25, ease: "none" }, at);

    const built = {};
    let stageEnd = at;

    stage.hops.forEach((hop) => {
      const wire = svg.querySelector("#w" + hop.w);
      if (!wire) return;
      const meta = data.wires[hop.w] || {};
      const color = COLORS[meta.color] || "#94A3B8";
      const L = wire.getTotalLength();
      const a = (hop.from ?? 0) * L, b = (hop.to ?? 1) * L;
      const sub = Math.abs(b - a);
      const parent = hop.after != null ? built[hop.after] : null;
      const dur = Math.min(MAX_RIDE, Math.max(sub / SPEED, parent ? 0.15 : 0.35));
      const startPt = wire.getPointAtLength(a);

      let rideStart = at + APPEAR;
      let continuation = false;
      if (parent) {
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
      let val = hop.label === false ? null : sigVal[meta.sig];
      if (val && parent && !continuation && parent.val === val) val = null;
      if (val) {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", "9"); t.setAttribute("y", "3.5");
        t.setAttribute("fill", color); t.setAttribute("class", "tokval");
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
        tl.set(g, { opacity: 1 }, rideStart);
        // hand-off hides the parent dot only when the SAME signal continues over a
        // bus junction; across a mux/adder the signal transforms, so the arriving
        // value stays parked at the input (like A/B at the ALU) and dims later.
        if (continuation && parent.sig === meta.sig) {
          tl.set(parent.g, { opacity: 0 }, rideStart);
          const i = settled.indexOf(parent.g);
          if (i >= 0) settled.splice(i, 1);
        }
      } else {
        tl.to(g, { opacity: 1, duration: APPEAR, ease: "none" }, rideStart - APPEAR);
      }

      const proxy = { p: 0 };
      tl.to(proxy, { p: 1, duration: dur, ease: "none", onUpdate: () => place(proxy.p) }, rideStart);
      const full = (hop.from ?? 0) === 0 && (hop.to ?? 1) === 1;
      if (full) tl.call(() => { wire.classList.add("on"); trace.remove(); }, [], rideStart + dur);
      if (val) tl.call(() => nudgeTokenLabel(svg, g), [], rideStart + dur);
      tl.to(dot, { attr: { r: 7 }, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.in" }, rideStart + dur - 0.04);
      settled.push(g);

      built[hop.w] = { rideStart, dur, a, b, wire, g, val, sig: meta.sig };
      stageEnd = Math.max(stageEnd, rideStart + dur);
    });

    sched.push({ at, end: stageEnd });
    at = stageEnd + DWELL;
  });

  // the last stage has no successor to dim it — settle everything at the end
  if (settled.length) tl.to(settled.slice(), { opacity: 0.45, duration: 0.3, ease: "none" }, at);
  if (onDone) tl.call(() => onDone(), [], at);
  tl.timeScale(timeScale);
  if (typeof window !== "undefined") { window.__tl = tl; window.__sched = sched; }
  return { tl, sched };
}

// one live-sim cycle: build the per-instruction plan and run it
export function runCycle(svg, rec, opts = {}) {
  const display = opts.display ?? "Hex";
  const stages = buildStages(rec, display);
  const { tl, sched } = runStages(svg, stages, sigValues(rec, display), opts);
  addCtlValues(svg, tl, rec, sched, stages);
  return tl;
}
