import { CONFIG } from '../config.js';

const W = CONFIG.MAP_WIDTH_TILES;
const H = CONFIG.MAP_HEIGHT_TILES;

// Floor layer: every cell is floor (tile index 0)
export const FLOOR_DATA = Array.from({ length: H }, () => Array(W).fill(CONFIG.TILE_FLOOR));

// Wall layer: -1 = no tile (open), 1 = wall tile
function generateWalls() {
    const d = Array.from({ length: H }, () => Array(W).fill(-1));

    // Helper: draw horizontal wall
    function hWall(y, x1, x2) {
        for (let x = x1; x <= x2; x++) d[y][x] = CONFIG.TILE_WALL;
    }
    // Helper: draw vertical wall
    function vWall(x, y1, y2) {
        for (let y = y1; y <= y2; y++) d[y][x] = CONFIG.TILE_WALL;
    }

    // Border walls
    hWall(0, 0, W - 1);        // top
    hWall(H - 1, 0, W - 1);    // bottom
    vWall(0, 0, H - 1);        // left
    vWall(W - 1, 0, H - 1);    // right

    // Room 1 divider (vertical wall with gap at rows 8-9)
    vWall(13, 1, 7);    // upper section
    // gap at y=8,9 (corridor)
    // no lower section — opens to central area

    // Room 2 enclosure (bottom-right area)
    vWall(20, 5, 8);     // left wall of room 2 upper
    hWall(5, 20, 28);    // top wall of room 2
    vWall(20, 5, 14);    // left wall full
    // gap at y=9,10 on x=20 for corridor
    hWall(14, 13, 21);   // bottom wall of inner section

    // Interior pillar in central area
    hWall(11, 10, 15);
    vWall(10, 11, 13);
    vWall(16, 11, 13);
    hWall(13, 10, 13);

    // Clear the corridors (ensure gaps)
    // Gap in room 1 divider
    d[8][13] = -1;
    d[9][13] = -1;

    // Gap in room 2 left wall
    d[9][20] = -1;
    d[10][20] = -1;

    // Gap in bottom inner wall
    d[14][15] = -1;
    d[14][16] = -1;

    return d;
}

export const WALL_DATA = generateWalls();

// Spawn point (inside room 1)
export const SPAWN_TILE = { x: 4, y: 3 };
