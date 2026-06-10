#pragma once
#include <string>
#include <vector>
#include <map>

struct Point {
    int x = 0, y = 0;
    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
    bool operator<(const Point& o) const { return x != o.x ? x < o.x : y < o.y; }
};

// One placed component (a gate, mux, splitter, pin, tunnel, or subcircuit instance).
struct Comp {
    std::string name;   // "AND Gate", "Multiplexer", "Splitter", "Pin", "add0", ...
    int lib = -1;       // library index; -1 for a same-file subcircuit instance
    Point loc;
    std::map<std::string, std::string> attrs;

    std::string attr(const std::string& k, const std::string& def = "") const {
        auto it = attrs.find(k);
        return it == attrs.end() ? def : it->second;
    }
    bool has(const std::string& k) const { return attrs.count(k) != 0; }
};

struct Wire { Point a, b; };

// A circuit's external port, taken from its <appear><circ-port> block.
// `pin` is the location of the Pin component this port maps to.
struct Port { std::string dir; Point pin; };  // dir = "in" | "out"

struct Circuit {
    std::string name;
    std::vector<Comp> comps;
    std::vector<Wire> wires;
    std::vector<Port> ports;
};

struct CircFile {
    std::string main;                  // name of the main circuit
    std::map<int, std::string> libs;   // lib index -> descriptor ("#Wiring", "file#alu.circ", ...)
    std::map<std::string, Circuit> circuits;
};

CircFile parse_circ(const std::string& path);
