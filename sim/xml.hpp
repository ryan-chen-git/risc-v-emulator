#pragma once
#include <string>
#include <vector>
#include <map>

// Minimal XML tree, sufficient for Logisim .circ files.
struct XmlNode {
    std::string tag;
    std::map<std::string, std::string> attrs;
    std::vector<XmlNode> children;

    const std::string* attr(const std::string& k) const {
        auto it = attrs.find(k);
        return it == attrs.end() ? nullptr : &it->second;
    }
    std::string attr_or(const std::string& k, const std::string& def = "") const {
        const std::string* v = attr(k);
        return v ? *v : def;
    }
};

// Parse XML text. The returned node is a synthetic root whose children are the
// top-level elements (normally just <project>).
XmlNode xml_parse(const std::string& text);
