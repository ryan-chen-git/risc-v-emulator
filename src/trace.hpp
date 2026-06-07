#pragma once
#include "types.hpp"

// One dynamically executed instruction, carrying just enough information for
// the timing models to detect hazards and count cycles.
struct Retired {
    u32 pc  = 0;
    u32 raw = 0;
    u8  rd = 0, rs1 = 0, rs2 = 0;
    bool writes_rd = false;
    bool reads_rs1 = false, reads_rs2 = false;
    bool is_load = false, is_store = false;
    bool is_branch = false, is_jump = false;
    bool taken = false; // control transfer actually taken on this execution
};
