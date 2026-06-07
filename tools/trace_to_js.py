#!/usr/bin/env python3
# Convert captured Logisim traces (-tty table,binary,csv output) into a JS
# data file the web replay viewer can load. Each row becomes one cycle with
# the program counter, instruction, a disassembly, and the traced registers.
import json
import sys

# Register columns, in the order the trace emits them.
TRACE_REGS = ["ra", "sp", "t0", "t1", "t2", "s0", "s1", "a0"]

ABI = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1",
       "a2", "a3", "a4", "a5", "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7",
       "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"]


def sext(value, bits):
    if (value >> (bits - 1)) & 1:
        return value - (1 << bits)
    return value


def disasm(x):
    if x == 0:
        return "nop"
    op = x & 0x7f
    rd = (x >> 7) & 0x1f
    f3 = (x >> 12) & 0x7
    rs1 = (x >> 15) & 0x1f
    rs2 = (x >> 20) & 0x1f
    f7 = (x >> 25) & 0x7f
    rn = lambda i: ABI[i]

    imm_i = sext(x >> 20, 12)
    imm_s = sext(((x >> 25) << 5) | ((x >> 7) & 0x1f), 12)
    imm_b = sext(((x >> 31) << 12) | (((x >> 7) & 1) << 11)
                 | (((x >> 25) & 0x3f) << 5) | (((x >> 8) & 0xf) << 1), 13)
    imm_u = (x >> 12) & 0xfffff
    imm_j = sext(((x >> 31) << 20) | (((x >> 12) & 0xff) << 12)
                 | (((x >> 20) & 1) << 11) | (((x >> 21) & 0x3ff) << 1), 21)

    if op == 0x37:
        return f"lui {rn(rd)}, 0x{imm_u:x}"
    if op == 0x17:
        return f"auipc {rn(rd)}, 0x{imm_u:x}"
    if op == 0x6f:
        return f"jal {rn(rd)}, {imm_j}"
    if op == 0x67:
        return f"jalr {rn(rd)}, {imm_i}({rn(rs1)})"
    if op == 0x63:
        m = {0: "beq", 1: "bne", 4: "blt", 5: "bge", 6: "bltu", 7: "bgeu"}.get(f3, "b?")
        return f"{m} {rn(rs1)}, {rn(rs2)}, {imm_b}"
    if op == 0x03:
        m = {0: "lb", 1: "lh", 2: "lw", 4: "lbu", 5: "lhu"}.get(f3, "l?")
        return f"{m} {rn(rd)}, {imm_i}({rn(rs1)})"
    if op == 0x23:
        m = {0: "sb", 1: "sh", 2: "sw"}.get(f3, "s?")
        return f"{m} {rn(rs2)}, {imm_s}({rn(rs1)})"
    if op == 0x13:
        if f3 == 1:
            return f"slli {rn(rd)}, {rn(rs1)}, {rs2}"
        if f3 == 5:
            return f"{'srai' if f7 == 0x20 else 'srli'} {rn(rd)}, {rn(rs1)}, {rs2}"
        m = {0: "addi", 2: "slti", 3: "sltiu", 4: "xori", 6: "ori", 7: "andi"}.get(f3, "?")
        return f"{m} {rn(rd)}, {rn(rs1)}, {imm_i}"
    if op == 0x33:
        if f7 == 1:
            m = {0: "mul", 1: "mulh", 2: "mulhsu", 3: "mulhu",
                 4: "div", 5: "divu", 6: "rem", 7: "remu"}.get(f3, "?")
        else:
            m = {0: "sub" if f7 == 0x20 else "add", 1: "sll", 2: "slt", 3: "sltu",
                 4: "xor", 5: "sra" if f7 == 0x20 else "srl", 6: "or", 7: "and"}.get(f3, "?")
        return f"{m} {rn(rd)}, {rn(rs1)}, {rn(rs2)}"
    return f"0x{x:08x}"


def load_trace(path):
    with open(path) as f:
        lines = [ln.strip().replace("\r", "") for ln in f if ln.strip()]
    header = lines[0].split(",")
    cycles = []
    for line in lines[1:]:
        cols = line.split(",")
        vals = [int(c, 2) if c and set(c) <= set("01") else 0 for c in cols]
        row = dict(zip(header, vals))
        instr = row["RequestedInstruction"]
        cycles.append({
            "t": row["TimeStep"],
            "pc": row["RequestedAddress"],
            "instr": instr,
            "dis": disasm(instr),
            "regs": [row[r] for r in TRACE_REGS],
        })
    return cycles


def main():
    if len(sys.argv) < 2:
        print("usage: trace_to_js.py name=trace.out [name=trace.out ...]", file=sys.stderr)
        sys.exit(1)
    out = {}
    for arg in sys.argv[1:]:
        name, path = arg.split("=", 1)
        out[name] = load_trace(path)
    print("// Generated from real-circuit Logisim traces. Do not edit by hand.")
    print(f"window.TRACE_REGS = {json.dumps(TRACE_REGS)};")
    print("window.TRACES = {")
    for name, cycles in out.items():
        print(f"  {json.dumps(name)}: [")
        for c in cycles:
            print(f"    {{t:{c['t']},pc:{c['pc']},instr:{c['instr']},"
                  f"dis:{json.dumps(c['dis'])},regs:{c['regs']}}},")
        print("  ],")
    print("};")


if __name__ == "__main__":
    main()
