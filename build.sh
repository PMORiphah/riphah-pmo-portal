#!/bin/bash
# Deploying copies dist/ over the repo root, which replaces index.html with the
# built file. Building again then fails because Vite tries to build its own
# output. Always restore the real entry point first.
set -e
cd "$(dirname "$0")"
cp index.source.html index.html
npx vite build "$@"
