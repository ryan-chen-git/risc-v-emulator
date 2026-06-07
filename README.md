# risc-v-emulator

A cycle-accurate RISC-V (RV32IM) emulator with a browser visualization that
runs single-cycle, 2-stage, and 5-stage datapaths side by side, so you can
watch the pipeline speedup happen in real time and drive the machine with
interactive input.

Built in C++ (core) compiled to WebAssembly, with a JavaScript front end.

## Status: Phase 1 (timing models)

A functional RV32IM interpreter (fetch, decode, and execute over 32 registers,
PC, and unified little-endian memory), validated against the Venus reference
traces from CS61C Project 3, plus timing models that report cycle count, CPI,
clock period, and total time for the single-cycle, 2-stage, and 5-stage
designs so you can compare their speed on any program.

### Build and test (in WSL)

```bash
make            # builds build/emu
make test       # assembles each tests/asm/*.s with Venus and diffs the trace
```

### Run one program

```bash
java -jar tools/venus.jar tests/asm/programs-fib.s --dump > build/fib.hex
build/emu --load build/fib.hex --trace --steps 50   # per-cycle register trace
build/emu --load build/fib.hex --compare            # race the three designs
build/emu --load build/fib.hex                       # final register dump
```

## Layout

```
src/        emulator core
  types.hpp        fixed-width integer aliases
  memory.hpp       sparse byte-addressable little-endian memory
  decode.hpp       instruction decode, immediates, and operand classification
  cpu.hpp/.cpp     architectural state and single-instruction step()
  trace.hpp        dynamic instruction record used for hazard analysis
  timing.hpp/.cpp  single-cycle, 2-stage, and 5-stage cycle and time model
  main.cpp         CLI driver (trace, compare, and final-state modes)
tools/      venus.jar (assembler and reference oracle, copied from proj3)
tests/      asm/  RISC-V programs (.s)   ref/  Venus reference traces (.ref)
            run_oracle.sh  assemble, run, and diff
```

## Timing model

All three designs share the one functional core, so they always agree on
architectural results. Only the cycle counts and clock period differ:

- single-cycle: one cycle per instruction, clock set by the full datapath path.
- 2-stage: fetch, then everything else; one flush per taken control transfer.
- 5-stage: full forwarding; one bubble per load-use hazard and two per taken
  control transfer.

Stage delays default to IMEM 200 ps, RegRead 100, ALU 200, DMEM 200, RegWrite
100, and are configurable in code. These are a model meant to show the tradeoff
between cycle count and clock frequency, not silicon measurements.

## Roadmap

1. Functional core (done): RV32IM, validated against the Venus traces.
2. Timing models (done): single-cycle, 2-stage, and 5-stage cycle counts, CPI,
   clock period, and total time, raced headless via `emu --compare`.
3. WASM bridge: compile to WebAssembly with Emscripten, minimal page.
4. Live datapaths: SVG datapath schematics, signals animated per clock;
   three up comparison and focus mode.
5. Interactive input: memory-mapped keyboard and mouse driving all three.
6. Polish: tunable stage delays, hazard and forwarding highlighting.
