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
node scripts/sim/make-sim-html.mjs "$OUT"
