import { CONFIG } from '../config.js';

export class LightBlockerGrid {
    constructor(wallLayer, mapWidth, mapHeight) {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.tileSize = CONFIG.TILE_SIZE;

        // Boolean grid: true = blocks light
        this.blockerGrid = [];
        for (let y = 0; y < mapHeight; y++) {
            this.blockerGrid[y] = [];
            for (let x = 0; x < mapWidth; x++) {
                const tile = wallLayer.getTileAt(x, y);
                this.blockerGrid[y][x] = (tile !== null);
            }
        }

        // Segments indexed by tile key (y * mapWidth + x)
        this.segmentsByTile = {};
        this.buildAllSegments();
    }

    isBlocking(tx, ty) {
        if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) return true;
        return this.blockerGrid[ty][tx];
    }

    buildAllSegments() {
        this.segmentsByTile = {};
        for (let y = 0; y < this.mapHeight; y++) {
            for (let x = 0; x < this.mapWidth; x++) {
                if (this.blockerGrid[y][x]) {
                    this.buildSegmentsForTile(x, y);
                }
            }
        }
    }

    buildSegmentsForTile(tx, ty) {
        const key = ty * this.mapWidth + tx;
        const segs = [];
        const T = this.tileSize;
        const x0 = tx * T;
        const y0 = ty * T;
        const x1 = x0 + T;
        const y1 = y0 + T;

        // Only emit edges that face open (non-blocking) space
        if (!this.isBlocking(tx, ty - 1)) {
            segs.push({ x1: x0, y1: y0, x2: x1, y2: y0 }); // top edge
        }
        if (!this.isBlocking(tx, ty + 1)) {
            segs.push({ x1: x0, y1: y1, x2: x1, y2: y1 }); // bottom edge
        }
        if (!this.isBlocking(tx - 1, ty)) {
            segs.push({ x1: x0, y1: y0, x2: x0, y2: y1 }); // left edge
        }
        if (!this.isBlocking(tx + 1, ty)) {
            segs.push({ x1: x1, y1: y0, x2: x1, y2: y1 }); // right edge
        }

        if (segs.length > 0) {
            this.segmentsByTile[key] = segs;
        } else {
            delete this.segmentsByTile[key];
        }
    }

    setTileBlocking(tileX, tileY, blocking) {
        if (tileX < 0 || tileX >= this.mapWidth || tileY < 0 || tileY >= this.mapHeight) return;
        this.blockerGrid[tileY][tileX] = blocking;

        // Rebuild segments for this tile and its 4 neighbors
        this.rebuildTileAndNeighbors(tileX, tileY);
    }

    rebuildTileAndNeighbors(tx, ty) {
        const tiles = [
            [tx, ty],
            [tx - 1, ty], [tx + 1, ty],
            [tx, ty - 1], [tx, ty + 1],
        ];
        for (const [x, y] of tiles) {
            if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
                if (this.blockerGrid[y][x]) {
                    this.buildSegmentsForTile(x, y);
                } else {
                    delete this.segmentsByTile[y * this.mapWidth + x];
                }
            }
        }
    }

    getSegmentsNear(worldX, worldY, radius) {
        const minTX = Math.max(0, Math.floor((worldX - radius) / this.tileSize));
        const maxTX = Math.min(this.mapWidth - 1, Math.floor((worldX + radius) / this.tileSize));
        const minTY = Math.max(0, Math.floor((worldY - radius) / this.tileSize));
        const maxTY = Math.min(this.mapHeight - 1, Math.floor((worldY + radius) / this.tileSize));

        // Reuse scratch array to avoid per-query GC pressure
        if (!this._segScratch) this._segScratch = [];
        const result = this._segScratch;
        result.length = 0;
        for (let ty = minTY; ty <= maxTY; ty++) {
            const rowBase = ty * this.mapWidth;
            for (let tx = minTX; tx <= maxTX; tx++) {
                const segs = this.segmentsByTile[rowBase + tx];
                if (segs) {
                    for (let i = 0; i < segs.length; i++) {
                        result.push(segs[i]);
                    }
                }
            }
        }
        return result;
    }
}
