const ZONE_PROP_TYPES = new Set(['zone_colony', 'zone_damaged', 'zone_hive']);

function normalizePropType(input) {
    if (input && typeof input === 'object') {
        return String(input.type ?? input._propType ?? input.kind ?? '').trim();
    }
    return String(input || '').trim();
}

function markCell(cells, width, height, tileX, tileY, key) {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return;
    const cell = cells[tileY]?.[tileX];
    if (!cell) return;
    cell[key] = true;
    cell.walkable = false;
}

function collectObjectTileCoverage(obj, tileWidth = 64, tileHeight = 64) {
    const x = Number(obj?.x) || 0;
    const y = Number(obj?.y) || 0;
    const width = Math.max(1, Number(obj?.width) || tileWidth);
    const height = Math.max(1, Number(obj?.height) || tileHeight);
    const minTileX = Math.floor(x / tileWidth);
    const minTileY = Math.floor(y / tileHeight);
    const maxTileX = Math.floor((x + Math.max(0, width - 1)) / tileWidth);
    const maxTileY = Math.floor((y + Math.max(0, height - 1)) / tileHeight);
    const tiles = [];
    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            tiles.push({ tileX, tileY });
        }
    }
    return tiles;
}

export function isZonePropType(input = '') {
    return ZONE_PROP_TYPES.has(normalizePropType(input));
}

export function authoredPropBlocksPath(input = '') {
    return !isZonePropType(input);
}

export function authoredPropBlocksLight(input = '') {
    const type = normalizePropType(input);
    if (!type || isZonePropType(type)) return false;
    return type !== 'lamp';
}

export function isEditorTerrainTileWalkable(value) {
    return Number(value) === 1;
}

export function buildEditorCollisionPreviewGrid(map) {
    const width = Math.max(0, Number(map?.width) || 0);
    const height = Math.max(0, Number(map?.height) || 0);
    const tileWidth = Math.max(1, Number(map?.tilewidth) || Number(map?.tileWidth) || 64);
    const tileHeight = Math.max(1, Number(map?.tileheight) || Number(map?.tileHeight) || 64);
    const cells = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => ({
            walkable: false,
            terrainValue: 0,
            blockedByTerrain: true,
            blockedByDoor: false,
            blockedByProp: false,
        }))
    );
    if (width <= 0 || height <= 0) return { width, height, cells };

    const terrainLayer = Array.isArray(map?.layers)
        ? map.layers.find((layer) => layer?.name === 'terrain')
        : null;
    const terrainData = Array.isArray(terrainLayer?.data) ? terrainLayer.data : [];
    for (let tileY = 0; tileY < height; tileY++) {
        for (let tileX = 0; tileX < width; tileX++) {
            const idx = tileY * width + tileX;
            const terrainValue = Number(terrainData[idx]) || 0;
            const walkable = isEditorTerrainTileWalkable(terrainValue);
            cells[tileY][tileX] = {
                walkable,
                terrainValue,
                blockedByTerrain: !walkable,
                blockedByDoor: false,
                blockedByProp: false,
            };
        }
    }

    const doorsLayer = Array.isArray(map?.layers)
        ? map.layers.find((layer) => layer?.name === 'doors' && layer?.type === 'objectgroup')
        : null;
    for (const obj of Array.isArray(doorsLayer?.objects) ? doorsLayer.objects : []) {
        for (const tile of collectObjectTileCoverage(obj, tileWidth, tileHeight)) {
            markCell(cells, width, height, tile.tileX, tile.tileY, 'blockedByDoor');
        }
    }

    const propsLayer = Array.isArray(map?.layers)
        ? map.layers.find((layer) => layer?.name === 'props' && layer?.type === 'objectgroup')
        : null;
    for (const obj of Array.isArray(propsLayer?.objects) ? propsLayer.objects : []) {
        if (!authoredPropBlocksPath(obj?.type)) continue;
        const tileX = Math.round((Number(obj?.x) || 0) / tileWidth);
        const tileY = Math.round((Number(obj?.y) || 0) / tileHeight);
        markCell(cells, width, height, tileX, tileY, 'blockedByProp');
    }

    return { width, height, cells };
}