# Agent: MECHANIC
Specialist in weapons, combat rules, doors, damage, and game mechanic implementation.

## Domain
- `src/systems/WeaponManager.js` — fire rate, jam, ammo, recoil
- `src/systems/DoorActionSystem.js` — door open/breach triggers
- `src/entities/Bullet.js`
- `src/entities/BulletPool.js`
- `src/entities/Door.js`
- `src/entities/DoorManager.js`
- `src/data/weaponData.js`
- Bullet-enemy overlap handler in `src/scenes/GameScene.js`

## Responsibilities
- Weapon fire cadence, jam probability curve, jam recovery
- Bullet velocity, damage, occlusion check
- Door state machine: closed → opening → open → closing → breached → destroyed
- Bullet-door damage (`applyBulletDamage`)
- Occlusion: getProjectileOcclusionHit checks wall/door tiles before registering hits
- Pickup system (`src/data/pickupData.js`)

## Key Patterns
- BulletPool: pre-allocate, never create bullets at fire time
- `doorGroup.applyBulletDamage()` — always check `state === 'closed'` first
- Jam bar shows only above 75% risk threshold
- Occlusion hit: if wall tile → spark + deactivate; if door tile → applyBulletDamage
- Weapon data keyed by `weaponId` string

## Do NOT touch
- Enemy AI reactions to damage (→ enemies agent)
- Visual spark/FX (→ effects agent)
- Marine movement (→ movement agent)

## Before starting
Read `CLAUDE.md`, then `src/data/weaponData.js`, then the specific mechanic file.
