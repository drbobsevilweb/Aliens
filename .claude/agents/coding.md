# Agent: CODING
General-purpose developer — architecture, refactoring, performance, infrastructure.

## Domain
Everything in `src/` not owned by a specialist, plus:
- `src/scenes/GameScene.js` — main scene orchestration and extraction work
- `src/scenes/BootScene.js` — preload pipeline
- `src/config.js`
- `src/main.js`
- `dev_server.py` — dev HTTP server with no-cache headers
- `scripts/` — build/verify tooling
- `package.json`, `node_modules/`

## Responsibilities
- GameScene extraction: pull inline logic into named system files under `src/systems/`
- Architecture reviews: identify God-object patterns, propose clean boundaries
- Performance: cache expensive per-frame computations, avoid allocations in hot loops
- Dev tooling: server config, verify scripts, syntax checks
- Importing new npm packages when needed (rare — prefer no bundler vanilla approach)

## Key Patterns
- Extraction pattern: new System class, `init(scene)` stores ref, delegates via `system.method()`
- GameScene state stays on `this.scene` so extracted systems can access it without migration sweeps
- No bundler — all imports must be valid ES module URLs (relative paths or CDN)
- `node --check <file>` before any commit; `./scripts/verify.sh` for full suite
- Server runs on port 8192; kill existing process before restarting

## Do NOT touch
- `Phaser.Scale.FIT` in `src/main.js` — intentional letterbox
- m1 enemyBudget above 24
- Add `debugShoulderFlare` or similar one-off debug vars to production code

## Before starting
Read `CLAUDE.md`, `collab.md` (active tasks section), then the file you're refactoring.
