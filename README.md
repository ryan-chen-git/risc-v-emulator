# risc-v-emulator

A cycle-accurate RISC-V (RV32IM) emulator with a browser visualization that
runs single-cycle, 2-stage, and 5-stage datapaths side by side, so you can
watch the pipeline speedup happen in real time and drive the machine with
interactive input.

Built in C++ (core) compiled to WebAssembly, with a JavaScript front end.

## Status: Phase 0 (functional core)

A working functional RV32IM interpreter: fetch, decode, and execute over
architectural state (32 registers, PC, unified little-endian memory). This is
the correctness foundation; the timing models and UI build on top of it.

It is validated against the Venus reference traces from CS61C Project 3: each
test program is assembled with Venus (--dump) and its per-cycle register trace
is diffed against the course .ref files.

### Build and test (in WSL)

```bash
make            # builds build/emu
make test       # assembles each tests/asm/*.s with Venus and diffs the trace
```

### Run one program

```bash
java -jar tools/venus.jar tests/asm/programs-fib.s --dump > build/fib.hex
build/emu --load build/fib.hex --trace --steps 50   # per-cycle trace
build/emu --load build/fib.hex                       # final register dump
```

## Layout

```
src/        emulator core
  types.hpp     fixed-width integer aliases
  memory.hpp    sparse byte-addressable little-endian memory
  decode.hpp    instruction decode and all immediate formats
  cpu.hpp/.cpp  architectural state and single-instruction step()
  main.cpp      CLI driver (trace and final-state modes)
tools/      venus.jar (assembler and reference oracle, copied from proj3)
tests/      asm/  RISC-V programs (.s)   ref/  Venus reference traces (.ref)
            run_oracle.sh  assemble, run, and diff
```

## Roadmap

1. Functional core (done): RV32IM, validated against the Venus traces.
2. Timing models: clock the core as single-cycle, 2-stage, and 5-stage;
   per-cycle signal snapshots, stage delay and clock model, cycle and CPI
   counters; race all three headless.
3. WASM bridge: compile to WebAssembly with Emscripten, minimal page.
4. Live datapaths: SVG datapath schematics, signals animated per clock;
   three up comparison and focus mode.
5. Interactive input: memory-mapped keyboard and mouse driving all three.
6. Polish: tunable stage delays, hazard and forwarding highlighting.
