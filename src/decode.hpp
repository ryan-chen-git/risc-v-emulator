#pragma once
#include "types.hpp"

// Decoded RISC-V instruction: raw fields plus every immediate format,
// each already sign-extended to 32 bits.
struct Decoded {
    u32 raw    = 0;
    u32 opcode = 0;
    u32 rd = 0, rs1 = 0, rs2 = 0;
    u32 funct3 = 0, funct7 = 0;
    i32 imm_i = 0, imm_s = 0, imm_b = 0, imm_u = 0, imm_j = 0;
};

inline Decoded decode(u32 raw) {
    Decoded d;
    d.raw    = raw;
    d.opcode = raw & 0x7f;
    d.rd     = (raw >> 7)  & 0x1f;
    d.funct3 = (raw >> 12) & 0x7;
    d.rs1    = (raw >> 15) & 0x1f;
    d.rs2    = (raw >> 20) & 0x1f;
    d.funct7 = (raw >> 25) & 0x7f;

    // I-type: imm[11:0] = raw[31:20], sign-extended
    d.imm_i = i32(raw) >> 20;

    // S-type: imm[11:5] = raw[31:25], imm[4:0] = raw[11:7]
    d.imm_s = ((i32(raw) >> 25) << 5) | i32((raw >> 7) & 0x1f);

    // B-type: imm[12|10:5|4:1|11], bit 0 = 0
    {
        i32 imm = 0;
        imm |= i32((raw >> 31) & 0x1)  << 12;
        imm |= i32((raw >> 7)  & 0x1)  << 11;
        imm |= i32((raw >> 25) & 0x3f) << 5;
        imm |= i32((raw >> 8)  & 0xf)  << 1;
        if (imm & 0x1000) imm |= ~0x1fff;   // sign-extend from bit 12
        d.imm_b = imm;
    }

    // U-type: imm[31:12] = raw[31:12], low 12 bits zero
    d.imm_u = i32(raw & 0xfffff000);

    // J-type: imm[20|10:1|11|19:12], bit 0 = 0
    {
        i32 imm = 0;
        imm |= i32((raw >> 31) & 0x1)   << 20;
        imm |= i32((raw >> 12) & 0xff)  << 12;
        imm |= i32((raw >> 20) & 0x1)   << 11;
        imm |= i32((raw >> 21) & 0x3ff) << 1;
        if (imm & 0x100000) imm |= ~0x1fffff; // sign-extend from bit 20
        d.imm_j = imm;
    }

    return d;
}
