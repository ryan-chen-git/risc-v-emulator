import "./App.css";
import "./Arch.css";
import { COLORS } from "./theme.js";

const C = { ...COLORS, mut: "#94A3B8" };

function Card({ x, y, w, h, color, title, dashed, children }) {
  x = +x; y = +y; w = +w; h = +h;   // JSX string attrs would turn + into concatenation
  return (
    <g>
      <rect className={dashed ? "dash" : "card"} x={x} y={y} width={w} height={h} rx="8" />
      <rect x={x} y={y + 10} width="4" height={h - 20} rx="2" fill={color} />
      <text className="ct" x={x + 16} y={y + 22} fill={color}>{title}</text>
      {children}
    </g>
  );
}

function Arrow({ x, y1, y2, label }) {
  x = +x; y1 = +y1; y2 = +y2;
  return (
    <g>
      <line className="wireln" x1={x} y1={y1} x2={x} y2={y2 - 7} />
      <polygon className="ah" points={`${x - 4.5},${y2 - 8} ${x + 4.5},${y2 - 8} ${x},${y2}`} />
      {label && <text className="alab" x={x + 12} y={(y1 + y2) / 2 + 4}>{label}</text>}
    </g>
  );
}

function Chip({ x, y, w, label }) {
  x = +x; y = +y; w = +w;
  return (
    <g>
      <rect className="chip" x={x} y={y} width={w} height="20" rx="5" />
      <text className="mono" x={x + w / 2} y={y + 13.5} textAnchor="middle">{label}</text>
    </g>
  );
}

export default function Arch() {
  return (
    <div className="app arch">
      <header>
        <div className="titlebar">
          <h1>how the animation gets its data</h1>
          <span className="sub">your circuit &rarr; trace &rarr; frames &rarr; gsap</span>
        </div>
        <div className="bar">
          <a className="navlink" href="/">&larr; back to the animation</a>
        </div>
      </header>

      <svg viewBox="0 0 900 840" xmlns="http://www.w3.org/2000/svg">
        {/* 1 - the Logisim circuit */}
        <Card x="150" y="16" w="440" h="122" color={C.pc} title="1 · your Logisim circuit (CS61C proj3)">
          <Chip x="166" y="50" w="62" label="cpu.circ" />
          <Chip x="236" y="50" w="62" label="alu.circ" />
          <Chip x="306" y="50" w="88" label="imm-gen.circ" />
          <Chip x="402" y="50" w="62" label="mem.circ" />
          <Chip x="166" y="76" w="119" label="control-logic.circ" />
          <Chip x="293" y="76" w="113" label="branch-comp.circ" />
          <Chip x="414" y="76" w="119" label="partial-load.circ" />
          <text className="cap" x="166" y="118">copied from your proj3 repo into circuit/cpu/, plus test-harness circuits</text>
        </Card>
        <Arrow x="370" y1="138" y2="172" label="clock your actual gates, cycle by cycle" />

        {/* 2 - run the circuit */}
        <Card x="150" y="172" w="440" h="112" color={C.inst} title="2 · run the circuit">
          <rect className="chip" x="166" y="204" width="196" height="46" rx="6" />
          <text className="mt" x="176" y="221">Logisim-evolution (61c) CLI</text>
          <text className="mono" x="176" y="240">-tty table captures</text>
          <rect className="chip" x="374" y="204" width="200" height="46" rx="6" />
          <text className="mt" x="384" y="221">sim/ &mdash; C++ netlist engine</text>
          <text className="mono" x="384" y="240">xml.cpp circ.cpp net.cpp</text>
          <text className="cap" x="166" y="272">the C++ engine is cross-checked against the Logisim captures (sim/validate)</text>
        </Card>
        <Arrow x="370" y1="284" y2="318" label="signal values, one row per clock edge" />

        {/* 3 - the trace */}
        <Card x="150" y="318" w="440" h="96" color={C.reg} title="3 · per-cycle trace">
          {[["cyc", "PC", "inst", "t0", ""], ["6", "0x00000010", "0x00128293", "2", "← addi t0, t0, 1"]].map((row, r) => (
            [166, 205, 300, 398, 428].map((cx, i) => (
              <text key={r + "-" + i} className="mono" x={cx} y={358 + r * 18}>{row[i]}</text>
            ))
          ))}
          <text className="cap" x="166" y="404">every signal in your CPU, sampled each cycle (circuit/tests/integration-addi)</text>
        </Card>
        <Arrow x="370" y1="414" y2="448" label="tools/trace_to_js.py &mdash; disassemble + structure" />

        {/* 4 - trace.js */}
        <Card x="150" y="448" w="440" h="74" color={C.imm} title="4 · web/trace.js">
          <text className="mono" x="166" y="492">{'{ pc, inst, asm: "addi t0, t0, 1", regs: { t0: 2, ... } }'}</text>
          <text className="cap" x="166" y="512">one record per cycle &mdash; generated, never edited by hand</text>
        </Card>
        <Arrow x="370" y1="522" y2="556" label="web/render.py &mdash; geometry + frames" />

        {/* 5 - render.py */}
        <Card x="150" y="556" w="440" h="90" color={C.alu} title="5 · web/render.py">
          <text className="cap" x="166" y="598">draws the reference datapath (geometry measured at 795&times;475)</text>
          <text className="cap" x="166" y="616">tags every wire with its signal, then emits per-cycle FRAMES</text>
          <text className="cap" x="166" y="634">frame = which wires carry data this cycle + the value on each</text>
        </Card>

        {/* fork to the two outputs */}
        <line className="wireln" x1="370" y1="646" x2="370" y2="664" />
        <line className="wireln" x1="252" y1="664" x2="487" y2="664" />
        <line className="wireln" x1="252" y1="664" x2="252" y2="693" />
        <line className="wireln" x1="487" y1="664" x2="487" y2="693" />
        <polygon className="ah" points="247.5,692 256.5,692 252,700" />
        <polygon className="ah" points="482.5,692 491.5,692 487,700" />

        <Card x="150" y="700" w="205" h="88" color={C.mut} title="datapath.html">
          <text className="cap" x="166" y="744">static self-contained page,</text>
          <text className="cap" x="166" y="762">pixel-checked with cairosvg</text>
        </Card>
        <Card x="385" y="700" w="205" h="88" color={C.wb} title="viz/ &mdash; React + GSAP">
          <text className="cap" x="401" y="744">staged hop animation</text>
          <a href="/"><text className="cap" x="401" y="762">&rarr; watch cycle 6 play</text></a>
        </Card>

        {/* separate path, not part of the pipeline */}
        <Card x="640" y="172" w="245" h="132" color={C.mut} title="separate path &mdash; src/" dashed>
          <text className="cap" x="656" y="214">C++ &rarr; WASM RV32IM emulator,</text>
          <text className="cap" x="656" y="232">validated against Venus traces</text>
          <text className="cap" x="656" y="250">timing models: 1- / 2- / 5-stage</text>
          <text className="mono" x="656" y="276">build/emu --compare</text>
        </Card>

        {/* palette footnote */}
        {["pc", "inst", "reg", "imm", "alu", "wb"].map((k, i) => (
          <circle key={k} cx={315 + i * 22} cy="806" r="4" fill={C[k]} />
        ))}
        <text className="cap" x="370" y="828" textAnchor="middle">the stage colours match the animation legend (pc, inst, reg, imm, alu, wb)</text>
      </svg>
    </div>
  );
}
