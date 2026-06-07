#pragma once
#include "types.hpp"
#include "memory.hpp"

// Architectural state of an RV32IM hart. Phase 0 = pure functional model:
// step() executes exactly one instruction, updating registers/memory/pc.
// (Phase 1 will wrap this with single-cycle / 2-stage / 5-stage timing.)
class CPU {
public:
    u32 regs[32] = {0};
    u32 pc = 0;
    Memory mem;
    bool halted = false;
    u64 retired = 0;

    u32 get(u32 r) const { return r == 0 ? 0u : regs[r]; }
    void set(u32 r, u32 v) { if (r != 0) regs[r] = v; }

    u32 fetch() const { return mem.read32(pc); }
    void step();
};
