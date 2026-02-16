import { CONFIG } from '../config.js';

const W = CONFIG.MAP_WIDTH_TILES;
const H = CONFIG.MAP_HEIGHT_TILES;

// Floor layer: every cell is floor (tile index 0)
export const FLOOR_DATA = Array.from({ length: H }, () => Array(W).fill(CONFIG.TILE_FLOOR));

// Wall layer: -1 = no tile (open), 1 = wall tile
function generateWalls() {
    const d = Array.from({ length: H }, () => Array(W).fill(CONFIG.TILE_WALL));

    function carveRect(x1, y1, x2, y2) {
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                d[y][x] = -1;
            }
        }
    }

    // 6-room layout (3 top, 3 bottom), larger rooms for testing
    carveRect(2, 2, 10, 9);    // Room 1
    carveRect(16, 2, 24, 9);   // Room 2
    carveRect(30, 2, 38, 9);   // Room 3
    carveRect(2, 15, 10, 23);  // Room 4
    carveRect(16, 15, 24, 23); // Room 5
    carveRect(30, 15, 38, 23); // Room 6

    // 6 corridors (width = 2 tiles), with longer runs between room doors
    carveRect(12, 5, 14, 6);   // C1: Room 1 <-> Room 2
    carveRect(26, 5, 28, 6);   // C2: Room 2 <-> Room 3
    carveRect(12, 18, 14, 19); // C3: Room 4 <-> Room 5
    carveRect(26, 18, 28, 19); // C4: Room 5 <-> Room 6
    carveRect(20, 11, 21, 13); // C5: Room 2 <-> Room 5
    carveRect(5, 11, 6, 13);   // C6: Room 1 <-> Room 4

    return d;
}

export const WALL_DATA = generateWalls();

// Spawn in Room 1, extraction in Room 6
export const SPAWN_TILE = { x: 5, y: 5 };
export const EXTRACTION_TILE = { x: 34, y: 19 };
