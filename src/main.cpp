#include "cpu.hpp"
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <string>

// Render the low `bits` of v as a big-endian binary string (matches Venus traces).
static std::string to_bin(u32 v, int bits) {
    std::string s(bits, '0');
    for (int i = 0; i < bits; ++i)
        if (v & (1u << i)) s[bits - 1 - i] = '1';
    return s;
}

// Load a Venus `--dump` hex image: one 32-bit word per line, placed
// sequentially from address 0. Non-hex lines are skipped.
static bool load_hex(CPU& cpu, const std::string& path) {
    std::ifstream f(path);
    if (!f) {
        std::fprintf(stderr, "error: cannot open %s\n", path.c_str());
        return false;
    }
    std::string line;
    u32 addr = 0;
    while (std::getline(f, line)) {
        size_t b = line.find_first_not_of(" \t\r\n");
        if (b == std::string::npos) continue;
        size_t e = line.find_last_not_of(" \t\r\n");
        std::string tok = line.substr(b, e - b + 1);
        if (tok.rfind("0x", 0) == 0 || tok.rfind("0X", 0) == 0) tok = tok.substr(2);
        char* endp = nullptr;
        unsigned long word = std::strtoul(tok.c_str(), &endp, 16);
        if (endp == tok.c_str()) continue; // not hex
        cpu.mem.write32(addr, u32(word));
        addr += 4;
    }
    return true;
}

// Registers dumped per cycle, in Venus trace order: ra,sp,t0,t1,t2,s0,s1,a0
static const int TRACE_REGS[8] = {1, 2, 5, 6, 7, 8, 9, 10};
static const char* ABI[32] = {
    "zero","ra","sp","gp","tp","t0","t1","t2","s0","s1","a0","a1",
    "a2","a3","a4","a5","a6","a7","s2","s3","s4","s5","s6","s7",
    "s8","s9","s10","s11","t3","t4","t5","t6"};

int main(int argc, char** argv) {
    std::string load_path;
    bool trace = false;
    long steps = 1000000; // safety cap when not overridden

    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        if      (a == "--load"  && i + 1 < argc) load_path = argv[++i];
        else if (a == "--trace")                 trace = true;
        else if (a == "--steps" && i + 1 < argc) steps = std::atol(argv[++i]);
        else if (a == "--help") {
            std::printf("usage: emu --load <hex> [--trace] [--steps N]\n");
            return 0;
        }
        else if (load_path.empty() && !a.empty() && a[0] != '-') load_path = a;
    }
    if (load_path.empty()) {
        std::fprintf(stderr, "error: no program given (use --load <hex>)\n");
        return 1;
    }

    CPU cpu;
    if (!load_hex(cpu, load_path)) return 1;

    if (trace) {
        std::printf("ra,sp,t0,t1,t2,s0,s1,a0,RequestedAddress,RequestedInstruction,TimeStep\n");
        for (long t = 0; t < steps; ++t) {
            u32 instr = cpu.fetch();
            std::string row;
            for (int k = 0; k < 8; ++k) row += to_bin(cpu.get(TRACE_REGS[k]), 32) + ",";
            row += to_bin(cpu.pc,  32) + ",";
            row += to_bin(instr,   32) + ",";
            row += to_bin(u32(t),  16);
            std::printf("%s\n", row.c_str());
            if (cpu.halted) break;
            cpu.step();
        }
    } else {
        long executed = 0;
        while (!cpu.halted && executed < steps) { cpu.step(); ++executed; }
        std::printf("pc=0x%08x  retired=%llu\n", cpu.pc,
                    (unsigned long long)cpu.retired);
        for (int r = 0; r < 32; ++r)
            std::printf("x%-2d %-4s = 0x%08x  (%d)\n", r, ABI[r],
                        cpu.regs[r], i32(cpu.regs[r]));
    }
    return 0;
}
