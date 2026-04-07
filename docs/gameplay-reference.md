# Aliens — Tactical Shooter: Gameplay Reference

> Colonial Marines top-down tactical shooter. One player controls the Team Leader; three AI followers (Tech, Medic, Heavy) operate autonomously according to their roles and the tactical situation.

---

## Table of Contents

1. [Controls](#1-controls)
2. [The Squad — Who's Who](#2-the-squad--whos-who)
3. [Weapons](#3-weapons)
4. [Squad Formations & Movement](#4-squad-formations--movement)
5. [Doors — States & Actions](#5-doors--states--actions)
6. [Enemies](#6-enemies)
7. [The CombatDirector — Tension System](#7-the-combatdirector--tension-system)
8. [HUD & Motion Tracker](#8-hud--motion-tracker)
9. [Missions & Objectives](#9-missions--objectives)
10. [Objects & Pickups](#10-objects--pickups)
11. [Typical Mission Flow](#11-typical-mission-flow)

---

## 1. Controls

| Input | Action |
|-------|--------|
| **LMB click** | Move Team Leader to position |
| **LMB double-click** | Sprint to position (1.5× speed) |
| **Hold RMB** | Fire current weapon |
| **Mouse wheel** | Cycle weapon (Pulse Rifle → Shotgun → Pistol → ...) |
| **Hover / click door** | Open the door action menu |
| **HUD HEAL / marine order** | Trigger a heal order on the selected marine |
| **M / MAP button** | Toggle fullscreen minimap |

> **Movement lock:** During a door Lock action the leader cannot move until the action completes. All other timed door actions (Weld, Hack, Unweld) allow leader movement but will cancel if the leader walks away.

---

## 2. The Squad — Who's Who

### Team Leader (Player)

| Stat | Value |
|------|-------|
| Health | 100 HP |
| Move speed | 120 px/s (180 px/s sprinting) |
| Physics | Cannot be pushed by aliens |

The TL is the only marine the player directly controls. Click to move, hold RMB to fire. The TL fires toward the mouse cursor using `facingAngle` — the bullet direction is always where the mouse points, regardless of the walk animation frame.

Accuracy degrades as health drops (−20% at 0 HP) and at negative morale (−12%). Morale bonuses give up to +7% accuracy. Accuracy is 80–90% base.

---

### Follower: HEAVY — T. CHANG *(Smartgun Operator)*

> **Primary role: Main firepower. Fastest reaction. Protects the leader.**

| Stat | Value |
|------|-------|
| Reaction time | 120 ms (fastest) |
| Damage multiplier | ×1.25 |
| Spread | Very tight (≈0.018 rad) |
| Burst length | 6–10 shots |
| Hit chance | 72–84% |
| Jam sensitivity | Low |
| Tint | Amber/gold |

**Combat behaviour:** The Heavy reacts first, hits hardest, and prioritises high-value threats (queens) and enemies swarming the TL. When the CombatDirector assigns lanes (see §7), the Heavy covers the **primary threat lane**. Suppression chance 74% — the Heavy will continue firing at last-known positions after losing sight.

**Door actions:** Third-fallback actor for timed door work (Tech → Medic → Heavy).

**Idle scan:** Covers relative West (left flank relative to leader facing).

---

### Follower: TECH — M. HORROWITZ

> **Primary role: Door specialist. Secondary firepower. Monitors for drones.**

| Stat | Value |
|------|-------|
| Reaction time | 340 ms |
| Damage multiplier | ×1.0 |
| Spread | 0.045 rad |
| Burst length | 4–7 shots |
| Hit chance | 58–70% |
| Jam sensitivity | Moderate |
| Tint | Light blue |

**Combat behaviour:** Slower to engage than the Heavy but reliably targets **door-attacking aliens** (priority score −56 when an alien is damaging a door) and **drones** specifically. Covers the secondary threat lane in split-fire directives. Suppression chance 58%.

**Door actions:** **First-choice** actor for all timed door actions: Hack, Lock, Weld, Unweld. When a door order is issued, Tech pathfinds to the door and begins work automatically, provided they are not already busy.

**Idle scan:** Covers relative East (right flank relative to leader facing).

---

### Follower: MEDIC — L. SHEEN

> **Primary role: Support. Healing. Protects wounded teammates.**

| Stat | Value |
|------|-------|
| Reaction time | 460 ms (slowest) |
| Damage multiplier | ×1.0 |
| Spread | 0.045 rad |
| Burst length | 4–7 shots |
| Hit chance | 58–70% |
| Jam sensitivity | High |
| Tint | Light blue |

**Combat behaviour:** Last to engage. When any teammate is below 72% HP, the Medic shifts priority to shooting aliens closest to that wounded marine. Prefers short-range targets; applies a penalty to threats beyond ~62% of torch range. Suppression chance 58%.

**Healing:** Preferred heal operator when a heal order is issued. If the Medic is busy (door task, already in combat), Tech or Heavy can perform heals as a fallback.

**Idle scan:** Covers relative North (ahead, relative to leader facing).

---

### Squad Morale System

Morale is a shared squad stat ranging **−100 to +100**, decaying toward 0 at 7/sec.

| Event | Morale change |
|-------|---------------|
| Enemy kill | +5 |
| Marine takes damage | −10 (max every 700 ms) |
| Ally hit | −3 (max every 1.1 s) |
| Objective completed | +10 |
| Weapon jam | −5 |
| Low HP (<55%) or large swarm | Ongoing fear pulses |

**Effects:** Positive morale → up to +7% hit chance. Negative morale → up to −12% hit chance, more weapon jams, and higher aggression multipliers from the CombatDirector.

---

## 3. Weapons

The player starts with only the **Pulse Rifle**. Shotgun and Pistol must be found as pickups.

### Pulse Rifle

| Stat | Value |
|------|-------|
| Damage | 13 per bullet |
| Fire rate | ~5 rounds/sec at default heat rate |
| Ammo | Unlimited via overheat system |
| Spread | 0 (perfectly accurate) |
| Bullet speed | 1,800 px/s |

**Overheat system:** The HUD counter runs from 99 → 0 at −23/sec while firing. Releasing the trigger recharges at +32/sec. If the counter hits 0, the weapon locks out for **2 full seconds**. After a lockout, the counter must recharge back to 24 before it unlocks again. A low-ammo warning indicator fires below 15. Followers also use pulse rifle stats scaled by their role multipliers.

One in three bullets is a visible tracer round. Recoil: 0.08 radians per shot, decaying at 2.4/sec.

---

### Shotgun

| Stat | Value |
|------|-------|
| Damage | 18 per pellet × 5 pellets (max 90 per shot) |
| Fire rate | 2 shots/sec |
| Ammo | 60 shells (limited); +15 per ammo pickup |
| Spread | ±8.6° total cone + per-pellet random jitter (0.04 rad) |
| Bullet speed | 1,500 px/s |

Strongest close-range burst in the game. All pellets are visible tracers. Highest recoil (0.35 rad/shot). Must be picked up to unlock — the player starts without it.

---

### Pistol

| Stat | Value |
|------|-------|
| Damage | 12 per bullet |
| Fire rate | 4 shots/sec |
| Ammo | 36 rounds on pickup (limited); +20 per ammo pickup |
| Spread | 0 |
| Bullet speed | 1,600 px/s, lifespan 1,500 ms (longest range) |

Fastest firing rate of the three. The long bullet lifespan makes it useful for long corridors. Least recoil recovery.

---

## 4. Squad Formations & Movement

### A. Snake Follow *(leader moving)*

When the leader has an active path AND the nearest follower is more than 2 tiles away, followers enter **single-file snake mode**. Each follower tracks the leader's position history with a 250/500/750 ms stagger respectively, following the exact path the leader walked.

- Base speed: **180 px/s**
- Catchup boost: up to ×1.8 when far behind
- Sprint: all followers also run at 1.5× speed

### B. Diamond Formation *(squad stopped)*

When the leader stops and the squad converges within 2 tiles, followers take up **rotated diamond slots** based on the leader's facing direction:

| Role | Position |
|------|---------|
| Heavy | Left near-flank (≈55 ahead, 67 left) |
| Tech | Right near-flank (≈55 ahead, 67 right) |
| Medic | Far rear center (≈118 behind) |

Formation speed: **140 px/s**. Each follower micro-patrols with a ±26px random offset refresh every 2.5–4.5 s so the squad looks alive, not frozen.

### C. Idle Coverage Scan *(no threats, squad formed)*

With no detected enemies, each follower sweeps their torch in a role-relative sector (Heavy: left, Tech: right, Medic: rear). Coverage plan is dynamically replanned every 1.6–3.2 s to avoid overlap and avoid sweeping into walls.

When an enemy is detected: all followers snap to face the threat position.

### D. Door Sync Mode *(door action queued)*

For any timed door action, the squad stacks up on the **same side as the leader** before work begins:

1. Working marine pathfinds to door at 1.35× speed
2. All others move to flanking positions ~1.25 tiles out at 1.3× speed, 44 px apart laterally
3. Once everyone is on-side (or 2 s timeout), work begins
4. The worker is **pinned** to their position during the action so separation forces can't drift them off the door

---

## 5. Doors — States & Actions

### Door States

| State | Passable | Alien can open | Actions available |
|-------|---------|----------------|-------------------|
| **Closed** | No | Drone, Queen Lesser, Queen | Open, Lock (electronic), Weld |
| **Open** | Yes | N/A | Close |
| **Locked** | No | Queen (force breach only) | Hack (electronic), Weld |
| **Welded** | No | Queen (force breach only) | Unweld |
| **Destroyed** | Yes | N/A | — |

Hover or click a door to open the context menu showing available actions.

### Timed Actions

| Action | Duration | Who does it | Notes |
|--------|----------|------------|-------|
| **Hack** | 3,000 ms | Tech (preferred), Medic, Heavy, TL | Unlocks a locked electronic door |
| **Lock** | 3,000 ms | Tech (preferred), Medic, Heavy, TL | Secures door against aliens. Leader movement locked during approach |
| **Weld** | 4,000 ms | Tech (preferred), Medic, Heavy, TL | Permanently seals. Plays looping weld audio. Spark VFX |
| **Unweld** | 3,000 ms | Tech (preferred), Medic, Heavy, TL | Cuts through weld seal |

**Open** and **Close** are instant — no specialist required, no sync wait.

A **progress bar** appears over the door for all timed actions. The working marine faces the door and holds position for the full duration.

### Door Durability

Doors start at **105 hit points** (configurable). Only bullets and alien attacks reduce this.

- **Bullet damage:** scaled to 0.34× normal — roughly 25–30 default pulse-rifle hits to destroy a closed door
- **Warrior:** 1 damage/hit, 600 ms cooldown
- **Queen Lesser:** 2 damage/hit, 520 ms cooldown  
- **Queen:** 3 damage/hit, 420 ms cooldown — fastest and most dangerous door attacker
- Locked/welded doors are **immune to normal alien damage** — only the Queen can force-breach them via her `canBreachAnyDoor` ability

---

## 6. Enemies

### Combat Stats (base values, scaled at spawn — see §7)

| | Warrior | Drone | Facehugger | Queen Lesser | Queen |
|--|---------|-------|------------|-------------|-------|
| **Health** | 34 | 44 | 24 | 82 | 132 |
| **Speed** | 98 | 120 | 100 | 120 | 125 |
| **Contact damage** | 15 | 18 | 7 | 30 | 38 |
| **Attack cooldown** | 750 ms | 560 ms | 310 ms | 620 ms | 690 ms |
| **Aggro range** | 640 px | 520 px | 600 px | 1,200 px | 1,200 px |
| **Door damage/hit** | 1 | 2 | 0 | 2 | 3 |
| **Opens unlocked doors** | No | **Yes** | No | **Yes** | **Yes** |
| **Breaches any door** | No | No | No | No | **Yes** |
| **Uses vents** | No | **Yes** | No | No | No |

> At default difficulty settings, spawn-time HP is multiplied ×2.85 and speed ×1.72.  
> Warriors: ×1.18 HP durability. Drones: ×1.14. Facehuggers: ×1.10. Queens: ×1.08.

---

### Warrior

> *Fast melee attacker. Attacks in coordinated packs from multiple angles.*

**Behaviours — 4-intent state machine** (re-evaluated every 650–1,250 ms):

| Intent | Trigger | Action |
|--------|---------|--------|
| **Assault** | Close range (<2.5 tiles) OR high pressure OR most allies assaulting | Rushes TL along an assigned lane angle (3 lanes at normal, 4 lanes at high pressure) at ×1.1 speed |
| **Flank** | Mid-range (>5.8 tiles), pressure moderate, few allies assaulting | Approaches at 60–90° offset, finding the least-defended side at ×1.05 speed |
| **Probe** | Long range, low threat count | Orbital circle at ~2.5 tile radius, testing defences at ×0.68 speed |
| **Retreat** | Below 25% HP, no nearby allies | Backs away toward healthy allies at 78% speed |

**Melee system:** Lunge → swipe → short bounce (await 110–180 ms) → lunge. Can leap at targets 1.8–5.4 tiles away (18% chance, ×2.15 speed, 180–280 ms).

**Gunfire response:** On the first shot in a firefight, warriors within aggro range **freeze briefly, screech, then pounce** toward the sound source (×1.58 speed for 680–980 ms). 2.2–3.8 s cooldown on the screech.

**Assault lane system:** The pack distributes across 3–4 preset angle offsets so warriors arrive from multiple vectors simultaneously rather than all rushing from the same direction.

**Hit slow:** Warriors are highly resistant to slowdown effects (×0.45 scale vs other types).

---

### Drone

> *Fast, cunning ambusher. Can open doors. Appears and disappears via vents.*

**Vent Ambush:**  
When 6–15 tiles from a target, and a vent exists within 4 tiles of the target and 6 tiles of the drone's current position, the drone may teleport through the ceiling:

1. Drone body vanishes — **fully invisible and OFF the motion tracker**
2. 800–1,500 ms travel time (in the vents)
3. Drone emerges directly adjacent to the target
4. 8–15 s cooldown before the next ambush

Vents are not random — they map to 12 fixed anchor points on the level.

**Door behaviour:** Drones actively open unlocked doors during pathfinding, potentially routing around barriers the player has set up.

---

### Facehugger

> *Low health, terrifyingly fast. Kills instantly if it catches a weakened marine.*

**Movement:** Uses a spring-damper physics system — direction changes produce realistic overshoot and the characteristic "slippery racing" feel.

**No collision with walls or doors** — facehuggers slip under and through obstacles.

**Leap state machine:**

1. **Approach** at ×1.1 speed
2. **Kite** (close range, leap on cooldown) — erratic high-speed dodging at ×1.3–×1.8 speed
3. **Leap** (within 2 tiles, 70% chance) — ×2.2 speed lunge for 420 ms
4. **Contact result:**
   - Target below 31% HP → **Instant kill** (deals HP + maxHP damage)
   - Target healthy → Bounce off, short retreat
   - Up to 3 nearby alien eggs burst open on successful contact (cascade spawn)
5. **Post-leap:**
   - 55% chance: full flank cycle (flee off-screen → wait 1.5–3 s → reappear at perpendicular angle, invisible until close)
   - 45% chance: short retreat and cooldown (840–1,500 ms)

---

### Queen (Lesser)

> *Massive, high-health bruiser. Giant aggro range. Cannot be ignored.*

- 1,200 px (~18 tiles) aggro range — will detect marines across most maps immediately
- Can open unlocked doors; cannot breach locked/welded ones
- 2 damage per door hit at 520 ms cooldown
- Same lunge-and-swipe melee mechanics as the Warrior (attack leap chance 12%)
- sizeScale 1.45 — substantially larger than warriors

No special abilities beyond persistence and exceptionally high health.

---

### Queen (Alien Queen)

> *Apex threat. Breaches any door. Highest damage. Enormous health pool.*

All of the above Queen Lesser traits, plus:

- **`canBreachAnyDoor`** — the Queen ignores `locked` and `welded` door states entirely. No door can stop her.
- **3 door damage per hit** at 420 ms cooldown — the fastest sustained door DPS of any enemy
- 1,200 px aggro range
- sizeScale 1.80

The Queen is the only enemy that makes Welding unreliable as a permanent solution — she will smash through regardless.

---

### Alien Death

On death:
- **Immediately removed from physics and targeting** (`setActive(false)`)
- Corpse stays visible for **8 seconds** with a quadratic alpha fade (slow start, fast end)
- Tinted dark green corpse colour
- **Body-part debris** spawns (tail, limb, crest, shard fragments) — facehuggers excluded
- **Acid blood** splashes at the hit position on every direct hit
- Live aliens **steer around corpses** (72 px avoidance radius)

---

### Phantom Blips

During the director's **build** (pre-wave tension) phase, occasional **false motion tracker contacts** are injected every 3–8 seconds:
- 1 or 2 blips per event, placed 200–500 px from a random marine
- They appear on the motion tracker as genuine contacts (lower confidence: 0.3–0.5) but have no actual sprite or body
- Stop appearing once the director enters `peak` or `release` state
- Designed to build tension: *"They're in the walls."*

---

## 7. The CombatDirector — Tension System

The CombatDirector continuously measures combat intensity and drives alien behaviour globally.

### Pressure Calculation (each frame)

```
Pressure = (on-screen hostiles / 15) × 0.36
         + (team damage taken recently / 55) × 0.24
         + (door pressure tally / 5) × 0.20
         + (marines firing: +0.08 if yes)
         + (negative morale / 75) × 0.12
```

Pressure rises faster than it falls (0.82/s up vs 0.55/s down). Safety valves reduce pressure if the team is struggling: if team HP < 50% and pressure > 0.58, target × 0.82.

### Tension States

```
BUILD ──► PEAK ──► RELEASE ──► BUILD (repeats)
```

| State | Trigger | What changes |
|-------|---------|-------------|
| **Build** | Default / after Release (pressure floor ≤26%) | Phantom blips active. Dynamic reinforcement spawns. Gradual pressure ramp |
| **Peak** | Pressure ≥ 0.78, sustained 2.6 s | Alien aggression ×1.96, flank ×1.92, door damage ×1.94. Marines: −28% accuracy, +58% jam chance. Peak holds 3–9.5 s |
| **Release** | Pressure ≤ 0.41 after peak (or 9.5 s timeout) | Aliens back off. Marines: +10% accuracy, −8% jams. Aliens less aggressive. Release lasts 2.2–10.5 s |

**Emergency lighting mode:** The ambient scene tint changes with director state — darker and redder at peak, slightly warmer in release.

### Dynamic Spawns

During `build` state, if there has been no firefight or melee contact for a sustained quiet window:
- 1–3 aliens spawn at valid unseen walkable tiles away from the marines
- Budget: up to 12 per tension cycle (resets each build→release→build)
- Longer the quiet, the bigger the spawn event (up to 3 at once)

### Per-Mission Enemy Budgets

| Mission | Budget |
|---------|--------|
| M1 — Cargo Concourse | 24 |
| M2 — Reactor Spine | 32 |
| M3 — Queen Cathedral | 40 |
| M4 — Hydroponics Array | 46 |
| M5 — Docking Ring | 56 |

Budget caps the total pool of aliens available for dynamic spawning across the mission. Wave spawns are a separate one-time event.

### Spawn Rules

An alien will only spawn at a position that is:
1. Not in any marine's line of sight
2. Not inside any marine's torch beam
3. At least 8 tiles from any marine (13 tiles near mission start zone)
4. On a walkable tile

---

## 8. HUD & Motion Tracker

### Squad Status Cards

Four CRT-style panel cards run across the top of the screen (left to right: Leader, Tech, Medic, Heavy).

| Element | What it shows |
|---------|---------------|
| **HP readout** | Current health as 2-digit number. Green at full, **orange below 50%**, **red below 25%**, dashes when KIA |
| **Ammo readout** | Pulse Rifle: heat counter 99→0. Shotgun/Pistol: rounds remaining. Pulses red when low. Dashes when KIA |
| **EKG lines** | Green cardiac waveform + orange SpO2 line. Speed adapts to stress level (HP, nearby enemies). Flatlines on KIA |
| **Video portrait** | Looping character feed. Replaced by CRT static/interference when KIA |
| **Weapon name** | Leader card only: shows current weapon name above ammo |
| **Overheat bar** | Leader card only: shows HEAT when overheating. REL indicator prompts releasing trigger |
| **Name label** | Role/name. Appended with [KIA] on death |

### Motion Tracker

A small world-space device that appears **below the Team Leader sprite** when enemies enter the detection cone.

| Property | Value |
|----------|-------|
| Cone angle | 60° (±30° of leader's facing) |
| Range | 23 tiles (1472 px) |
| Position | 28 px below TL sprite, world-space |
| Opacity | 50% |
| Size | 36×36 px |

**Behaviour:**
- Hidden when no enemies are in cone
- On first contact: interference video plays (fade-in → hold → fade-out), then the contact count flashes
- Flash rate is urgency-based: slow (~1,400 ms) when enemies are far away, fast (~200 ms) when many are close
- Periodic re-interference every 5–15 s while contacts persist
- All motion contacts (including **phantom blips**) appear on the minimap as red dots across the whole map

### Minimap

190×130 px panel, bottom-right corner. Always visible. Press **M** or click **MAP** to expand fullscreen.

| Blip | Colour |
|------|--------|
| Team Leader | Green (pulsing) |
| Followers | Blue |
| Enemy contacts | Red (flashing) |
| Next objective marker | Gold diamond (pulsing) |

Enemy contact blips show **all** motion contacts regardless of torch range — including phantom blips and door-occluded enemies.

---

## 9. Missions & Objectives

### The Five Missions

| # | Name | Map | Objective |
|---|------|-----|-----------|
| **M1** | Cargo Concourse | lv1_colony_hub | Reach elevator with access credentials |
| **M2** | Reactor Spine | lv2_reactor_spine | Collect card then reactivate security terminal |
| **M3** | Queen Cathedral | lv5_queen_cathedral | Cross lockdown sectors and secure elevator route |
| **M4** | Hydroponics Array | lv6_hydroponics_array | Collect two cards and route power to elevator |
| **M5** | Docking Ring | lv9_docking_ring | Unlock ring sectors and board freight elevator |

### Objective Types

#### Security Cards *(marker value 4)*

Walk the Team Leader within 52 px of a card marker tile to collect it. Each card collected triggers:
- Morale gain across all marines (+10 per marine)
- "OBJECTIVE SECURED" floating text
- Objectives panel updates

#### Terminal Uplinks *(marker value 3)*

Same collection mechanic as cards — approach within 52 px to activate. At least one mission (M2+) requires activating a terminal after collecting the card.

#### Wave Cleared

Waves track through `StageFlow`. Each wave is `'combat'` state. When all live aliens are dead and the director has exhausted its budget, the wave transitions:
- If more waves remain: 1.5 s intermission → next wave
- If this was the last wave: `StageFlow` enters `'extract'` — satisfying the wave objective

Standard generated missions currently use 2 waves on normal and 3 on hard/extreme, so "wave cleared" means finishing the active stage before extraction unlocks.

### Extraction Flow

**All three conditions must be met simultaneously:**
1. Waves cleared (`StageFlow.state === 'extract'`)
2. All required security cards collected
3. All required terminals activated

When all conditions are met:
1. Up to 3 doors near the elevator that were automatically locked/sealed at mission start are **force-opened**: *"SECURITY GATES UNLOCKED: ELEVATOR ACCESS"*
2. A **green extraction ring** appears at the elevator tile
3. Minimap objective marker points to the elevator
4. Lead the Team Leader into the ring to complete the mission

**Defeat:** If the Team Leader's health reaches 0 at any point, the mission ends immediately.

### Scripted Setpiece Surges

Each mission has one scripted surge event that fires once when certain timing and pressure conditions are met:

| Mission | Trigger (approx.) | Direction | Size | Notes |
|---------|------------------|-----------|------|-------|
| M1 | ~28 s | East | 3 aliens | Intro push, directive: HOLD FORMATION E |
| M2 | ~18 s | North | 4 + 1 hugger | Reactor sweep, directive: SPLIT N/E FIRE |
| M3 | ~22 s | North | 5 + 1 hugger | Cathedral wave, directive: FALL BACK N ARC, forces tight formation |
| M4 | ~24 s | East | 4 + 1 hugger | Hydro flank, directive: SPLIT E/S FIRE |
| M5 | ~28 s | East | 5 + 1 hugger | Ring pincer, directive: SPLIT E/N FIRE |

After a setpiece, the CombatDirector issues a **tactical directive** to the followers (e.g., `SPLIT N/E FIRE`) — followers adjust their target lane priorities for 5–8 seconds.

---

## 10. Objects & Pickups

### Pickups

Pickups are static world objects. Walk the Team Leader over them to collect.

| Item | Effect |
|------|--------|
| **Medkit** | Heals **28 HP** to the leader |
| **Shotgun ammo pack** | +10 shotgun shells |
| **Pistol ammo pack** | +20 pistol rounds |

Shotgun and Pistol are not available until their corresponding ammo/weapon pickups are found. They do not respawn by default.

### Doors

See §5 for full door mechanics. Doors are interactive objects that shape both marine pathing and alien movement.

### Acid Pools

Created on alien death or from spitter-type projectiles:

| Property | Value |
|----------|-------|
| Duration | 5,000 ms |
| Damage | 10 HP/sec to any marine standing in it |
| Visual | SVG splatter, blood animation, steam particles |

Facehugger leap contacts also create a small acid splash.

### Alien Eggs *(passive)*

Eggs are stationary objects. They are always fully visible. When a facehugger reaches a weakened target (≤31% HP), nearby eggs burst open simultaneously (cascade: up to 3 within 4 tiles), releasing additional facehuggers.

---

## 11. Typical Mission Flow

```
MISSION START
├─ Map loads, pathfinding grid built
├─ Doors placed (some auto-locked near elevator as extraction gates)
├─ Pickups spawn
├─ HUD cascade boot animation
└─ CombatDirector begins in BUILD state, pressure = 0

EARLY GAME (~0–30 s)
├─ CombatDirector gradually raises pressure
├─ Small alien patrols or idle-spawns appear
├─ Phantom blips may appear on motion tracker during quiet moments
└─ Squad moves in snake formation to explore

MISSION SETPIECE (~15–30 s, mission-specific)
├─ Scripted surge arrives from a fixed direction
├─ Directive broadcast to followers ("HOLD FORMATION E", etc.)
└─ Intense firefight — squad may enter PEAK state briefly

MID-GAME — OBJECTIVES + WAVES
├─ TL collects security cards (52 px proximity)
├─ TL activates terminals (52 px proximity)
├─ Each objective: marine morale +10, "OBJECTIVE SECURED"
├─ Director cycles BUILD → PEAK → RELEASE every few minutes
└─ Dynamic corridor surges every 15–22 s at pressure ≥ 0.54

WAVE CLEARED
├─ All director budget exhausted, all aliens dead
└─ StageFlow → 'extract' (satisfies wave objective)

ALL OBJECTIVES MET
├─ Extraction security gates force-open near elevator
├─ "SECURITY GATES UNLOCKED" message
└─ Green extraction ring appears at elevator tile

EXTRACTION
└─ Lead TL into the green ring → MISSION COMPLETE

FAILURE STATE (any time)
└─ TL health = 0 → MISSION FAILED
```

---

## Appendix: Commander Directives

The `CommanderSystem` analyses enemy weight per compass lane every 180 ms and broadcasts a directive:

| Directive | Condition |
|-----------|-----------|
| `ADVANCE & SCAN` | Low overall threat |
| `ANCHOR X LANE` | Moderate single-direction threat |
| `SPLIT X/Y FIRE` | Two high-threat lanes |
| `FALL BACK X ARC` | Overwhelming single-direction threat |

Followers adjust lane targeting accordingly for the directive duration. Mission setpieces override directives with their own. Directives appear in the MissionLog overlay.
