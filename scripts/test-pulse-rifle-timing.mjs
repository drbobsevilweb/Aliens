#!/usr/bin/env node
import assert from 'node:assert/strict';
import { WeaponManager } from '../src/systems/WeaponManager.js';
import { WEAPONS } from '../src/data/weaponData.js';

function testPassiveRecharge() {
    const manager = new WeaponManager({
        fire() { return true; },
        fireSpread() { return 1; },
    });
    manager.pulseAmmo = 50;
    manager.setPulseTriggerHeld(false);

    manager.update(1000, 1000); 

    const expected = 50 + manager.pulseRechargeRate;
    assert.equal(manager.pulseAmmo, expected);
    assert.equal(manager.isOverheated, false);
}

function testTriggerHoldConsumesCounter() {
    const manager = new WeaponManager({
        fire() { return true; },
        fireSpread() { return 1; },
    });
    manager.pulseAmmo = 50;
    manager.setPulseTriggerHeld(true);

    manager.update(1000, 1000); 
    
    const expected = 50 - manager.pulseDrainRate;
    assert.equal(manager.pulseAmmo, expected);
    assert.equal(manager.isFiringPulse, true);
}

function testEmptyDelayBlocksRecharge() {
    const manager = new WeaponManager({
        fire() { return true; },
        fireSpread() { return 1; },
    });
    manager.pulseAmmo = 10;
    manager.setPulseTriggerHeld(true);

    manager.update(1000, 1000); // drain 10→0 at time=1000, overheatCooldownUntil=1000+2000=3000
    assert.equal(manager.pulseAmmo, 0);
    assert.equal(manager.isOverheated, true);
    assert.equal(manager.overheatCooldownUntil, 3000);

    // Release trigger but still inside the 2s lockout window (time=2000 < 3000)
    manager.setPulseTriggerHeld(false);
    manager.update(1000, 2000);

    assert.equal(manager.pulseAmmo, 0);
    assert.equal(manager.isOverheated, true);
}

function testRechargeResumesAfterEmptyDelay() {
    const manager = new WeaponManager({
        fire() { return true; },
        fireSpread() { return 1; },
    });
    manager.pulseAmmo = 0;
    manager.isOverheated = true;
    manager.overheatCooldownUntil = 5000;

    manager.update(2000, 5000); 

    const expected = 0 + manager.pulseRechargeRate * 2;
    assert.equal(manager.pulseAmmo, Math.min(expected, manager.pulseMaxAmmo));
    assert.equal(manager.isOverheated, manager.pulseAmmo < manager.pulseUnlockAt);
}

function main() {
    testPassiveRecharge();
    testTriggerHoldConsumesCounter();
    testEmptyDelayBlocksRecharge();
    testRechargeResumesAfterEmptyDelay();
    console.log('pulseRifleTiming.spec: ok');
}

main();
