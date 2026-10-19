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
# The simulation is approved for /preview/ (PMO, 15 Oct 2026) and for production (PMO, 19 Oct 2026),
# so every build writes simulation.html. SIM_PROD=0 leaves it out of a production build (then set
# SIM_ENABLED in src/App.jsx back to preview-only too, or the button opens a missing page).
BASE=$(grep -oE "base:[[:space:]]*['\"][^'\"]+['\"]" "$CONFIG" | head -1 | sed -E "s/base:[[:space:]]*['\"]([^'\"]+)['\"]/\1/")
case "$BASE" in
  */preview/) node scripts/sim/make-sim-html.mjs "$OUT" ;;
  *)
    if [ "${SIM_PROD:-1}" = "0" ]; then
      rm -f "$OUT/simulation.html"
      echo "build.sh: simulation.html not written for base ${BASE:-?} (SIM_PROD=0)"
    else
      node scripts/sim/make-sim-html.mjs "$OUT"
    fi ;;
esac
