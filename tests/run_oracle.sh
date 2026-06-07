#!/usr/bin/env bash
# Validate the emulator against the CS61C Venus reference traces:
# assemble each .s with Venus (--dump), run it through our emulator in
# trace mode for the same number of cycles, and diff against the .ref.
set -uo pipefail
cd "$(dirname "$0")/.."

EMU=build/emu
VENUS=tools/venus.jar

[ -x "$EMU" ]      || { echo "build first: run 'make'"; exit 1; }
[ -f "$VENUS" ]    || { echo "missing tools/venus.jar"; exit 1; }

pass=0; fail=0
for ref in tests/ref/*.ref; do
  name=$(basename "$ref" .ref)
  asm="tests/asm/$name.s"
  [ -f "$asm" ] || continue

  hex="build/$name.hex"
  out="build/$name.out"
  java -jar "$VENUS" "$asm" --dump > "$hex" 2>/dev/null

  # cycles = data rows in the reference (every line has commas; minus header)
  rows=$(( $(grep -c ',' "$ref") - 1 ))

  "$EMU" --load "$hex" --trace --steps "$rows" > "$out"

  if diff <(tr -d '\r' < "$ref") "$out" > "build/$name.diff" 2>&1; then
    printf 'PASS  %-22s (%s cycles)\n' "$name" "$rows"
    pass=$((pass+1))
  else
    printf 'FAIL  %-22s\n' "$name"
    head -n 8 "build/$name.diff" | sed 's/^/      /'
    fail=$((fail+1))
  fi
done

echo "-------------------------------------------"
echo "Passed $pass / $((pass+fail))"
[ "$fail" -eq 0 ]
