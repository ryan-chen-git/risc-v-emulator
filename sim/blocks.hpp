#pragma once
#include <cstdint>

using u32 = uint32_t;
using i32 = int32_t;

// Control word produced by the control-logic block from the stage-2 instruction
// (and the branch comparator result, which decides a taken branch).
struct Control {
    u32  alusel = 0;    // ALU operation, alu.circ encoding
    bool asel   = false;  // ALU A: false=ReadData1, true=PC (expc)
    bool bsel   = false;  // ALU B: false=ReadData2, true=Immediate
    bool brun   = false;  // branch comparator unsigned
    bool regwen = false;  // register write enable
    bool memwr  = false;  // data memory write
    bool memen  = false;  // data memory access (load or store)
    u32  wbsel  = 0;      // writeback: 0=ALUResult, 1=mem load, 2=PC+4
    bool pcsel  = false;  // next PC: false=PC+4, true=ALUResult (branch/jump)
};

// The seven modeled subcircuit blocks.
void  branch_comp(u32 a, u32 b, bool brun, bool& eq, bool& lt);
Control control_logic(u32 inst, bool br_eq, bool br_lt);
u32   imm_gen(u32 inst);
u32   alu_op(u32 a, u32 b, u32 alusel);
u32   partial_load(u32 memword, u32 addr, u32 funct3);

struct StoreOut { u32 data; u32 mask; };  // mask: byte-enable bits for the word
StoreOut partial_store(u32 rs2, u32 addr, u32 funct3);
