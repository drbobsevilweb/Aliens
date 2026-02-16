export const RUNTIME_SETTINGS_KEY = 'aliens_runtime_settings_v1';

export const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
    player: Object.freeze({
        leaderSpeed: 180,
        movementRigidity: 0.98,
        moveResponseRate: 9.5,
        leaderTurnSpeed: 8.5,
        maxHealth: 100,
        startHealth: 100,
    }),
    squad: Object.freeze({
        reactionDelayMs: 90,
        followLerp: 0.1,
        followerTurnMultiplier: 1,
        snakeBaseSpeed: 280,
        snakeCatchupGain: 1.8,
        formupSpeed: 210,
        snakeStaggerMs: 380,
        minSpacing: 40,
    }),
    enemies: Object.freeze({
        globalHealthScale: 0.68,
        globalSpeedScale: 1,
        globalDamageScale: 1,
        hitSlowMinPct: 25,
        hitSlowMaxPct: 50,
        hitSlowDurationMinMs: 180,
        hitSlowDurationMaxMs: 320,
        types: Object.freeze({
            warrior: Object.freeze({ healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 }),
            drone: Object.freeze({ healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 }),
            facehugger: Object.freeze({ healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 }),
            queenLesser: Object.freeze({ healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 }),
            queen: Object.freeze({ healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 }),
        }),
    }),
    weapons: Object.freeze({
        globalDamageMultiplier: 1,
        globalSpeedMultiplier: 1,
        globalFireRateMultiplier: 1,
        pulseRifle: Object.freeze({ damageMultiplier: 1, speedMultiplier: 1, fireRateMultiplier: 1 }),
        shotgun: Object.freeze({ damageMultiplier: 1, speedMultiplier: 1, fireRateMultiplier: 1 }),
        pistol: Object.freeze({ damageMultiplier: 1, speedMultiplier: 1, fireRateMultiplier: 1 }),
    }),
    lighting: Object.freeze({
        ambientDarkness: 0.5,
        torchRange: 330,
        torchConeHalfAngle: 0.6,
        softRadius: 110,
        coreAlpha: 0.42,
    }),
    visibility: Object.freeze({
        spottedMemoryMs: 2000,
        trackerScanMs: 2000,
        trackerRiskMs: 6000,
        trackerCooldownMs: 30000,
        trackerRange: 420,
    }),
    doors: Object.freeze({
        integrityHits: 10,
        hackDurationMs: 3000,
        weldDurationMs: 4000,
        unweldDurationMs: 3000,
    }),
    marines: Object.freeze({
        heavyAccuracyMul: 1.1,
        techAccuracyMul: 1.0,
        medicAccuracyMul: 0.85,
        heavyReactionMs: 260,
        techReactionMs: 420,
        medicReactionMs: 560,
        heavyJamSensitivity: 0.7,
        techJamSensitivity: 0.9,
        medicJamSensitivity: 1.1,
        moraleKillGain: 5,
        moraleDamageLoss: 10,
        moraleRecoverMinMs: 30000,
        moraleRecoverMaxMs: 60000,
        panicKillGain: 5,
        panicObjectiveGain: 10,
        panicCalmPerSec: 7,
        panicSelfHitLoss: 10,
        panicAllyHitLoss: 3,
        panicLowHealthPerSec: 9,
        panicSwarmPerSec: 6,
        incomingDamageMul: 0.84,
        leaderIncomingDamageMul: 0.9,
        heavyIncomingDamageMul: 0.82,
        techIncomingDamageMul: 0.96,
        medicIncomingDamageMul: 0.98,
        focusFireGraceMs: 900,
        focusFireGraceMul: 0.62,
        maxHitPctOfMaxHp: 0.16,
        lowHpMitigationStartPct: 0.35,
        lowHpMitigationMulMin: 0.58,
        radioUnderAttackMinMs: 1800,
        radioAmbientMinMs: 4200,
        radioAmbientMaxMs: 8800,
        radioUnderAttackChance: 0.86,
        radioAmbientChance: 0.46,
    }),
    objects: Object.freeze({
        acidDurationMs: 5000,
        acidDamagePerSec: 10,
        pickupRespawnMs: 0,
        doorHintWindowMs: 800,
    }),
    walls: Object.freeze({
        doorLightBlockStrength: 1,
        lightPenetrationPct: 0.25,
        wallCollisionHardness: 1,
        ricochetSparkIntensity: 1,
    }),
    other: Object.freeze({
        uiScale: 1,
        audioBeepVolume: 1,
        pauseOnFocusLoss: 0,
    }),
    game: Object.freeze({
        globalTimeScale: 1,
        cameraLerp: 0.1,
        gameSpeedMultiplier: 1,
        fogEnabled: 1,
    }),
    mapTiles: Object.freeze({
        roomVisibilityMul: 1,
        corridorVisibilityMul: 1,
        doorWidthTiles: 2,
        tileEdgePadding: 0,
    }),
    scripting: Object.freeze({
        directorEnabled: 1,
        eventTickMs: 80,
        aiThinkIntervalMs: 120,
        autoSaveBetweenMissions: 1,
        idlePressureBaseMs: 7000,
        idlePressureMinMs: 3500,
        gunfireReinforceBaseMs: 4500,
        gunfireReinforceMinMs: 2200,
        reinforceCap: 16,
        reinforceCapIdle: 6,
        reinforceCapGunfire: 10,
        doorNoiseMemoryMs: 16000,
        idleSpawnMemoryMs: 9000,
        waveTransitionGraceMs: 2600,
    }),
    spriteAnimation: Object.freeze({
        marineSpriteScale: 1,
        alienSpriteScale: 1,
        muzzleFlashScale: 1,
        animationRateMul: 1,
    }),
    director: Object.freeze({
        enabled: 1,
        pressureRiseRate: 1.25,
        pressureFallRate: 0.55,
        peakEnterPressure: 0.74,
        releaseEnterPressure: 0.46,
        peakMaxMs: 9500,
        buildMinMs: 2600,
        releaseMinMs: 2200,
    }),
    editor: Object.freeze({
        spriteStorageKey: 'aliens_dev_editors_v1',
    }),
});

function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
    if (!isObject(base)) return patch;
    const out = { ...base };
    for (const [k, v] of Object.entries(patch || {})) {
        if (isObject(v) && isObject(base[k])) {
            out[k] = deepMerge(base[k], v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function sanitize(settings) {
    const s = JSON.parse(JSON.stringify(deepMerge(DEFAULT_RUNTIME_SETTINGS, settings || {})));

    s.player.leaderSpeed = clampNumber(s.player.leaderSpeed, 40, 600, 180);
    s.player.movementRigidity = clampNumber(s.player.movementRigidity, 0, 1, 0.98);
    s.player.moveResponseRate = clampNumber(s.player.moveResponseRate, 1, 50, 9.5);
    s.player.leaderTurnSpeed = clampNumber(s.player.leaderTurnSpeed, 1, 40, 8.5);
    s.player.maxHealth = clampNumber(s.player.maxHealth, 1, 9999, 100);
    s.player.startHealth = clampNumber(s.player.startHealth, 1, s.player.maxHealth, 100);

    s.squad.reactionDelayMs = clampNumber(s.squad.reactionDelayMs, 20, 400, 90);
    s.squad.followLerp = clampNumber(s.squad.followLerp, 0.02, 0.4, 0.1);
    s.squad.followerTurnMultiplier = clampNumber(s.squad.followerTurnMultiplier, 0.2, 4, 1);
    s.squad.snakeBaseSpeed = clampNumber(s.squad.snakeBaseSpeed, 80, 600, 280);
    s.squad.snakeCatchupGain = clampNumber(s.squad.snakeCatchupGain, 0.1, 6, 1.8);
    s.squad.formupSpeed = clampNumber(s.squad.formupSpeed, 80, 500, 210);
    s.squad.snakeStaggerMs = clampNumber(s.squad.snakeStaggerMs, 0, 2000, 380);
    s.squad.minSpacing = clampNumber(s.squad.minSpacing, 4, 120, 40);

    s.enemies.globalHealthScale = clampNumber(s.enemies.globalHealthScale, 0.1, 3, 0.68);
    s.enemies.globalSpeedScale = clampNumber(s.enemies.globalSpeedScale, 0.2, 3, 1);
    s.enemies.globalDamageScale = clampNumber(s.enemies.globalDamageScale, 0.1, 3, 1);
    s.enemies.hitSlowMinPct = clampNumber(s.enemies.hitSlowMinPct, 0, 95, 25);
    s.enemies.hitSlowMaxPct = clampNumber(s.enemies.hitSlowMaxPct, s.enemies.hitSlowMinPct, 99, 50);
    s.enemies.hitSlowDurationMinMs = clampNumber(s.enemies.hitSlowDurationMinMs, 40, 3000, 180);
    s.enemies.hitSlowDurationMaxMs = clampNumber(
        s.enemies.hitSlowDurationMaxMs,
        s.enemies.hitSlowDurationMinMs,
        5000,
        320
    );

    const typeKeys = ['warrior', 'drone', 'facehugger', 'queenLesser', 'queen'];
    for (const key of typeKeys) {
        const t = s.enemies.types[key] || {};
        t.healthMultiplier = clampNumber(t.healthMultiplier, 0.1, 5, 1);
        t.speedMultiplier = clampNumber(t.speedMultiplier, 0.1, 5, 1);
        t.damageMultiplier = clampNumber(t.damageMultiplier, 0.1, 5, 1);
        s.enemies.types[key] = t;
    }

    s.weapons.globalDamageMultiplier = clampNumber(s.weapons.globalDamageMultiplier, 0.1, 5, 1);
    s.weapons.globalSpeedMultiplier = clampNumber(s.weapons.globalSpeedMultiplier, 0.1, 5, 1);
    s.weapons.globalFireRateMultiplier = clampNumber(s.weapons.globalFireRateMultiplier, 0.2, 4, 1);

    const weaponKeys = ['pulseRifle', 'shotgun', 'pistol'];
    for (const key of weaponKeys) {
        const w = s.weapons[key] || {};
        w.damageMultiplier = clampNumber(w.damageMultiplier, 0.1, 5, 1);
        w.speedMultiplier = clampNumber(w.speedMultiplier, 0.1, 5, 1);
        w.fireRateMultiplier = clampNumber(w.fireRateMultiplier, 0.2, 4, 1);
        s.weapons[key] = w;
    }

    s.lighting.ambientDarkness = clampNumber(s.lighting.ambientDarkness, 0, 1, 0.5);
    s.lighting.torchRange = clampNumber(s.lighting.torchRange, 80, 1200, 330);
    s.lighting.torchConeHalfAngle = clampNumber(s.lighting.torchConeHalfAngle, 0.1, 1.57, 0.6);
    s.lighting.softRadius = clampNumber(s.lighting.softRadius, 10, 600, 110);
    s.lighting.coreAlpha = clampNumber(s.lighting.coreAlpha, 0, 1, 0.42);

    s.visibility.spottedMemoryMs = clampNumber(s.visibility.spottedMemoryMs, 250, 10000, 2000);
    s.visibility.trackerScanMs = clampNumber(s.visibility.trackerScanMs, 1000, 12000, 2000);
    s.visibility.trackerRiskMs = clampNumber(s.visibility.trackerRiskMs, 1000, 20000, 6000);
    s.visibility.trackerCooldownMs = clampNumber(s.visibility.trackerCooldownMs, 1000, 120000, 30000);
    s.visibility.trackerRange = clampNumber(s.visibility.trackerRange, 120, 1600, 420);

    s.doors.integrityHits = clampNumber(s.doors.integrityHits, 1, 20, 10);
    s.doors.hackDurationMs = clampNumber(s.doors.hackDurationMs, 100, 20000, 3000);
    s.doors.weldDurationMs = clampNumber(s.doors.weldDurationMs, 100, 20000, 4000);
    s.doors.unweldDurationMs = clampNumber(s.doors.unweldDurationMs, 100, 20000, 3000);

    s.marines.heavyAccuracyMul = clampNumber(s.marines.heavyAccuracyMul, 0.2, 3, 1.1);
    s.marines.techAccuracyMul = clampNumber(s.marines.techAccuracyMul, 0.2, 3, 1);
    s.marines.medicAccuracyMul = clampNumber(s.marines.medicAccuracyMul, 0.2, 3, 0.85);
    s.marines.heavyReactionMs = clampNumber(s.marines.heavyReactionMs, 50, 2000, 260);
    s.marines.techReactionMs = clampNumber(s.marines.techReactionMs, 50, 3000, 420);
    s.marines.medicReactionMs = clampNumber(s.marines.medicReactionMs, 50, 4000, 560);
    s.marines.heavyJamSensitivity = clampNumber(s.marines.heavyJamSensitivity, 0.1, 3, 0.7);
    s.marines.techJamSensitivity = clampNumber(s.marines.techJamSensitivity, 0.1, 3, 0.9);
    s.marines.medicJamSensitivity = clampNumber(s.marines.medicJamSensitivity, 0.1, 3, 1.1);
    s.marines.moraleKillGain = clampNumber(s.marines.moraleKillGain, 0, 30, 5);
    s.marines.moraleDamageLoss = clampNumber(s.marines.moraleDamageLoss, 0, 50, 10);
    s.marines.moraleRecoverMinMs = clampNumber(s.marines.moraleRecoverMinMs, 1000, 120000, 30000);
    s.marines.moraleRecoverMaxMs = clampNumber(
        s.marines.moraleRecoverMaxMs,
        s.marines.moraleRecoverMinMs,
        180000,
        60000
    );
    s.marines.panicKillGain = clampNumber(s.marines.panicKillGain, 0, 50, 5);
    s.marines.panicObjectiveGain = clampNumber(s.marines.panicObjectiveGain, 0, 50, 10);
    s.marines.panicCalmPerSec = clampNumber(s.marines.panicCalmPerSec, 0.5, 40, 7);
    s.marines.panicSelfHitLoss = clampNumber(s.marines.panicSelfHitLoss, 0, 80, 10);
    s.marines.panicAllyHitLoss = clampNumber(s.marines.panicAllyHitLoss, 0, 40, 3);
    s.marines.panicLowHealthPerSec = clampNumber(s.marines.panicLowHealthPerSec, 0, 50, 9);
    s.marines.panicSwarmPerSec = clampNumber(s.marines.panicSwarmPerSec, 0, 50, 6);
    s.marines.incomingDamageMul = clampNumber(s.marines.incomingDamageMul, 0.2, 2, 0.84);
    s.marines.leaderIncomingDamageMul = clampNumber(s.marines.leaderIncomingDamageMul, 0.2, 2, 0.9);
    s.marines.heavyIncomingDamageMul = clampNumber(s.marines.heavyIncomingDamageMul, 0.2, 2, 0.82);
    s.marines.techIncomingDamageMul = clampNumber(s.marines.techIncomingDamageMul, 0.2, 2, 0.96);
    s.marines.medicIncomingDamageMul = clampNumber(s.marines.medicIncomingDamageMul, 0.2, 2, 0.98);
    s.marines.focusFireGraceMs = clampNumber(s.marines.focusFireGraceMs, 100, 4000, 900);
    s.marines.focusFireGraceMul = clampNumber(s.marines.focusFireGraceMul, 0.1, 1, 0.62);
    s.marines.maxHitPctOfMaxHp = clampNumber(s.marines.maxHitPctOfMaxHp, 0.04, 0.5, 0.16);
    s.marines.lowHpMitigationStartPct = clampNumber(s.marines.lowHpMitigationStartPct, 0.1, 0.8, 0.35);
    s.marines.lowHpMitigationMulMin = clampNumber(s.marines.lowHpMitigationMulMin, 0.2, 1, 0.58);
    s.marines.radioUnderAttackMinMs = clampNumber(s.marines.radioUnderAttackMinMs, 200, 12000, 1800);
    s.marines.radioAmbientMinMs = clampNumber(s.marines.radioAmbientMinMs, 400, 15000, 4200);
    s.marines.radioAmbientMaxMs = clampNumber(
        s.marines.radioAmbientMaxMs,
        s.marines.radioAmbientMinMs,
        24000,
        8800
    );
    s.marines.radioUnderAttackChance = clampNumber(s.marines.radioUnderAttackChance, 0, 1, 0.86);
    s.marines.radioAmbientChance = clampNumber(s.marines.radioAmbientChance, 0, 1, 0.46);

    s.objects.acidDurationMs = clampNumber(s.objects.acidDurationMs, 100, 30000, 5000);
    s.objects.acidDamagePerSec = clampNumber(s.objects.acidDamagePerSec, 0, 100, 10);
    s.objects.pickupRespawnMs = clampNumber(s.objects.pickupRespawnMs, 0, 120000, 0);
    s.objects.doorHintWindowMs = clampNumber(s.objects.doorHintWindowMs, 150, 2500, 800);

    s.walls.doorLightBlockStrength = clampNumber(s.walls.doorLightBlockStrength, 0, 3, 1);
    s.walls.lightPenetrationPct = clampNumber(s.walls.lightPenetrationPct, 0, 0.8, 0.25);
    s.walls.wallCollisionHardness = clampNumber(s.walls.wallCollisionHardness, 0, 3, 1);
    s.walls.ricochetSparkIntensity = clampNumber(s.walls.ricochetSparkIntensity, 0, 3, 1);

    s.other.uiScale = clampNumber(s.other.uiScale, 0.5, 2, 1);
    s.other.audioBeepVolume = clampNumber(s.other.audioBeepVolume, 0, 2, 1);
    s.other.pauseOnFocusLoss = clampNumber(s.other.pauseOnFocusLoss, 0, 1, 0);

    s.game.globalTimeScale = clampNumber(s.game.globalTimeScale, 0.25, 3, 1);
    s.game.cameraLerp = clampNumber(s.game.cameraLerp, 0.01, 1, 0.1);
    s.game.gameSpeedMultiplier = clampNumber(s.game.gameSpeedMultiplier, 0.25, 3, 1);
    s.game.fogEnabled = clampNumber(s.game.fogEnabled, 0, 1, 1);

    s.mapTiles.roomVisibilityMul = clampNumber(s.mapTiles.roomVisibilityMul, 0.2, 3, 1);
    s.mapTiles.corridorVisibilityMul = clampNumber(s.mapTiles.corridorVisibilityMul, 0.2, 3, 1);
    s.mapTiles.doorWidthTiles = clampNumber(s.mapTiles.doorWidthTiles, 1, 6, 2);
    s.mapTiles.tileEdgePadding = clampNumber(s.mapTiles.tileEdgePadding, 0, 8, 0);

    s.scripting.directorEnabled = clampNumber(s.scripting.directorEnabled, 0, 1, 1);
    s.scripting.eventTickMs = clampNumber(s.scripting.eventTickMs, 10, 1000, 80);
    s.scripting.aiThinkIntervalMs = clampNumber(s.scripting.aiThinkIntervalMs, 20, 2000, 120);
    s.scripting.autoSaveBetweenMissions = clampNumber(s.scripting.autoSaveBetweenMissions, 0, 1, 1);
    s.scripting.idlePressureBaseMs = clampNumber(s.scripting.idlePressureBaseMs, 2000, 30000, 7000);
    s.scripting.idlePressureMinMs = clampNumber(
        s.scripting.idlePressureMinMs,
        1000,
        s.scripting.idlePressureBaseMs,
        3500
    );
    s.scripting.gunfireReinforceBaseMs = clampNumber(s.scripting.gunfireReinforceBaseMs, 1200, 20000, 4500);
    s.scripting.gunfireReinforceMinMs = clampNumber(
        s.scripting.gunfireReinforceMinMs,
        600,
        s.scripting.gunfireReinforceBaseMs,
        2200
    );
    s.scripting.reinforceCap = clampNumber(s.scripting.reinforceCap, 0, 80, 16);
    s.scripting.reinforceCapIdle = clampNumber(s.scripting.reinforceCapIdle, 0, 80, 6);
    s.scripting.reinforceCapGunfire = clampNumber(s.scripting.reinforceCapGunfire, 0, 80, 10);
    s.scripting.doorNoiseMemoryMs = clampNumber(s.scripting.doorNoiseMemoryMs, 1000, 60000, 16000);
    s.scripting.idleSpawnMemoryMs = clampNumber(s.scripting.idleSpawnMemoryMs, 1000, 60000, 9000);
    s.scripting.waveTransitionGraceMs = clampNumber(s.scripting.waveTransitionGraceMs, 0, 15000, 2600);

    s.spriteAnimation.marineSpriteScale = clampNumber(s.spriteAnimation.marineSpriteScale, 0.2, 4, 1);
    s.spriteAnimation.alienSpriteScale = clampNumber(s.spriteAnimation.alienSpriteScale, 0.2, 4, 1);
    s.spriteAnimation.muzzleFlashScale = clampNumber(s.spriteAnimation.muzzleFlashScale, 0.2, 4, 1);
    s.spriteAnimation.animationRateMul = clampNumber(s.spriteAnimation.animationRateMul, 0.1, 4, 1);

    s.director.enabled = clampNumber(s.director.enabled, 0, 1, 1);
    s.director.pressureRiseRate = clampNumber(s.director.pressureRiseRate, 0.1, 5, 1.25);
    s.director.pressureFallRate = clampNumber(s.director.pressureFallRate, 0.05, 5, 0.55);
    s.director.peakEnterPressure = clampNumber(s.director.peakEnterPressure, 0.1, 0.99, 0.74);
    s.director.releaseEnterPressure = clampNumber(s.director.releaseEnterPressure, 0.05, 0.95, 0.46);
    s.director.peakMaxMs = clampNumber(s.director.peakMaxMs, 500, 60000, 9500);
    s.director.buildMinMs = clampNumber(s.director.buildMinMs, 100, 60000, 2600);
    s.director.releaseMinMs = clampNumber(s.director.releaseMinMs, 100, 60000, 2200);

    return s;
}

export function loadRuntimeSettings() {
    if (typeof window === 'undefined' || !window.localStorage) return sanitize({});
    try {
        const raw = window.localStorage.getItem(RUNTIME_SETTINGS_KEY);
        if (!raw) return sanitize({});
        return sanitize(JSON.parse(raw));
    } catch {
        return sanitize({});
    }
}

export function saveRuntimeSettings(settings) {
    const s = sanitize(settings);
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(RUNTIME_SETTINGS_KEY, JSON.stringify(s));
    }
    return s;
}

export function resetRuntimeSettings() {
    const s = sanitize({});
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(RUNTIME_SETTINGS_KEY, JSON.stringify(s));
    }
    return s;
}

export function mergeRuntimeSettings(partial) {
    const current = loadRuntimeSettings();
    return saveRuntimeSettings(deepMerge(current, partial || {}));
}
