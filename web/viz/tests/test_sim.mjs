import { assemble, Sim, hex } from "../src/sim.js";

let pass = 0, fail = 0;
function run(name, src, steps, check) {
  const { errors, words } = assemble(src);
  if (errors.length) { console.log(`FAIL ${name}: asm errors ${JSON.stringify(errors)}`); fail++; return; }
  const sim = new Sim(words);
  let rec;
  for (let i = 0; i < steps && !sim.done(); i++) rec = sim.step();
  const problems = check(sim, rec) || [];
  if (problems.length) { console.log(`FAIL ${name}: ${problems.join("; ")}`); fail++; }
  else { pass++; }
}
const eq = (what, got, want) => (got | 0) === (want | 0) ? null : `${what}: got ${got} (${hex(got)}), want ${want} (${hex(want)})`;
const T = (arr) => arr.filter(Boolean);
const R = { t0: 5, t1: 6, t2: 7, a0: 10, ra: 1 };

// basics
run("addi", "addi t0, zero, 42", 1, (s) => T([eq("t0", s.regs[R.t0], 42)]));
run("addi-neg", "addi t0, zero, -5", 1, (s) => T([eq("t0", s.regs[R.t0], -5)]));
run("add/sub", "addi t0, zero, 7\naddi t1, zero, 3\nadd t2, t0, t1\nsub a0, t0, t1", 4,
  (s) => T([eq("t2", s.regs[R.t2], 10), eq("a0", s.regs[R.a0], 4)]));
run("x0-write-ignored", "addi zero, zero, 99\naddi t0, zero, 1", 2, (s) => T([eq("x0", s.regs[0], 0), eq("t0", s.regs[R.t0], 1)]));

// the traps from control-tables.md
run("lw-nonzero-offset", "addi t0, zero, 0x60\naddi t1, zero, 77\nsw t1, 4(t0)\nlw t2, 4(t0)", 4,
  (s) => T([eq("t2", s.regs[R.t2], 77)]));
run("bge-takes-on-equal", "addi t0, zero, 5\naddi t1, zero, 5\nbge t0, t1, ok\naddi a0, zero, 1\nok: addi t2, zero, 9", 4,
  (s) => T([eq("a0 (skipped)", s.regs[R.a0], 0), eq("t2", s.regs[R.t2], 9)]));
run("blt-not-on-equal", "addi t0, zero, 5\nblt t0, t0, bad\naddi a0, zero, 1\nbad: addi t2, zero, 2", 4,
  (s) => T([eq("a0 (executed)", s.regs[R.a0], 1)]));
run("bltu-unsigned", "addi t0, zero, -1\naddi t1, zero, 1\nbltu t1, t0, ok\naddi a0, zero, 9\nok: addi t2, zero, 3", 4,
  (s) => T([eq("a0 (skipped: 1 <u 0xffffffff)", s.regs[R.a0], 0), eq("t2", s.regs[R.t2], 3)]));
run("jalr-clears-lsb", "addi t0, zero, 13\njalr ra, t0, 0", 2, (s, r) => T([eq("nextPc (12 not 13)", r.nextPc, 12), eq("ra", s.regs[R.ra], 8)]));
run("auipc-uses-pc", "nop\nauipc t0, 1", 2, (s) => T([eq("t0 (4 + 0x1000)", s.regs[R.t0], 0x1004)]));
run("jal-link", "jal ra, target\naddi a0, zero, 1\ntarget: addi t0, zero, 2", 2,
  (s) => T([eq("ra (pc+4)", s.regs[R.ra], 4), eq("t0", s.regs[R.t0], 2), eq("a0 skipped", s.regs[R.a0], 0)]));

// wider coverage
run("lui+li32", "li t0, 0x12345678", 2, (s) => T([eq("t0", s.regs[R.t0], 0x12345678)]));
run("li32-neg", "li t0, -1234567", 2, (s) => T([eq("t0", s.regs[R.t0], -1234567)]));
run("shifts", "addi t0, zero, -8\nsrai t1, t0, 1\nsrli t2, t0, 28\nslli a0, t0, 1", 4,
  (s) => T([eq("srai", s.regs[R.t1], -4), eq("srli", s.regs[R.t2], 0xf), eq("slli", s.regs[R.a0], -16)]));
run("slt/sltu", "addi t0, zero, -1\naddi t1, zero, 1\nslt t2, t0, t1\nsltu a0, t0, t1", 4,
  (s) => T([eq("slt", s.regs[R.t2], 1), eq("sltu", s.regs[R.a0], 0)]));
run("logic", "addi t0, zero, 0xC\nandi t1, t0, 0xA\nori t2, t0, 0x3\nxori a0, t0, 0xF", 4,
  (s) => T([eq("andi", s.regs[R.t1], 8), eq("ori", s.regs[R.t2], 0xF), eq("xori", s.regs[R.a0], 3)]));
run("lb-sign", "addi t0, zero, 0x80\naddi t1, zero, -1\nsb t1, 0(t0)\nlb t2, 0(t0)\nlbu a0, 0(t0)", 5,
  (s) => T([eq("lb", s.regs[R.t2], -1), eq("lbu", s.regs[R.a0], 0xff)]));
run("loop-sum-1to5", `
  addi t0, zero, 0
  addi t1, zero, 1
  addi t2, zero, 6
loop: beq t1, t2, end
  add t0, t0, t1
  addi t1, t1, 1
  j loop
end: nop`, 40, (s) => T([eq("sum 1..5", s.regs[R.t0], 15)]));

// record shape for the animation (single addi like the old story)
run("record-shape", "addi t0, t0, 1", 1, (s, r) => T([
  eq("vals.imm", r.vals.imm, 1),
  eq("ctrl.BSel", r.ctrl.BSel, 1),
  eq("ctrl.ASel", r.ctrl.ASel, 0),
  r.ctrl.ALUSel === "add" ? null : `ALUSel ${r.ctrl.ALUSel}`,
  eq("ctrl.WBSel", r.ctrl.WBSel, 1),
  eq("ctrl.PCSel", r.ctrl.PCSel, 0),
  r.regWrite && r.regWrite.rd === 5 ? null : "regWrite missing",
]));

// branch record: taken branch drives PCSel=1 and BrEq
run("branch-record", "addi t0, zero, 3\naddi t1, zero, 3\nbeq t0, t1, off\nnop\noff: nop", 3, (s, r) => T([
  eq("BrEq", r.ctrl.BrEq, 1), eq("PCSel", r.ctrl.PCSel, 1), eq("ASel(PC)", r.ctrl.ASel, 1),
  eq("ALU(target)", r.vals.ALU, 16), eq("nextPc", r.nextPc, 16),
]));

// error reporting (pass-1 errors preempt pass-2 range checks; that's fine)
{
  const { errors } = assemble("addi t0, zero, 5000\nbadop x, y\nlw t0, 4(t9)");
  const lines = errors.map((e) => e.line).join(",");
  if (errors.length === 2 && lines === "2,3") pass++;
  else { console.log(`FAIL errors: ${JSON.stringify(errors)}`); fail++; }
}
// review fixes: strict immediates, odd offsets, jalr displacement form
{
  const bad = (src, name) => {
    const { errors } = assemble(src);
    if (errors.length >= 1) pass++;
    else { console.log(`FAIL ${name}: expected an assembler error`); fail++; }
  };
  bad("addi t0, zero, 0b101", "reject-0b-literal");
  bad("addi t0, zero, 12abc", "reject-trailing-garbage");
  bad("beq zero, zero, 3", "reject-odd-branch-offset");
}
run("jalr-displacement-form", "addi t0, zero, 13\njalr 8(t0)", 2,
  (s, r) => T([eq("nextPc ((13+8)&~1)", r.nextPc, 20), eq("ra", s.regs[R.ra], 8)]));
run("plus-hex-imm", "addi t0, zero, +0x10", 1, (s) => T([eq("t0", s.regs[R.t0], 16)]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
