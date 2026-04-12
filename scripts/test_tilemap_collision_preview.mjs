#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
    authoredPropBlocksLight,
    authoredPropBlocksPath,
    buildEditorCollisionPreviewGrid,
    isZonePropType,
} from '../shared/tilemapCollision.js';

function main() {
    assert.equal(isZonePropType('zone_hive'), true, 'zone_hive should be recognized as a zone prop');
    assert.equal(authoredPropBlocksPath('zone_hive'), false, 'zone props should not block pathing');
    assert.equal(authoredPropBlocksLight('zone_hive'), false, 'zone props should not block light');
    assert.equal(authoredPropBlocksPath('barrel'), true, 'physical props should block pathing');
    assert.equal(authoredPropBlocksLight('barrel'), true, 'barrels should block light');
    assert.equal(authoredPropBlocksPath('lamp'), true, 'lamps should still block pathing');
    assert.equal(authoredPropBlocksLight('lamp'), false, 'lamps should not block light');

    const map = {
        width: 4,
        height: 3,
        tilewidth: 64,
        tileheight: 64,
        layers: [
            {
                name: 'terrain',
                type: 'tilelayer',
                data: [
                    1, 1, 2, 0,
                    1, 1, 1, 1,
                    1, 1, 1, 1,
                ],
            },
            {
                name: 'doors',
                type: 'objectgroup',
                objects: [
                    { x: 64, y: 0, width: 128, height: 64 },
                ],
            },
            {
                name: 'props',
                type: 'objectgroup',
                objects: [
                    { x: 0, y: 64, width: 64, height: 64, type: 'barrel' },
                    { x: 64, y: 64, width: 64, height: 64, type: 'zone_hive' },
                ],
            },
        ],
    };

    const preview = buildEditorCollisionPreviewGrid(map);

    assert.equal(preview.cells[0][0].walkable, true, 'floor tiles should preview as walkable');
    assert.equal(preview.cells[0][1].blockedByDoor, true, 'door footprint should preview as blocked');
    assert.equal(preview.cells[0][1].walkable, false, 'door tiles should not preview as walkable');
    assert.equal(preview.cells[0][2].blockedByTerrain, true, 'wall terrain should preview as blocked');
    assert.equal(preview.cells[0][3].blockedByTerrain, true, 'empty terrain should preview as blocked');
    assert.equal(preview.cells[1][0].blockedByProp, true, 'blocking props should preview as blocked');
    assert.equal(preview.cells[1][0].walkable, false, 'blocking props should remove walkability');
    assert.equal(preview.cells[1][1].blockedByProp, false, 'zone props should not preview as blockers');
    assert.equal(preview.cells[1][1].walkable, true, 'zone props should preserve floor walkability');

    console.log('tilemapCollisionPreview.spec: ok');
}

main();