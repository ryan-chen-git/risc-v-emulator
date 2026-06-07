#include "cpu.hpp"
#include "decode.hpp"
#include <cstdio>
#include <cstdint>

void CPU::step() {
    if (halted) return;

    u32 raw = mem.read32(pc);
    Decoded d = decode(raw);
    u32 next_pc = pc + 4;

    switch (d.opcode) {
    case 0x37: // LUI
        set(d.rd, u32(d.imm_u));
        break;

    case 0x17: // AUIPC
        set(d.rd, pc + u32(d.imm_u));
        break;

    case 0x6f: // JAL
        set(d.rd, pc + 4);
        next_pc = pc + u32(d.imm_j);
        break;

    case 0x67: // JALR
        if (d.funct3 == 0) {
            u32 link = pc + 4;
            next_pc = (get(d.rs1) + u32(d.imm_i)) & ~1u;
            set(d.rd, link);
        }
        break;

    case 0x63: { // BRANCH
        u32 a = get(d.rs1), b = get(d.rs2);
        bool take = false;
        switch (d.funct3) {
        case 0x0: take = (a == b);           break; // BEQ
        case 0x1: take = (a != b);           break; // BNE
        case 0x4: take = (i32(a) <  i32(b)); break; // BLT
        case 0x5: take = (i32(a) >= i32(b)); break; // BGE
        case 0x6: take = (a <  b);           break; // BLTU
        case 0x7: take = (a >= b);           break; // BGEU
        }
        if (take) next_pc = pc + u32(d.imm_b);
        break;
    }

    case 0x03: { // LOAD
        u32 addr = get(d.rs1) + u32(d.imm_i);
        u32 val = 0;
        switch (d.funct3) {
        case 0x0: val = u32(i32(i8 (mem.read8 (addr)))); break; // LB
        case 0x1: val = u32(i32(i16(mem.read16(addr)))); break; // LH
        case 0x2: val = mem.read32(addr);                break; // LW
        case 0x4: val = mem.read8 (addr);                break; // LBU
        case 0x5: val = mem.read16(addr);                break; // LHU
        }
        set(d.rd, val);
        break;
    }

    case 0x23: { // STORE
        u32 addr = get(d.rs1) + u32(d.imm_s);
        u32 val  = get(d.rs2);
        switch (d.funct3) {
        case 0x0: mem.write8 (addr, u8 (val)); break; // SB
        case 0x1: mem.write16(addr, u16(val)); break; // SH
        case 0x2: mem.write32(addr,     val ); break; // SW
        }
        break;
    }

    case 0x13: { // OP-IMM
        u32 a = get(d.rs1);
        i32 imm = d.imm_i;
        u32 res = 0;
        switch (d.funct3) {
        case 0x0: res = a + u32(imm);                  break; // ADDI
        case 0x2: res = (i32(a) < imm) ? 1 : 0;        break; // SLTI
        case 0x3: res = (a < u32(imm)) ? 1 : 0;        break; // SLTIU
        case 0x4: res = a ^ u32(imm);                  break; // XORI
        case 0x6: res = a | u32(imm);                  break; // ORI
        case 0x7: res = a & u32(imm);                  break; // ANDI
        case 0x1: res = a << (imm & 0x1f);             break; // SLLI
        case 0x5:
            if (d.funct7 == 0x20) res = u32(i32(a) >> (imm & 0x1f)); // SRAI
            else                  res = a >> (imm & 0x1f);           // SRLI
            break;
        }
        set(d.rd, res);
        break;
    }

    case 0x33: { // OP (register-register)
        u32 a = get(d.rs1), b = get(d.rs2);
        u32 res = 0;
        if (d.funct7 == 0x01) { // RV32M
            switch (d.funct3) {
            case 0x0: res = u32(a * b); break;                              // MUL
            case 0x1: res = u32((__int128(i32(a)) * i32(b)) >> 32); break;  // MULH
            case 0x2: res = u32((__int128(i32(a)) * u32(b)) >> 32); break;  // MULHSU
            case 0x3: res = u32((static_cast<unsigned __int128>(a) * b) >> 32); break; // MULHU
            case 0x4: // DIV
                if (b == 0) res = 0xffffffffu;
                else if (i32(a) == INT32_MIN && i32(b) == -1) res = u32(INT32_MIN);
                else res = u32(i32(a) / i32(b));
                break;
            case 0x5: // DIVU
                res = (b == 0) ? 0xffffffffu : (a / b);
                break;
            case 0x6: // REM
                if (b == 0) res = a;
                else if (i32(a) == INT32_MIN && i32(b) == -1) res = 0;
                else res = u32(i32(a) % i32(b));
                break;
            case 0x7: // REMU
                res = (b == 0) ? a : (a % b);
                break;
            }
        } else {
            switch (d.funct3) {
            case 0x0: res = (d.funct7 == 0x20) ? (a - b) : (a + b); break; // SUB / ADD
            case 0x1: res = a << (b & 0x1f); break;                        // SLL
            case 0x2: res = (i32(a) < i32(b)) ? 1 : 0; break;              // SLT
            case 0x3: res = (a < b) ? 1 : 0; break;                        // SLTU
            case 0x4: res = a ^ b; break;                                  // XOR
            case 0x5:
                if (d.funct7 == 0x20) res = u32(i32(a) >> (b & 0x1f));     // SRA
                else                  res = a >> (b & 0x1f);               // SRL
                break;
            case 0x6: res = a | b; break;                                  // OR
            case 0x7: res = a & b; break;                                  // AND
            }
        }
        set(d.rd, res);
        break;
    }

    case 0x0f: // FENCE -> nop in a single-hart functional model
        break;

    case 0x73: // SYSTEM: ECALL / EBREAK -> stop
        halted = true;
        break;

    case 0x00: // all-zero word: end of program / nop
        break;

    default:
        std::fprintf(stderr, "warning: illegal instruction 0x%08x at pc=0x%08x\n", raw, pc);
        break;
    }

    pc = next_pc;
    ++retired;
}
