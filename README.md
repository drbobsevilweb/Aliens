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

## AI Handoff

If another model/agent needs to continue, start from commit:

- `1823583` (`v3.07 apply leader panic effects to weapon handling with jam feedback`)

Current workspace note:

- `docs/fx-research.md` may be modified locally as notes.

Recommended continuation order:

1. Run regression playtest first (do not refactor first):
- follower door-task persistence (leader movement should not cancel follower hack/weld).
- motion tracker flow (5s channel + 5s active, cancel on attack only).
- passive visual beeps/thump cues visibility.
2. Tune panic/weapon behavior from `v3.07`:
- verify leader jam frequency is noticeable under stress but not constant at calm morale.
3. Validate visibility readability:
- enemies visible in cone and held for ~2s after losing direct torch exposure.
4. Continue combat pacing polish:
- spawn pressure and alien aggression per mission, while preserving survivability.

Guardrails for future AI edits:

- Do not revert existing behavior unless it conflicts with explicit gameplay rules.
- Prefer tuning values before rewriting systems.
- Keep CMS/editor compatibility with multi-map mission-package imports.
