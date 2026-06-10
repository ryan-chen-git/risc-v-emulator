#include "circ.hpp"
#include "net.hpp"
#include <cstdio>
#include <map>

static void print_summary(const CircFile& cf) {
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
    }
}

static void dump_netlist(const Circuit& c, const CircFile& cf) {
    Netlist nl = build_netlist(c, cf);
    std::printf("circuit '%s': %d nets, %zu orphan wire-ends\n",
                c.name.c_str(), nl.num_nets, nl.orphans.size());
    for (const Point& o : nl.orphans)
        std::printf("  ORPHAN at (%d,%d)  <- a pin geometry is missing/wrong here\n", o.x, o.y);
    std::printf("component pins -> net id:\n");
    for (size_t i = 0; i < c.comps.size(); i++) {
        const Comp& comp = c.comps[i];
        if (comp.name == "Text") continue;
        std::printf("  %-12s @(%4d,%4d)", comp.name.c_str(), comp.loc.x, comp.loc.y);
        if (comp.has("label")) std::printf(" [%s]", comp.attr("label").c_str());
        for (size_t j = 0; j < nl.pins[i].size(); j++)
            std::printf("   %s(%d,%d)=n%d",
                        nl.pins[i][j].role.c_str(), nl.pins[i][j].pt.x,
                        nl.pins[i][j].pt.y, nl.pin_net[i][j]);
        std::printf("\n");
    }
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::printf("usage: sim <file.circ> [circuit]\n");
        return 1;
    }
    CircFile cf = parse_circ(argv[1]);
    if (argc >= 3) {
        auto it = cf.circuits.find(argv[2]);
        if (it == cf.circuits.end()) {
            std::printf("no circuit named '%s'\n", argv[2]);
            return 1;
        }
        dump_netlist(it->second, cf);
    } else {
        print_summary(cf);
    }
    return 0;
}
