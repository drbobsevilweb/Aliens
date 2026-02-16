import { WEAPONS, WEAPON_ORDER } from '../data/weaponData.js';

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

        // Overheat state (Pulse Rifle)
        this.heat = 0;
        this.isOverheated = false;

        // Callbacks for HUD
        this.onWeaponChange = null;
        this.onAmmoChange = null;
        this.onHeatChange = null;
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
        this.currentWeaponKey = weaponKey;
        if (this.onWeaponChange) this.onWeaponChange(weaponKey);
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

    canFire(time) {
        const key = this.currentWeaponKey;
        const def = this.getRuntimeWeaponDef(key);

        if (time - this.lastFiredTime[key] < def.fireRate) return false;
        if (key === 'pulseRifle' && this.isOverheated) return false;
        if (def.ammoType === 'limited' && this.ammo[key] <= 0) return false;

        return true;
    }

    fire(x, y, angle, time) {
        if (!this.canFire(time)) return false;

        const key = this.currentWeaponKey;
        const def = this.getRuntimeWeaponDef(key);
        let spawnedCount = 0;

        if (def.bulletsPerShot > 1) {
            spawnedCount = this.bulletPool.fireSpread(x, y, angle, time, def);
        } else {
            spawnedCount = this.bulletPool.fire(x, y, angle, time, def) ? 1 : 0;
        }

        if (spawnedCount <= 0) {
            return false;
        }

        this.lastFiredTime[key] = time;

        // Consume ammo
        if (def.ammoType === 'limited') {
            this.ammo[key]--;
            if (this.onAmmoChange) this.onAmmoChange(key, this.ammo[key]);
        }

        // Add heat (Pulse Rifle)
        if (key === 'pulseRifle') {
            this.heat = Math.min(this.heat + def.heatPerShot, def.overheatThreshold);
            if (this.heat >= def.overheatThreshold) {
                this.isOverheated = true;
            }
            if (this.onHeatChange) this.onHeatChange(this.heat, this.isOverheated);
        }

        return true;
    }

    update(delta) {
        const def = this.getRuntimeWeaponDef('pulseRifle');
        if (this.heat > 0) {
            const rate = this.isOverheated ? def.overheatCoolRate : def.passiveCoolRate;
            this.heat = Math.max(0, this.heat - rate * (delta / 1000));

            if (this.isOverheated && this.heat <= def.overheatUnlockAt) {
                this.isOverheated = false;
            }
            if (this.onHeatChange) this.onHeatChange(this.heat, this.isOverheated);
        }
    }
}
