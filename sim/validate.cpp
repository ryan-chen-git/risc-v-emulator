#include "engine.hpp"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

// Parse a 32-char binary string into a word.
static u32 binval(const std::string& s) {
    u32 v = 0;
    for (char c : s) v = (v << 1) | (u32)(c == '1');
    return v;
}

// Validate the engine against a Logisim .piperef golden trace: rebuild the
// instruction memory from the (RequestedAddress, RequestedInstruction) pairs,
// run the engine, and diff every column cycle by cycle.
int main(int argc, char** argv) {
    if (argc < 2) {
        std::printf("usage: validate <piperef.csv>\n");
        return 1;
    }
    std::ifstream f(argv[1]);
    std::string line;
    std::getline(f, line);  // header

    struct Row { u32 r[8], addr, instr; };
    std::vector<Row> rows;
    while (std::getline(f, line)) {
        if (line.empty()) continue;
        std::vector<std::string> col;
        std::stringstream ss(line);
        std::string c;
        while (std::getline(ss, c, ',')) col.push_back(c);
        if (col.size() < 11) continue;
        Row row;
        for (int i = 0; i < 8; i++) row.r[i] = binval(col[i]);
        row.addr = binval(col[8]);
        row.instr = binval(col[9]);
        rows.push_back(row);
    }

    Engine e;
    e.reset();
    for (const Row& row : rows) e.mem[row.addr >> 2] = row.instr;  // instruction memory

    const char* names[8] = {"ra", "sp", "t0", "t1", "t2", "s0", "s1", "a0"};
    int ok = 0, bad = 0;
    for (size_t k = 0; k < rows.size(); k++) {
        e.step();
        const Row& row = rows[k];
        bool match = (e.sig["ProgramCounter"] == row.addr) && (e.sig["Instruction"] == row.instr);
        for (int i = 0; i < 8; i++) match = match && (e.sig[names[i]] == row.r[i]);
        if (match) { ok++; continue; }
        bad++;
        if (bad <= 10) {
            std::printf("MISMATCH ts=%zu  addr me=%u ref=%u  instr me=%08x ref=%08x\n",
                        k, e.sig["ProgramCounter"], row.addr, e.sig["Instruction"], row.instr);
            for (int i = 0; i < 8; i++)
                if (e.sig[names[i]] != row.r[i])
                    std::printf("    %s me=%u ref=%u\n", names[i], e.sig[names[i]], row.r[i]);
        }
    }
    std::printf("%s: matched %d/%zu rows (%d mismatch)\n", argv[1], ok, rows.size(), bad);
    return bad == 0 ? 0 : 1;
}
