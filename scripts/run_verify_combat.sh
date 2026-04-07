#!/usr/bin/env bash
set -euo pipefail

# This script ensures the dev server is running before executing the combat harness.
# It starts a temporary server if none is detected on 8192.

PORT=8192
TEMP_SERVER=0

if ! curl -s "http://127.0.0.1:$PORT/" > /dev/null; then
    echo "[verify-combat] Starting temporary dev server on $PORT..."
    python3 dev_server.py --port $PORT > logs/temp_verify_server.log 2>&1 &
    SERVER_PID=$!
    TEMP_SERVER=1
    sleep 3
fi

echo "[verify-combat] Running combat regression harness..."
if node scripts/verify_combat.mjs; then
    echo "[verify-combat] Combat assertions passed."
    RES=0
else
    echo "[verify-combat] Combat assertions FAILED."
    RES=1
fi

if [ "$TEMP_SERVER" -eq 1 ]; then
    echo "[verify-combat] Stopping temporary server (PID $SERVER_PID)..."
    kill $SERVER_PID || true
fi

exit $RES
