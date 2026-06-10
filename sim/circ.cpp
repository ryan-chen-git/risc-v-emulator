#include "circ.hpp"
#include "xml.hpp"
#include <cstdio>
#include <fstream>
#include <sstream>

// Parse "(x,y)" or "x,y" into a Point.
static Point parse_point(const std::string& s) {
    Point p;
    std::string t;
    for (char c : s)
        if (c != '(' && c != ')') t += c;
    std::sscanf(t.c_str(), "%d,%d", &p.x, &p.y);
    return p;
}

static int to_int(const std::string& s, int def) {
    if (s.empty()) return def;
    try { return std::stoi(s); } catch (...) { return def; }
}

CircFile parse_circ(const std::string& path) {
    std::ifstream f(path);
    std::stringstream ss;
    ss << f.rdbuf();
    XmlNode root = xml_parse(ss.str());

    CircFile cf;
    for (const XmlNode& proj : root.children) {
        if (proj.tag != "project") continue;
        for (const XmlNode& el : proj.children) {
            if (el.tag == "lib") {
                cf.libs[to_int(el.attr_or("name"), -1)] = el.attr_or("desc");
            } else if (el.tag == "main") {
                cf.main = el.attr_or("name");
            } else if (el.tag == "circuit") {
                Circuit c;
                c.name = el.attr_or("name");
                for (const XmlNode& ch : el.children) {
                    if (ch.tag == "comp") {
                        Comp comp;
                        comp.name = ch.attr_or("name");
                        comp.lib = ch.attr("lib") ? to_int(*ch.attr("lib"), -1) : -1;
                        comp.loc = parse_point(ch.attr_or("loc"));
                        for (const XmlNode& a : ch.children)
                            if (a.tag == "a" && a.attr("name"))
                                comp.attrs[a.attr_or("name")] = a.attr_or("val");
                        c.comps.push_back(std::move(comp));
                    } else if (ch.tag == "wire") {
                        c.wires.push_back({parse_point(ch.attr_or("from")),
                                           parse_point(ch.attr_or("to"))});
                    } else if (ch.tag == "appear") {
                        for (const XmlNode& pe : ch.children)
                            if (pe.tag == "circ-port")
                                c.ports.push_back({pe.attr_or("dir"),
                                                   parse_point(pe.attr_or("pin"))});
                    }
                }
                cf.circuits[c.name] = std::move(c);
            }
        }
    }
    return cf;
}
