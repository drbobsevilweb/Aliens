import { WEAPONS, WEAPON_ORDER } from '../data/weaponData.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class WeaponManager {
    constructor(bulletPool, runtimeSettings = null) {
        this.bulletPool = bulletPool;
        this.runtimeSettings = runtimeSettings || {};

        this.inventory = {
            pulseRifle: true,
            shotgun: false,
            pistol: false,
        };

        this.ammo = {
            shotgun: 0,
            pistol: 0,
        };

        this.currentWeaponKey = 'pulseRifle';

        this.lastFiredTime = {};
        for (const key of WEAPON_ORDER) {
            this.lastFiredTime[key] = 0;
        }

        // Pulse rifle counter: passive recharge with an empty-state lockout.
        this.pulseAmmo = 99;
        this.isOverheated = false;
        this.overheatCooldownUntil = 0;
        this.isFiringPulse = false;
        this.lastPulseFiredTime = 0;
        this.pulseTriggerHeld = false;
        const prDef = WEAPONS.pulseRifle;
        this.pulseMaxAmmo = 99;
        this.pulseUnlockAt = prDef.overheatUnlockAt || 20;
        this.pulseRechargeRate = prDef.passiveCoolRate || 10;
        this.pulseDrainRate = 50;  // 99/50 ≈ 2s continuous fire to empty
        this.pulseEmptyDelayMs = 2000;

        // Recoil tracking per weapon
        this.recoil = {};
        for (const key of WEAPON_ORDER) {
            this.recoil[key] = 0;
        }

        // Callbacks for HUD
        this.onWeaponChange = null;
        this.onAmmoChange = null;
        this.onHeatChange = null;
        this.onLowAmmoWarning = null;  // called when pulse ammo crosses below threshold
        this.onOverheatStart = null;   // called when pulse rifle overheats (counter hits 0)
        this.onJam = null;
        this.jamUntil = 0;
        this._lastLowAmmoWarnAt = 0;   // timestamp of last low-ammo warning
    }

    setPulseTriggerHeld(held) {
        this.pulseTriggerHeld = held === true;
        if (!this.pulseTriggerHeld) this.isFiringPulse = false;
    }

    getCurrentWeapon() {
        return this.getRuntimeWeaponDef(this.currentWeaponKey);
    }

    getRuntimeWeaponDef(weaponKey) {
        const base = WEAPONS[weaponKey];
        if (!base) return null;
        const s = this.runtimeSettings || {};
        const globalDamage = Number(s.globalDamageMultiplier) || 1;
        const globalSpeed = Number(s.globalSpeedMultiplier) || 1;
        const globalRate = Number(s.globalFireRateMultiplier) || 1;
        const per = s[weaponKey] || {};
        const damageMul = (Number(per.damageMultiplier) || 1) * globalDamage;
        const speedMul = (Number(per.speedMultiplier) || 1) * globalSpeed;
        const rateMul = (Number(per.fireRateMultiplier) || 1) * globalRate;
        return {
            ...base,
            damage: Math.max(1, base.damage * damageMul),
            bulletSpeed: Math.max(50, base.bulletSpeed * speedMul),
            fireRate: Math.max(25, Math.floor(base.fireRate / Math.max(0.2, rateMul))),
        };
    }

    switchWeapon(weaponKey) {
        if (!this.inventory[weaponKey]) return false;
        if (weaponKey === this.currentWeaponKey) return false;
        const prev = this.currentWeaponKey;
        this.currentWeaponKey = weaponKey;
        if (this.onWeaponChange) this.onWeaponChange(weaponKey);
        this.scene?.eventBus?.emit('weaponSwitched', { from: prev, to: weaponKey });
        return true;
    }

    switchByIndex(index) {
        if (index < 0 || index >= WEAPON_ORDER.length) return false;
        return this.switchWeapon(WEAPON_ORDER[index]);
    }

    cycleWeapon(direction = 1) {
        const step = direction >= 0 ? 1 : -1;
        const currentIndex = WEAPON_ORDER.indexOf(this.currentWeaponKey);
        if (currentIndex === -1) return false;

        for (let i = 1; i <= WEAPON_ORDER.length; i++) {
            const idx = (currentIndex + i * step + WEAPON_ORDER.length) % WEAPON_ORDER.length;
            const candidate = WEAPON_ORDER[idx];
            if (this.inventory[candidate]) {
                return this.switchWeapon(candidate);
            }
        }
        return false;
    }

    addWeapon(weaponKey, ammoAmount) {
        this.inventory[weaponKey] = true;
        const def = WEAPONS[weaponKey];
        if (!def) return;
        if (def.ammoType === 'limited') {
            const grant = Number.isFinite(ammoAmount) ? ammoAmount : (def.defaultUnlockAmmo || 0);
            this.ammo[weaponKey] = Math.min(
                (this.ammo[weaponKey] || 0) + grant,
                def.maxAmmo
            );
            if (this.onAmmoChange) this.onAmmoChange(weaponKey, this.ammo[weaponKey]);
        }
    }

    addAmmo(weaponKey, amount) {
        const def = WEAPONS[weaponKey];
        if (!def || def.ammoType !== 'limited') return;
        this.ammo[weaponKey] = Math.min(
            (this.ammo[weaponKey] || 0) + amount,
            def.maxAmmo
        );
        if (this.onAmmoChange) this.onAmmoChange(weaponKey, this.ammo[weaponKey]);
    }

    getAdjustedFireRate(def, options = {}) {
        const mulRaw = Number(options.fireRateMul);
        const mul = Number.isFinite(mulRaw) ? clamp(mulRaw, 0.5, 3) : 1;
        return Math.max(20, Math.floor(def.fireRate * mul));
    }

    getRecoilNormalized(weaponKey) {
        const key = weaponKey || this.currentWeaponKey;
        return clamp(Number(this.recoil[key]) || 0, 0, 1);
    }

    canFire(time, options = {}) {
        const key = this.currentWeaponKey;
        const def = this.getRuntimeWeaponDef(key);
        const effectiveFireRate = this.getAdjustedFireRate(def, options);
        const ownerRoleKey = String(options.ownerRoleKey || 'leader');

        if (ownerRoleKey !== 'leader' && time < this.jamUntil) return false;
        if (time - this.lastFiredTime[key] < effectiveFireRate) return false;
        if (key === 'pulseRifle' && this.isOverheated) return false;
        if (key === 'pulseRifle' && Math.floor(this.pulseAmmo) <= 0) return false;
        if (def.ammoType === 'limited' && this.ammo[key] <= 0) return false;

        return true;
    }

    fire(x, y, angle, time, options = {}) {
        if (!this.canFire(time, options)) return false;

        const key = this.currentWeaponKey;
        const def = this.getRuntimeWeaponDef(key);
        const ownerRoleKey = options.ownerRoleKey || 'leader';
        const jamChanceRaw = Number(options.jamChance);
        const jamChance = Number.isFinite(jamChanceRaw) ? clamp(jamChanceRaw, 0, 0.9) : 0;
        if (ownerRoleKey !== 'leader' && jamChance > 0 && Math.random() < jamChance) {
            const jamMin = Math.max(100, Number(options.jamDurationMinMs) || 700);
            const jamMax = Math.max(jamMin, Number(options.jamDurationMaxMs) || 1500);
            const jamDuration = Math.floor(jamMin + Math.random() * (jamMax - jamMin));
            this.jamUntil = time + jamDuration;
            if (typeof this.onJam === 'function') {
                this.onJam({ weaponKey: key, ownerRoleKey, jamUntil: this.jamUntil, jamDuration, time });
            }
            return false;
        }

        const angleJitterRaw = Number(options.angleJitter);
        const angleJitter = Number.isFinite(angleJitterRaw) ? clamp(angleJitterRaw, 0, 0.35) : 0;
        // Recoil-based angular perturbation — sustained fire gets progressively less accurate
        const currentRecoil = this.recoil[key] || 0;
        const recoilSpread = (Math.random() - 0.5) * currentRecoil * 0.15;
        const shotAngle = angle + (angleJitter > 0 ? ((Math.random() * 2 - 1) * angleJitter) : 0) + recoilSpread;
        const shotDef = { ...def, ownerRoleKey };
        let spawnedCount = 0;

        if (shotDef.bulletsPerShot > 1) {
            spawnedCount = this.bulletPool.fireSpread(x, y, shotAngle, time, shotDef);
        } else {
            spawnedCount = this.bulletPool.fire(x, y, shotAngle, time, shotDef) ? 1 : 0;
        }

        if (spawnedCount <= 0) {
            return false;
        }

        this.lastFiredTime[key] = time;

        // Consume ammo
        if (def.ammoType === 'limited') {
            this.ammo[key] = Math.max(0, (this.ammo[key] || 0) - 1);
            if (this.onAmmoChange) this.onAmmoChange(key, this.ammo[key]);
        }

        // Accumulate recoil
        const recoilPerShot = Number(def.recoilPerShot) || 0.08;
        this.recoil[key] = clamp((this.recoil[key] || 0) + recoilPerShot, 0, 1);

        if (key === 'pulseRifle') {
            this.isFiringPulse = true;
            this.lastPulseFiredTime = time;
        }

        return true;
    }

    update(delta, time = 0) {
        const dt = delta / 1000;
        const prevAmmo = Math.floor(this.pulseAmmo);
        const prevOverheated = this.isOverheated;

        if (this.currentWeaponKey === 'pulseRifle' && this.pulseTriggerHeld && this.pulseAmmo > 0 && !this.isOverheated) {
            this.isFiringPulse = true;
            this.lastPulseFiredTime = time;
            this.pulseAmmo = Math.max(0, this.pulseAmmo - this.pulseDrainRate * dt);
            if (this.pulseAmmo <= 0) {
                this.pulseAmmo = 0;
                this.isOverheated = true;
                this.overheatCooldownUntil = time + this.pulseEmptyDelayMs;
                if (this.onOverheatStart) this.onOverheatStart(time);
                this.scene?.eventBus?.emit('weaponOverheat', { weaponKey: 'pulseRifle', time });
            }
        } else {
            this.isFiringPulse = false;
        }

        if (this.pulseAmmo < this.pulseMaxAmmo) {
            const canRecharge = !this.pulseTriggerHeld && (!this.isOverheated || time >= this.overheatCooldownUntil);
            if (canRecharge) {
                this.pulseAmmo = Math.min(this.pulseMaxAmmo, this.pulseAmmo + this.pulseRechargeRate * dt);
                if (this.isOverheated && this.pulseAmmo >= this.pulseUnlockAt) {
                    this.isOverheated = false;
                }
            }
        }

        const flooredAmmo = Math.floor(this.pulseAmmo);
        if (flooredAmmo > 0 && flooredAmmo <= 15 && (time - this._lastLowAmmoWarnAt) > 250) {
            this._lastLowAmmoWarnAt = time;
            if (this.onLowAmmoWarning) this.onLowAmmoWarning(flooredAmmo, time);
        }
        if (this.onHeatChange && (flooredAmmo !== prevAmmo || this.isOverheated !== prevOverheated)) {
            this.onHeatChange(flooredAmmo, this.isOverheated);
        }

        // Decay recoil for all weapons
        for (const key of WEAPON_ORDER) {
            if (this.recoil[key] > 0) {
                const wDef = WEAPONS[key];
                const decayRate = Number(wDef?.recoilDecay) || 2.0;
                this.recoil[key] = Math.max(0, this.recoil[key] - decayRate * dt);
            }
        }
    }
}
