# ALIENS: Tactical Shooter

Top-down Phaser 3 prototype focused on squad movement, dynamic door actions, cone lighting, and wave-based combat.

## Run

Serve the project from the repo root (module imports require HTTP):

```bash
python3 dev_server.py --port 8000
```

Then open:

`http://127.0.0.1:8000`

Tools:

- `http://127.0.0.1:8000/game`
- `http://127.0.0.1:8000/game?mission=m1` ... `m5`
- `http://127.0.0.1:8000/plan` (plan + embedded editors tabs)
- `http://127.0.0.1:8000/editors` (direct editor workspace)
- `http://127.0.0.1:8000/settings` (runtime tuning for gameplay variables)

`dev_server.py` also exposes `POST /api/error-notes` and writes reports to `logs/error-notes.ndjson`.

## Controls

- `RMB`: Move / open door context menu
- `LMB (hold)`: Fire
- `Mouse Wheel`: Cycle weapon
- `1 / 2 / 3`: Select weapon
- `P` or `ESC`: Pause/unpause
- `F1`: Show/hide controls
- `F3`: Toggle debug overlay
- `R` or click after mission end: Restart

## Gameplay Loop

1. Clear all enemy waves.
2. Reach extraction.
3. Survive and optimize mission stats (kills/time tracked in local storage).

## Project Layout

- `src/scenes`: Boot/game scene orchestration
- `src/entities`: Leader, enemies, doors, projectiles
- `src/systems`: Movement, weapons, enemies, squad, stage flow, door actions
- `src/lighting`: Raycast-based visibility and blocker grid
- `src/ui`: HUD, tracker, objectives, overlays, context menu
- `src/data`: Weapons, enemies, pickups
- `src/map`: Tile and door definitions
