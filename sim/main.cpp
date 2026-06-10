#include "circ.hpp"
#include <cstdio>
#include <map>

// Phase 1 driver: parse a .circ and print what we found, so we can confirm the
// parser sees the real structure before we build the netlist and engine on it.
int main(int argc, char** argv) {
    if (argc < 2) {
        std::printf("usage: sim <file.circ>\n");
        return 1;
    }
    CircFile cf = parse_circ(argv[1]);

    std::printf("main circuit: %s\n", cf.main.c_str());
    std::printf("libraries:\n");
    for (const auto& [idx, desc] : cf.libs)
        std::printf("  lib %2d = %s\n", idx, desc.c_str());

    std::printf("circuits: %zu\n", cf.circuits.size());
    for (const auto& [name, c] : cf.circuits) {
        std::printf("\n  circuit '%s'  (%zu comps, %zu wires, %zu ports)\n",
                    name.c_str(), c.comps.size(), c.wires.size(), c.ports.size());
        std::map<std::string, int> hist;
        for (const Comp& comp : c.comps) hist[comp.name]++;
        for (const auto& [n, cnt] : hist)
            std::printf("      %3d x %s\n", cnt, n.c_str());
        if (!c.ports.empty()) {
            std::printf("      ports:");
            for (const Port& p : c.ports)
                std::printf(" %s(%d,%d)", p.dir.c_str(), p.pin.x, p.pin.y);
            std::printf("\n");
        }
    }
    return 0;
}
