// Live single-cycle RV32I simulator for the CS61C datapath.
// Architecture follows the vendored Hines simulator (component values ARE the
// wires; step() computes one full combinational cycle then latches), adapted to
// OUR topology: ASel/BSel muxes, separate BranchComp (BrUn/BrEq/BrLT), PCSel,
// 3-way WBSel, ImmSel. 32-bit math in plain JS: |0 = signed view, >>>0 = unsigned.

export const ABI = ["zero","ra","sp","gp","tp","t0","t1","t2","s0","s1","a0","a1",
  "a2","a3","a4","a5","a6","a7","s2","s3","s4","s5","s6","s7","s8","s9","s10","s11","t3","t4","t5","t6"];
const REGNUM = {};
ABI.forEach((n, i) => { REGNUM[n] = i; REGNUM["x" + i] = i; });
REGNUM["fp"] = 8;

const hex = (v) => "0x" + (v >>> 0).toString(16).padStart(8, "0");

// One formatter for every value display in the app (register panel, wire tokens,
// stage labels) so the Display selector governs them all. pad=true gives the
// register-panel 8-digit form; tokens use the compact form.
export function formatValue(v, type = "Hex", pad = false) {
  if (type === "Decimal") return String(v | 0);
  if (type === "Unsigned") return String(v >>> 0);
  if (type === "ASCII")
    return [24, 16, 8, 0].map((s) => { const b = (v >>> s) & 0xff; return b >= 32 && b <= 126 ? String.fromCharCode(b) : "�"; }).join("");
  return pad ? hex(v) : "0x" + (v >>> 0).toString(16);
}

// ---------------- assembler (hand-rolled two-pass; syntax follows Venus) ----------------

const R_OPS = { add:[0,0], sub:[0,0x20], sll:[1,0], slt:[2,0], sltu:[3,0], xor:[4,0], srl:[5,0], sra:[5,0x20], or:[6,0], and:[7,0] };
const I_OPS = { addi:0, slti:2, sltiu:3, xori:4, ori:6, andi:7 };
const SHIFT_OPS = { slli:[1,0], srli:[5,0], srai:[5,0x20] };
const LOADS = { lb:0, lh:1, lw:2, lbu:4, lhu:5 };
const STORES = { sb:0, sh:1, sw:2 };
const BRANCHES = { beq:0, bne:1, blt:4, bge:5, bltu:6, bgeu:7 };

class AsmError extends Error {
  constructor(msg, line) { super(msg); this.line = line; }
}

function parseReg(tok, line) {
  const r = REGNUM[tok];
  if (r === undefined) throw new AsmError(`unknown register "${tok}"`, line);
  return r;
}
function parseImm(tok, line, labels, pc, rel) {
  if (labels && tok in labels) return rel ? labels[tok] - pc : labels[tok];
  if (!/^[+-]?(0x[0-9a-f]+|\d+)$/i.test(tok)) throw new AsmError(`bad immediate "${tok}"`, line);   // whole-token check: "0b101"/"12abc" must not half-parse
  const neg = tok[0] === "-";
  const body = tok.replace(/^[+-]/, "");
  const v = /^0x/i.test(body) ? parseInt(body, 16) : parseInt(body, 10);
  return neg ? -v : v;
}
function checkRange(v, bits, line, what) {
  const lo = -(2 ** (bits - 1)), hi = 2 ** (bits - 1) - 1;
  if (v < lo || v > hi) throw new AsmError(`${what} ${v} out of range [${lo}, ${hi}]`, line);
}

// encoders (instruction-bit packing per RISC-V spec)
const encR = (f7, rs2, rs1, f3, rd, op) => (f7 << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | rd << 7 | op) >>> 0;
const encI = (imm, rs1, f3, rd, op) => ((imm & 0xfff) << 20 | rs1 << 15 | f3 << 12 | rd << 7 | op) >>> 0;
const encS = (imm, rs2, rs1, f3, op) => (((imm >> 5) & 0x7f) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | (imm & 0x1f) << 7 | op) >>> 0;
const encB = (imm, rs2, rs1, f3, op) =>
  (((imm >> 12) & 1) << 31 | ((imm >> 5) & 0x3f) << 25 | rs2 << 20 | rs1 << 15 | f3 << 12 | ((imm >> 1) & 0xf) << 8 | ((imm >> 11) & 1) << 7 | op) >>> 0;
const encU = (imm, rd, op) => ((imm & 0xfffff) << 12 | rd << 7 | op) >>> 0;
const encJ = (imm, rd, op) =>
  (((imm >> 20) & 1) << 31 | ((imm >> 1) & 0x3ff) << 21 | ((imm >> 11) & 1) << 20 | ((imm >> 12) & 0xff) << 12 | rd << 7 | op) >>> 0;

// parse one line into zero or more {gen(labels, pcOf) -> word} records
function parseLine(raw, lineNum) {
  const text = raw.replace(/#.*$/, "").trim();
  if (!text) return { label: null, instrs: [] };
  let label = null, rest = text;
  const lm = text.match(/^([A-Za-z_.][\w.]*)\s*:\s*(.*)$/);
  if (lm) { label = lm[1]; rest = lm[2].trim(); }
  if (!rest) return { label, instrs: [] };

  const m = rest.match(/^([a-z.]+)\s*(.*)$/i);
  if (!m) throw new AsmError(`cannot parse "${rest}"`, lineNum);
  const op = m[1].toLowerCase();
  const args = m[2].split(",").map((s) => s.trim()).filter(Boolean);
  const need = (n) => { if (args.length !== n) throw new AsmError(`${op} expects ${n} operands`, lineNum); };
  const displacement = (tok) => {
    const dm = tok.match(/^(-?\w+)\s*\(\s*(\w+)\s*\)$/);
    if (!dm) throw new AsmError(`expected imm(reg), got "${tok}"`, lineNum);
    return [dm[1], dm[2]];
  };
  const L = lineNum;
  const one = (gen) => ({ label, instrs: [{ gen, line: L, src: text }] });

  if (op in R_OPS) {
    need(3);
    const [rd, rs1, rs2] = args.map((a) => parseReg(a, L));
    const [f3, f7] = R_OPS[op];
    return one(() => encR(f7, rs2, rs1, f3, rd, 0x33));
  }
  if (op in I_OPS) {
    need(3);
    const rd = parseReg(args[0], L), rs1 = parseReg(args[1], L);
    return one((lb) => { const imm = parseImm(args[2], L, lb); checkRange(imm, 12, L, "immediate"); return encI(imm, rs1, I_OPS[op], rd, 0x13); });
  }
  if (op in SHIFT_OPS) {
    need(3);
    const rd = parseReg(args[0], L), rs1 = parseReg(args[1], L);
    const [f3, f7] = SHIFT_OPS[op];
    return one((lb) => { const sh = parseImm(args[2], L, lb); if (sh < 0 || sh > 31) throw new AsmError(`shift amount ${sh} out of range`, L); return encI((f7 << 5) | sh, rs1, f3, rd, 0x13); });
  }
  if (op in LOADS) {
    need(2);
    const rd = parseReg(args[0], L), [immTok, baseTok] = displacement(args[1]);
    const rs1 = parseReg(baseTok, L);
    return one((lb) => { const imm = parseImm(immTok, L, lb); checkRange(imm, 12, L, "offset"); return encI(imm, rs1, LOADS[op], rd, 0x03); });
  }
  if (op in STORES) {
    need(2);
    const rs2 = parseReg(args[0], L), [immTok, baseTok] = displacement(args[1]);
    const rs1 = parseReg(baseTok, L);
    return one((lb) => { const imm = parseImm(immTok, L, lb); checkRange(imm, 12, L, "offset"); return encS(imm, rs2, rs1, STORES[op], 0x23); });
  }
  if (op in BRANCHES) {
    need(3);
    const rs1 = parseReg(args[0], L), rs2 = parseReg(args[1], L);
    return one((lb, pc) => { const imm = parseImm(args[2], L, lb, pc, true); checkRange(imm, 13, L, "branch offset"); if (imm & 1) throw new AsmError(`branch offset ${imm} must be even`, L); return encB(imm, rs2, rs1, BRANCHES[op], 0x63); });
  }
  if (op === "lui" || op === "auipc") {
    need(2);
    const rd = parseReg(args[0], L);
    return one((lb) => { const imm = parseImm(args[1], L, lb); if (imm < 0 || imm > 0xfffff) throw new AsmError(`20-bit immediate out of range`, L); return encU(imm, rd, op === "lui" ? 0x37 : 0x17); });
  }
  if (op === "jal") {
    if (args.length === 1) args.unshift("ra");
    need(2);
    const rd = parseReg(args[0], L);
    return one((lb, pc) => { const imm = parseImm(args[1], L, lb, pc, true); checkRange(imm, 21, L, "jump offset"); if (imm & 1) throw new AsmError(`jump offset ${imm} must be even`, L); return encJ(imm, rd, 0x6f); });
  }
  if (op === "jalr") {
    if (args.length === 1 && args[0].includes("(")) { const [i, b] = displacement(args[0]); args.splice(0, 1, "ra", b, i); }   // jalr 8(t0)
    else if (args.length === 1) { args.unshift("ra"); args.push("0"); }                                                        // jalr t0
    if (args.length === 2 && args[1].includes("(")) { const [i, b] = displacement(args[1]); args[1] = b; args[2] = i; }        // jalr rd, 8(t0)
    need(3);
    const rd = parseReg(args[0], L), rs1 = parseReg(args[1], L);
    return one((lb) => { const imm = parseImm(args[2], L, lb); checkRange(imm, 12, L, "offset"); return encI(imm, rs1, 0, rd, 0x67); });
  }
  // pseudo-instructions (Venus set, the common ones)
  if (op === "nop") { need(0); return one(() => encI(0, 0, 0, 0, 0x13)); }
  if (op === "mv") { need(2); const rd = parseReg(args[0], L), rs = parseReg(args[1], L); return one(() => encI(0, rs, 0, rd, 0x13)); }
  if (op === "not") { need(2); const rd = parseReg(args[0], L), rs = parseReg(args[1], L); return one(() => encI(-1, rs, 4, rd, 0x13)); }
  if (op === "neg") { need(2); const rd = parseReg(args[0], L), rs = parseReg(args[1], L); return one(() => encR(0x20, rs, 0, 0, rd, 0x33)); }
  if (op === "seqz") { need(2); const rd = parseReg(args[0], L), rs = parseReg(args[1], L); return one(() => encI(1, rs, 3, rd, 0x13)); }
  if (op === "snez") { need(2); const rd = parseReg(args[0], L), rs = parseReg(args[1], L); return one(() => encR(0, rs, 0, 3, rd, 0x33)); }
  if (op === "beqz") { need(2); return parseLine(`beq ${args[0]}, zero, ${args[1]}`, L); }
  if (op === "bnez") { need(2); return parseLine(`bne ${args[0]}, zero, ${args[1]}`, L); }
  if (op === "j") { need(1); return parseLine(`jal zero, ${args[0]}`, L); }
  if (op === "jr") { need(1); return parseLine(`jalr zero, ${args[0]}, 0`, L); }
  if (op === "ret") { need(0); return parseLine(`jalr zero, ra, 0`, L); }
  if (op === "li") {
    need(2);
    const rd = parseReg(args[0], L);
    const v = parseImm(args[1], L, null);
    if (v >= -2048 && v <= 2047) return one(() => encI(v, 0, 0, rd, 0x13));
    // 32-bit li: lui + addi (compensate addi sign extension)
    const lo = ((v << 20) >> 20);            // sign-extended low 12
    const hi = ((v - lo) >>> 12) & 0xfffff;
    return {
      label, instrs: [
        { gen: () => encU(hi, rd, 0x37), line: L, src: text + "  (lui part)" },
        { gen: () => encI(lo, rd, 0, rd, 0x13), line: L, src: text + "  (addi part)" },
      ],
    };
  }
  throw new AsmError(`unknown instruction "${op}"`, lineNum);
}

export function assemble(text) {
  const lines = text.split("\n");
  const instrs = [];       // {gen, line, src}
  const labels = {};
  const errors = [];
  lines.forEach((raw, i) => {
    try {
      const { label, instrs: ins } = parseLine(raw, i + 1);
      if (label !== null) {
        if (label in labels) throw new AsmError(`duplicate label "${label}"`, i + 1);
        labels[label] = instrs.length * 4;
      }
      instrs.push(...ins);
    } catch (e) {
      errors.push({ line: e.line ?? i + 1, message: e.message });
    }
  });
  if (errors.length) return { errors, words: [], lineOf: [], srcOf: [] };
  const words = [], lineOf = [], srcOf = [];
  instrs.forEach((ins, idx) => {
    try {
      words.push(ins.gen(labels, idx * 4) >>> 0);
      lineOf.push(ins.line);
      srcOf.push(ins.src);
    } catch (e) {
      errors.push({ line: e.line ?? ins.line, message: e.message });
    }
  });
  return { errors, words, lineOf, srcOf };
}

// ---------------- the single-cycle machine ----------------

export class Sim {
  constructor(words) {
    this.words = words;
    this.pc = 0;
    this.regs = new Int32Array(32);
    this.regs[2] = 0xbffffff0 | 0;   // sp (Venus convention)
    this.regs[3] = 0x10008000 | 0;   // gp
    this.mem = new Map();            // byte addr -> byte (little-endian)
    this.cycle = 0;
  }
  done() { return this.pc / 4 >= this.words.length || this.pc < 0; }

  loadMem(addr, bytes, unsigned) {
    let v = 0;
    for (let i = bytes - 1; i >= 0; i--) v = (v << 8) | (this.mem.get((addr + i) >>> 0) ?? 0);
    if (!unsigned) { const sh = 32 - bytes * 8; v = (v << sh) >> sh; }
    return v | 0;
  }
  storeMem(addr, bytes, val) {
    for (let i = 0; i < bytes; i++) this.mem.set((addr + i) >>> 0, (val >>> (i * 8)) & 0xff);
  }

  // one full combinational cycle + latch; returns the complete wire/control record
  step() {
    const pc = this.pc;
    if (pc % 4 !== 0) throw new Error(`misaligned PC ${hex(pc)}`);
    const inst = this.words[pc / 4] >>> 0;
    const opcode = inst & 0x7f;
    const rd = (inst >>> 7) & 0x1f, f3 = (inst >>> 12) & 0x7, rs1 = (inst >>> 15) & 0x1f,
          rs2 = (inst >>> 20) & 0x1f, f7 = (inst >>> 25) & 0x7f;

    // immgen (all formats; ImmSel picks)
    const immI = (inst | 0) >> 20;
    const immS = (((inst | 0) >> 25) << 5) | ((inst >>> 7) & 0x1f);
    const immB = ((((inst | 0) >> 31) << 12) | (((inst >>> 7) & 1) << 11) | (((inst >>> 25) & 0x3f) << 5) | (((inst >>> 8) & 0xf) << 1)) | 0;
    const immU = (inst & 0xfffff000) | 0;
    const immJ = ((((inst | 0) >> 31) << 20) | (((inst >>> 12) & 0xff) << 12) | (((inst >>> 20) & 1) << 11) | (((inst >>> 21) & 0x3ff) << 1)) | 0;

    const cls =
      opcode === 0x33 ? "R" : opcode === 0x13 ? "I" : opcode === 0x03 ? "load" :
      opcode === 0x23 ? "store" : opcode === 0x63 ? "branch" : opcode === 0x37 ? "lui" :
      opcode === 0x17 ? "auipc" : opcode === 0x6f ? "jal" : opcode === 0x67 ? "jalr" : "unknown";
    if (cls === "unknown") throw new Error(`illegal instruction ${hex(inst)} at ${hex(pc)}`);

    // control (CS61C signals)
    const ImmSel = { R: "-", I: "I", load: "I", jalr: "I", store: "S", branch: "B", lui: "U", auipc: "U", jal: "J" }[cls];
    const imm = { "-": 0, I: immI, S: immS, B: immB, U: immU, J: immJ }[ImmSel];
    const usesRs1 = !(cls === "lui" || cls === "auipc" || cls === "jal");
    const usesRs2 = cls === "R" || cls === "store" || cls === "branch";
    const rd1 = this.regs[rs1] | 0, rd2 = this.regs[rs2] | 0;

    // branch comparator (separate from ALU, like the circuit)
    const BrUn = cls === "branch" && (f3 === 6 || f3 === 7) ? 1 : 0;
    const BrEq = rd1 === rd2 ? 1 : 0;
    const BrLT = BrUn ? ((rd1 >>> 0) < (rd2 >>> 0) ? 1 : 0) : (rd1 < rd2 ? 1 : 0);
    let taken = 0;
    if (cls === "branch")
      taken = { 0: BrEq, 1: BrEq ^ 1, 4: BrLT, 5: BrLT ^ 1, 6: BrLT, 7: BrLT ^ 1 }[f3] ?? 0;

    const ASel = (cls === "branch" || cls === "auipc" || cls === "jal") ? 1 : 0;
    const BSel = cls === "R" ? 0 : 1;
    const A = ASel ? pc | 0 : rd1;
    const B = BSel ? imm : rd2;

    // ALU
    let ALUSel = "add";
    if (cls === "R" || cls === "I") {
      const sub = cls === "R" && f7 === 0x20 && f3 === 0;
      const sra = f7 === 0x20 && f3 === 5;
      ALUSel = { 0: sub ? "sub" : "add", 1: "sll", 2: "slt", 3: "sltu", 4: "xor", 5: sra ? "sra" : "srl", 6: "or", 7: "and" }[f3];
    } else if (cls === "lui") ALUSel = "copyB";
    const sh = B & 0x1f;
    const ALU = ({
      add: (A + B) | 0, sub: (A - B) | 0, and: A & B, or: A | B, xor: A ^ B,
      sll: A << sh, srl: A >>> sh, sra: A >> sh,
      slt: (A | 0) < (B | 0) ? 1 : 0, sltu: (A >>> 0) < (B >>> 0) ? 1 : 0,
      copyB: B | 0,
    })[ALUSel];

    // memory
    const MemRW = cls === "load" ? "read" : cls === "store" ? "write" : "-";
    let mem = 0;
    if (cls === "load") mem = this.loadMem(ALU >>> 0, [1, 2, 4, 0, 1, 2][f3], f3 >= 4);

    // writeback + next pc
    const pcp4 = (pc + 4) | 0;
    const WBSel = cls === "load" ? 0 : (cls === "jal" || cls === "jalr") ? 2 : 1;
    const wdata = WBSel === 0 ? mem : WBSel === 2 ? pcp4 : ALU;
    const PCSel = (cls === "jal" || cls === "jalr" || taken) ? 1 : 0;
    const aluTarget = cls === "jalr" ? (ALU & ~1) : ALU;
    const nextPc = PCSel ? aluTarget | 0 : pcp4;

    const record = {
      cycle: this.cycle + 1, pc, inst, cls, fields: { rd, rs1, rs2, f3, f7 },
      usesRs1, usesRs2, taken,
      ctrl: { PCSel, ImmSel, RegWEn: cls === "store" || cls === "branch" ? 0 : 1, BrUn, BrEq, BrLT, ASel, BSel, ALUSel, MemRW, WBSel },
      vals: { PC: pc, PCp4: pcp4, inst, rd1, rd2, imm, A, B, ALU, mem, wdata, NextPC: nextPc },
      regWrite: (cls !== "store" && cls !== "branch" && rd !== 0) ? { rd, value: wdata } : null,
      memWrite: cls === "store" ? { addr: ALU >>> 0, bytes: [1, 2, 4][f3], value: rd2 } : null,
      nextPc,
    };

    // ---- rising edge: latch ----
    if (record.regWrite) this.regs[rd] = wdata;
    if (record.memWrite) this.storeMem(record.memWrite.addr, record.memWrite.bytes, rd2);
    this.pc = nextPc;
    this.cycle++;
    return record;
  }
}

export { hex };
