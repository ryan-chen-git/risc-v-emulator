#include "engine.hpp"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

// Load a hex program (one 32-bit word per line) and run it. By default print
// the eight debug registers each cycle; with --js emit the full per-cycle
// signal trace as a JavaScript array for the datapath viewer to replay.
int main(int argc, char** argv) {
    if (argc < 2) {
        std::printf("usage: run <prog.hex> [cycles] [--js]\n");
        return 1;
    }
    bool js = false;
    int cycles = 20;
    for (int i = 2; i < argc; i++) {
        if (std::strcmp(argv[i], "--js") == 0) js = true;
        else cycles = std::atoi(argv[i]);
    }

    std::vector<u32> prog;
    std::ifstream f(argv[1]);
    std::string line;
    while (std::getline(f, line)) {
        if (line.empty() || line[0] == '#') continue;
        prog.push_back((u32)std::strtoul(line.c_str(), nullptr, 16));
    }

    Engine e;
    e.load(prog);

    if (js) {
        std::printf("const TRACE = [\n");
        for (int i = 0; i < cycles; i++) {
            e.step();
            std::printf("{\"cyc\":%d", i + 1);
            for (const auto& [k, v] : e.sig) std::printf(",\"%s\":%u", k.c_str(), v);
            std::printf("},\n");
        }
        std::printf("];\n");
        return 0;
    }

    std::printf("cyc |  ra  sp  t0  t1  t2  s0  s1  a0 |   pc  exi\n");
    for (int i = 0; i < cycles; i++) {
        e.step();
        std::printf("%3d | %3u %3u %3u %3u %3u %3u %3u %3u | %4u %08x\n", i + 1,
                    e.regs[1], e.regs[2], e.regs[5], e.regs[6], e.regs[7],
                    e.regs[8], e.regs[9], e.regs[10],
                    e.sig["ProgramCounter"], e.sig["exi"]);
    }
    return 0;
}
