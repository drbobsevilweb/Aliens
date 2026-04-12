#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPackageFromEditorState } from '../editors/backend/js/buildPackageFromEditorState.js';
import { validateMissionPackageShape } from '../editors/backend/js/normalizeMissionPackage.js';
import { validateAgainstJsonSchema } from '../editors/backend/js/schemaRuntimeCheck.js';

const schema = JSON.parse(
    fs.readFileSync(new URL('../editors/backend/schemas/mission-package-v1.schema.json', import.meta.url), 'utf8')
);

function makeBaseState(overrides = {}) {
    return {
        tilemaps: [{
            id: 'map1',
            name: 'Map 1',
            width: 40,
            height: 26,
            terrain: [],
            doors: [],
            markers: [],
        }],
        missions: [{
            id: 'm1',
            name: 'Mission 1',
            mapId: 'map1',
            difficulty: 'normal',
            enemyBudget: 8,
        }],
        directorEvents: [],
        audioCues: [],
        gameConfig: { difficultyPreset: 'normal' },
        hudConfig: { layout: 'default' },
        ...overrides,
    };
}

function assertSchemaClean(pkg, label) {
    const errors = validateAgainstJsonSchema(pkg, schema, '$');
    assert.deepEqual(errors, [], `${label} schema errors:\n${errors.join('\n')}`);
}

const modernPackage = buildPackageFromEditorState(makeBaseState({
    nodeGraphs: [{
        id: 'graph-modern',
        name: 'Modern Graph',
        enabled: true,
        nodes: [{ id: 'n1', type: 'event', x: 12, y: 34, data: { eventName: 'alienDied' } }],
        connections: [],
    }],
}));

assert.equal(Array.isArray(modernPackage.nodeGraphs), true, 'modern package should include nodeGraphs array');
assert.equal(modernPackage.nodeGraphs.length, 1, 'modern package should preserve one node graph');
assert.equal(modernPackage.nodeGraphs[0].name, 'Modern Graph');
assertSchemaClean(modernPackage, 'modernPackage');

const legacyPackage = buildPackageFromEditorState(makeBaseState({
    missionGraph: {
        id: 'graph-legacy',
        name: 'Legacy Mission Graph',
        enabled: true,
        nodes: [{
            id: 'legacy-event',
            type: 'event',
            data: {
                trigger: 'always',
                action: 'show_text',
                params: { text: 'Legacy event path' },
            },
        }],
        edges: [],
    },
}));

assert.equal(Array.isArray(legacyPackage.nodeGraphs), false, 'legacy missionGraph should not masquerade as executable nodeGraphs');
assertSchemaClean(legacyPackage, 'legacyPackage');

const invalidGraphPackage = buildPackageFromEditorState(makeBaseState({
    nodeGraphs: [{
        id: 'graph-invalid',
        name: 'Broken Graph',
        enabled: true,
        nodes: [
            { id: 'event-1', type: 'event', x: 0, y: 0, data: {} },
            { id: 'action-1', type: 'action', x: 40, y: 0, data: {} },
        ],
        connections: [{ fromNode: 'event-1', toNode: 'missing-node' }],
    }],
}));

const invalidErrors = validateAgainstJsonSchema(invalidGraphPackage, schema, '$');
assert.deepEqual(invalidErrors, [], `invalidGraphPackage schema errors:\n${invalidErrors.join('\n')}`);

const semanticErrors = validateMissionPackageShape(invalidGraphPackage);
assert.ok(
    semanticErrors.some((err) => err.includes('missing data.eventName')),
    `expected missing eventName validation error, got:\n${semanticErrors.join('\n')}`
);
assert.ok(
    semanticErrors.some((err) => err.includes('missing data.actionType')),
    `expected missing actionType validation error, got:\n${semanticErrors.join('\n')}`
);
assert.ok(
    semanticErrors.some((err) => err.includes('references a missing node')),
    `expected bad-connection validation error, got:\n${semanticErrors.join('\n')}`
);

const tiledSpawnPackage = buildPackageFromEditorState(makeBaseState({
    tilemaps: [{
        id: 'map_spawn_layer',
        name: 'Map Spawn Layer',
        width: 40,
        height: 26,
        terrain: [],
        doors: [],
        markers: [],
        tilewidth: 64,
        layers: [{
            name: 'markers',
            type: 'objectgroup',
            objects: [{
                id: 1,
                name: 'alien_spawn',
                type: 'alien_spawn',
                x: 12 * 64,
                y: 8 * 64,
                width: 64,
                height: 64,
                properties: [
                    { name: 'markerValue', type: 'int', value: 5 },
                    { name: 'count', type: 'int', value: 3 },
                    { name: 'enemyType', type: 'string', value: 'drone' },
                    { name: 'spawnTimeSec', type: 'float', value: 9.5 },
                ],
            }],
        }],
    }],
}));

assert.deepEqual(tiledSpawnPackage.maps[0].spawnPoints, [{
    tileX: 12,
    tileY: 8,
    count: 3,
    enemyType: 'drone',
    spawnTimeSec: 9.5,
}], 'spawn marker layer properties should become canonical spawnPoints');
assertSchemaClean(tiledSpawnPackage, 'tiledSpawnPackage');

console.log('Node graph package checks passed.');
