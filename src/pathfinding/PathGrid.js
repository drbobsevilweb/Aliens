import { CONFIG } from '../config.js';

export class PathGrid {
    constructor(wallLayer, mapWidth, mapHeight) {
        this.width = mapWidth;
        this.height = mapHeight;
        this.grid = [];

        for (let y = 0; y < mapHeight; y++) {
            this.grid[y] = [];
            for (let x = 0; x < mapWidth; x++) {
                const tile = wallLayer.getTileAt(x, y);
                this.grid[y][x] = (tile === null);
            }
        }
    }

    setWalkable(x, y, walkable) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.grid[y][x] = walkable;
        }
    }

    isWalkable(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
        return this.grid[y][x];
    }

    worldToTile(worldX, worldY) {
        return {
            x: Math.floor(worldX / CONFIG.TILE_SIZE),
            y: Math.floor(worldY / CONFIG.TILE_SIZE)
        };
    }

    tileToWorld(tileX, tileY) {
        return {
            x: tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
            y: tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2
        };
    }
}
