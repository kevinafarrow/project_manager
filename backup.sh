#!/usr/bin/env bash
# Download a timestamped backup of the running Engagement PM database.
#
#   ./backup.sh                 # -> backups/engagement-pm-backup-<stamp>.sqlite3
#   ./backup.sh /path/to/dir    # write into another directory
#   PORT=42688 ./backup.sh      # override the port (default 42688)
#
# The app must be running (docker compose up, or ./run.sh). The snapshot is taken
# through /api/backup, so it is consistent even while the app is in use.
#
# To restore, use the "Backup & restore" card on the Settings page, or:
#   curl -f -F "file=@backups/<file>.sqlite3" http://localhost:${PORT:-42688}/api/restore
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-42688}"
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/engagement-pm-backup-$STAMP.sqlite3"

curl -fsS "http://localhost:$PORT/api/backup" -o "$OUT"
echo "Backup written to $OUT ($(du -h "$OUT" | cut -f1))"
