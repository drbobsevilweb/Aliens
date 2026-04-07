# Node-Based Action Editor — Implementation Plan

## Current Status — 2026-04-06

This file started as the original greenfield rollout plan. The repo is now **past the early phases**, so treat this status block as the canonical snapshot and the phase text below as historical implementation detail.

### Live now
- `editors/tabs/story.js` is the active **Actions** tab and saves authored graphs to `editorState.nodeGraphs[]`.
- `src/events/EventBus.js`, `src/events/ActionDispatcher.js`, and `src/events/GraphRunner.js` are already wired in `GameScene.create()`.
- `src/settings/missionPackageRuntime.js` loads published `nodeGraphs` through `getMissionNodeGraphs()`.
- The package builder/schema path now preserves and validates `nodeGraphs` for published mission packages.

### Still remaining
- Expand authored event/getter/action coverage where the live runtime is still using older flat mission-package flows.
- Keep legacy `missionGraph` handling as compatibility-only; new authored behavior should use `nodeGraphs`.
- Add deeper authored-graph end-to-end regression coverage as more gameplay hooks move over.

## Original Goal

Replace hand-coded game behavior with a visual node/blueprint editor. Users drag event, condition, and action nodes onto a canvas, wire them together, and the game executes those graphs at runtime. No JavaScript coding required to change what happens when entities collide, take damage, spawn, die, etc.

## Scope Definition

**What this replaces:** The hardcoded collision callbacks, damage handlers, spawn logic, death effects, door behaviors, and setpiece triggers currently spread across `GameScene.js` (11,158 lines), `SetpieceSystem.js`, `StageFlow.js`, entity classes, and 20+ system files.

**What this does NOT replace:** Core engine plumbing (physics, rendering, pathfinding, audio engine). The node system *calls into* these systems — it doesn't reimplement them.

**Design model:** Event-Condition-Action (ECA) rule graphs. Each graph is: "When [event] fires, check [conditions], then execute [actions]." This is simpler than full Unreal Blueprints (no variables, loops, or custom functions in Phase 1) but covers ~80% of gameplay authoring.

---

## Existing Foundation

| Asset | Status | Reuse |
|-------|--------|-------|
| `editors/tabs/story.js` (875 lines) | Working canvas node editor with pan/zoom, bezier connections, 6 node types, drag-to-connect, properties panel, context menu, save/load | **Heavy reuse** — extend with typed ports and new node categories |
| `editors/tabs/missions.js` (1077 lines) | Card-based event editor with 17 action types and param definitions (`ACTION_PARAM_DEFS`) | **Reuse param definitions** — port directly into action node property panels |
| `editors/backend/` | Schema validation, build/normalize mission packages | **Extend** with graph schema validation |
| `GameScene.js` collision handlers (lines 857-1070) | Inline callbacks with ~15 distinct collision pairs | **Extract** into event emission points |
| Entity `takeDamage()`, `die()` methods | Direct behavior, no hooks | **Add** event emission before/after |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  EDITOR (browser)                    │
│                                                      │
│  story.js (upgraded) ──► Graph JSON ──► localStorage │
│   - Event nodes (green)                              │
│   - Condition nodes (orange)                         │
│   - Action nodes (red)                               │
│   - Data getter nodes (blue)                         │
└──────────────────────┬──────────────────────────────┘
                       │ saved as mission package
                       ▼
┌─────────────────────────────────────────────────────┐
│               RUNTIME (game engine)                  │
│                                                      │
│  EventBus.js          — pub/sub event dispatcher     │
│  ActionDispatcher.js  — maps action names → methods  │
│  GraphRunner.js       — loads graphs, walks nodes    │
│                         on event fire                │
│                                                      │
│  GameScene.js         — emits events at key points   │
│  Entities             — emit events on state change  │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. User creates graph in editor: `[OnBulletHitAlien] → [If: enemyType == "queen"] → [ScreenShake(2.0)] → [PlaySound("queen_hit")]`
2. Graph saved as JSON in mission package (localStorage)
3. On game start, `GraphRunner` loads all graphs and registers listeners on `EventBus`
4. During gameplay, `GameScene` collision handler calls `EventBus.emit('bulletHitAlien', { bullet, enemy, damage })`
5. `GraphRunner` receives event, walks the graph, evaluates conditions, calls `ActionDispatcher` for each action node
6. `ActionDispatcher` calls the actual game system method (e.g., `scene.cameras.main.shake(...)`)

---

## Phase Plan

### Phase 0 — EventBus + ActionDispatcher (Foundation)
**Prompt for AI:**
> Read `src/scenes/GameScene.js`, `src/entities/TeamLeader.js`, `src/entities/AlienEnemy.js`, `src/entities/Door.js`, and `src/systems/SetpieceSystem.js`. Create two new files:
>
> 1. `src/events/EventBus.js` — A simple pub/sub event emitter. Methods: `on(eventName, callback)`, `off(eventName, callback)`, `emit(eventName, payload)`, `once(eventName, callback)`. Keep it under 60 lines. No dependencies.
>
> 2. `src/events/ActionDispatcher.js` — A registry that maps action name strings to functions. Methods: `register(actionName, handlerFn)`, `dispatch(actionName, params, context)`. The `context` object carries the current scene reference so handlers can access game systems. Keep it under 80 lines.
>
> Then wire a single `EventBus` instance into `GameScene.js`:
> - Create it in `GameScene.create()` as `this.eventBus = new EventBus()`
> - Create `this.actionDispatcher = new ActionDispatcher(this)` (pass scene as context)
> - Register these initial actions on the dispatcher:
>   - `screen_shake` → `scene.cameras.main.shake(duration, intensity)`
>   - `play_sound` → `scene.sfx?.playSample(key)` (with null guard)
>   - `show_text` → `scene.showFloatingText(x, y, text, color)`
>   - `spawn_pack` → delegate to `scene.setpieceSystem.spawnDirectorPack(params)`
>   - `set_lighting` → `scene.lightingOverlay?.setAmbient(value)` and `setAmbientTint(r,g,b)`
>   - `door_action` → `scene.doorManager.setDoorState(doorId, state)`
>
> DO NOT change any existing game behavior yet. This is additive only — the EventBus exists but nothing emits to it yet. Verify with `node --check` on all modified files.

**Deliverable:** EventBus + ActionDispatcher exist, are instantiated in GameScene, 6 actions registered. Game runs identically to before.

**Verification:** Load game, open console, type `window.__scene.eventBus.emit('test', {})` — no crash. Type `window.__scene.actionDispatcher.dispatch('screen_shake', { duration: 200, intensity: 0.01 })` — camera shakes.

---

### Phase 1 — Emit Events from Existing Code
**Prompt for AI:**
> Read `src/scenes/GameScene.js` lines 857-1070 (collision handlers), `src/entities/TeamLeader.js` `takeDamage()`, `src/entities/AlienEnemy.js` `takeDamage()` and `die()`, `src/entities/Door.js`, `src/systems/StageFlow.js`, and `src/events/EventBus.js`.
>
> Add `this.scene.eventBus?.emit(...)` calls at these points in the existing code. Each emit should pass a payload object with all relevant context. Do NOT change any existing behavior — just add the emit call alongside what already happens.
>
> Events to add:
>
> **Collision events (in GameScene.js collision handlers):**
> - `bulletHitWall` — payload: `{ bullet, x, y, weaponKey }`
> - `bulletHitAlien` — payload: `{ bullet, enemy, damage, killed }` (emit after the kill check)
> - `bulletHitDoor` — payload: `{ bullet, door, damage, breached }`
> - `bulletHitEgg` — payload: `{ bullet, egg, damage }`
> - `acidHitLeader` — payload: `{ projectile, target, damage }`
> - `acidHitFollower` — payload: `{ projectile, target, damage }`
> - `alienHitLeader` — payload: `{ alien, leader, damage }` (find the melee damage handler)
> - `alienHitFollower` — payload: `{ alien, follower, damage }`
>
> **Entity state events:**
> - `leaderDamaged` — in `TeamLeader.takeDamage()`, payload: `{ leader, amount, healthAfter, healthBefore }`
> - `leaderHealed` — in `TeamLeader.heal()`, payload: `{ leader, amount, healthAfter }`
> - `alienDamaged` — in `AlienEnemy.takeDamage()`, payload: `{ enemy, amount, healthAfter, type: this.type }`
> - `alienDied` — in `AlienEnemy.die()`, payload: `{ enemy, x, y, type: this.type }`
> - `alienSpawned` — in `EnemyManager` where enemies are created, payload: `{ enemy, type, x, y }`
>
> **Game flow events:**
> - `waveStarted` — in `StageFlow` when state becomes 'combat', payload: `{ wave, totalWaves }`
> - `waveCleared` — when state becomes 'intermission', payload: `{ wave }`
> - `stageChanged` — on any state transition, payload: `{ from, to, wave }`
> - `extractionStarted` — when state becomes 'extract', payload: `{ wave }`
>
> **Door events:**
> - `doorOpened` — payload: `{ door, doorId }`
> - `doorClosed` — payload: `{ door, doorId }`
> - `doorWelded` — payload: `{ door, doorId }`
> - `doorBreached` — payload: `{ door, doorId, cause }` (cause = 'bullet'|'alien'|'explosion')
>
> Important: For entity events (TeamLeader, AlienEnemy), access the eventBus via `this.scene?.eventBus`. Verify it exists before emitting. The emit calls must be non-breaking — if eventBus is null, nothing happens.
>
> Run `node --check` on every modified file. Run `bash ./scripts/verify.sh` at the end.

**Deliverable:** ~25 events emitting from existing code. Zero behavior change. Game plays identically.

**Verification:** Open game console, run `window.__scene.eventBus.on('bulletHitAlien', e => console.log('HIT', e.enemy.type, e.damage))` — see logs when shooting aliens.

---

### Phase 2 — GraphRunner (Runtime Interpreter)
**Prompt for AI:**
> Read `src/events/EventBus.js`, `src/events/ActionDispatcher.js`, and `editors/tabs/story.js` (to understand the graph JSON format: nodes array + connections array, each node has `{ id, type, x, y, data }`, each connection has `{ fromNode, toNode }`).
>
> Create `src/events/GraphRunner.js` — the runtime engine that loads node graphs and executes them when events fire.
>
> Class `GraphRunner`:
> - Constructor takes `(eventBus, actionDispatcher)`
> - `loadGraphs(graphArray)` — takes an array of graph objects (from mission package). Each graph has `{ id, name, nodes, connections, enabled }`. For each graph, find all nodes where `type === 'event'` — these are entry points. Register a listener on `eventBus` for that event node's `data.eventName`.
> - When an event fires and matches an event node:
>   1. Start at the event node
>   2. Follow outgoing connections (find connections where `fromNode === currentNode.id`)
>   3. For each connected node:
>      - If `type === 'condition'`: evaluate `data.check` `data.operator` `data.value` against the event payload (e.g., `payload.damage >= 10`). If true, continue to its outgoing connections. If false, stop this branch (or follow a "false" port if it exists).
>      - If `type === 'action'`: call `actionDispatcher.dispatch(data.actionType, data, payload)` where payload is the original event data merged with any upstream data
>      - If `type === 'delay'`: schedule the downstream nodes to run after `data.delayMs` using `setTimeout`
>   4. Process nodes in topological order (BFS from event node along connections)
>
> - `unloadAll()` — remove all event listeners
>
> Properties of the condition evaluator:
> - `data.check` can be a dot-path into the event payload (e.g., `"enemy.type"`, `"damage"`, `"healthAfter"`)
> - `data.operator` is one of: `>=`, `<=`, `>`, `<`, `==`, `!=`, `contains`
> - `data.value` is the comparison value (auto-coerced: try number first, fall back to string)
> - For `contains`: checks if a string contains the value or if an array includes it
>
> Wire it into GameScene.create():
> - After EventBus and ActionDispatcher are created, create `this.graphRunner = new GraphRunner(this.eventBus, this.actionDispatcher)`
> - Load graphs from mission package: `const graphs = getMissionNodeGraphs(); if (graphs) this.graphRunner.loadGraphs(graphs);`
> - Add `getMissionNodeGraphs()` to `src/settings/missionPackageRuntime.js` — reads `editorState.nodeGraphs` from the mission package in localStorage
>
> Keep GraphRunner under 250 lines. No external dependencies.
>
> Run `node --check` on all files. Run `bash ./scripts/verify.sh`.

**Deliverable:** Runtime graph interpreter. If someone manually constructs a graph JSON in localStorage, it runs in-game.

**Verification:** Paste a test graph into console:
```js
window.__scene.graphRunner.loadGraphs([{
  id: 'test', name: 'test', enabled: true,
  nodes: [
    { id: 'e1', type: 'event', data: { eventName: 'alienDied' } },
    { id: 'a1', type: 'action', data: { actionType: 'screen_shake', duration: 300, intensity: 0.02 } }
  ],
  connections: [{ fromNode: 'e1', toNode: 'a1' }]
}]);
```
Kill an alien — screen shakes.

---

### Phase 3 — Upgrade Node Editor UI
**Prompt for AI:**
> Read `editors/tabs/story.js` (all 875 lines) carefully. This is the existing canvas-based node graph editor. It currently has 6 node types: start, dialogue, objective, condition, action, end.
>
> Upgrade it to support the Event-Condition-Action graph system. The goal is that this editor creates graphs that `GraphRunner` can execute.
>
> **Changes needed:**
>
> 1. **Replace node types.** Remove the old 6 types. Add these new categories:
>
>    **Event nodes (green, `#1d6e3a`):**
>    - Each has a single `eventName` dropdown listing all events from Phase 1:
>      `bulletHitWall, bulletHitAlien, bulletHitDoor, bulletHitEgg, acidHitLeader, acidHitFollower, alienHitLeader, alienHitFollower, leaderDamaged, leaderHealed, alienDamaged, alienDied, alienSpawned, waveStarted, waveCleared, stageChanged, extractionStarted, doorOpened, doorClosed, doorWelded, doorBreached`
>    - Event nodes only have an output port (no input) — they are graph entry points
>    - Summary line shows the selected event name
>
>    **Condition nodes (orange, `#7a4110`):**
>    - Fields: `check` (text input — dot-path like `enemy.type` or `damage`), `operator` (dropdown: `>=, <=, >, <, ==, !=, contains`), `value` (text input)
>    - Has one input port and one output port (true path). Optionally a second "false" output port (stretch goal — skip for now, just don't continue if false)
>    - Summary shows `check operator value` (e.g., `damage >= 10`)
>
>    **Action nodes (red, `#6e1a1a`):**
>    - Field: `actionType` dropdown listing all registered actions. Start with the 6 from Phase 0:
>      `screen_shake, play_sound, show_text, spawn_pack, set_lighting, door_action`
>    - When an actionType is selected, show additional parameter fields based on that action type. Reuse the `ACTION_PARAM_DEFS` pattern from `editors/tabs/missions.js` (lines 108-180) — copy that parameter definition structure.
>    - Has one input port and one output port (for chaining actions)
>    - Summary shows the action type name
>
>    **Delay nodes (blue, `#1a3d6e`):**
>    - Field: `delayMs` (number input, default 1000)
>    - Summary shows `wait ${delayMs}ms`
>
> 2. **Update the context menu** (right-click on canvas to add nodes). Group by category:
>    ```
>    + Event ►  [submenu of event types]
>    + Condition
>    + Action ►  [submenu of action types]
>    + Delay
>    ```
>
> 3. **Update the properties panel** (right sidebar when a node is selected). Show editable fields based on node type. For action nodes, dynamically show fields based on the selected actionType (same as missions.js does).
>
> 4. **Update serialization.** The saved graph format should be:
>    ```json
>    {
>      "id": "graph_xxxxx",
>      "name": "User-given name",
>      "enabled": true,
>      "nodes": [{ "id": "n_xxx", "type": "event|condition|action|delay", "x": 0, "y": 0, "data": {...} }],
>      "connections": [{ "id": "n1→n2", "fromNode": "n1", "toNode": "n2" }]
>    }
>    ```
>
> 5. **Save graphs to mission package.** When saving, write to `editorState.nodeGraphs[]` in localStorage (same pattern as `editorState.directorEvents`). This is what `GraphRunner` reads at game startup.
>
> 6. **Port colors.** Color-code the port circles by what they carry:
>    - Green circle = event output
>    - Orange circle = condition in/out
>    - Red circle = action in/out
>    - Blue circle = delay in/out
>    - Only allow connections between compatible ports (output → input, not output → output)
>
> Keep the existing pan/zoom, grid, bezier rendering, drag, selection, and keyboard shortcuts. This is an upgrade to the node types and properties panel, not a rewrite of the canvas engine.
>
> Run `node --check editors/tabs/story.js` when done.

**Deliverable:** The editor tab creates ECA graphs that match what GraphRunner expects.

**Verification:** Open `/editors`, go to the Story tab. Right-click canvas, add an Event node (select `alienDied`), add an Action node (select `screen_shake`), drag a connection from Event's output to Action's input. Save. Load game — killing an alien triggers the screen shake.

---

### Phase 4 — Expand Action Library
**Prompt for AI:**
> Read `src/events/ActionDispatcher.js` and `src/scenes/GameScene.js`. The ActionDispatcher currently has 6 registered actions. Expand it to cover all the behaviors users would want to control. Register each new action in GameScene.create() where the dispatcher is set up.
>
> **New actions to register:**
>
> Spawn/Entity actions:
> - `spawn_alien` — params: `{ type, x, y, count }`. Calls `scene.enemyManager.spawnEnemyAtWorld(type, x, y, wave)`. If x/y are 0 or absent, spawn near a random edge.
> - `spawn_facehugger` — params: `{ count, sector }`. Shortcut for spawn_alien with type='facehugger'.
> - `spawn_queen` — params: `{ sector }`. Spawns a queen enemy.
> - `spawn_egg_cluster` — params: `{ x, y, count }`. Calls egg spawning logic.
> - `kill_all_aliens` — no params. Calls `die()` on all active enemies.
> - `damage_alien` — params: `{ amount }`. Applied to the event's `enemy` from payload.
> - `heal_leader` — params: `{ amount }`. Calls `scene.leader.heal(amount)`.
> - `damage_leader` — params: `{ amount }`. Calls `scene.leader.takeDamage(amount)`.
>
> Visual/FX actions:
> - `screen_flash` — params: `{ color, duration }`. Camera flash effect.
> - `camera_zoom` — params: `{ zoom, duration }`. Smooth zoom to level.
> - `spawn_acid_pool` — params: `{ x, y, size }`. Creates acid decal at position. If x/y absent, use event payload position.
> - `spawn_decal` — params: `{ type, x, y }`. Calls `scene.spawnFloorDecal()`.
> - `show_floating_text` — params: `{ text, color, x, y }`. If x/y absent, use event payload position.
> - `set_ambient_darkness` — params: `{ value }`. Sets lighting overlay ambient.
> - `set_ambient_tint` — params: `{ r, g, b }`. Sets RGB tint on lighting.
> - `emergency_lighting` — params: `{ enabled }`. Toggles red emergency tint.
>
> Audio actions:
> - `play_sound` — already exists, ensure it takes `{ key, volume }`.
> - `stop_all_sounds` — calls `scene.sfx?.stopAll()` if available.
>
> Door actions:
> - `open_door` — params: `{ doorId }`. Opens specific door.
> - `close_door` — params: `{ doorId }`. Closes specific door.
> - `lock_door` — params: `{ doorId }`. Locks specific door.
> - `weld_door` — params: `{ doorId }`. Welds specific door.
> - `breach_door` — params: `{ doorId }`. Force-breaches a door.
>
> Combat Director actions:
> - `set_pressure` — params: `{ value }`. Directly sets combat pressure 0-1.
> - `set_combat_mods` — params: `{ speedMult, damageMult }`. Sets modifier multipliers.
> - `force_stage` — params: `{ stage }`. Forces StageFlow to a specific state.
>
> Squad actions:
> - `set_formation` — params: `{ formation }`. Changes squad formation.
> - `follower_callout` — params: `{ text }`. Shows callout text above a random follower.
>
> HUD actions:
> - `show_objective` — params: `{ text }`. Updates the objective display.
> - `show_mission_text` — params: `{ text, duration }`. Shows cinematic text overlay.
>
> For each action, also add a corresponding entry in the `ACTION_PARAM_DEFS` object (either in ActionDispatcher or in a shared `src/events/actionDefs.js` that both the editor and runtime import). This way the editor automatically knows what fields to show for each action type.
>
> Run `node --check` on all modified files. Run `bash ./scripts/verify.sh`.

**Deliverable:** ~35 total actions registered. The editor dropdown shows all of them with correct parameter fields.

---

### Phase 5 — Expand Event Library
**Prompt for AI:**
> Read `src/events/EventBus.js`, `src/scenes/GameScene.js`, `src/systems/InputHandler.js`, `src/systems/WeaponManager.js`, `src/systems/SquadSystem.js`, `src/systems/CombatDirector.js`, `src/systems/MissionFlow.js`, `src/systems/AtmosphereSystem.js`, `src/entities/MarineFollower.js`.
>
> Add more event emissions to cover gameplay moments users would want to hook into. Add `this.scene.eventBus?.emit(...)` or `this.eventBus?.emit(...)` (depending on context) at each point.
>
> **New events:**
>
> Input events:
> - `playerFired` — when WeaponManager fires. Payload: `{ weaponKey, x, y, angle }`
> - `playerReloaded` — when weapon reload completes. Payload: `{ weaponKey }`
> - `weaponOverheated` — when pulse rifle overheats. Payload: `{ weaponKey }`
> - `weaponSwitched` — when player scrolls to change weapon. Payload: `{ fromWeapon, toWeapon }`
> - `playerMoved` — when movement system processes a click-to-move. Payload: `{ fromX, fromY, toX, toY }`
> - `playerRightClicked` — when context menu opens. Payload: `{ x, y, target }`
>
> Combat events:
> - `followerDamaged` — in MarineFollower.takeDamage(). Payload: `{ follower, amount, healthAfter, role }`
> - `followerDowned` — when follower HP hits 0. Payload: `{ follower, role, x, y }`
> - `facehuggerLeaped` — when facehugger starts leap attack. Payload: `{ enemy, targetX, targetY }`
> - `facehuggerLatched` — when facehugger attaches. Payload: `{ enemy, target }`
> - `queenSpawned` — when a queen-type enemy spawns. Payload: `{ enemy, x, y }`
> - `killStreak` — emit when 3+ kills within 2 seconds. Payload: `{ count, timespan }`
>
> Director/flow events:
> - `pressureChanged` — when CombatDirector pressure crosses a threshold (every 0.1 increment). Payload: `{ pressure, previousPressure, state }`
> - `directorStateChanged` — when CombatDirector state changes (build/peak/release). Payload: `{ from, to, pressure }`
> - `missionObjectiveComplete` — when MissionFlow marks objective done. Payload: `{ objectiveIndex, text }`
> - `missionStarted` — when mission begins. Payload: `{ missionId, name }`
> - `missionEnded` — when mission concludes. Payload: `{ missionId, result }`
>
> Atmosphere events:
> - `atmosphereEvent` — when AtmosphereSystem triggers vent_hiss, distant_thump, etc. Payload: `{ type }`
>
> Proximity events (add a simple check in GameScene.update):
> - `alienNearLeader` — when any alien is within 3 tiles of leader (debounced, max once per 2s). Payload: `{ enemy, distance }`
> - `alienNearDoor` — when alien is within 2 tiles of any closed door. Payload: `{ enemy, door, distance }`
>
> Also update the event name list in the editor's Event node dropdown to include all new events.
>
> Run `node --check` on all files. Run `bash ./scripts/verify.sh`.

**Deliverable:** ~45 total events emitting. Full coverage of gameplay moments.

---

### Phase 6 — Data Getter Nodes + Enhanced Conditions
**Prompt for AI:**
> Read `src/events/GraphRunner.js` and `editors/tabs/story.js`.
>
> Currently, condition nodes can only check values from the event payload (e.g., `damage >= 10`). Users also need to check live game state that isn't in the payload (e.g., "if leader health < 30%", "if alive enemies > 10", "if current wave == 3").
>
> Add a new node type: **Getter** (color: `#1a5a6e`, cyan-ish).
>
> Getter nodes read a value from game state and pass it downstream. They have:
> - `source` dropdown: `leader.health`, `leader.healthPct`, `leader.x`, `leader.y`, `aliveEnemies`, `currentWave`, `totalWaves`, `pressure`, `directorState`, `totalKills`, `stageState`, `followerCount`, `activeFollowerCount`
> - One output port
>
> Implementation approach:
> - In `GraphRunner`, when processing a Getter node, resolve the value by reading from the scene reference (passed as context). Store the resolved value on the node's output.
> - Condition nodes get a new `source` option: instead of checking the event payload, they can check "the value from the connected Getter node." If a Getter is connected to a Condition's input, the condition evaluates against the Getter's resolved value instead of the event payload.
>
> This requires a small change to how GraphRunner processes the graph:
> 1. Before evaluating conditions, resolve all Getter nodes in the chain
> 2. Pass resolved values along connections
>
> Also add to the **editor**:
> - Getter node type in the context menu
> - Cyan port color for Getter output
> - Properties panel showing the `source` dropdown
> - Summary line showing the selected source
>
> Also enhance Condition nodes with a **second output port** ("false" path):
> - Draw a second port on the bottom-right of condition nodes, colored red
> - When the condition evaluates false, follow connections from the false port instead of stopping
> - Update the connection system to support `fromPort: 'true'|'false'` on condition nodes
> - In the editor, when dragging from a condition node, let the user drag from either port
>
> Run `node --check` on all files. Run `bash ./scripts/verify.sh`.

**Deliverable:** Getter nodes for reading game state, condition nodes with true/false branching.

**Verification:** Create a graph: `[OnAlienDied] → [Getter: aliveEnemies] → [Condition: value <= 0] → [Action: show_mission_text("ALL CLEAR")]`. Kill the last alien — text appears.

---

### Phase 7 — Default Behavior Graphs + Migration
**Prompt for AI:**
> This phase converts existing hardcoded behaviors into editable graphs so users can see how the game works and modify it.
>
> Read `src/scenes/GameScene.js` collision handlers (lines 857-1070), the `onEnemyKilled()` method, and `src/systems/SetpieceSystem.js`.
>
> Create a file `src/data/defaultGraphs.js` that exports an array of pre-built graph objects representing the game's current default behaviors. These serve as:
> 1. Starting point — game works out of the box with these loaded
> 2. Examples — users can see how behaviors are constructed
> 3. Editable — users can modify or disable them in the editor
>
> Default graphs to create:
>
> 1. **"Alien Death Effects"** — `[OnAlienDied] → [Action: spawn_acid_pool] + [Action: spawn_decal(acid)]`
> 2. **"Queen Death Mega-Burst"** — `[OnAlienDied] → [Condition: type == "queen"] → [Action: screen_shake(500, 0.03)] + [Action: spawn_acid_pool(large)] + [Action: play_sound("queen_death")]`
> 3. **"Bullet Wall Impact"** — `[OnBulletHitWall] → [Action: show_impact_effect]`
> 4. **"Door Breach Alert"** — `[OnDoorBreached] → [Action: screen_shake(200, 0.01)] + [Action: show_floating_text("BREACHED")]`
> 5. **"Wave Start Announcement"** — `[OnWaveStarted] → [Action: show_mission_text] + [Action: play_sound("alert")]`
> 6. **"Low Health Warning"** — `[OnLeaderDamaged] → [Condition: healthAfter < 30] → [Action: emergency_lighting(true)] + [Action: play_sound("alert")]`
> 7. **"Extraction Available"** — `[OnExtractionStarted] → [Action: show_objective("Reach extraction point")] + [Action: set_lighting(0.3)]`
>
> In `GraphRunner.loadGraphs()`, if no user graphs exist in the mission package, load these defaults. If user graphs exist, merge: user graphs override defaults with the same ID, and any defaults not overridden still load.
>
> In the editor, show default graphs with a "[DEFAULT]" badge. Users can clone and modify them but not delete the originals (they can disable them).
>
> Position nodes in the default graphs at sensible canvas coordinates so they look tidy when opened in the editor.
>
> Run `node --check` on all files. Run `bash ./scripts/verify.sh`.

**Deliverable:** Game ships with visual representations of its own behavior. Users see how it works and can modify it.

---

### Phase 8 — Polish and UX
**Prompt for AI:**
> Read `editors/tabs/story.js` (the upgraded node editor from Phase 3).
>
> Add these UX improvements:
>
> 1. **Node search/palette** — Press `Space` or `Tab` on the canvas to open a search popup. Type to filter node types (e.g., type "shake" to find `screen_shake` action, type "alien" to see all alien-related events). Click to place at cursor position.
>
> 2. **Connection validation** — When dragging a connection, only highlight valid target ports (can't connect output to output, can't connect a node to itself, can't create duplicate connections). Gray out invalid ports.
>
> 3. **Mini-map** — Small overview in the bottom-right corner showing all nodes as colored dots with viewport rectangle. Click to jump.
>
> 4. **Undo/redo** — Keep a stack of graph states (max 50). Ctrl+Z to undo, Ctrl+Shift+Z to redo. Push state on: node add/delete, connection add/delete, node move (on mouseup), property change.
>
> 5. **Copy/paste** — Ctrl+C copies selected nodes + their interconnections. Ctrl+V pastes at cursor with new IDs. Useful for duplicating patterns.
>
> 6. **Graph list panel** — Left sidebar showing all graphs (like the story list already does). Each entry shows: name, enabled toggle, event count, node count. Click to switch. "New Graph" button. "Delete" with confirmation.
>
> 7. **Node grouping** — Select multiple nodes, right-click → "Group". Draws a labeled, colored background rectangle behind them. Purely visual organization — no logic change. Groups have an editable name and color.
>
> 8. **Tooltip on hover** — When hovering over a node for 500ms, show a tooltip with the node's full details (all data fields). Helps when zoomed out.
>
> 9. **Graph validation** — Show warnings in the graph list: "Event node with no connections", "Action with no input", "Orphaned nodes". Yellow warning icon next to graph name.
>
> Run `node --check editors/tabs/story.js`. Test in browser.

**Deliverable:** Production-quality editor UX.

---

## Estimated Conversation Breakdown

| Phase | Conversations | Lines of New/Changed Code | Dependencies |
|-------|:---:|:---:|---|
| Phase 0 — EventBus + ActionDispatcher | 1 | ~200 | None |
| Phase 1 — Emit Events | 1 | ~150 (scattered additions) | Phase 0 |
| Phase 2 — GraphRunner | 1 | ~250 | Phase 0 |
| Phase 3 — Editor Upgrade | 1-2 | ~500 (rewriting story.js node types) | Phase 2 |
| Phase 4 — Action Library | 1 | ~400 | Phase 0 |
| Phase 5 — Event Library | 1 | ~200 (scattered additions) | Phase 1 |
| Phase 6 — Getters + Conditions | 1 | ~300 | Phase 2, 3 |
| Phase 7 — Default Graphs | 1 | ~300 | Phase 4, 5, 6 |
| Phase 8 — Polish | 1-2 | ~600 | Phase 3 |
| **Total** | **9-11** | **~2900** | |

## Dependency Graph

```
Phase 0 (EventBus + ActionDispatcher)
├── Phase 1 (Emit Events)
│   └── Phase 5 (More Events)
│       └── Phase 7 (Default Graphs) ← also needs Phase 4, 6
├── Phase 2 (GraphRunner)
│   ├── Phase 3 (Editor Upgrade)
│   │   ├── Phase 6 (Getters + Conditions)
│   │   └── Phase 8 (Polish)
│   └── Phase 7 (Default Graphs)
└── Phase 4 (Action Library)
    └── Phase 7 (Default Graphs)
```

**Parallelizable:** Phases 1 + 2 can run in parallel after Phase 0. Phases 4 + 5 can run in parallel after their dependencies. Phase 8 can start after Phase 3.

## Prompt Tips for Each Conversation

- **Always start with:** "Read these specific files: [list]. Here is what exists and what we're building: [context]."
- **Always end with:** "Run `node --check` on all modified files. Run `bash ./scripts/verify.sh`. Do NOT change any existing game behavior unless this phase specifically requires it."
- **If something breaks:** "The game crashes with [error]. Read [file] at line [N]. Fix the issue without changing any other behavior."
- **To add a single new event:** "Read `src/events/EventBus.js` and `[file where event should emit]`. Add a new event `[name]` emitted at [location]. Payload: `{ ... }`. Then add it to the event dropdown in `editors/tabs/story.js`."
- **To add a single new action:** "Read `src/events/ActionDispatcher.js` and `[file with the system method]`. Register a new action `[name]` that calls `[method]`. Add its param definition. Then add it to the action dropdown in `editors/tabs/story.js`."

## Stretch Goals (Phase 9+)

These are not in the core plan but are natural extensions:

- **Variable nodes** — Set/get named variables that persist across events within a mission. Enables counters ("after 5 kills, trigger X"), state machines, and complex sequences.
- **Loop/iterator nodes** — "For each alive enemy, do X." Powerful but complex to implement safely (infinite loop protection needed).
- **Custom function graphs** — Name a graph and call it from other graphs. Enables reuse ("my acid burst" used in 3 different event handlers).
- **Import/export** — Share graph sets as JSON files. Community content.
- **Graph debugger** — Live overlay in-game showing which nodes are firing, with execution highlighting and value inspection.
- **Sprite/animation nodes** — `SetSprite(entity, spriteKey)`, `PlayAnimation(entity, animKey)`, `SetTint(entity, color)`. Requires the sprite pipeline to expose an API.
- **Timeline nodes** — Sequence actions over time: "at 0s do A, at 1.5s do B, at 3s do C." Like a cinematic sequencer.
