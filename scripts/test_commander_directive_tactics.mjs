#!/usr/bin/env node
import assert from 'node:assert/strict';
import { CommanderSystem } from '../src/systems/CommanderSystem.js';

function testDirectiveProfiles() {
    const system = new CommanderSystem({});

    const hold = system.getDirectiveTacticalProfile('HOLD FORMATION E');
    assert.equal(hold.mode, 'hold');
    assert.equal(hold.spacingMul, 0.78);
    assert.equal(hold.laneReactionMul, 0.8);

    const split = system.getDirectiveTacticalProfile('SPLIT N/E FIRE');
    assert.equal(split.mode, 'split');
    assert.ok(split.spacingMul > hold.spacingMul);
    assert.ok(split.laneReactionMul > hold.laneReactionMul);

    const fallback = system.getDirectiveTacticalProfile('FALL BACK S ARC');
    assert.equal(fallback.mode, 'fallback');
    assert.ok(fallback.catchupMul > hold.catchupMul);

    const none = system.getDirectiveTacticalProfile('ADVANCE & SCAN');
    assert.equal(none.mode, 'none');
    assert.equal(none.laneHitMul, 1);
    assert.equal(none.suppressWindowMul, 1);
}

testDirectiveProfiles();
console.log('commanderDirectiveTactics.spec: ok');