#pragma once
#include "blocks.hpp"
#include <map>
#include <string>
#include <vector>

// Cycle-stepped 2-stage datapath: stage 1 fetches at ProgramCounter, stage 2
// executes the latched instruction (exi) with the latched PC values. The
// top-level muxes and registers are the ones reconstructed from cpu.circ; the
// seven blocks are the modeled subcircuit functions. Memory is the harness.
struct Engine {
    u32 pc = 0;
    u32 exi = 0x13;          // instruction pipeline register (0x13 = nop bubble)
    u32 expc = 0, expcp4 = 0;
    u32 num_cycles = 0;
    u32 regs[32] = {};
    std::map<u32, u32> mem;  // shared word-addressed memory (key = addr >> 2)

    std::map<std::string, u32> sig;  // per-cycle named signals, for the viewer

    void load(const std::vector<u32>& prog);
    void reset();
    void step();

    u32  memread(u32 addr) const;
    void memwrite(u32 addr, u32 data, u32 mask);
};
