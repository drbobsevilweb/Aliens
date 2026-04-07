# Plan: Door Delegation + TL Movement Lock on Lock Actions

> **Historical implementation note:** the follower door-delegation / TL-lock work has already landed. Keep this doc as design background only; use the live runtime files and `md/progress.md` for current behavior.

## Goal

1. **Followers perform door actions, not the TL** — TL orders, followers execute (weld, hack, lock, unweld). TL should never personally perform these unless all followers are dead.
2. **Locking a door forces all marines to the correct side first** — auto-move, TL cannot move until repositioning completes.
3. **Action duration: 5-10 seconds** — longer than current values for tension.
4. **Followers stuck at door during action** — if attacked they remain committed to the task.

## Current State (from code audit)

### Delegation (already partially works)
- `resolveActionActor()` in DoorActionSystem.js (lines 233-260) already prioritizes:
  1. Tech specialist
  2. Medic specialist
  3. TeamLeader (fallback)
- This is the right structure but TL fallback is too easy to hit.

### Squad Sync (already partially works)
- `requestDoorSync()` and `isDoorSyncReady()` exist in SquadSystem.js
- Side determination via door center X/Y comparison
- **3-second timeout** — if squad isn't synced in 3s, proceeds anyway
- Side checking: vertical door uses X comparison, horizontal door uses Y

### Action Durations (too short)
- Hack: 3000ms (4500ms if TL)
- Lock: 800ms
- Weld: 4000ms
- Unweld: 3000ms
- Source: `src/config.js` lines 54-57 and `getActionDuration()` in DoorActionSystem

### Follower Commitment (partially works)
- Followers assigned via `assignRoleTask()` in SquadSystem
- Movement uses `moveTowardRigid()` at `formupSpeed`
- `task.done = true` when waypoint reached, triggers action
- But: no "stuck at door" enforcement during the timed action phase

## Required Changes

### 1. TL should never perform door actions if any follower is alive
- In `resolveActionActor()`: remove TL as fallback when any follower is alive and able
- Expand delegation beyond tech/medic — any alive follower can weld/lock/unweld
- Only fall back to TL when ALL followers are dead or incapacitated
- Priority: tech → medic → heavy → TL (heavy added as eligible)

### 2. Lock action: force all marines to correct side
- When a lock action is queued:
  - Determine which side of the door the squad should be on (side opposite to threat, or side TL is on)
  - Auto-pathfind ALL marines (including TL) to positions on that side
  - **TL movement lock**: disable player input movement until all marines are positioned
  - Only then does the follower begin the lock action
- Increase squad sync timeout from 3s to something reasonable (8-10s) for lock actions specifically
- If TL is already on the correct side, only followers need to reposition

### 3. Increase action durations to 5-10 seconds
- Update `src/config.js` door action timings:
  - Hack: 3000ms → **7000ms**
  - Lock: 800ms → **5000ms**
  - Weld: 4000ms → **8000ms**
  - Unweld: 3000ms → **6000ms**
- Remove TL penalty multiplier (TL shouldn't be doing these anyway)

### 4. Follower commitment during action
- Once a follower begins the timed action at the door:
  - They remain at the door position for the full duration
  - They do NOT break off to fight if attacked
  - They CAN take damage and die (which cancels the action)
  - They do NOT contribute to combat targeting/shooting during the action
  - Visual: follower faces the door, possibly plays a "working" animation or spark effect

### 5. TL movement lock implementation
- Add a `movementLocked` flag to TeamLeader or InputHandler
- When lock action is initiated: set flag, disable click-to-move
- When all marines are positioned and action begins: keep flag until action completes OR release after positioning (TBD — user preference)
- Show visual feedback that TL is locked (subtle UI indicator)

## Risks

- Long action durations (5-10s) during combat could feel punishing — but that's the intended tension
- Follower dying mid-action needs clean cancellation (door stays in previous state)
- TL movement lock could feel frustrating if pathfinding gets stuck — need a timeout/cancel mechanism
- Multiple doors in sequence could chain-lock the TL repeatedly

## Files to Edit

- `src/systems/DoorActionSystem.js` — delegation logic, lock-side coordination, commitment enforcement
- `src/systems/SquadSystem.js` — expanded sync, TL-side auto-move
- `src/config.js` — action duration values
- `src/systems/InputHandler.js` — TL movement lock flag
- `src/entities/MarineFollower.js` — commitment state (no combat during action)
- `src/systems/FollowerCombatSystem.js` — skip followers in door-action state

## Acceptance Criteria

- TL never personally performs weld/hack/lock/unweld when any follower is alive
- Lock action auto-moves all marines to the correct side before starting
- TL cannot move during the repositioning phase of a lock action
- Actions take 5-10 seconds
- Follower stays at door for full duration even if attacked
- If follower dies mid-action, action cancels cleanly
