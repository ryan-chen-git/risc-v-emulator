#include "engine.hpp"

u32 Engine::memread(u32 addr) const {
    auto it = mem.find(addr >> 2);
    return it == mem.end() ? 0u : it->second;
}

void Engine::memwrite(u32 addr, u32 data, u32 mask) {
    u32 w = memread(addr);
    mem[addr >> 2] = (w & ~mask) | (data & mask);
}

void Engine::reset() {
    pc = 0; exi = 0x13; expc = 0; expcp4 = 0; num_cycles = 0;
    for (u32& r : regs) r = 0;
}

void Engine::load(const std::vector<u32>& prog) {
    reset();
    mem.clear();
    for (size_t i = 0; i < prog.size(); i++) mem[(u32)i] = prog[i];
}

void Engine::step() {
    u32 cur_pc = pc;

    // ---- stage 1: fetch ----
    u32 instr = memread(cur_pc);
    u32 pcp4 = cur_pc + 4;

    // ---- stage 2: decode / execute / mem / writeback (on latched exi) ----
    u32 op = exi & 0x7f, f3 = (exi >> 12) & 7;
    u32 rs1 = (exi >> 15) & 0x1f, rs2 = (exi >> 20) & 0x1f, rd = (exi >> 7) & 0x1f;
    u32 rd1 = regs[rs1], rd2 = regs[rs2];

    bool brun = (op == 0x63 && (f3 == 6 || f3 == 7));
    bool breq, brlt;
    branch_comp(rd1, rd2, brun, breq, brlt);

    Control c = control_logic(exi, breq, brlt);
    u32 imm = imm_gen(exi);
    u32 A = c.asel ? expc : rd1;
    u32 B = c.bsel ? imm : rd2;
    u32 alures = alu_op(A, B, c.alusel);
    u32 memaddr = alures;
    u32 memrd = (c.memen && !c.memwr) ? memread(memaddr) : 0;
    u32 dataToReg = partial_load(memrd, memaddr, f3);
    u32 writeData = (c.wbsel == 0) ? alures : (c.wbsel == 1) ? dataToReg : expcp4;

    // ---- record named signals for the viewer ----
    sig.clear();
    sig["ProgramCounter"] = cur_pc;  sig["Instruction"] = instr;  sig["pcp4"] = pcp4;
    sig["exi"] = exi;  sig["expc"] = expc;  sig["expcp4"] = expcp4;
    sig["ReadData1"] = rd1;  sig["ReadData2"] = rd2;  sig["Immediate"] = imm;
    sig["ASelOut"] = A;  sig["BSelOut"] = B;  sig["ALUResult"] = alures;
    sig["WriteData"] = writeData;  sig["DataToReg"] = dataToReg;  sig["MemAddress"] = memaddr;
    sig["ASel"] = c.asel;  sig["BSel"] = c.bsel;  sig["ALUSel"] = c.alusel;
    sig["WBSel"] = c.wbsel;  sig["PCSel"] = c.pcsel;  sig["RegWEn"] = c.regwen;
    sig["BrUn"] = brun;  sig["BrEq"] = breq;  sig["BrLt"] = brlt;
    sig["NextPC"] = c.pcsel ? alures : pcp4;            // PC-select mux output
    sig["NextInstr"] = c.pcsel ? 0x13u : instr;         // instruction-kill mux output
    // Debug register outputs, sampled before this cycle's writeback to match the
    // circuit's registered ra/sp/.../a0 pins.
    sig["ra"] = regs[1];  sig["sp"] = regs[2];  sig["t0"] = regs[5];  sig["t1"] = regs[6];
    sig["t2"] = regs[7];  sig["s0"] = regs[8];  sig["s1"] = regs[9];  sig["a0"] = regs[10];

    // ---- clock edge: commit writes and latch the registers ----
    if (c.memen && c.memwr) {
        StoreOut so = partial_store(rd2, memaddr, f3);
        memwrite(memaddr, so.data, so.mask);
    }
    if (c.regwen && rd != 0) regs[rd] = writeData;

    pc = c.pcsel ? alures : pcp4;
    exi = c.pcsel ? 0x13 : instr;   // kill the fetched instruction on a taken branch
    expc = cur_pc;
    expcp4 = pcp4;
    num_cycles++;
}
