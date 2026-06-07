#pragma once
#include <vector>
#include "types.hpp"
#include "memory.hpp"
#include "trace.hpp"

// Architectural state of an RV32IM hart. Phase 0 is a pure functional model:
// step() executes exactly one instruction, updating registers, memory, and pc.
// The timing models in Phase 1 wrap this without changing its results.
class CPU {
public:
    u32 regs[32] = {0};
    u32 pc = 0;
    Memory mem;
    bool halted = false;
    u64 retired = 0;

    // Optional dynamic trace: when set, step() appends one Retired record per
    // executed instruction for the timing models to analyze.
    std::vector<Retired>* reclog = nullptr;

    u32 get(u32 r) const { return r == 0 ? 0u : regs[r]; }
    void set(u32 r, u32 v) { if (r != 0) regs[r] = v; }

    u32 fetch() const { return mem.read32(pc); }
    void step();
};
