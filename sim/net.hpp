#pragma once
#include "circ.hpp"
#include <vector>
#include <string>

// One pin of a component: where it sits, whether it drives a value, its bit
// width, and a human-readable role for debugging.
struct PinRef {
    Point pt;
    bool is_output = false;
    int width = 1;
    std::string role;  // "in", "out", "in0", "in1", "clk", "sel", ...
};

// Compute a component's pins from its location and attributes.
std::vector<PinRef> component_pins(const Comp& c, const CircFile& cf);

// The connectivity result for one circuit.
struct Netlist {
    std::vector<std::vector<PinRef>> pins;     // per component, its pins
    std::vector<std::vector<int>> pin_net;     // pins[i][j] -> net id
    int num_nets = 0;
    std::vector<Point> orphans;                // dangling wire ends (geometry check)
};

Netlist build_netlist(const Circuit& circ, const CircFile& cf);
