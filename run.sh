#!/usr/bin/env bash
# Start the Engagement PM app (production mode: FastAPI serves the built frontend).
set -euo pipefail
cd "$(dirname "$0")"

export PATH="$HOME/.local/opt/node/bin:$PATH"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d frontend/dist ] || [ "${REBUILD:-}" = "1" ]; then
  (cd frontend && npm install --silent && npm run build)
fi

echo "Engagement PM → http://localhost:${PORT:-42688}"
exec .venv/bin/uvicorn backend.app.main:app --port "${PORT:-42688}"
