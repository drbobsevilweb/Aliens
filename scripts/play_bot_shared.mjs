export function buildWeaponTelemetry(scene, now = Number(scene?.time?.now) || 0) {
    const weapon = { key: scene?.weaponManager?.currentWeaponKey || 'unknown' };
    const ammo = scene?.marineAmmo?.get?.('leader');
    if (weapon.key === 'pulseRifle') {
        const pulseAmmo = Math.max(0, Number(scene?.weaponManager?.pulseAmmo) || 0);
        const magSize = Math.max(1, Number(scene?.weaponManager?.pulseMaxAmmo) || 99);
        weapon.ammo = {
            counter: Math.round(pulseAmmo),
            magSize,
            heatPct: +Math.max(0, Math.min(1, 1 - (pulseAmmo / magSize))).toFixed(3),
            overheated: scene?.weaponManager?.isOverheated === true,
            emptyDelayMs: Math.max(0, Math.round((Number(scene?.weaponManager?.overheatCooldownUntil) || 0) - now)),
        };
        return weapon;
    }

    if (ammo) {
        weapon.ammo = {
            mag: ammo.currentMag,
            mags: ammo.magsLeft,
            magSize: ammo.magSize,
            reloading: !!ammo.isReloading,
        };
    }
    return weapon;
}
