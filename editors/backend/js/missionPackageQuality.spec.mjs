#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizeMissionPackage } from './normalizeMissionPackage.js';
import { analyzeMissionPackageQuality, autoTuneMissionPackage } from './missionPackageQuality.js';

function testNormalizePreservesMissionScopes() {
    const pkg = normalizeMissionPackage({
        version: '1.0',
        maps: [{ id: 'map_a', width: 40, height: 26, terrain: [], doors: [], markers: [] }],
        missions: [{ id: 'm1', mapId: 'map_a', difficulty: 'normal' }],
        audioCues: [
            { id: 'cue_a', textCue: 'A', missionId: 'm1' },
            { id: 'cue_b', textCue: 'B', missionIds: ['m1', 'm1', 'm2', ''] },
        ],
    });
    const cueA = pkg.audioCues.find((c) => c.id === 'cue_a');
    const cueB = pkg.audioCues.find((c) => c.id === 'cue_b');
    assert.equal(cueA.missionId, 'm1');
    assert.deepEqual(cueB.missionIds, ['m1', 'm2']);
}

function testAutoTuneAddsCoverage() {
    const src = {
        version: '1.0',
        maps: [{ id: 'map_a', width: 40, height: 26, terrain: [], doors: [], markers: [] }],
        missions: [{ id: 'm1', mapId: 'map_a', difficulty: 'normal' }],
        directorEvents: [],
        audioCues: [],
    };
    const tuned = autoTuneMissionPackage(src);
    assert.ok(tuned.added.audioCues > 0, 'expected added audio cues');
    assert.ok(tuned.added.directorEvents > 0, 'expected added director events');
    const quality = analyzeMissionPackageQuality(tuned.pkg);
    assert.ok(quality.score >= 60, 'quality score should improve after auto tune');
}

function main() {
    testNormalizePreservesMissionScopes();
    testAutoTuneAddsCoverage();
    console.log('missionPackageQuality.spec: ok');
}

main();
