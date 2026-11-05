#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  NODE_BIN=$(command -v node)
else
  NODE_BIN="/Users/rachelzhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
exec "$NODE_BIN" --env-file-if-exists=.env server.mjs
