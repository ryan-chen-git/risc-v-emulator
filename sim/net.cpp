#include "net.hpp"
#include <map>
#include <set>

static int iattr(const Comp& c, const std::string& k, int def) {
    std::string v = c.attr(k);
    if (v.empty()) return def;
    try { return std::stoi(v); } catch (...) { return def; }
}

// East-facing base offset (dx,dy) transformed by the component's facing.
static Point off(const std::string& facing, int dx, int dy, Point loc) {
    int x = dx, y = dy;
    if (facing == "west")       { x = -dx; y = -dy; }
    else if (facing == "north") { x =  dy; y = -dx; }
    else if (facing == "south") { x = -dy; y =  dx; }
    return { loc.x + x, loc.y + y };
}

std::vector<PinRef> component_pins(const Comp& c, const CircFile& cf) {
    (void)cf;
    std::vector<PinRef> pins;
    std::string facing = c.attr("facing", "east");
    int w = iattr(c, "width", 1);

    if (c.name == "Pin") {
        bool out = c.attr("output") == "true";
        pins.push_back({ c.loc, out, w, out ? "out" : "in" });
    } else if (c.name == "Tunnel") {
        pins.push_back({ c.loc, false, w, "tunnel" });
    } else if (c.name == "Constant") {
        pins.push_back({ c.loc, true, w, "out" });
    } else if (c.name == "Adder" || c.name == "Subtractor" ||
               c.name == "Multiplier" || c.name == "Comparator") {
        pins.push_back({ off(facing, -40, -10, c.loc), false, w, "in0" });
        pins.push_back({ off(facing, -40,  10, c.loc), false, w, "in1" });
        pins.push_back({ c.loc, true, w, "out" });
    } else if (c.name == "Shifter") {
        pins.push_back({ off(facing, -40, -10, c.loc), false, w, "in0" });
        pins.push_back({ off(facing, -40,  10, c.loc), false, 5, "shamt" });
        pins.push_back({ c.loc, true, w, "out" });
    } else if (c.name == "Multiplexer") {
        int sel = iattr(c, "select", 1);
        int n = 1 << sel;
        if (sel == 1) {
            pins.push_back({ off(facing, -30, -10, c.loc), false, w, "in0" });
            pins.push_back({ off(facing, -30,  10, c.loc), false, w, "in1" });
            pins.push_back({ off(facing, -20,  20, c.loc), false, sel, "sel" });
        } else {
            for (int k = 0; k < n; k++) {
                int y = -((n - 1) * 10) + k * 20;  // centered, spaced 20
                pins.push_back({ off(facing, -60, y, c.loc), false, w, "in" + std::to_string(k) });
            }
            pins.push_back({ off(facing, -20, 30, c.loc), false, sel, "sel" });
        }
        pins.push_back({ c.loc, true, w, "out" });
    } else if (c.name == "Register") {
        pins.push_back({ off(facing,  0, 30, c.loc), false, w, "D" });
        pins.push_back({ off(facing, 70, 30, c.loc), true,  w, "Q" });
        pins.push_back({ off(facing,  0, 70, c.loc), false, 1, "clk" });
    }
    // Splitter, Bit Extender, and subcircuit instances are added next.
    return pins;
}

Netlist build_netlist(const Circuit& circ, const CircFile& cf) {
    // Union-find over coordinates.
    std::map<Point, int> idx;
    std::vector<int> parent;
    auto getid = [&](Point p) -> int {
        auto it = idx.find(p);
        if (it != idx.end()) return it->second;
        int n = (int)parent.size();
        idx[p] = n; parent.push_back(n);
        return n;
    };
    auto find = [&parent](int x) {
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    };
    auto uni = [&](Point a, Point b) { parent[find(getid(a))] = find(getid(b)); };

    for (const Wire& wr : circ.wires) uni(wr.a, wr.b);

    Netlist nl;
    nl.pins.resize(circ.comps.size());
    std::set<Point> pin_points;
    for (size_t i = 0; i < circ.comps.size(); i++) {
        nl.pins[i] = component_pins(circ.comps[i], cf);
        for (const PinRef& p : nl.pins[i]) { getid(p.pt); pin_points.insert(p.pt); }
    }

    // Tunnels with the same label are one net.
    std::map<std::string, std::vector<Point>> tun;
    for (const Comp& c : circ.comps)
        if (c.name == "Tunnel") tun[c.attr("label")].push_back(c.loc);
    for (auto& [lbl, pts] : tun) {
        (void)lbl;
        for (size_t k = 1; k < pts.size(); k++) uni(pts[0], pts[k]);
    }

    // Compress net ids.
    std::map<int, int> netmap;
    auto net_of = [&](Point p) -> int {
        int r = find(getid(p));
        auto it = netmap.find(r);
        if (it != netmap.end()) return it->second;
        int n = (int)netmap.size();
        netmap[r] = n;
        return n;
    };
    nl.pin_net.resize(circ.comps.size());
    for (size_t i = 0; i < circ.comps.size(); i++)
        for (const PinRef& p : nl.pins[i]) nl.pin_net[i].push_back(net_of(p.pt));
    nl.num_nets = (int)netmap.size();

    // Self-check: a wire endpoint touched by only one wire and not coincident
    // with any component pin is dangling, which means a pin geometry is wrong.
    std::map<Point, int> deg;
    for (const Wire& wr : circ.wires) { deg[wr.a]++; deg[wr.b]++; }
    for (auto& [pt, d] : deg)
        if (d == 1 && !pin_points.count(pt)) nl.orphans.push_back(pt);

    return nl;
}
