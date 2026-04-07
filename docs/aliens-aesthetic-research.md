# Aliens Franchise Aesthetic & Gameplay Design Research

Comprehensive reference for implementing the Aliens (1986) and Aliens: Colonial Marines (2013) aesthetic in a Phaser.js top-down tactical squad shooter.

---

## 1. Visual Aesthetic: Hadley's Hope Colony

### 1.1 Surface Materials & Architectural Language

The colony is a **prefabricated industrial installation** — think modular ISO-container architecture bolted together on an alien world. Every surface communicates function:

| Surface Type | Visual Treatment | Hex Palette Targets |
|---|---|---|
| **Corridor floors** | Diamond-plate steel grating with visible drainage seams every 3–4 tiles. Dark, scuffed, oil-stained. | Base `#1a2128`, seam highlight `#2a3640`, drain grate `#0e1518` |
| **Walls — lower panels** | Ribbed steel with vertical bolt lines every 2 tiles. Kick-plate damage near floor level. | `#2e3842` base, bolt `#1a2228`, scuff `#3a4450` |
| **Walls — upper panels** | Smoother composite panels with stenciled zone labels (A-17, B-LEVEL, SUB-2). Corporate logos. | `#3a4048` base, stencil `#556068` |
| **Warning stripes** | Chevron hazard tape on door frames, airlock edges, power conduit runs. Always 45° diagonal. | Yellow `#c4a820` on black `#181818`, or red `#a03020` on steel |
| **Ceiling infrastructure** | Exposed conduit bundles, cable trays, ventilation ductwork — visible as wall-top detail in top-down. | Dark `#141a20`, pipe highlight `#283038` |
| **Corporate/medical spaces** | Cleaner white-ish polymer walls, flush-mounted light panels, clean tile. The "before" contrast. | `#c8ccd0` wall, `#e0e4e8` floor, `#8090a0` trim |
| **Alien-infested areas** | Organic resin secreted over existing architecture. Irregular, ribbed, wet-looking. Walls disappear under biomechanical growth. | Resin `#1a1812`, wet highlight `#2a2820`, slime green `#2a3818` |

### 1.2 Environmental Storytelling Dressing

These props read clearly in top-down and establish "lived-in colony" vs. "alien-compromised zone":

**Colony (intact) props:**
- Cargo crates (olive drab `#434830`, stenciled labels)
- Floor-mounted bollards and guide rails (yellow `#b89820`)
- Wall-mounted fire extinguishers and first-aid kits (red `#a82020`, white cross)
- Overhead pipe runs crossing corridors (shadow lines on floor)
- Steam vents — 1-tile bright spots that pulse (white `#e8e8e8` → `#a0a8b0`)
- CRT monitors on desks (green phosphor `#33ff88` glow halo, 2-tile footprint)
- Stacked supply pallets and floor-mounted equipment racks

**Colony (compromised) props:**
- Resin-webbed doors (partially transparent, organic texture over door frame)
- Cocooned colonists against walls (pale flesh tone `#d8c8b0` wrapped in `#1a1812` resin)
- Acid damage pits in floor (acid green `#88cc22` with dark corrosion rim `#2a2818`)
- Upturned furniture, scattered personal effects
- Flickering or destroyed light sources
- Slime trails on floor (subtle translucent green tint `#1a2818` at 0.15 alpha)

### 1.3 Lighting Design Language

The film uses **three distinct lighting zones** that create immediate visual storytelling. This is the single most important aesthetic element:

#### Zone A — Normal Operations (Cool Blue-Steel)
- **Color temperature:** 6500K+, rendered as `#4488aa` to `#6699bb`
- **Application:** Intact corridors, command areas, medical. Overhead fluorescent strips cast even, cold light.
- **In Phaser:** Ambient darkness at 0.45–0.55. Torch/flashlight tint should lean cool blue `#88bbdd`.
- **Key detail:** Fluorescent lights in the film flicker and buzz — implement as subtle alpha oscillation (0.85–1.0, sine wave at ~3Hz) on room light sources.

#### Zone B — Emergency/Alert (Warm Amber)
- **Color temperature:** 2200K, rendered as `#ff8830` to `#ffaa44`
- **Application:** Triggered by combat, power failures, lockdown. The film switches entire sections to this palette when things go wrong.
- **In Phaser:** Emergency light sources at door frames and corridor intersections. When `CombatDirector.state === 'peak'`, additional amber point lights activate. Floor warning stripe tiles should pulse.
- **Key detail:** Emergency lights are **rotating beacons** in the film — in top-down, render as a slow-rotating cone of amber light from wall-mounted positions.

#### Zone C — Alien Nest (Near Darkness + Selective Highlights)
- **Color temperature:** No artificial lighting. Only torch beams and acid-green bioluminescence.
- **Application:** Fully infested areas. The resin absorbs light, so torch range should decrease (multiply by 0.7 in hive zones).
- **In Phaser:** Raise `AMBIENT_DARKNESS` to 0.7–0.8 in hive tiles. Add faint green point lights (`#1a4422`, radius 60px, alpha 0.08) at egg cluster positions and resin wall nodes.
- **Key detail:** The Queen's chamber in the film has a sickly amber underlighting from the egg sacs — implement as faint warm glow `#443818` rising from egg tile positions.

### 1.4 The Motion Tracker Display (M314 Prop)

The film's motion tracker is one of cinema's most iconic UI props. Your `MotionTracker.js` already captures much of this. Specific film-accurate refinements:

- **Phosphor color:** The film uses P1 phosphor green — `#33ff88` is close but slightly cyan. Pure film match is `#30e070` with a faint blue scanline interference.
- **Display format:** Concentric range arcs, not a full radar sweep. The film prop shows **forward-facing 60° cone** with distance rings, not 360° sweep. Your implementation uses 360° which is fine for gameplay, but adding a "primary arc" in the leader's facing direction with brighter rendering would sell the aesthetic.
- **Signal representation:** Contacts in the film are **vertical bar blips** that grow in height with proximity, not dots. Consider rendering contacts as short vertical line segments (`g.fillRect(px, py-h, 2, h)` where `h` scales with proximity).
- **CRT decay:** Real CRT phosphor has afterglow — blips persist and slowly fade after the sweep passes. Already partially implemented via `contactEchoes` — increase `maxEchoAgeMs` to ~1800 for more visible persistence.
- **Interference noise:** When contacts are numerous or close, the film tracker gets noisy/saturated. Add random static dots (green, alpha 0.05–0.12) proportional to contact count.

---

## 2. Audio & Atmosphere Design

### 2.0 2026 research grounding

External reference check:
- The Academy Awards database and Academy highlights confirm **Aliens** won the **1987 Oscar for Visual Effects** and **Sound Effects Editing**.
- Academy material on the film's anniversary screening emphasizes that the movie's effects identity came from pushing **in-camera, pre-CGI practical/optical methods** very hard.

Implication for this game:
- Favor an audiovisual treatment that feels **practical, mechanical, and industrial**.
- Prefer layered light, smoke, sparks, camera-feed degradation, and physically suggestive material response over clean digital sci-fi gloss.
- Sound and VFX should feel like they come from machines, pressure, stress, and wet biological matter, not abstract “future tech.”

### 2.1 The Motion Tracker Ping

The film's tracker ping is a **short, sharp descending chirp** — approximately 1200Hz square wave dropping to 800Hz over ~80ms, with a subtle harmonic at 1.5× the fundamental. The current `playTrackerPing()` is close. Film-accurate refinements:

- **Ping rate:** In the film, the ping rate increases with proximity — from ~1 ping/2sec at max range to continuous high-frequency chirp at close range. Map this to `1 / (proximity * 0.5 + 0.1)` pings per second.
- **Double-ping on first detection:** The film consistently uses a **double chirp** when a new contact first appears. Play two pings 120ms apart when a contact transitions from unseen to detected.
- **Static burst between pings:** Between pings, the tracker emits a faint white-noise hiss (`createNoise(t, 0.02, 0.03, 800, 3000)`) — the "carrier signal."
- **Presentation principle:** The tracker should sell fear through information cadence. It is most effective when it suggests approach, ambiguity, and unseen geometry rather than simply confirming visible enemies.

### 2.2 Pulse Rifle (M41A)

The film's M41A has one of the most recognizable weapon sounds in cinema — a **rapid hammering mechanical report** with a distinctive high-frequency component. It's part jackhammer, part heavy stapler. Your looping implementation (`pulse_rifle_long`) is the right approach. Key characteristics:

- **Rate of fire:** The film's pulse rifle fires approximately 900 RPM — your 150ms fire rate (400 RPM) is slower for gameplay reasons, which is fine. The audio loop should still convey the fast cyclic nature.
- **Shell casing eject sound:** Each burst in the film has a tinkling brass component. A very quiet high-frequency transient (`createTone(3200, 'triangle', t + 0.01, 0.03, 0.02)`) on each shot.
- **Magazine empty click:** When ammo runs out, a distinct dry mechanical click. Implement as sharp 200Hz square + 800Hz transient, 30ms duration.
- **Grenade launcher thump:** If you ever add the under-barrel launcher — deep `80Hz` sine thump + air-rush noise.
- **Mixing note:** The pulse rifle should not sound “fat” in a modern cinematic way. It should sound aggressive, narrow, percussive, and militarily functional, with brightness concentrated in the attack rather than a long bass tail.

### 2.3 Ambient Soundscape Layers

The film maintains a constant **industrial substrate** of sound. These should be procedurally generated background layers tied to location and combat state:

| Layer | Sound Profile | Trigger |
|---|---|---|
| **Ventilation hum** | Low continuous drone, 60Hz + 120Hz harmonics at very low volume. Subtle warble. | Always active in colony zones. Disabled in open/outdoor areas. |
| **Pipe stress groans** | Deep metallic creaks, random 2–8 second intervals. 80–200Hz with resonance. | Random timer, more frequent during `build` state. |
| **Steam hiss** | Filtered white noise burst, 800–4000Hz, 200–500ms duration. | Near steam vent tiles, or random ambient. |
| **Distant thumps** | Sub-bass impacts (<80Hz), irregular rhythm. | During `build` and `peak` states. Aliens moving in the walls. |
| **Radio static** | Crackling white noise, brief squelch tones. | Before squad callouts. |
| **Alien chittering** | High-frequency clicks and scrapes, 2000–6000Hz, very quiet. | When aliens are nearby but unseen. Proximity-scaled volume. |

Additional recommended ambient layers for this project:

| Layer | Sound Profile | Trigger |
|---|---|---|
| **CRT / monitor hash** | Faint electrical fizz, barely audible, band-limited | Near active HUD-heavy control rooms or terminals |
| **Door servo strain** | Short electric motor + stressed latch chatter | When doors are cycling, locking, or resisting breach pressure |
| **Weld burn spit** | Sharp crackle with intermittent bright transients | During welding / unwelding actions |
| **Resin drip / slime tick** | Sparse wet plinks, close-mic feel | Hive / nest zones only |

### 2.4 Radio Chatter Style

The film establishes a specific military radio protocol. Colonial Marines expanded on this significantly. Your callout system in `GameScene.js` already implements this well. Film-authentic patterns:

**Callout structure:** `[Urgency prefix] + [Content] + [Suffix]`
- Normal: "Movement, sector four." / "All clear this side."
- Alert: "Contact! I've got movement!" / "Something on the tracker!"
- Combat: "They're coming out of the walls!" / "Short controlled bursts!" / "Let's rock!"
- Panic: "GAME OVER MAN, GAME OVER!" / "We're all gonna die!"

**Radio processing effect:** All squad callouts should have a subtle bandpass filter quality — boost 800–3000Hz, cut below 400Hz and above 4000Hz. A slight distortion/clip. This is the "hearing through a radio" effect. Implement with Web Audio `BiquadFilterNode` chain.

**Colonial Marines additions:**
- Target callouts with clock positions: "Contact, two o'clock!"
- Status reports: "Mag change!" / "Reloading!" / "Gun's jammed!"
- Acknowledgments: "Copy that." / "Roger." / "Solid copy."

Implementation note for this project:
- Idle chatter should stay sparse.
- Radio lines become valuable when they:
  - confirm unseen threat vectors
  - reinforce marine roles under pressure
  - punctuate damage / reload / door states
- Avoid too many “cool” lines that dilute tension.

---

## 3. Gameplay Feel: Colonial Marines Design Patterns

### 3.1 Tension Curve Architecture

The film and game both follow a **precise tension wave pattern** that maps directly to your `CombatDirector` states:

```
Film Structure:
QUIET → TRACKER PINGS → FIRST CONTACT → ESCALATION → OVERWHELMING → DESPERATE ESCAPE → BRIEF REPRIEVE → REPEAT

CombatDirector mapping:
build (QUIET/PINGS) → peak (ESCALATION/OVERWHELMING) → release (REPRIEVE)
```

**Key design principle:** The quiet periods are as important as the loud ones. The film spends **60–70% of its runtime in tension-building**, not combat. Your `buildMinMs: 2600` is short — the film's build phases last 3–8 minutes. Consider `buildMinMs: 8000–15000` for more authentic pacing, with the motion tracker providing the anxiety during build phases.

**"They're in the room" moment:** Colonial Marines features moments where the tracker shows contacts and the squad can't see them — they're in the ceiling/vents. Implement as: during `build` state, spawn "phantom" contacts that appear on the motion tracker as brief blips but have no visible entity on screen. This creates the "where are they?" anxiety.

Project refinement:
- Build phases in this repo are currently short for the target mood.
- If pacing is revisited, prefer longer suspicion windows with:
  - more directional audio hints
  - more tracker uncertainty
  - fewer visible enemies
  - stronger environmental stress sounds

### 3.2 Door Mechanics (Welding/Barricading)

The "seal the doors" scene in the film is iconic. Your `DoorManager` and `DoorActionSystem` already support welding. Film/game expansions:

- **Weld sparks visual:** During welding, emit a shower of bright orange-white particles from the door position. In the film, the welding torch creates dramatic light that illuminates the marine's face.
- **Weld quality mechanic:** In the film, Hudson's weld job is explicitly described as poor. Consider a weld-strength stat tied to the tech marine's role — faster weld = weaker barrier.
- **Breach feedback:** When aliens attack a welded door, the metal should visibly deform. Your 3-stage `renderDamageCracks` handles this. Add: the door should **glow red-hot** at stage 3 from the other side (acid damage).
- **Sound design:** Welding produces a sharp crackling hiss + electrical buzz. Door breach attempts produce impact thuds + screeching metal.
- **Tactical information:** The player should be able to tell which doors are under pressure. A visual indicator (vibrating animation, dust particles from door frame, muffled impact sounds) communicates "something wants in."
- **Best version for this project:** make doors feel like temporary promises, not binary locks. The audiovisual language should communicate that every sealed door is buying time, not guaranteeing safety.

### 3.3 Weapon Feel

Colonial Marines weapons need to feel **heavy and mechanical**, not sci-fi laser-light:

| Weapon | Feel Target | Visual/Audio Cues |
|---|---|---|
| **M41A Pulse Rifle** | Assault rifle with high cyclic rate. The "workhorse." | Bright yellow tracers, rapid muzzle flash, strong recoil shake (1–2px camera jitter per shot), ejected brass casings particle. Reload has distinct magazine-change clack. |
| **Shotgun (M37)** | Pump-action. Devastating at short range. | Wide orange tracer spread, heavy camera kick (3–4px), pump-action cycling sound between shots, shell ejection. |
| **Pistol (VP-78)** | Backup weapon. Precise. | Blue-white thin tracer, minimal recoil, sharp snappy report. |
| **Smartgun (M56)** (if added) | Auto-tracking, sustained fire. | Green tracking reticle, smooth continuous fire, distinctive *whirring* servo sound. |
| **Flamethrower (M240)** (if added) | Area denial. Terrifying but imprecise. | Orange particle stream, screen heat distortion, roaring fire audio, lingering flame on ground tiles. |

**Overheat/jam mechanic:** Your pulse rifle overheat system is a great analog for the film's ammo counter anxiety. The M41A in the film has a visible round counter — the tension of watching it drop is critical. Ensure the HUD ammo display has a **visible countdown** that the player can read at a glance. In the film, the counter depleting triggers magazine changes. When heat reaches 80%+, add visual cues: muzzle flash turns orange→red, slight smoke particles from weapon position.

### 3.4 Wave Assault Patterns

Colonial Marines aliens attack in **structured tactical waves**, not random mob:

**Wave Phase 1 — Probing:**
- 1–3 aliens test defenses from a single direction
- Move cautiously, retreat quickly if fired upon
- Purpose: reveal player's position and facing

**Wave Phase 2 — Flanking:**
- While Phase 1 contacts hold attention, 2–4 aliens approach from a different compass direction
- Often use vents to bypass sealed corridors
- Purpose: split player's fire

**Wave Phase 3 — Rush:**
- All surviving aliens attack simultaneously from all engaged directions
- Facehuggers released during this phase (they're held back as ambush units)
- Purpose: overwhelm

**Wave Phase 4 — Retrieval Pause:**
- Survivors break contact and retreat
- Short period of silence (10–20 seconds)
- New aliens may be spawned in unseen areas during this pause
- Purpose: let pressure drop before next wave (reset to Phase 1)

This maps to your `CombatDirector` `build → peak → release` cycle but adds **directional structure**. Your `EnemyMovement` already has flanking logic — ensure the spawn system coordinates angles so attacks come from deliberate compass sectors, not random positions.

---

## 4. UI/HUD Design

### 4.1 CRT Aesthetic Language

Colonial Marines' HUD draws from **1980s military CRT displays** — the film was made in 1986, and the in-universe technology deliberately feels 1980s-analog:

- **Font:** Monospaced, all-caps. Your `Share Tech Mono` choice is excellent. Alternatives: `VT323`, `Press Start 2P` for more retro feel.
- **Color coding:** Green for nominal/tracker, amber for warnings/weapon data, red for critical/damage. This three-color system is already in your `HUD_COLORS`.
- **Scanline effect:** Your current post-FX stack already supports this look. Film-authentic density: 1 dark line per 2–3 screen pixels. Strength 0.06–0.10 is correct — too strong breaks readability.
- **Phosphor bloom:** Bright text/elements should have a faint glow halo. Keep this in the runtime-configurable post-FX tuning. CRT text "bleeds" horizontally more than vertically.
- **Screen curvature:** CRTs have barrel distortion. A very subtle (2–3%) barrel distortion shader on the HUD panel would sell the effect, but may not be worth the GPU cost in Phaser. Optional.
- **Practical refinement:** keep the strongest CRT artifacts on UI surfaces and portrait feeds. The main battlefield camera should stay comparatively cleaner for tactical play.

## 5. High-Value Refinements For This Repo

These are the strongest next-step upgrades based on the current implementation:

### 5.1 Sound
- Add a first-detection **double tracker chirp**
- Add a subtle **tracker carrier hiss**
- Add pulse-rifle **empty click / jam stress / reload punctuation**
- Add **door pressure** audio state so sealed corridors feel alive
- Add proximity-based **unseen alien scrape/chitter** cues

### 5.2 Shaders / FX
- Add selective **normal-mapped** floor/door response for flashlight and alert sweeps
- Add stronger **micro-halation** on welding, muzzle flash, sparks, and tracker blooms
- Add **alert-state amber sweeps** rather than relying only on generic dark grading
- Distinguish **metal / resin / acid** response packages more clearly

### 5.3 Atmosphere
- Increase contrast between:
  - intact colony
  - alarm / combat lockdown
  - hive infestation
- Use sound, props, and light rhythm together instead of trying to solve mood with darkness alone

## 6. Source Links

- Academy 59th Oscars highlights: https://www.oscars.org/videos-photos/59th-oscar-highlights
- Academy Awards database, Visual Effects: https://awardsdatabase.oscars.org/Search/GetResults?query=%7B%22AwardCategory%22%3A%5B%2224%22%5D%2C%22Sort%22%3A%223-Award+Category-Chron%22%2C%22Search%22%3A%22Basic%22%7D
- Academy article on the film's tech legacy: https://digitalcollections.oscars.org/digital/api/collection/p15759coll4/id/3819/download

### 4.2 HUD Element Layout (Film Prop Reference)

The film's APC command console and Hudson's arm-mounted terminal provide the HUD template. Your current HUD implementation already follows this. Specific prop details:

### 4.2.1 Concrete Layout Target

Use `images/mockup.png` as the immediate composition target for the marine status card.

- The card is a **left-edge vertical monitor panel**, not a bottom HUD bar.
- It should read as a single diegetic display unit with embedded modules, not separate floating widgets.
- Composition order:
  - marine name in white at the top-left
  - large monochrome portrait / helmet-cam face occupying most of the panel
  - red ammo and magazine digits clustered in the upper-right
  - green `VITALS` label, large health number, and EKG waveform along the lower-left
  - two full-width rectangular command buttons along the bottom edge
- The panel should feel like smoked CRT glass with scanlines, mild blur/noise, and hard blue frame rails.
- The portrait feed should be desaturated and dirty, as if sourced from a helmet camera, not a clean modern avatar tile.
- Preserve strong color separation:
  - white for marine identity text
  - green for life-sign data
  - red for ammunition
  - blue for frame rails and command-button housings

### 4.2.2 What To Avoid

- Do not place the marine cards as a bottom row or bottom dock.
- Do not use rounded modern HUD capsules, glossy game-menu buttons, or soft mobile-style panels.
- Do not separate the portrait, vitals, ammo, and buttons into disconnected UI islands.
- Do not make the portrait small; the face feed is the dominant visual mass.

**Ammo Counter Display:**
- The M41A's ammo counter in the film is a **red LED number display** on the rifle itself, reading `95` (max) down to `00`.
- In HUD terms: render ammo as a large monospaced number, right-aligned, with a `ROUNDS` label above. Color: `#ff4444` for < 20%, `#ffaa44` for < 50%, `#33ff88` for normal.
- Below the counter: a thin bar graph matching rounds remaining. Film prop style is segmented (individual block per 5 rounds), not continuous fill.

**Squad Status Indicators:**
- Colonial Marines shows each squad member as a **camera feed thumbnail** with vital signs overlay. In top-down, translate this to:
  - Bordered card per marine (already implemented in your CARD_ORDER system)
  - Health bar as a **heartbeat line** that flatlines on death — more dramatic than a simple bar
  - Status icons: green chevron = nominal, amber = wounded, red = critical, grey = KIA, skull = facehugger-latched
- **Marine down callout:** When a marine's health hits 0, their HUD card should flash red, display "KIA" in large text, and trigger a radio callout.

**Motion Tracker HUD Integration:**
- In the film it's a **handheld separate device**, but Colonial Marines integrates it into the HUD corner.
- Your top-right placement matches Colonial Marines. The film prop has a **range readout** in meters below the display — add a numeric range value (e.g., `RNG: 240M`).
- The tracker in the film makes a distinctive sound even when showing zero contacts — the carrier sweep. This should be a faint, continuous background tone when the tracker is active.

### 4.3 Objective/Mission UI

Colonial Marines uses a clean briefing-style overlay:
- Mission name in block capitals at top: `MISSION 2: REACTOR SPINE`
- Objective list with checkbox marks: `[x] CLEAR ALL WAVES` / `[ ] COLLECT ACCESS CARD`
- A compass/directional indicator pointing toward the next objective
- Flash alerts for state changes: `PRIMARY OBJECTIVE UPDATED` in amber, full-width banner, held for 2 seconds

---

## 5. Enemy Behavior Design

### 5.1 Xenomorph Movement Philosophy

Aliens in both the film and game follow the principle: **they don't walk at you, they flow around you.**

**Movement characteristics by type:**

| Type | Speed Pattern | Path Shape | Special Movement |
|---|---|---|---|
| **Warrior** | Steady approach, burst sprint for final 2 tiles | Curved flanking arcs, not straight lines | Wall-hugging (prefer paths adjacent to walls for cover) |
| **Drone** | Variable — pause, observe, then fast commit | Indirect, uses cover and alternate routes | Vent traversal (disappear, reappear elsewhere) |
| **Facehugger** | Erratic jittering, then sudden leap | Random-walk until detection, then bee-line | Leap attack (your `leapSpeed: 540` captures this) |
| **Queen** | Slow, deliberate, unstoppable | Direct when enraged, retreats to nest when hurt | Tail sweep (area attack), can breach any barrier |

**Tactical intelligence behaviors from Colonial Marines:**
- **Probe and withdraw:** When first encountering the squad, 1–2 aliens approach to visual range, then retreat. This triggers tracker pings and builds tension without combat.
- **Ceiling crawl (top-down equivalent):** Aliens moving through "vent zones" should appear as tracker blips without visible sprites until they drop down. Vent tiles should emit particle effects (dust falling) when aliens pass through.
- **Corpse avoidance:** After several aliens die in one corridor, subsequent aliens prefer alternate routes. Implement as a temporary pathfinding cost increase on tiles with recent deaths.
- **Acid blood zone control:** Dead aliens create acid pools that also block marine movement — aliens use their own deaths as area denial (whether intentional or not).

### 5.2 Facehugger Behavior

Facehuggers in the film are **ambush predators**, not direct attackers:
- They remain motionless inside eggs until a host is within ~3 tiles
- Once deployed, they move with **erratic lateral jitter** — hard to track and shoot
- They leap at face height — in top-down, represent as a sudden position teleport to target
- Once latched, they're extremely difficult to remove without harming the host
- They are **silent** — no tracker ping until they're already moving (low detection confidence)
- Your facehugger data already captures the speed (182) and leap behavior well

### 5.3 The Queen Encounter

The Queen fight in the film is structured as:
1. **Discovery phase:** The squad enters the nest. Eggs open slowly. Tension, not combat.
2. **Provocation:** The squad destroys eggs/threatens the nest. The Queen **screams** (audio cue) and warriors are summoned.
3. **Retreat phase:** The squad must withdraw while fighting a rearguard action. The Queen pursues slowly but warriors flood in.
4. **Final stand:** Confined space, Queen closes in, running out of ammo.

Design the Queen encounter as a **multi-phase boss** — she doesn't immediately attack but summons reinforcements. Only after her warriors are defeated does she engage directly. She's more dangerous as a commander than a combatant.

---

## 6. Color Palette Reference

### 6.1 Master Palette

Organized by narrative function — each color group tells the player something:

```
COLONY STRUCTURE (cold industrial)
  Steel dark:     #1a2128  — floor base, deep shadow
  Steel mid:      #2e3842  — wall panels, structural
  Steel light:    #4a5868  — highlights, rivets, edges
  Warm steel:     #3a3428  — rust stains, aged metal

LIGHTING (atmosphere)
  Cool ambient:   #4488aa  — normal fluorescent blue
  Warm ambient:   #ff8830  — emergency amber
  Torch beam:     #ffe8c0  — flashlight white-warm
  Hive glow:      #1a4422  — alien bioluminescence

ALIEN (threat)
  Chitin:         #0a0a0a  — xenomorph body (near-black)
  Chitin wet:     #1a1a1a  — highlight edges  
  Acid blood:     #88cc22  — bright, toxic
  Acid dim:       #445a18  — dried/old acid
  Resin:          #1a1812  — organic structure
  Resin wet:      #2a2820  — fresh secretion
  Slime:          #22cc44  — translucent green
  Egg flesh:      #887858  — leathery, organic
  Facehugger:     #d8c0a0  — pale, fleshy

MARINE (friendly)
  Armor olive:    #4a5030  — standard marine BDU
  Armor highlight:#6a7050  — edge light on armor
  Muzzle flash:   #ffee88  — bright warm yellow
  Tracer yellow:  #ffff00  — pulse rifle
  Tracer orange:  #ff8800  — shotgun
  Medical:        #33ff66  — health, medic role

UI (information hierarchy)
  Primary green:  #33ff88  — tracker, nominal status
  Warning amber:  #ffb347  — weapon data, alerts
  Critical red:   #ff4444  — damage, danger, low ammo
  Dim green:      #1a9944  — inactive/background elements
  Frame blue:     #4aa4d8  — HUD structure lines
  Dark bg:        #030a10  — HUD panel background
```

### 6.2 Palette Application Rules

1. **Threat reads warm, safety reads cool.** Alien acid is the warmest green; marine health is the coolest green.
2. **Brightness = importance.** Critical information is bright. Background structure is dark.
3. **Desaturation = decay/death.** Damaged doors desaturate. KIA marine cards go grey. Alien corpses lose their wet highlight.
4. **The only truly warm color in the colony is emergency amber.** Everything else is cool-shifted. When amber appears, it signals "something is wrong."
5. **Acid green is the alien's color.** It appears in blood, tracker, bioluminescence. It invades the cool blue palette. The visual metaphor: the alien presence is *replacing* the human environment.

---

## 7. Mission Structure Design Patterns

### 7.1 Colonial Marines Mission Archetypes

Colonial Marines missions follow a small set of templates that your `MissionFlow` already mirrors:

| Archetype | Description | Tension Profile | Your Equivalent |
|---|---|---|---|
| **Search & Secure** | Move through areas, clear hostiles, reach objective. Linear path. | Steady build with encounter spikes | Mission 1 (Cargo Concourse) |
| **Defend Position** | Hold a location against wave assaults while a timer runs (weld doors, set turrets). | Escalating waves with brief lulls | Wave-clear phases |
| **Escort/Extraction** | Move a VIP or the squad from A to B under constant threat. | Continuous pressure, route-finding | M3+ extraction phase |
| **Investigate** | Enter unknown area, discover alien presence, survive first contact. Low initial combat. | Long quiet build → sudden peak | First phase of new missions |
| **Last Stand** | Final desperate holdout, diminishing resources. | Unrelenting escalation, no release | Queen Cathedral end-phase |

### 7.2 Objective Design Principles

From Colonial Marines, objectives should:
- **Be physical locations on the map** — not abstract goals. "Reach operations center" not "kill 20 aliens."
- **Chain with natural movement** — card → terminal → elevator creates a route through the map. The player always has a "where do I go next" answer.
- **Create decision points** — two objectives in opposite directions force the squad to choose a path. The unchosen path gets more alien spawns (probing the gap in defense).
- **Integrate with door mechanics** — reaching an objective often requires opening a locked door, which exposes the squad's flank during the action.
- **Escalate with revelation** — "reach the elevator" becomes "the elevator is destroyed, re-route to alternate extraction" mid-mission. Your setpiece system can trigger these narrative beats.

### 7.3 Pacing Between Missions

Colonial Marines uses drop-ship sequences and briefing screens between missions. In your game:
- **Debrief stat screen:** KIA count, rounds fired, accuracy, mission time. Military report format.
- **Loadout selection:** Between missions, choose squad composition and weapon loadouts.
- **Intel briefing:** Map preview of next mission with known threat locations marked.
- **"Gear up" moment:** The Aliens scene where marines load weapons and check equipment is deliberately slow — it builds anticipation. A pre-mission screen with equipment animations serves the same purpose.

---

## 8. Actionable Implementation Priorities

Ranked by impact-to-effort ratio for a Phaser.js game, cross-referenced with what's already in the codebase:

### Already Strong (maintain/refine):
- Motion tracker implementation — shape, sweep, contact rendering, directional alerts
- CombatDirector pressure curve — build/peak/release cycle
- Squad callout system — role-specific and threat-specific dialogue
- Scanline/grain post-processing pipeline
- Door welding and breach mechanics
- Lighting overlay with torch, ambient darkness, contact shadows

### High Impact, Moderate Effort (next priorities):
1. **Ambient soundscape layers** — Add continuous ventilation hum, random pipe stress sounds, distant thumps during build phase. All procedural via existing `SfxEngine` Web Audio primitives. The single biggest atmosphere multiplier missing.
2. **Emergency lighting mode** — When `CombatDirector.state === 'peak'`, activate amber point lights at door frames and tint the ambient overlay warm. Switch back to cool blue during `release`. This two-tone lighting shift is the visual signature of the franchise.
3. **Contact phantom blips** — During `build` state, add brief motion tracker contacts with no visible enemy sprite. Use existing vent point positions. Sells the "they're in the walls" anxiety.
4. **Weld spark VFX** — During door welding action, emit bright orange-white particle burst from door position + temporary point light. Re-uses existing FX particle pool.
5. **Alien probe-and-retreat behavior** — Early wave aliens approach to visual range then pull back before committing. Modify `EnemyMovement.updateWarriorIntent` to add a `probe` intent at long range that retreats after first line-of-sight.

### Medium Impact, Higher Effort (future improvements):
6. **Radio processing filter** — Run callout text through bandpass + distortion audio chain before display. Add brief static burst before each callout appears.
7. **Segmented ammo counter** — Replace continuous ammo bar with block-segment display mimicking the film's LED counter. Pure UI change in `HUD.js`.
8. **Environmental zone tiles** — Tag tile regions as `colony`, `damaged`, `hive` and vary ambient darkness, torch range, and background audio per zone type.
9. **Wave direction coordination** — Spawn system assigns compass sectors to wave phases (probe from N, flank from E, rush from all). Coordinate with `CombatDirector` state transitions.
10. **Queen command phase** — Queen summons warrior waves before engaging directly. Add `commandPhase` to Queen AI that spawns reinforcements on a timer.

---

## 9. Reference Frame Grabs (Descriptive)

Key visual moments from the film that define the aesthetic, useful as mental targets when tuning:

1. **Operations Room** — Cool blue overhead lights, green CRT monitors, grid-pattern floor, clean walls. Peak "intact colony."
2. **Sub-Level 3 Corridor** — Emergency amber lights only, steam vents, water on floor reflecting lights, marines' flashlights cutting through haze. Peak "tension."
3. **Hive/Nest** — Near-total darkness except flashlights. Organic resin everywhere, cocooned colonists, egg clusters with faint internal glow. Peak "alien territory."
4. **APC Command Console** — Multiple CRT screens showing marine helmet cam feeds, motion tracker centered, green-on-dark text readouts. Peak "HUD reference."
5. **Barricade Scene** — Marines welding doors, sparks flying, motion tracker pinging faster, amber emergency lights. Peak "gameplay loop."
6. **First Contact** — Ceiling grid panels torn open, aliens dropping down, pulse rifle tracers in the dark, acid blood spraying. Peak "combat."

---

*This document is a living reference. Update as implementation reveals which details matter most at the pixel scale of a top-down Phaser.js game.*
