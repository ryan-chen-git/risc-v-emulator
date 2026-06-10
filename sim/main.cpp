#include "circ.hpp"
#include "net.hpp"
#include <cstdio>
#include <cstdlib>
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
    for (const Point& o : nl.orphans) {
        const Comp* best = nullptr;
        int bd = 1 << 30;
        for (const Comp& comp : c.comps) {
            if (comp.name == "Text") continue;
            if (!component_pins(comp, cf).empty()) continue;  // only un-geometried types
            int d = std::abs(comp.loc.x - o.x) + std::abs(comp.loc.y - o.y);
            if (d < bd) { bd = d; best = &comp; }
        }
        if (best)
            std::printf("  ORPHAN near=%-12s delta=(%+d,%+d)  at=(%d,%d)\n",
                        best->name.c_str(), o.x - best->loc.x, o.y - best->loc.y, o.x, o.y);
        else
            std::printf("  ORPHAN at=(%d,%d)  (no un-geometried comp nearby)\n", o.x, o.y);
    }
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

// For each mux/register/splitter, list nearby connection points (wire ends and
// tunnels) with deltas and labels, to read off exact pin geometry and signals.
static void dump_geom(const Circuit& c, int radius) {
    struct CP { Point pt; std::string label, kind; };
    std::vector<CP> cps;
    for (const Wire& w : c.wires) { cps.push_back({w.a, "", "wire"}); cps.push_back({w.b, "", "wire"}); }
    for (const Comp& comp : c.comps) {
        if (comp.name == "Tunnel") cps.push_back({comp.loc, comp.attr("label"), "tunnel"});
        else if (comp.name == "Pin") cps.push_back({comp.loc, comp.attr("label"), "PIN"});
    }
    for (const Comp& comp : c.comps) {
        if (comp.name != "Multiplexer" && comp.name != "Register" && comp.name != "Splitter")
            continue;
        std::printf("\n%s @(%d,%d) select=%s width=%s facing=%s:\n",
                    comp.name.c_str(), comp.loc.x, comp.loc.y,
                    comp.attr("select", "-").c_str(), comp.attr("width", "-").c_str(),
                    comp.attr("facing", "east").c_str());
        for (const CP& cp : cps) {
            int d = std::abs(cp.pt.x - comp.loc.x) + std::abs(cp.pt.y - comp.loc.y);
            if (d <= radius)
                std::printf("   delta(%+4d,%+4d) %-7s %s\n",
                            cp.pt.x - comp.loc.x, cp.pt.y - comp.loc.y, cp.kind.c_str(), cp.label.c_str());
        }
    }
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::printf("usage: sim <file.circ> [circuit] [geom]\n");
        return 1;
    }
    CircFile cf = parse_circ(argv[1]);
    if (argc >= 3) {
        auto it = cf.circuits.find(argv[2]);
        if (it == cf.circuits.end()) {
            std::printf("no circuit named '%s'\n", argv[2]);
            return 1;
        }
        if (argc >= 4 && std::string(argv[3]) == "geom")
            dump_geom(it->second, argc >= 5 ? std::atoi(argv[4]) : 50);
        else dump_netlist(it->second, cf);
    } else {
        print_summary(cf);
    }
    return 0;
}
