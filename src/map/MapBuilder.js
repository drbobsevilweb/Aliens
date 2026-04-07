import { CONFIG } from '../config.js';
import { FLOOR_DATA, WALL_DATA } from './mapData.js';
import { buildAutoTiledWallData, WALL_AUTO_BASE, WALL_AUTO_COUNT } from './AutoTile.js';

export class MapBuilder {
    constructor(scene, layout = null) {
        this.scene = scene;
        this.layout = layout;
    }

    createMissingAssetPlaceholder(x, y, width, height, depth = 2) {
        const size = Math.max(18, Math.min(width, height) * 0.72);
        const placeholder = this.scene.add.rectangle(x, y, size, size, 0x3f5564, 0.9);
        placeholder.setStrokeStyle(Math.max(2, size * 0.08), 0x9fc7da, 0.95);
        placeholder.setDepth(depth);
        return placeholder;
    }

    build(physicsGroup = null) {
        const floorData = this.layout?.floorData || FLOOR_DATA;
        const wallData = this.layout?.wallData || WALL_DATA;
        const width = this.layout?.width || CONFIG.MAP_WIDTH_TILES;
        const height = this.layout?.height || CONFIG.MAP_HEIGHT_TILES;

        const map = this.scene.make.tilemap({
            tileWidth: CONFIG.TILE_SIZE,
            tileHeight: CONFIG.TILE_SIZE,
            width,
            height
        });

        const tileset = map.addTilesetImage('tileset', 'tileset',
            CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 0, 0);

        // Floor layer with deterministic tile variation for more natural base wear.
        const variedFloorData = floorData.map((row, y) => row.map((tile, x) => {
            if (tile !== CONFIG.TILE_FLOOR) return tile;
            const h = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0;
            if ((h % 19) === 0) return 3;
            if ((h % 11) === 0) return 2;
            return 0;
        }));
        const floorLayer = map.createBlankLayer('tiles_floor', tileset, 0, 0);
        floorLayer.putTilesAt(variedFloorData, 0, 0);
        floorLayer.setDepth(0);

        // Wall layer — autotile for context-aware wall edge rendering
        const autoTiledWalls = buildAutoTiledWallData(wallData);
        const wallLayer = map.createBlankLayer('tiles_walls', tileset, 0, 0);
        wallLayer.putTilesAt(autoTiledWalls, 0, 0);
        wallLayer.setCollision(CONFIG.TILE_WALL);
        wallLayer.setCollisionBetween(WALL_AUTO_BASE, WALL_AUTO_BASE + WALL_AUTO_COUNT - 1);
        wallLayer.setDepth(5);

        const terrainTextureSprites = [];
        if (Array.isArray(this.layout?.terrainTextures)) {
            for (let y = 0; y < this.layout.terrainTextures.length; y++) {
                const row = Array.isArray(this.layout.terrainTextures[y]) ? this.layout.terrainTextures[y] : [];
                for (let x = 0; x < row.length; x++) {
                    const key = String(row[x] || '').trim();
                    if (!key) continue;
                    const px = (x + 0.5) * CONFIG.TILE_SIZE;
                    const py = (y + 0.5) * CONFIG.TILE_SIZE;
                    const sprite = this.scene.textures.exists(key)
                        ? this.scene.add.image(px, py, key)
                        : this.createMissingAssetPlaceholder(px, py, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 1);
                    if (typeof sprite.setDisplaySize === 'function') {
                        sprite.setDisplaySize(CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    }
                    sprite.setDepth(1);
                    terrainTextureSprites.push(sprite);
                }
            }
        }

        const largeTextureSprites = [];
        if (Array.isArray(this.layout?.largeTextures)) {
            for (const largeTexture of this.layout.largeTextures) {
                const key = String(largeTexture?.imageKey || '');
                const tileX = Number(largeTexture.tileX);
                const tileY = Number(largeTexture.tileY);
                if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
                const widthTiles = Math.max(1, Math.round(Number(largeTexture.widthTiles) || 1));
                const heightTiles = Math.max(1, Math.round(Number(largeTexture.heightTiles) || 1));
                const px = (tileX + (widthTiles * 0.5)) * CONFIG.TILE_SIZE;
                const py = (tileY + (heightTiles * 0.5)) * CONFIG.TILE_SIZE;
                const widthPx = widthTiles * CONFIG.TILE_SIZE;
                const heightPx = heightTiles * CONFIG.TILE_SIZE;
                const sprite = key && this.scene.textures.exists(key)
                    ? this.scene.add.image(px, py, key)
                    : this.createMissingAssetPlaceholder(px, py, widthPx, heightPx, 1);
                if (typeof sprite.setDisplaySize === 'function') {
                    sprite.setDisplaySize(widthPx, heightPx);
                }
                sprite.setDepth(Number.isFinite(Number(largeTexture.depth)) ? Number(largeTexture.depth) : 1);
                sprite.setAlpha(
                    Number.isFinite(Number(largeTexture.opacity))
                        ? Phaser.Math.Clamp(Number(largeTexture.opacity), 0, 1)
                        : 1
                );
                largeTextureSprites.push(sprite);
            }
        }

        // Spawn authored props from the tilemap editor.
        const propSprites = [];
        if (Array.isArray(this.layout?.props)) {
            for (const prop of this.layout.props) {
                const key = String(prop.imageKey || '');
                const px = (prop.tileX + 0.5) * CONFIG.TILE_SIZE;
                const py = (prop.tileY + 0.5) * CONFIG.TILE_SIZE;
                
                let sprite;
                if (key && this.scene.textures.exists(key) && physicsGroup) {
                    sprite = physicsGroup.create(px, py, key);
                } else if (key && this.scene.textures.exists(key)) {
                    sprite = this.scene.add.image(px, py, key);
                } else {
                    sprite = this.createMissingAssetPlaceholder(px, py, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 2);
                    if (this.scene.physics?.add?.existing) {
                        this.scene.physics.add.existing(sprite, true);
                    }
                    if (physicsGroup?.add) {
                        physicsGroup.add(sprite);
                    }
                }

                if (typeof sprite.setDisplaySize === 'function') {
                    sprite.setDisplaySize(CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                }
                sprite.setDepth(2); // above floor, below entities

                // Apply rotation from editor (stored in degrees)
                const rotDeg = Number(prop.rotation) || 0;
                if (rotDeg !== 0) {
                    sprite.setRotation(rotDeg * Math.PI / 180);
                }

                if (sprite.body) {
                    const radius = Math.max(8, Number(prop.radius) || 18);
                    if (typeof sprite.body.setCircle === 'function') {
                        sprite.body.setCircle(radius);
                        const ox = (sprite.width * sprite.scaleX * 0.5) - radius;
                        const oy = (sprite.height * sprite.scaleY * 0.5) - radius;
                        sprite.body.setOffset(ox, oy);
                    } else if (typeof sprite.body.setSize === 'function') {
                        sprite.body.setSize(radius * 2, radius * 2);
                    }
                    sprite._roomPropRadius = radius;
                }
                sprite._tileX = Number(prop.tileX);
                sprite._tileY = Number(prop.tileY);
                sprite._propType = String(prop.type || key || 'prop');
                sprite._blocksLight = sprite._propType !== 'lamp';

                propSprites.push(sprite);
            }
        }

        // Top-down mode: no projected south wall faces.
        return { map, floorLayer, wallLayer, wallOverlays: [], terrainTextureSprites, propSprites, largeTextureSprites };
    }
}
