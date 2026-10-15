#!/bin/bash
# Deploying copies dist/ over the repo root, which replaces index.html with the
# built file. Building again then fails because Vite tries to build its own
# output. Always restore the real entry point first.
set -e
cd "$(dirname "$0")"
cp index.source.html index.html
npx vite build "$@"

# The simulation page (simulation.html) is written next to the built index.html,
# in whichever folder this build used: dist/ (vite.config.js) or dist-preview/
# (vite.config.preview.js), or the one given with --outDir.
CONFIG=vite.config.js
OUT=""
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  case "${ARGS[$i]}" in
    --config|-c) CONFIG="${ARGS[$((i + 1))]}" ;;
    --config=*)  CONFIG="${ARGS[$i]#--config=}" ;;
    --outDir)    OUT="${ARGS[$((i + 1))]}" ;;
    --outDir=*)  OUT="${ARGS[$i]#--outDir=}" ;;
  esac
done
if [ -z "$OUT" ]; then
  OUT=$(grep -oE "outDir:[[:space:]]*['\"][^'\"]+['\"]" "$CONFIG" | head -1 | sed -E "s/outDir:[[:space:]]*['\"]([^'\"]+)['\"]/\1/")
  OUT=${OUT:-dist}
fi
# The simulation is approved for /preview/ only (PMO, 15 Oct 2026): a production build does not get
# simulation.html (and the portal hides the Simulation button outside /preview/, see SIM_ENABLED in
# src/App.jsx). Once the PMO approves production, build with SIM_PROD=1 and change SIM_ENABLED too.
BASE=$(grep -oE "base:[[:space:]]*['\"][^'\"]+['\"]" "$CONFIG" | head -1 | sed -E "s/base:[[:space:]]*['\"]([^'\"]+)['\"]/\1/")
case "$BASE" in
  */preview/) node scripts/sim/make-sim-html.mjs "$OUT" ;;
  *)
    if [ "${SIM_PROD:-}" = "1" ]; then
      node scripts/sim/make-sim-html.mjs "$OUT"
    else
      rm -f "$OUT/simulation.html"
      echo "build.sh: simulation.html not written for base ${BASE:-?} (preview only; SIM_PROD=1 overrides)"
    fi ;;
esac
