#!/usr/bin/env bash
set -euo pipefail

echo "[verify] JS syntax check (src + editors)"
while IFS= read -r file; do
    node --check "$file" >/dev/null
done < <(rg --files src editors | rg '\.(js|mjs)$')

echo "[verify] tiled asset sync"
node scripts/test-tiled-sync.mjs

echo "[verify] mission package quality spec"
node editors/backend/js/missionPackageQuality.spec.mjs

echo "[verify] runtime settings regression spec"
node scripts/test-runtime-settings.mjs

echo "[verify] runtime override modes spec"
node scripts/test-runtime-override-modes.mjs

echo "[verify] mission layout regression spec"
node scripts/test-mission-layout.mjs

echo "[verify] follower AI regression spec"
node scripts/test-follower-ai.mjs

echo "[verify] enemy AI regression spec"
node scripts/test-enemy-ai.mjs

echo "[verify] pulse rifle timing spec"
node scripts/test-pulse-rifle-timing.mjs

echo "[verify] bot telemetry regression spec"
node scripts/test-play-bot-telemetry.mjs

echo "[verify] combat regression harness"
chmod +x scripts/run_verify_combat.sh
./scripts/run_verify_combat.sh

echo "[verify] ok"
