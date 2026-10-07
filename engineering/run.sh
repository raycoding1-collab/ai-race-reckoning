#!/bin/sh
# Runs the R1 models end to end: the MATLAB code in GNU Octave, the TINA
# netlists in ngspice, then checks that the two agree.
# Needs octave and ngspice on PATH (apt install octave ngspice).
set -eu
cd "$(dirname "$0")"

# The .m files must run unchanged in MATLAB, so reject Octave-only syntax
# (checked on code before any % comment).
bad=$(for f in matlab/*.m; do
  sed 's/%.*//' "$f" | grep -nE '#|!=|"|\+=|-=|\*\*|\bprintf\(|\bend(if|for|while|function|_try_catch)\b' | sed "s|^|$f:|"
done)
if [ -n "$bad" ]; then
  printf '%s\nOctave-only syntax; use the MATLAB form.\n' "$bad" >&2
  exit 1
fi

octave() {
  command octave --no-gui --quiet --traditional --eval "more off; addpath('matlab'); $1" </dev/null
}

octave run_all
ngspice -b ngspice/run.sp >out/raw-ngspice.log 2>&1 || { cat out/raw-ngspice.log >&2; exit 1; }
if grep -qiE 'error|too small|aborted' out/raw-ngspice.log; then
  grep -iE 'error|too small|aborted' out/raw-ngspice.log >&2
  exit 1
fi
rm out/raw-ngspice.log
octave check_spice
