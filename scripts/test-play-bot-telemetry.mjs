#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildWeaponTelemetry } from './play_bot_shared.mjs';

function testPulseTelemetryShape() {
    const telemetry = buildWeaponTelemetry({
        time: { now: 1200 },
        weaponManager: {
            currentWeaponKey: 'pulseRifle',
            pulseAmmo: 40,
            pulseMaxAmmo: 99,
            isOverheated: true,
            overheatCooldownUntil: 5000,
        },
        marineAmmo: new Map(),
    });

    assert.deepEqual(Object.keys(telemetry.ammo), [
        'counter',
        'magSize',
        'heatPct',
        'overheated',
        'emptyDelayMs',
    ]);
    assert.equal(telemetry.ammo.counter, 40);
    assert.equal(telemetry.ammo.magSize, 99);
    assert.equal(telemetry.ammo.overheated, true);
    assert.equal(telemetry.ammo.emptyDelayMs, 3800);
}

function testLimitedAmmoTelemetryShape() {
    const telemetry = buildWeaponTelemetry({
        time: { now: 0 },
        weaponManager: {
            currentWeaponKey: 'shotgun',
        },
        marineAmmo: new Map([
            ['leader', {
                currentMag: 6,
                magsLeft: 2,
                magSize: 12,
                isReloading: true,
            }],
        ]),
    });

    assert.deepEqual(telemetry, {
        key: 'shotgun',
        ammo: {
            mag: 6,
            mags: 2,
            magSize: 12,
            reloading: true,
        },
    });
}

function main() {
    testPulseTelemetryShape();
    testLimitedAmmoTelemetryShape();
    console.log('playBotTelemetry.spec: ok');
}

main();
