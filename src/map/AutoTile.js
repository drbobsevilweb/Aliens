/**
 * 4-bit NESW wall autotile system.
 *
 * Bitmask encoding (standard tilemap convention):
 *   bit 0 (1) = North neighbor is wall
 *   bit 1 (2) = East neighbor is wall
 *   bit 2 (4) = South neighbor is wall
 *   bit 3 (8) = West neighbor is wall
 *
 * Tile index layout in the tileset texture:
 *   0       floor base
 *   1       wall fallback (fully surrounded — kept for backward compat)
 *   2       floor hazard variant
 *   3       floor grating variant
 *   4-19    wall autotile variants (index = WALL_AUTO_BASE + bitmask)
 */

/** First tile index for wall autotile variants. */
export const WALL_AUTO_BASE = 4;

/** Total number of wall autotile variants (2^4 = 16). */
export const WALL_AUTO_COUNT = 16;

/** Total tiles in the expanded tileset. */
export const TILESET_TILE_COUNT = WALL_AUTO_BASE + WALL_AUTO_COUNT; // 20

/**
 * Compute the 4-bit NESW bitmask for a wall cell.
 * @param {number[][]} grid  2-D grid where values > 0 are wall, <= 0 are open.
 * @param {number} x  Column index.
 * @param {number} y  Row index.
 * @returns {number} 0–15 bitmask.
 */
function wallBitmask(grid, x, y) {
    const h = grid.length;
    const w = (grid[0] && grid[0].length) || 0;
    let mask = 0;
    if (y > 0     && grid[y - 1][x] > 0) mask |= 1; // N
    if (x < w - 1 && grid[y][x + 1] > 0) mask |= 2; // E
    if (y < h - 1 && grid[y + 1][x] > 0) mask |= 4; // S
    if (x > 0     && grid[y][x - 1] > 0) mask |= 8; // W
    return mask;
}

/**
 * Build an autotiled wall-layer grid from raw wall data.
 *
 * Input  – 2-D array: > 0 means wall, -1 means open.
 * Output – 2-D array: WALL_AUTO_BASE + bitmask for walls, -1 for open.
 *
 * @param {number[][]} wallData
 * @returns {number[][]}
 */
export function buildAutoTiledWallData(wallData) {
    const h = wallData.length;
    const w = (wallData[0] && wallData[0].length) || 0;
    const out = Array.from({ length: h }, () => Array(w).fill(-1));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (wallData[y][x] > 0) {
                out[y][x] = WALL_AUTO_BASE + wallBitmask(wallData, x, y);
            }
        }
    }
    return out;
}
