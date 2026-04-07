import { CONFIG } from '../config.js';

const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Classifies spawn points by compass bearing relative to map center.
 * Used by EnemySpawner to coordinate wave attack directions and by
 * ReinforcementSystem to weight flanking pressure.
 */
export class SectorMapper {
    constructor() {
        /** @type {Map<string, Array<{type:string, tileX:number, tileY:number}>>} */
        this.sectorSpawns = new Map();
        this.centerX = 0;
        this.centerY = 0;
        this.lastWaveSector = '';
    }

    /**
     * Classify each spawn point into one of eight compass sectors relative to
     * the map center (world coordinates).
     * @param {object} scene - Phaser scene (unused but kept for future hooks)
     * @param {Array<{type:string, tileX:number, tileY:number}>} spawnPoints
     * @param {{x:number, y:number}} mapCenter - world-coordinate center
     */
    init(scene, spawnPoints, mapCenter) {
        this.centerX = mapCenter.x;
        this.centerY = mapCenter.y;
        this.sectorSpawns.clear();
        for (const sector of SECTORS) {
            this.sectorSpawns.set(sector, []);
        }
        if (!Array.isArray(spawnPoints)) return;
        for (const sp of spawnPoints) {
            const wx = sp.tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
            const wy = sp.tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
            const sector = this.bearingToSector(wx, wy);
            this.sectorSpawns.get(sector).push(sp);
        }
    }

    /**
     * Return the compass sector for a world-coordinate point relative to the
     * stored map center.
     */
    bearingToSector(worldX, worldY) {
        const dx = worldX - this.centerX;
        const dy = worldY - this.centerY;
        // atan2 returns radians; convert to degrees with 0 = North, CW positive
        let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
        if (deg < 0) deg += 360;
        // 0=N, 45=NE, 90=E, ...
        const index = Math.round(deg / 45) % 8;
        return SECTORS[index];
    }

    /**
     * Count active (alive) aliens per sector.
     * @param {Array} aliens - array of alive alien sprites
     * @returns {Map<string, number>}
     */
    getSectorOccupancy(aliens) {
        const counts = new Map();
        for (const sector of SECTORS) counts.set(sector, 0);
        if (!Array.isArray(aliens)) return counts;
        for (const a of aliens) {
            if (!a || !a.active) continue;
            const sector = this.bearingToSector(a.x, a.y);
            counts.set(sector, (counts.get(sector) || 0) + 1);
        }
        return counts;
    }

    /**
     * Return the N sectors with the fewest active aliens, filtered to sectors
     * that actually have spawn points.  Excludes lastWaveSector from position
     * 0 (primary) when alternatives exist.
     * @param {Array} aliens - active alien sprites
     * @param {number} count - how many sectors to return
     * @returns {string[]}
     */
    getWeakSectors(aliens, count) {
        const occupancy = this.getSectorOccupancy(aliens);
        const ranked = SECTORS
            .filter(s => (this.sectorSpawns.get(s) || []).length > 0)
            .sort((a, b) => (occupancy.get(a) || 0) - (occupancy.get(b) || 0));

        if (ranked.length === 0) return [];

        // Avoid consecutive primary sector: bump lastWaveSector down if possible
        if (ranked.length > 1 && ranked[0] === this.lastWaveSector) {
            const tmp = ranked[0];
            ranked[0] = ranked[1];
            ranked[1] = tmp;
        }
        return ranked.slice(0, Math.min(count, ranked.length));
    }

    /**
     * Return spawn points belonging to a given sector.
     * @param {string} sector
     * @returns {Array<{type:string, tileX:number, tileY:number}>}
     */
    getSpawnsInSector(sector) {
        return this.sectorSpawns.get(sector) || [];
    }

    /**
     * Determine the sector that is 90-180 degrees away from the sector
     * containing the most marines (i.e. the best flanking angle).
     * @param {Array} marines - active marine sprites
     * @returns {string|null}
     */
    getFlankingSector(marines) {
        if (!Array.isArray(marines) || marines.length === 0) return null;
        // Find which sector has the most marines
        const marineCounts = new Map();
        for (const sector of SECTORS) marineCounts.set(sector, 0);
        for (const m of marines) {
            if (!m || !m.active) continue;
            const sector = this.bearingToSector(m.x, m.y);
            marineCounts.set(sector, (marineCounts.get(sector) || 0) + 1);
        }
        let maxSector = SECTORS[0];
        let maxCount = 0;
        for (const [sector, cnt] of marineCounts) {
            if (cnt > maxCount) { maxCount = cnt; maxSector = sector; }
        }
        const mainIdx = SECTORS.indexOf(maxSector);
        // Flanking = 3-5 steps away (90-180 degrees)
        const candidates = [3, 4, 5].map(offset => SECTORS[(mainIdx + offset) % 8]);
        // Pick the flanking sector that has spawn points and fewest aliens
        const withSpawns = candidates.filter(s => (this.sectorSpawns.get(s) || []).length > 0);
        return withSpawns.length > 0 ? withSpawns[0] : null;
    }
}
