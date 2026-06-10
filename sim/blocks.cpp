#include "blocks.hpp"
#include <cstdint>

using i64 = int64_t;
using u64 = uint64_t;

static u32 opcode(u32 i) { return i & 0x7f; }
static u32 funct3(u32 i) { return (i >> 12) & 0x7; }
static u32 funct7(u32 i) { return (i >> 25) & 0x7f; }

// ---- immediate generator -------------------------------------------------
u32 imm_gen(u32 i) {
    switch (opcode(i)) {
        case 0x13: case 0x03: case 0x67:  // I-type: addi/load/jalr
            return (u32)((i32)i >> 20);
        case 0x23:                        // S-type: store
            return (u32)(((i32)(i & 0xfe000000) >> 20) | ((i >> 7) & 0x1f));
        case 0x63: {                      // B-type: branch
            u32 imm = (((i >> 31) & 1) << 12) | (((i >> 7) & 1) << 11) |
                      (((i >> 25) & 0x3f) << 5) | (((i >> 8) & 0xf) << 1);
            return (u32)((i32)(imm << 19) >> 19);
        }
        case 0x37: case 0x17:             // U-type: lui/auipc
            return i & 0xfffff000;
        case 0x6f: {                      // J-type: jal
            u32 imm = (((i >> 31) & 1) << 20) | (((i >> 12) & 0xff) << 12) |
                      (((i >> 20) & 1) << 11) | (((i >> 21) & 0x3ff) << 1);
            return (u32)((i32)(imm << 11) >> 11);
        }
    }
    return 0;
}

// ---- ALU (alu.circ encoding) ---------------------------------------------
u32 alu_op(u32 a, u32 b, u32 sel) {
    u32 sh = b & 31;
    switch (sel) {
        case 0:  return a + b;                                   // add
        case 1:  return a << sh;                                 // sll
        case 2:  return ((i32)a < (i32)b) ? 1 : 0;               // slt
        case 3:  return (a < b) ? 1 : 0;                         // sltu
        case 4:  return a ^ b;                                   // xor
        case 5:  return a >> sh;                                 // srl
        case 6:  return a | b;                                   // or
        case 7:  return a & b;                                   // and
        case 8:  return (u32)((i32)a * (i32)b);                  // mul
        case 9:  return (u32)(((i64)(i32)a * (i64)(i32)b) >> 32);    // mulh
        case 10: return (u32)(((i64)(i32)a * (u64)b) >> 32);         // mulhsu
        case 11: return (u32)(((u64)a * (u64)b) >> 32);              // mulhu
        case 12: return a - b;                                   // sub
        case 13: return (u32)((i32)a >> sh);                     // sra
        case 15: return b;                                       // bsel (pass B, for lui)
    }
    return 0;
}

// ALU select for R-type and I-type ALU ops, from funct3/funct7.
static u32 alusel_alu(u32 inst, bool is_rtype) {
    u32 f3 = funct3(inst), f7 = funct7(inst);
    if (is_rtype && f7 == 0x01) {  // RV32M
        return 8 + f3;             // mul,mulh,mulhsu,mulhu,div,divu,rem,remu (8..15)
    }
    switch (f3) {
        case 0: return (is_rtype && (f7 & 0x20)) ? 12 : 0;  // add/sub
        case 1: return 1;                                    // sll
        case 2: return 2;                                    // slt
        case 3: return 3;                                    // sltu
        case 4: return 4;                                    // xor
        case 5: return (f7 & 0x20) ? 13 : 5;                 // sra/srl
        case 6: return 6;                                    // or
        case 7: return 7;                                    // and
    }
    return 0;
}

// ---- branch comparator ---------------------------------------------------
void branch_comp(u32 a, u32 b, bool brun, bool& eq, bool& lt) {
    eq = (a == b);
    lt = brun ? (a < b) : ((i32)a < (i32)b);
}

// ---- control logic -------------------------------------------------------
Control control_logic(u32 inst, bool br_eq, bool br_lt) {
    Control c;
    u32 op = opcode(inst), f3 = funct3(inst);
    switch (op) {
        case 0x33:  // R-type
            c.alusel = alusel_alu(inst, true);
            c.asel = false; c.bsel = false; c.regwen = true; c.wbsel = 0;
            break;
        case 0x13:  // I-type ALU
            c.alusel = alusel_alu(inst, false);
            c.asel = false; c.bsel = true; c.regwen = true; c.wbsel = 0;
            break;
        case 0x03:  // load
            c.alusel = 0; c.asel = false; c.bsel = true;
            c.regwen = true; c.memen = true; c.wbsel = 1;
            break;
        case 0x23:  // store
            c.alusel = 0; c.asel = false; c.bsel = true;
            c.memen = true; c.memwr = true;
            break;
        case 0x63: {  // branch
            c.alusel = 0; c.asel = true; c.bsel = true;
            c.brun = (f3 == 6 || f3 == 7);  // bltu/bgeu
            bool taken = false;
            switch (f3) {
                case 0: taken = br_eq; break;            // beq
                case 1: taken = !br_eq; break;           // bne
                case 4: case 6: taken = br_lt; break;    // blt/bltu
                case 5: case 7: taken = !br_lt; break;   // bge/bgeu
            }
            c.pcsel = taken;
            break;
        }
        case 0x67:  // jalr
            c.alusel = 0; c.asel = false; c.bsel = true;
            c.regwen = true; c.wbsel = 2; c.pcsel = true;
            break;
        case 0x6f:  // jal
            c.alusel = 0; c.asel = true; c.bsel = true;
            c.regwen = true; c.wbsel = 2; c.pcsel = true;
            break;
        case 0x37:  // lui
            c.alusel = 15; c.asel = false; c.bsel = true; c.regwen = true; c.wbsel = 0;
            break;
        case 0x17:  // auipc
            c.alusel = 0; c.asel = true; c.bsel = true; c.regwen = true; c.wbsel = 0;
            break;
    }
    return c;
}

// ---- partial load: extract the accessed bytes from a memory word ---------
u32 partial_load(u32 memword, u32 addr, u32 f3) {
    u32 sh = (addr & 3) * 8;
    u32 v = memword >> sh;
    switch (f3) {
        case 0: return (u32)(i32)(int8_t)(v & 0xff);     // lb
        case 1: return (u32)(i32)(int16_t)(v & 0xffff);  // lh
        case 2: return memword;                          // lw
        case 4: return v & 0xff;                          // lbu
        case 5: return v & 0xffff;                        // lhu
    }
    return memword;
}

// ---- partial store: place rs2 into the word with a byte-enable mask -------
StoreOut partial_store(u32 rs2, u32 addr, u32 f3) {
    u32 sh = (addr & 3) * 8;
    switch (f3) {
        case 0: return { rs2 << sh, 0xffu << sh };       // sb
        case 1: return { rs2 << sh, 0xffffu << sh };     // sh
        default: return { rs2, 0xffffffffu };            // sw
    }
}
