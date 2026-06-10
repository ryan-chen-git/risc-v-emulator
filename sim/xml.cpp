#include "xml.hpp"
#include <cctype>

namespace {

struct Parser {
    const std::string& s;
    size_t i = 0;
    explicit Parser(const std::string& str) : s(str) {}

    void skip_ws() {
        while (i < s.size() && std::isspace((unsigned char)s[i])) i++;
    }
    bool starts(const char* p) const {
        size_t n = 0; while (p[n]) n++;
        return s.compare(i, n, p) == 0;
    }
    // Skip whitespace, comments, processing instructions, doctype, and any
    // free text between tags.
    void skip_misc() {
        for (;;) {
            skip_ws();
            if (starts("<!--")) {
                size_t e = s.find("-->", i);
                i = (e == std::string::npos) ? s.size() : e + 3;
            } else if (starts("<?")) {
                size_t e = s.find("?>", i);
                i = (e == std::string::npos) ? s.size() : e + 2;
            } else if (starts("<!")) {
                size_t e = s.find('>', i);
                i = (e == std::string::npos) ? s.size() : e + 1;
            } else if (i < s.size() && s[i] != '<') {
                size_t e = s.find('<', i);
                i = (e == std::string::npos) ? s.size() : e;
            } else {
                break;
            }
        }
    }
    std::string read_name() {
        size_t start = i;
        while (i < s.size() &&
               (std::isalnum((unsigned char)s[i]) || s[i] == '_' || s[i] == '-' || s[i] == ':'))
            i++;
        return s.substr(start, i - start);
    }
    // Parse one element. Assumes the next non-misc char is '<' of an open tag.
    bool parse_element(XmlNode& out) {
        skip_misc();
        if (i >= s.size() || s[i] != '<' || starts("</")) return false;
        i++;  // consume '<'
        out.tag = read_name();
        for (;;) {  // attributes
            skip_ws();
            if (i >= s.size()) return false;
            if (s[i] == '/') {  // self-closing
                i++; skip_ws();
                if (i < s.size() && s[i] == '>') i++;
                return true;
            }
            if (s[i] == '>') { i++; break; }
            std::string an = read_name();
            skip_ws();
            if (i < s.size() && s[i] == '=') { i++; skip_ws(); }
            if (i < s.size() && s[i] == '"') {
                i++;
                size_t start = i;
                while (i < s.size() && s[i] != '"') i++;
                out.attrs[an] = s.substr(start, i - start);
                if (i < s.size()) i++;  // closing quote
            }
        }
        for (;;) {  // children until </tag>
            skip_misc();
            if (i >= s.size()) break;
            if (starts("</")) {
                i += 2; read_name(); skip_ws();
                if (i < s.size() && s[i] == '>') i++;
                break;
            }
            XmlNode child;
            if (!parse_element(child)) break;
            out.children.push_back(std::move(child));
        }
        return true;
    }
};

}  // namespace

XmlNode xml_parse(const std::string& text) {
    XmlNode root;
    root.tag = "#root";
    Parser p(text);
    for (;;) {
        p.skip_misc();
        if (p.i >= text.size() || p.starts("</")) break;
        XmlNode child;
        if (!p.parse_element(child)) break;
        root.children.push_back(std::move(child));
    }
    return root;
}
