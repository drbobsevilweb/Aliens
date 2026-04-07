import { CONFIG } from '../config.js';

export const ENEMIES = Object.freeze({
    warrior: Object.freeze({
        key: 'warrior',
        name: 'Warrior',
        textureKey: 'warrior',
        speed: 98,
        maxHealth: 34,
        contactDamage: 15,   // harder baseline — pressure builds faster
        attackCooldownMs: 750, // ~21 DPS — gives player a reaction window between hits
        canSpit: false,
        patrolRadiusTiles: 6,
        aggroRange: 640,     // ~10 tiles — detect marines within roughly one screen width
        separationRadius: 54, // Increased from 44
        separationForce: 0.95,
        flankStrength: 0.52,
        doorDamage: 1,
        doorAttackCooldownMs: 600,
        canOpenUnlockedDoors: false,
        canBreachAnyDoor: false,
        sizeScale: 0.44,
        spriteAngleOffset: Math.PI * 0.5,
        walkAnimRate: 1.56,
    }),
    drone: Object.freeze({
        key: 'drone',
        name: 'Drone',
        textureKey: 'warrior',
        speed: 120,
        maxHealth: 44,
        contactDamage: 18,
        attackCooldownMs: 560,
        canSpit: false,
        patrolRadiusTiles: 8,
        aggroRange: 520,     // reduced from 760 — no longer pulls from across the whole map
        separationRadius: 60, // Increased from 53
        separationForce: 1.35,
        flankStrength: 0.16,
        canUseVents: true,
        ventCooldownMs: 9000,
        ventMinDist: 200,
        ventMaxDist: 460,
        doorDamage: 2,
        canOpenUnlockedDoors: true,
        canBreachAnyDoor: false,
        sizeScale: 0.44,
        spriteAngleOffset: Math.PI * 0.5,
        walkAnimRate: 1.71,
    }),
    facehugger: Object.freeze({
        key: 'facehugger',
        name: 'Facehugger',
        textureKey: 'facehugger',
        speed: 100,            // ATS design intent — slower, dodgeable
        maxHealth: 24,
        contactDamage: 7,
        attackCooldownMs: 310,
        canSpit: false,
        patrolRadiusTiles: 10,
        aggroRange: 600,
        separationRadius: 40,
        separationForce: 0.8,
        flankStrength: 0.3,
        randomPatternStrength: 0.75,
        leapMinRange: 70,
        leapMaxRange: 210,
        leapSpeed: 380,        // ~30% slower leap (was 540)
        leapCooldownMs: 1900,
        latchDurationMs: 900,
        latchTickMs: 260,
        latchDamage: 5,
        doorDamage: 0,
        canOpenUnlockedDoors: false,
        canBreachAnyDoor: false,
        sizeScale: 0.20,
        bodyRadius: 4,
        spriteAngleOffset: Math.PI * 0.5,
        walkAnimRate: 1.98,
    }),
    queenLesser: Object.freeze({
        key: 'queenLesser',
        name: 'Lesser Queen',
        textureKey: 'queen_lesser',
        speed: 120,
        maxHealth: 82,
        contactDamage: 30,
        attackCooldownMs: 620,
        canSpit: false,
        patrolRadiusTiles: 9,
        aggroRange: 1200,
        separationRadius: 78, // Increased from 68
        separationForce: 1.2,
        flankStrength: 0.22,
        canUseVents: false,
        canOpenUnlockedDoors: true,
        doorDamage: 2,
        doorAttackCooldownMs: 520,
        canBreachAnyDoor: false,
        sizeScale: 1.45,
        spriteAngleOffset: Math.PI * 0.5,
        walkAnimRate: 1.44,
    }),
    queen: Object.freeze({
        key: 'queen',
        name: 'Alien Queen',
        textureKey: 'queen',
        speed: 125,
        maxHealth: 132,
        contactDamage: 38,
        attackCooldownMs: 690,
        canSpit: false,
        patrolRadiusTiles: 12,
        aggroRange: 1200,
        separationRadius: 84, // Increased from 74
        separationForce: 1.4,
        flankStrength: 0.18,
        canUseVents: false,
        canOpenUnlockedDoors: true,
        doorDamage: 3,
        doorAttackCooldownMs: 420,
        canBreachAnyDoor: true,
        sizeScale: 1.8,
        spriteAngleOffset: Math.PI * 0.5,
        walkAnimRate: 1.35,
    }),
});

export const ENEMY_WAVES = Object.freeze([
    // Wave 1 — sparse wanderers, spread across map so they arrive in ones and twos.
    // Queens/lessers are late-wave escalation, not opening threats.
    Object.freeze([
        { type: 'warrior', tileX: 32, tileY: 4 },   // top-right
        { type: 'warrior', tileX: 17, tileY: 8 },   // top-left
        { type: 'warrior', tileX: 37, tileY: 8 },   // far top-right
        { type: 'warrior', tileX: 18, tileY: 17 },  // bottom-left
        { type: 'warrior', tileX: 36, tileY: 19 },  // bottom-right
        { type: 'warrior', tileX: 23, tileY: 22 },  // far bottom
        { type: 'drone',   tileX: 23, tileY: 5 },   // top-centre
        { type: 'facehugger', tileX: 8, tileY: 19 }, // far-left flank
    ]),
]);

export const ENEMY_VENT_POINTS = Object.freeze([
    { tileX: 10, tileY: 10 },
    { tileX: 48, tileY: 10 },
    { tileX: 86, tileY: 10 },
    { tileX: 10, tileY: 50 },
    { tileX: 48, tileY: 50 },
    { tileX: 86, tileY: 50 },
    { tileX: 30, tileY: 12 },
    { tileX: 68, tileY: 12 },
    { tileX: 30, tileY: 52 },
    { tileX: 68, tileY: 52 },
    { tileX: 50, tileY: 30 },
    { tileX: 15, tileY: 30 },
]);

export const EGG_CLUSTERS = Object.freeze([
    Object.freeze([
        { tileX: 80, tileY: 11 },
        { tileX: 82, tileY: 12 },
        { tileX: 81, tileY: 12 },
        { tileX: 83, tileY: 13 },
        { tileX: 82, tileY: 13 },
        { tileX: 82, tileY: 14 },
        { tileX: 84, tileY: 14 },
        { tileX: 81, tileY: 14 },
    ]),
    Object.freeze([
        { tileX: 49, tileY: 49 },
        { tileX: 50, tileY: 50 },
        { tileX: 51, tileY: 50 },
        { tileX: 51, tileY: 51 },
        { tileX: 50, tileY: 51 },
        { tileX: 50, tileY: 52 },
        { tileX: 52, tileY: 52 },
        { tileX: 49, tileY: 52 },
    ]),
    Object.freeze([
        { tileX: 13, tileY: 49 },
        { tileX: 14, tileY: 50 },
        { tileX: 15, tileY: 50 },
        { tileX: 15, tileY: 51 },
        { tileX: 14, tileY: 51 },
        { tileX: 14, tileY: 52 },
        { tileX: 16, tileY: 52 },
        { tileX: 13, tileY: 52 },
    ]),
    Object.freeze([
        { tileX: 26, tileY: 12 },
        { tileX: 27, tileY: 12 },
        { tileX: 28, tileY: 13 },
        { tileX: 27, tileY: 14 },
        { tileX: 26, tileY: 14 },
    ]),
    Object.freeze([
        { tileX: 64, tileY: 12 },
        { tileX: 65, tileY: 12 },
        { tileX: 66, tileY: 13 },
        { tileX: 65, tileY: 14 },
        { tileX: 64, tileY: 14 },
    ]),
    Object.freeze([
        { tileX: 24, tileY: 44 },
        { tileX: 25, tileY: 44 },
        { tileX: 26, tileY: 45 },
        { tileX: 25, tileY: 46 },
        { tileX: 24, tileY: 46 },
    ]),
    Object.freeze([
        { tileX: 70, tileY: 42 },
        { tileX: 71, tileY: 42 },
        { tileX: 72, tileY: 43 },
        { tileX: 71, tileY: 44 },
        { tileX: 70, tileY: 44 },
    ]),
]);

export const EGG_TRIGGER_RANGE = 180;
export const EGG_OPEN_DURATION_MS = 1700;
export const EGG_COOLDOWN_MS = 5200;

export function tileToWorld(tileX, tileY) {
    return {
        x: tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
        y: tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    };
}
