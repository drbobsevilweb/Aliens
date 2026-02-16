const WIDTH = 104;
const HEIGHT = 70;

function makeGrid(fill) {
    return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(fill));
}

function carveRect(grid, x1, y1, x2, y2, value = 0) {
    for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
            if (grid[y] && typeof grid[y][x] !== 'undefined') grid[y][x] = value;
        }
    }
}

function addTwoTileDoor(doors, x, y, horizontal, value) {
    doors[y][x] = value;
    if (horizontal) doors[y][x + 1] = value;
    else doors[y + 1][x] = value;
}

function buildLevel1() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // 6 rooms (large)
    carveRect(terrain, 2, 3, 19, 20);   // Room 1
    carveRect(terrain, 42, 3, 59, 20);  // Room 2
    carveRect(terrain, 82, 3, 99, 20);  // Room 3
    carveRect(terrain, 2, 42, 19, 59);  // Room 4
    carveRect(terrain, 42, 42, 59, 59); // Room 5
    carveRect(terrain, 82, 42, 99, 59); // Room 6

    // Corridors (2 tiles wide, long)
    carveRect(terrain, 21, 11, 40, 12); // C1 R1<->R2
    carveRect(terrain, 61, 11, 80, 12); // C2 R2<->R3
    carveRect(terrain, 21, 49, 40, 50); // C3 R4<->R5
    carveRect(terrain, 61, 49, 80, 50); // C4 R5<->R6
    carveRect(terrain, 50, 22, 51, 40); // C5 R2<->R5
    carveRect(terrain, 10, 22, 11, 40); // C6 R1<->R4

    // Doors at corridor entrances (2 tiles each)
    addTwoTileDoor(doors, 20, 11, false, 1); // c1_r1 standard
    addTwoTileDoor(doors, 41, 11, false, 2); // c1_r2 electronic
    addTwoTileDoor(doors, 60, 11, false, 1); // c2_r2 standard
    addTwoTileDoor(doors, 81, 11, false, 2); // c2_r3 electronic

    addTwoTileDoor(doors, 20, 49, false, 1); // c3_r4 standard
    addTwoTileDoor(doors, 41, 49, false, 2); // c3_r5 electronic
    addTwoTileDoor(doors, 60, 49, false, 1); // c4_r5 standard
    addTwoTileDoor(doors, 81, 49, false, 2); // c4_r6 electronic

    addTwoTileDoor(doors, 50, 21, true, 2); // c5_r2 electronic
    addTwoTileDoor(doors, 50, 41, true, 1); // c5_r5 standard
    addTwoTileDoor(doors, 10, 21, true, 2); // c6_r1 electronic
    addTwoTileDoor(doors, 10, 41, true, 1); // c6_r4 standard

    markers[10][10] = 1; // spawn
    markers[50][90] = 2; // extract
    markers[10][50] = 3; // terminal marker

    return {
        id: 'lv1_colony_hub',
        name: 'Level 1: Colony Hub',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
    };
}

function buildLevel2() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // Large rooms
    carveRect(terrain, 4, 4, 27, 22);
    carveRect(terrain, 40, 4, 63, 22);
    carveRect(terrain, 76, 4, 99, 22);
    carveRect(terrain, 4, 44, 27, 67);
    carveRect(terrain, 40, 44, 63, 67);
    carveRect(terrain, 76, 44, 99, 67);

    // Long corridors
    carveRect(terrain, 29, 13, 38, 14);
    carveRect(terrain, 65, 13, 74, 14);
    carveRect(terrain, 29, 55, 38, 56);
    carveRect(terrain, 65, 55, 74, 56);
    carveRect(terrain, 50, 24, 51, 42);
    carveRect(terrain, 15, 24, 16, 42);

    addTwoTileDoor(doors, 28, 13, false, 1);
    addTwoTileDoor(doors, 39, 13, false, 2);
    addTwoTileDoor(doors, 64, 13, false, 1);
    addTwoTileDoor(doors, 75, 13, false, 2);

    addTwoTileDoor(doors, 28, 55, false, 1);
    addTwoTileDoor(doors, 39, 55, false, 2);
    addTwoTileDoor(doors, 64, 55, false, 1);
    addTwoTileDoor(doors, 75, 55, false, 2);

    addTwoTileDoor(doors, 50, 23, true, 2);
    addTwoTileDoor(doors, 50, 43, true, 1);
    addTwoTileDoor(doors, 15, 23, true, 2);
    addTwoTileDoor(doors, 15, 43, true, 1);

    markers[12][12] = 1;
    markers[58][92] = 2;
    markers[12][52] = 3;
    markers[56][52] = 3;

    return {
        id: 'lv2_reactor_spine',
        name: 'Level 2: Reactor Spine',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
    };
}

function buildLevel3() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // Large chambers
    carveRect(terrain, 6, 6, 29, 29);
    carveRect(terrain, 42, 6, 65, 29);
    carveRect(terrain, 78, 6, 101, 29);
    carveRect(terrain, 6, 41, 29, 64);
    carveRect(terrain, 42, 41, 65, 64);
    carveRect(terrain, 78, 41, 101, 64);

    // Long corridors
    carveRect(terrain, 31, 17, 40, 18);
    carveRect(terrain, 67, 17, 76, 18);
    carveRect(terrain, 31, 51, 40, 52);
    carveRect(terrain, 67, 51, 76, 52);
    carveRect(terrain, 53, 31, 54, 39);

    addTwoTileDoor(doors, 30, 17, false, 1);
    addTwoTileDoor(doors, 41, 17, false, 2);
    addTwoTileDoor(doors, 66, 17, false, 1);
    addTwoTileDoor(doors, 77, 17, false, 2);

    addTwoTileDoor(doors, 30, 51, false, 1);
    addTwoTileDoor(doors, 41, 51, false, 2);
    addTwoTileDoor(doors, 66, 51, false, 1);
    addTwoTileDoor(doors, 77, 51, false, 2);

    addTwoTileDoor(doors, 53, 30, true, 2);
    addTwoTileDoor(doors, 53, 40, true, 1);

    markers[12][12] = 1;
    markers[56][94] = 2;
    markers[12][86] = 3;
    markers[52][54] = 4;

    return {
        id: 'lv3_hive_core',
        name: 'Level 3: Hive Core',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
    };
}

export const TILEMAP_TEMPLATES = Object.freeze([
    buildLevel1(),
    buildLevel2(),
    buildLevel3(),
]);
