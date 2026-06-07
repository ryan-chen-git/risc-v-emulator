#pragma once
#include <string>
#include <vector>
#include "trace.hpp"

// Per-stage propagation delays in picoseconds. Defaults are the classic
// textbook figures used to compare single-cycle and pipelined designs.
struct StageDelays {
    double imem     = 200;
    double regread  = 100;
    double alu      = 200;
    double dmem     = 200;
    double regwrite = 100;
};

struct TimingResult {
    std::string name;
    long   instructions = 0;
    long   cycles       = 0;
    double cpi          = 0;
    double clock_ps     = 0;
    double time_ns      = 0;
    double speedup      = 0; // relative to the single-cycle design
};

struct Comparison {
    TimingResult single;
    TimingResult two;
    TimingResult five;
    long load_use_stalls = 0;
    long taken_control   = 0;
};

// Analyze a dynamic instruction stream and produce cycle counts and timing
// for each design under the given stage delay model.
Comparison analyze(const std::vector<Retired>& log, StageDelays d = StageDelays());
