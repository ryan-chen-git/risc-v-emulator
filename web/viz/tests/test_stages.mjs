// Connectivity audit of the per-instruction animation plans: for every
// instruction class, every hop must START at a component output or within
// EPS of geometry already lit earlier in the plan (fetch-order). This is the
// check that catches "token materializes mid-air" bugs.
import { readFileSync } from "fs";
import { assemble, Sim } from "../src/sim.js";
import { buildStages } from "../src/anim.js";

const data = JSON.parse(readFileSync("../src/datapath.json", "utf8"));

// parse each wire's polyline from the exported SVG
const wirePts = {};
for (const m of data.svg.matchAll(/id="w(\d+)"[^d]*d="M([\d.,\sL-]+)"/g)) {
  wirePts[+m[1]] = m[2].trim().split(/\s*L\s*/).map((p) => p.split(",").map(Number));
}

const seglen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function polyline(w) {
  const pts = wirePts[w];
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const L = seglen(pts[i - 1], pts[i]); lens.push(L); total += L; }
  return { pts, lens, total };
}
function pointAt(w, frac) {
  const { pts, lens, total } = polyline(w);
  let d = frac * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] + 1e-9) {
      const t = lens[i] ? d / lens[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}
// sample a hop's sub-range as points
function samples(w, from, to, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pointAt(w, from + (to - from) * (i / n)));
  return out;
}

// component OUTPUT positions a hop may start from (box faces / mux outputs)
const SOURCES = [
  [107, 179], [113, 179], [140, 179],      // PC out + stem taps
  [140, 145],                              // +4 out
  [69, 181],                               // PCSel mux out
  [169, 257],                              // IMEM inst
  [348, 236], [348, 306],                  // RegFile rdata1/2
  [335, 378],                              // ImmGen
  [502.5, 225], [502.5, 317],              // ASel/BSel mux outs
  [576, 255],                              // ALU out
  [698, 303],                              // DMEM rdata
  [762, 281],                              // WB mux out
];
const EPS = 7;
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= EPS;

function auditPlan(name, rec) {
  const stages = buildStages(rec);
  const lit = [];   // accumulated sample points
  const problems = [];
  for (const stage of stages) {
    const stageLit = [];
    for (const hop of stage.hops) {
      if (!wirePts[hop.w]) { problems.push(`${stage.label}: missing wire w${hop.w}`); continue; }
      const from = hop.from ?? 0, to = hop.to ?? 1;
      const start = pointAt(hop.w, from);
      const connected =
        SOURCES.some((s) => near(start, s)) ||
        lit.some((p) => near(start, p)) ||
        stageLit.some((p) => near(start, p));
      if (!connected)
        problems.push(`${name} / "${stage.label.slice(0, 40)}": w${hop.w} starts mid-air at [${start.map((v) => v.toFixed(0))}]`);
      stageLit.push(...samples(hop.w, from, to));
    }
    lit.push(...stageLit);
  }
  return problems;
}

// one representative program per instruction class (+ both branch outcomes)
const CASES = [
  ["R-type add", "addi t0, zero, 3\nadd t1, t0, t0", 2],
  ["I-type addi", "addi t0, zero, 5", 1],
  ["shift srai", "addi t0, zero, -8\nsrai t1, t0, 1", 2],
  ["load lw", "addi t0, zero, 0x40\nsw t0, 0(t0)\nlw t1, 0(t0)", 3],
  ["store sw", "addi t0, zero, 0x40\nsw t0, 4(t0)", 2],
  ["branch taken", "addi t0, zero, 1\nbeq t0, t0, t\nnop\nt: nop", 2],
  ["branch not taken", "addi t0, zero, 1\nbne t0, t0, t\nnop\nt: nop", 2],
  ["lui", "lui t0, 0x12345", 1],
  ["auipc", "nop\nauipc t0, 1", 2],
  ["jal", "jal ra, t\nnop\nt: nop", 1],
  ["jalr", "addi t0, zero, 16\njalr ra, t0, 0", 2],
];

let fail = 0;
for (const [name, src, steps] of CASES) {
  const { errors, words } = assemble(src);
  if (errors.length) { console.log(`ASM FAIL ${name}: ${JSON.stringify(errors)}`); fail++; continue; }
  const sim = new Sim(words);
  let rec;
  for (let i = 0; i < steps; i++) rec = sim.step();
  const problems = auditPlan(name, rec);
  if (problems.length) { fail++; problems.forEach((p) => console.log("GAP:", p)); }
  else console.log(`ok  ${name} (${rec.cls}, ${buildStages(rec).length} stages)`);
}
console.log(fail ? `\n${fail} case(s) with gaps` : "\nall plans fully connected");
process.exit(fail ? 1 : 0);
