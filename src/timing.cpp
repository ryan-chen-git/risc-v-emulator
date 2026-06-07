#include "timing.hpp"
#include <algorithm>

// A load followed immediately by a dependent instruction stalls one cycle
// even with full forwarding: the loaded value is not ready until after MEM.
static long count_load_use(const std::vector<Retired>& log) {
    long n = 0;
    for (size_t i = 0; i + 1 < log.size(); ++i) {
        const Retired& a = log[i];
        const Retired& b = log[i + 1];
        if (!a.is_load || !a.writes_rd || a.rd == 0) continue;
        bool dep = (b.reads_rs1 && b.rs1 == a.rd) ||
                   (b.reads_rs2 && b.rs2 == a.rd);
        if (dep) ++n;
    }
    return n;
}

static long count_taken(const std::vector<Retired>& log) {
    long n = 0;
    for (const Retired& r : log)
        if (r.taken) ++n;
    return n;
}

Comparison analyze(const std::vector<Retired>& log, StageDelays d) {
    Comparison c;
    const long N = static_cast<long>(log.size());
    c.load_use_stalls = count_load_use(log);
    c.taken_control   = count_taken(log);

    const double full     = d.imem + d.regread + d.alu + d.dmem + d.regwrite;
    const double back     = d.regread + d.alu + d.dmem + d.regwrite;
    const double maxstage = std::max({d.imem, d.regread, d.alu, d.dmem, d.regwrite});

    // Single-cycle: one cycle per instruction, clock set by the worst case
    // (load) path through the entire datapath.
    c.single.name     = "single-cycle";
    c.single.cycles   = N;
    c.single.clock_ps = full;

    // Two-stage: fetch in stage 1, everything else in stage 2. One fill cycle
    // plus one flushed instruction per taken control transfer.
    c.two.name     = "2-stage";
    c.two.cycles   = N + 1 + c.taken_control;
    c.two.clock_ps = std::max(d.imem, back);

    // Five-stage with full forwarding: four fill cycles, one bubble per
    // load-use hazard, two bubbles per taken control transfer.
    c.five.name     = "5-stage";
    c.five.cycles   = N + 4 + c.load_use_stalls + 2 * c.taken_control;
    c.five.clock_ps = maxstage;

    TimingResult* all[3] = {&c.single, &c.two, &c.five};
    for (TimingResult* r : all) {
        r->instructions = N;
        r->cpi     = N ? double(r->cycles) / double(N) : 0.0;
        r->time_ns = r->cycles * r->clock_ps / 1000.0;
    }
    const double base = c.single.time_ns;
    for (TimingResult* r : all)
        r->speedup = r->time_ns ? base / r->time_ns : 0.0;

    return c;
}
