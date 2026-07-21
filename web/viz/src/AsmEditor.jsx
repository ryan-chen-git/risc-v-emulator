// CodeMirror 6 assembly editor (the editor Venus and the Hines simulator both
// build on). Debugger-style execution markers done the canonical CM6 way: a
// StateField driven by effects, a line-decoration layer, and a dedicated gutter
// with ▶ (executing) / ▷ (next) markers. Assembler errors surface as real
// diagnostics (red underline + gutter dot) via @codemirror/lint.

import { useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView, Decoration, gutter, GutterMarker } from "@codemirror/view";
import { StateField, StateEffect, RangeSet } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { setDiagnostics } from "@codemirror/lint";
import { tags } from "@lezer/highlight";
import { riscv } from "./riscvLang.js";

// ---- execution-line state (cur = executing, next = where PC goes) ----
const setExec = StateEffect.define();
const execField = StateField.define({
  create: () => ({ cur: -1, next: -1 }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setExec)) value = e.value;
    return value;
  },
});

const curLineDeco = Decoration.line({ class: "cm-execLine" });
const nextLineDeco = Decoration.line({ class: "cm-nextLine" });
const execHighlight = EditorView.decorations.compute([execField], (state) => {
  const { cur, next } = state.field(execField);
  const ranges = [];
  const add = (n, deco) => {
    if (n >= 1 && n <= state.doc.lines) ranges.push(deco.range(state.doc.line(n).from));
  };
  add(cur, curLineDeco);
  if (next !== cur) add(next, nextLineDeco);
  return Decoration.set(ranges.sort((a, b) => a.from - b.from));
});

class ExecMarker extends GutterMarker {
  constructor(kind) { super(); this.kind = kind; }
  eq(other) { return this.kind === other.kind; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-execMark " + this.kind;
    s.textContent = this.kind === "cur" ? "▶" : "▷";
    return s;
  }
}
const CUR = new ExecMarker("cur"), NEXT = new ExecMarker("next");

const execGutter = gutter({
  class: "cm-execGutter",
  markers(view) {
    const { cur, next } = view.state.field(execField);
    const ranges = [];
    const add = (n, m) => {
      if (n >= 1 && n <= view.state.doc.lines) ranges.push(m.range(view.state.doc.line(n).from));
    };
    add(cur, CUR);
    if (next !== cur) add(next, NEXT);
    return RangeSet.of(ranges.sort((a, b) => a.from - b.from));
  },
  lineMarkerChange: (update) =>
    update.transactions.some((tr) => tr.effects.some((e) => e.is(setExec))),
});

// ---- theme: our design tokens ----
const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--fg)", fontSize: "13px" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent)", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(96, 165, 250, 0.22) !important" },
  ".cm-gutters": { backgroundColor: "var(--bg-deep)", color: "var(--fg-faint)", border: "none", fontFamily: "var(--font-mono)", fontSize: "11px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg-dim)" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
  ".cm-execGutter": { width: "16px" },
  ".cm-execMark": { display: "inline-block", fontSize: "10px", lineHeight: "1.4" },
  ".cm-execMark.cur": { color: "var(--accent)", textShadow: "0 0 6px rgba(34,197,94,.7)" },
  ".cm-execMark.next": { color: "var(--fg-faint)" },
  ".cm-execLine": { backgroundColor: "rgba(34, 197, 94, 0.13)" },
  ".cm-nextLine": { backgroundColor: "rgba(148, 163, 184, 0.07)" },
  ".cm-lintRange-error": { backgroundImage: "none", borderBottom: "1.5px wavy underline transparent", textDecoration: "underline wavy var(--danger) 1px" },
  ".cm-lint-marker-error": { content: "none" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--fg)", border: "1px solid var(--border-strong)" },
  "&.cm-focused": { outline: "none" },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--fg-faint)", fontStyle: "italic" },
  { tag: tags.keyword, color: "#C084FC" },
  { tag: tags.function(tags.variableName), color: "#60A5FA", fontWeight: "600" },
  { tag: tags.standard(tags.variableName), color: "#2DD4BF" },
  { tag: tags.number, color: "#FBBF24" },
  { tag: tags.string, color: "#4ADE80" },
  { tag: tags.name, color: "var(--fg)" },
]);

const extensions = [riscv(), syntaxHighlighting(highlight), execField, execHighlight, execGutter, theme];

export default function AsmEditor({ value, onChange, curLine = -1, nextLine = -1, errors = [] }) {
  const viewRef = useRef(null);

  // push execution markers + diagnostics into the editor whenever they change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setExec.of({ cur: curLine, next: nextLine }) });
  }, [curLine, nextLine, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const diags = errors
      .filter((e) => e.line >= 1 && e.line <= view.state.doc.lines)
      .map((e) => {
        const line = view.state.doc.line(e.line);
        return { from: line.from, to: line.to, severity: "error", message: e.message };
      });
    view.dispatch(setDiagnostics(view.state, diags));
  }, [errors, value]);

  return (
    <CodeMirror
      className="asmeditor"
      theme="none"
      value={value}
      height="260px"
      placeholder="Write RISC-V assembly..."
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false }}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={(view) => { viewRef.current = view; }}
    />
  );
}
