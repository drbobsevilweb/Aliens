# ALIENS: Tactical Shooter

Top-down Phaser 3 prototype focused on squad movement, dynamic door actions, lighting, and wave combat.

Operational docs live under [`md/`](./md):

- [`md/WORKFLOW.md`](./md/WORKFLOW.md)
- [`md/handoff.md`](./md/handoff.md)
- [`md/collab.md`](./md/collab.md)
- [`md/progress.md`](./md/progress.md)

Latest editor planning/spec docs live under [`prompts/`](./prompts) (`image-editor.md`, `map-editor.md`, `story-mission-editor.md`, `sound-editor.md`, `svg-editor.md`, `hud-editor.md`).

## Run

Serve from the repo root:

```bash
python3 dev_server.py --port 8000
```

Optional verification:

```bash
bash ./scripts/verify.sh
```

Tiled map pipeline:

```bash
npm run build:tiled
```

Open:

- `http://127.0.0.1:8000/game`
- `http://127.0.0.1:8000/game?mission=m1` ... `m5`
- `http://127.0.0.1:8000/game?mission=m1&noaliens`
- `http://127.0.0.1:8000/editors`
- `http://127.0.0.1:8000/settings`
- `http://127.0.0.1:8000/sound`
- `http://127.0.0.1:8000/gameplan` (`/plan` also exists as a legacy alias)

## Controls

- `LMB`: Move / target / menus
- `RMB (hold)`: Fire
- `Mouse Wheel`: Cycle weapon
- `1 / 2 / 3`: Select weapon
- `P` or `ESC`: Pause
- `F1`: Toggle controls
- `F3`: Toggle debug overlay
- `R`: Restart after mission end

## Project Structure

- `src/scenes`: scene orchestration
- `src/entities`: marines, enemies, doors, projectiles
- `src/systems`: combat, movement, squad, mission, spawning
- `src/lighting`: visibility and lighting
- `src/ui`: HUD, tracker, overlays, context menus
- `src/data`: weapons, enemies, mission/template data
- `src/map`: map building and mission layout
- `prompts`: latest editor planning/spec docs for the modular authoring surfaces
