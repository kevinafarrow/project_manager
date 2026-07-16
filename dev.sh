#!/usr/bin/env bash
# Development mode: uvicorn with reload + Vite dev server with HMR.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/opt/node/bin:$PATH"

.venv/bin/uvicorn backend.app.main:app --port 26248 --reload &
BACK=$!
trap 'kill $BACK' EXIT
(cd frontend && npm run dev)
