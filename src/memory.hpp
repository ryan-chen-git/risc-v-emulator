#pragma once
#include <unordered_map>
#include "types.hpp"

// Sparse, byte-addressable, little-endian memory.
// Unified instruction + data memory (just like the real machine).
class Memory {
public:
    u8 read8(u32 addr) const {
        auto it = bytes_.find(addr);
        return it == bytes_.end() ? u8(0) : it->second;
    }
    void write8(u32 addr, u8 v) { bytes_[addr] = v; }

    u16 read16(u32 addr) const {
        return u16(read8(addr)) | (u16(read8(addr + 1)) << 8);
    }
    void write16(u32 addr, u16 v) {
        write8(addr, u8(v));
        write8(addr + 1, u8(v >> 8));
    }

    u32 read32(u32 addr) const {
        return u32(read8(addr))
             | (u32(read8(addr + 1)) << 8)
             | (u32(read8(addr + 2)) << 16)
             | (u32(read8(addr + 3)) << 24);
    }
    void write32(u32 addr, u32 v) {
        write8(addr, u8(v));
        write8(addr + 1, u8(v >> 8));
        write8(addr + 2, u8(v >> 16));
        write8(addr + 3, u8(v >> 24));
    }

private:
    std::unordered_map<u32, u8> bytes_;
};
