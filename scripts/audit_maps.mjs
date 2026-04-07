/**
 * Comprehensive map audit script.
 * Checks all 5 tilemap templates for bugs, door placement, connectivity, corridor width, etc.
 * Run with: node scripts/audit_maps.mjs
 */

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

// ---- Build levels inline (copied from tilemapTemplates.js) ----

function buildLevel1() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);
    carveRect(terrain, 6, 24, 22, 44);
    carveRect(terrain, 82, 24, 100, 44);
    carveRect(terrain, 32, 6, 54, 22);
    carveRect(terrain, 42, 26, 62, 42);
    carveRect(terrain, 28, 46, 54, 64);
    carveRect(terrain, 64, 10, 80, 24);
    carveRect(terrain, 64, 46, 80, 62);
    carveRect(terrain, 22, 14, 32, 15);
    carveRect(terrain, 22, 34, 42, 35);
    carveRect(terrain, 22, 54, 28, 55);
    carveRect(terrain, 54, 14, 64, 15);
    carveRect(terrain, 62, 34, 82, 35);
    carveRect(terrain, 54, 54, 64, 55);
    carveRect(terrain, 80, 18, 82, 19);
    carveRect(terrain, 80, 50, 82, 51);
    carveRect(terrain, 42, 22, 43, 26);
    carveRect(terrain, 46, 42, 47, 46);
    carveRect(terrain, 68, 24, 69, 34);
    carveRect(terrain, 68, 35, 69, 46);
    carveRect(terrain, 30, 15, 31, 34);
    carveRect(terrain, 26, 35, 27, 54);
    carveRect(terrain, 24, 10, 28, 18);
    carveRect(terrain, 56, 28, 60, 32);
    carveRect(terrain, 56, 38, 60, 42);
    carveRect(terrain, 58, 50, 62, 58);
    addTwoTileDoor(doors, 22, 34, false, 1);
    addTwoTileDoor(doors, 42, 34, false, 2);
    addTwoTileDoor(doors, 62, 34, false, 1);
    addTwoTileDoor(doors, 82, 34, false, 2);
    addTwoTileDoor(doors, 42, 22, true, 1);
    addTwoTileDoor(doors, 46, 42, true, 2);
    addTwoTileDoor(doors, 68, 24, true, 1);
    addTwoTileDoor(doors, 68, 46, true, 2);
    addTwoTileDoor(doors, 80, 18, true, 1);
    addTwoTileDoor(doors, 80, 50, true, 2);
    markers[34][12] = 1;
    markers[34][94] = 2;
    markers[34][52] = 4;
    markers[14][42] = 6;
    markers[34][32] = 6;
    markers[34][72] = 6;
    markers[54][44] = 6;
    markers[54][72] = 6;
    return { id: 'lv1_colony_hub', terrain, doors, markers, width: WIDTH, height: HEIGHT };
}

function buildLevel2() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);
    carveRect(terrain, 42, 28, 62, 42);
    carveRect(terrain, 6, 8, 27, 24);
    carveRect(terrain, 40, 6, 66, 20);
    carveRect(terrain, 76, 8, 98, 24);
    carveRect(terrain, 8, 44, 30, 64);
    carveRect(terrain, 72, 44, 98, 66);
    carveRect(terrain, 28, 34, 41, 35);
    carveRect(terrain, 63, 34, 75, 35);
    carveRect(terrain, 51, 21, 52, 27);
    carveRect(terrain, 51, 43, 52, 49);
    carveRect(terrain, 28, 14, 39, 15);
    carveRect(terrain, 67, 14, 75, 15);
    carveRect(terrain, 31, 54, 43, 55);
    carveRect(terrain, 63, 54, 71, 55);
    carveRect(terrain, 18, 25, 19, 43);
    carveRect(terrain, 85, 25, 86, 43);
    carveRect(terrain, 28, 18, 32, 24);
    carveRect(terrain, 56, 2, 60, 5);
    carveRect(terrain, 55, 5, 57, 5);
    carveRect(terrain, 99, 12, 101, 18);
    carveRect(terrain, 31, 52, 36, 58);
    carveRect(terrain, 72, 67, 82, 68);
    carveRect(terrain, 34, 31, 36, 33);
    carveRect(terrain, 68, 31, 70, 33);
    carveRect(terrain, 48, 44, 50, 47);
    carveRect(terrain, 14, 30, 17, 36);
    addTwoTileDoor(doors, 41, 34, false, 1);
    addTwoTileDoor(doors, 63, 34, false, 1);
    addTwoTileDoor(doors, 51, 27, true, 2);
    addTwoTileDoor(doors, 51, 43, true, 1);
    addTwoTileDoor(doors, 28, 14, false, 1);
    addTwoTileDoor(doors, 39, 14, false, 2);
    addTwoTileDoor(doors, 67, 14, false, 1);
    addTwoTileDoor(doors, 75, 14, false, 2);
    addTwoTileDoor(doors, 31, 54, false, 1);
    addTwoTileDoor(doors, 71, 54, false, 2);
    addTwoTileDoor(doors, 18, 25, true, 2);
    addTwoTileDoor(doors, 18, 43, true, 1);
    addTwoTileDoor(doors, 85, 25, true, 2);
    addTwoTileDoor(doors, 85, 43, true, 1);
    markers[16][14] = 1;
    markers[60][92] = 2;
    markers[12][54] = 3;
    markers[16][84] = 4;
    markers[10][50] = 5;
    markers[34][50] = 5;
    markers[56][84] = 5;
    markers[56][20] = 5;
    return { id: 'lv2_reactor_spine', terrain, doors, markers, width: WIDTH, height: HEIGHT };
}

function buildLevel5() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);
    carveRect(terrain, 38, 26, 66, 44);
    carveRect(terrain, 10, 6, 33, 22);
    carveRect(terrain, 70, 6, 97, 22);
    carveRect(terrain, 6, 30, 27, 48);
    carveRect(terrain, 78, 30, 101, 48);
    carveRect(terrain, 8, 52, 33, 66);
    carveRect(terrain, 68, 52, 99, 66);
    carveRect(terrain, 34, 34, 37, 35);
    carveRect(terrain, 67, 34, 77, 35);
    carveRect(terrain, 51, 23, 52, 25);
    carveRect(terrain, 51, 45, 52, 51);
    carveRect(terrain, 34, 14, 39, 15);
    carveRect(terrain, 64, 14, 69, 15);
    carveRect(terrain, 34, 58, 39, 59);
    carveRect(terrain, 62, 58, 67, 59);
    carveRect(terrain, 24, 23, 25, 51);
    carveRect(terrain, 76, 23, 77, 51);
    carveRect(terrain, 38, 21, 42, 25);
    carveRect(terrain, 62, 21, 66, 25);
    carveRect(terrain, 38, 45, 42, 49);
    carveRect(terrain, 62, 45, 66, 49);
    carveRect(terrain, 3, 12, 9, 18);
    carveRect(terrain, 98, 12, 100, 18);
    carveRect(terrain, 3, 54, 7, 60);
    carveRect(terrain, 100, 54, 102, 60);
    carveRect(terrain, 36, 10, 39, 13);
    carveRect(terrain, 64, 10, 67, 13);
    carveRect(terrain, 20, 32, 23, 36);
    carveRect(terrain, 78, 32, 81, 36);
    carveRect(terrain, 28, 38, 37, 39);
    carveRect(terrain, 30, 40, 33, 42);
    carveRect(terrain, 67, 30, 75, 31);
    addTwoTileDoor(doors, 67, 34, false, 2);
    addTwoTileDoor(doors, 51, 25, true, 4);
    addTwoTileDoor(doors, 51, 45, true, 3);
    addTwoTileDoor(doors, 34, 14, false, 1);
    addTwoTileDoor(doors, 69, 14, false, 2);
    addTwoTileDoor(doors, 34, 58, false, 1);
    addTwoTileDoor(doors, 67, 58, false, 2);
    addTwoTileDoor(doors, 24, 23, true, 3);
    addTwoTileDoor(doors, 24, 51, true, 2);
    addTwoTileDoor(doors, 76, 23, true, 3);
    addTwoTileDoor(doors, 76, 51, true, 2);
    markers[12][14] = 1;
    markers[60][96] = 2;
    markers[34][22] = 3;
    markers[34][52] = 4;
    markers[16][80] = 5;
    markers[56][88] = 5;
    markers[54][30] = 5;
    return { id: 'lv5_queen_cathedral', terrain, doors, markers, width: WIDTH, height: HEIGHT };
}

function buildLevel6() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);
    carveRect(terrain, 2, 4, 20, 22);
    carveRect(terrain, 42, 4, 60, 22);
    carveRect(terrain, 42, 48, 60, 66);
    carveRect(terrain, 82, 4, 100, 22);
    carveRect(terrain, 82, 48, 100, 66);
    carveRect(terrain, 2, 48, 20, 66);
    carveRect(terrain, 21, 12, 41, 13);
    carveRect(terrain, 61, 12, 81, 13);
    carveRect(terrain, 21, 57, 41, 58);
    carveRect(terrain, 61, 57, 81, 58);
    carveRect(terrain, 11, 23, 12, 47);
    carveRect(terrain, 51, 23, 52, 47);
    carveRect(terrain, 91, 23, 92, 47);
    carveRect(terrain, 21, 4, 28, 11);
    carveRect(terrain, 74, 4, 81, 11);
    carveRect(terrain, 21, 58, 28, 66);
    carveRect(terrain, 74, 58, 81, 66);
    carveRect(terrain, 30, 9, 32, 11);
    carveRect(terrain, 70, 9, 72, 11);
    carveRect(terrain, 30, 59, 32, 61);
    carveRect(terrain, 70, 59, 72, 61);
    carveRect(terrain, 6, 32, 10, 36);
    carveRect(terrain, 46, 32, 50, 38);
    carveRect(terrain, 86, 32, 90, 36);
    carveRect(terrain, 13, 34, 50, 35);
    carveRect(terrain, 53, 34, 90, 35);
    addTwoTileDoor(doors, 21, 12, false, 1);
    addTwoTileDoor(doors, 41, 12, false, 2);
    addTwoTileDoor(doors, 61, 12, false, 1);
    addTwoTileDoor(doors, 81, 12, false, 2);
    addTwoTileDoor(doors, 21, 57, false, 1);
    addTwoTileDoor(doors, 41, 57, false, 2);
    addTwoTileDoor(doors, 61, 57, false, 1);
    addTwoTileDoor(doors, 81, 57, false, 2);
    addTwoTileDoor(doors, 11, 23, true, 1);
    addTwoTileDoor(doors, 51, 23, true, 2);
    addTwoTileDoor(doors, 91, 23, true, 1);
    markers[5][3] = 1;
    markers[62][97] = 2;
    markers[14][52] = 3;
    markers[14][92] = 4;
    markers[58][8] = 4;
    markers[34][30] = 5;
    markers[34][70] = 5;
    markers[12][70] = 5;
    markers[57][30] = 5;
    return { id: 'lv6_hydroponics_array', terrain, doors, markers, width: WIDTH, height: HEIGHT };
}

function buildLevel9() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);
    carveRect(terrain, 6, 4, 19, 66);
    carveRect(terrain, 84, 4, 97, 66);
    carveRect(terrain, 21, 4, 82, 18);
    carveRect(terrain, 21, 52, 82, 66);
    carveRect(terrain, 28, 24, 74, 46);
    carveRect(terrain, 28, 19, 29, 23);
    carveRect(terrain, 50, 19, 51, 23);
    carveRect(terrain, 72, 19, 73, 23);
    carveRect(terrain, 28, 47, 29, 51);
    carveRect(terrain, 50, 47, 51, 51);
    carveRect(terrain, 72, 47, 73, 51);
    carveRect(terrain, 2, 15, 5, 25);
    carveRect(terrain, 2, 45, 5, 55);
    carveRect(terrain, 98, 15, 101, 25);
    carveRect(terrain, 98, 45, 101, 55);
    carveRect(terrain, 34, 1, 42, 3);
    carveRect(terrain, 60, 1, 68, 3);
    carveRect(terrain, 34, 67, 42, 69);
    carveRect(terrain, 60, 67, 68, 69);
    carveRect(terrain, 21, 30, 27, 40);
    carveRect(terrain, 75, 30, 82, 40);
    carveRect(terrain, 16, 33, 20, 36);
    carveRect(terrain, 83, 33, 87, 36);
    carveRect(terrain, 24, 20, 27, 23);
    carveRect(terrain, 74, 20, 78, 23);
    addTwoTileDoor(doors, 28, 22, true, 1);
    addTwoTileDoor(doors, 50, 22, true, 2);
    addTwoTileDoor(doors, 72, 22, true, 1);
    addTwoTileDoor(doors, 28, 47, true, 2);
    addTwoTileDoor(doors, 50, 47, true, 1);
    addTwoTileDoor(doors, 72, 47, true, 2);
    addTwoTileDoor(doors, 20, 10, false, 2);
    addTwoTileDoor(doors, 83, 10, false, 2);
    addTwoTileDoor(doors, 20, 58, false, 1);
    addTwoTileDoor(doors, 83, 58, false, 1);
    markers[6][8] = 1;
    markers[62][90] = 2;
    markers[34][51] = 3;
    markers[60][50] = 3;
    markers[12][30] = 4;
    markers[58][70] = 4;
    markers[10][40] = 5;
    markers[60][40] = 5;
    markers[34][34] = 5;
    markers[34][70] = 5;
    return { id: 'lv9_docking_ring', terrain, doors, markers, width: WIDTH, height: HEIGHT };
}

const levels = [buildLevel1(), buildLevel2(), buildLevel5(), buildLevel6(), buildLevel9()];

// ---- Audit functions ----

function floodFill(terrain, doors, startX, startY, treatDoorsAsFloor = true) {
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    visited.add(`${startX},${startY}`);
    while (queue.length > 0) {
        const { x, y } = queue.shift();
        const neighbors = [
            { x: x + 1, y }, { x: x - 1, y },
            { x, y: y + 1 }, { x, y: y - 1 },
        ];
        for (const n of neighbors) {
            if (n.x < 0 || n.y < 0 || n.x >= WIDTH || n.y >= HEIGHT) continue;
            const key = `${n.x},${n.y}`;
            if (visited.has(key)) continue;
            const t = terrain[n.y][n.x];
            if (t === 0) {
                visited.add(key);
                queue.push(n);
            } else if (treatDoorsAsFloor && doors[n.y] && doors[n.y][n.x] > 0) {
                // Door tiles on wall terrain are passable
                visited.add(key);
                queue.push(n);
            }
        }
    }
    return visited;
}

function findMarker(markers, value) {
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (markers[y][x] === value) return { x, y };
        }
    }
    return null;
}

function findAllMarkers(markers, value) {
    const results = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (markers[y][x] === value) results.push({ x, y });
        }
    }
    return results;
}

function getDoorTiles(doors) {
    const result = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (doors[y][x] > 0) result.push({ x, y, value: doors[y][x] });
        }
    }
    return result;
}

function checkCorridorWidth(terrain) {
    const narrow = [];
    // Check for 1-tile-wide horizontal passages
    for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (terrain[y][x] !== 0) continue;
            // If above and below are walls, this is a 1-tile-high passage
            if (terrain[y - 1][x] !== 0 && terrain[y + 1][x] !== 0) {
                // Check it's part of a run (not just an isolated tile)
                let isRun = false;
                if (x > 0 && terrain[y][x - 1] === 0 && terrain[y - 1][x - 1] !== 0 && terrain[y + 1][x - 1] !== 0) isRun = true;
                if (x < WIDTH - 1 && terrain[y][x + 1] === 0 && terrain[y - 1][x + 1] !== 0 && terrain[y + 1][x + 1] !== 0) isRun = true;
                if (isRun) narrow.push({ x, y, dir: 'horizontal_1wide' });
            }
        }
    }
    // Check for 1-tile-wide vertical passages
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 1; x < WIDTH - 1; x++) {
            if (terrain[y][x] !== 0) continue;
            if (terrain[y][x - 1] !== 0 && terrain[y][x + 1] !== 0) {
                let isRun = false;
                if (y > 0 && terrain[y - 1][x] === 0 && terrain[y - 1][x - 1] !== 0 && terrain[y - 1][x + 1] !== 0) isRun = true;
                if (y < HEIGHT - 1 && terrain[y + 1][x] === 0 && terrain[y + 1][x - 1] !== 0 && terrain[y + 1][x + 1] !== 0) isRun = true;
                if (isRun) narrow.push({ x, y, dir: 'vertical_1wide' });
            }
        }
    }
    return narrow;
}

function checkDoorsOnFloor(terrain, doors) {
    const issues = [];
    const doorTiles = getDoorTiles(doors);
    for (const dt of doorTiles) {
        if (terrain[dt.y][dt.x] === 0) {
            issues.push({ ...dt, problem: 'door_on_floor' });
        }
    }
    return issues;
}

function checkDoorsOnWall(terrain, doors) {
    // Doors should be inset in wall tiles (terrain=1) forming a passage.
    // Or they can be on floor tiles in corridor mouths. Both are valid.
    // The real issue is doors that are isolated walls with no floor on either side.
    const issues = [];
    const doorTiles = getDoorTiles(doors);
    for (const dt of doorTiles) {
        // Check if door has at least one floor neighbor
        let hasFloorNeighbor = false;
        const neighbors = [
            { x: dt.x + 1, y: dt.y }, { x: dt.x - 1, y: dt.y },
            { x: dt.x, y: dt.y + 1 }, { x: dt.x, y: dt.y - 1 },
        ];
        for (const n of neighbors) {
            if (n.x >= 0 && n.y >= 0 && n.x < WIDTH && n.y < HEIGHT) {
                if (terrain[n.y][n.x] === 0) hasFloorNeighbor = true;
            }
        }
        if (!hasFloorNeighbor) {
            issues.push({ ...dt, problem: 'door_no_adjacent_floor' });
        }
    }
    return issues;
}

function checkMarkersOnWalkable(terrain, markers) {
    const issues = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const m = markers[y][x];
            if (m === 0) continue;
            if (terrain[y][x] !== 0) {
                issues.push({ x, y, marker: m, problem: 'marker_on_wall' });
            }
        }
    }
    return issues;
}

function countFloorTiles(terrain) {
    let count = 0;
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (terrain[y][x] === 0) count++;
        }
    }
    return count;
}

function checkDisconnectedRegions(terrain, doors) {
    // Find all floor tiles, flood fill from first one, see if any are unreachable
    const allFloor = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (terrain[y][x] === 0) allFloor.push({ x, y });
        }
    }
    if (allFloor.length === 0) return { regionCount: 0, unreachable: [] };
    
    const reachable = floodFill(terrain, doors, allFloor[0].x, allFloor[0].y, true);
    const unreachable = allFloor.filter(t => !reachable.has(`${t.x},${t.y}`));
    
    // Count distinct unreachable regions
    const unreachableSet = new Set(unreachable.map(t => `${t.x},${t.y}`));
    let regionCount = 1; // main region
    const visited = new Set();
    for (const t of unreachable) {
        const key = `${t.x},${t.y}`;
        if (visited.has(key)) continue;
        regionCount++;
        const q = [t];
        visited.add(key);
        while (q.length > 0) {
            const cur = q.shift();
            for (const n of [{ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 }]) {
                const nk = `${n.x},${n.y}`;
                if (visited.has(nk)) continue;
                if (unreachableSet.has(nk)) {
                    visited.add(nk);
                    q.push(n);
                }
            }
        }
    }
    
    return { regionCount, unreachable };
}

function checkSpawnExtractionReachability(terrain, doors, markers) {
    const spawn = findMarker(markers, 1);
    const extract = findMarker(markers, 2);
    if (!spawn) return { error: 'NO SPAWN MARKER' };
    if (!extract) return { error: 'NO EXTRACTION MARKER' };
    
    const reachable = floodFill(terrain, doors, spawn.x, spawn.y, true);
    const extractReachable = reachable.has(`${extract.x},${extract.y}`);
    
    // Also check without doors (doors might be welded/locked)
    const reachableNoDoors = floodFill(terrain, doors, spawn.x, spawn.y, false);
    const extractReachableNoDoors = reachableNoDoors.has(`${extract.x},${extract.y}`);
    
    return {
        spawn,
        extract,
        reachableWithDoors: extractReachable,
        reachableWithoutDoors: extractReachableNoDoors,
        reachableTileCount: reachable.size,
    };
}

function checkDoorAnchoringIssues(terrain, doors) {
    // For each door group, check if both sides have reachable floor
    const doorTiles = getDoorTiles(doors);
    const issues = [];
    
    // Group door tiles by adjacency
    const visited = new Set();
    const groups = [];
    for (const dt of doorTiles) {
        const key = `${dt.x},${dt.y}`;
        if (visited.has(key)) continue;
        const group = [dt];
        visited.add(key);
        // BFS to find connected door tiles
        const q = [dt];
        while (q.length > 0) {
            const cur = q.shift();
            for (const n of [{ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 }]) {
                const nk = `${n.x},${n.y}`;
                if (visited.has(nk)) continue;
                if (n.x >= 0 && n.y >= 0 && n.x < WIDTH && n.y < HEIGHT && doors[n.y][n.x] > 0) {
                    visited.add(nk);
                    group.push({ x: n.x, y: n.y, value: doors[n.y][n.x] });
                    q.push(n);
                }
            }
        }
        groups.push(group);
    }
    
    for (const group of groups) {
        if (group.length !== 2) {
            issues.push({ tiles: group, problem: `door_group_${group.length}_tiles (expected 2)` });
            continue;
        }
        const [a, b] = group;
        const isVertical = a.x === b.x;
        const isHorizontal = a.y === b.y;
        if (!isVertical && !isHorizontal) {
            issues.push({ tiles: group, problem: 'door_tiles_not_aligned' });
            continue;
        }
        
        // Check floor access on both sides
        let sideAFloor = 0, sideBFloor = 0;
        if (isVertical) {
            // Check left and right
            for (const t of group) {
                if (t.x > 0 && terrain[t.y][t.x - 1] === 0) sideAFloor++;
                if (t.x < WIDTH - 1 && terrain[t.y][t.x + 1] === 0) sideBFloor++;
            }
        } else {
            // Check above and below
            for (const t of group) {
                if (t.y > 0 && terrain[t.y - 1][t.x] === 0) sideAFloor++;
                if (t.y < HEIGHT - 1 && terrain[t.y + 1][t.x] === 0) sideBFloor++;
            }
        }
        if (sideAFloor === 0 || sideBFloor === 0) {
            issues.push({
                tiles: group,
                problem: `door_one_side_blocked (sideA=${sideAFloor}, sideB=${sideBFloor})`,
                orientation: isVertical ? 'vertical' : 'horizontal',
            });
        }
    }
    return issues;
}

// ---- Mission data checks ----
const MISSIONS = [
    { id: 'm1', tilemapId: 'lv1_colony_hub', requiredCards: 1, requiredTerminals: 0, enemyBudget: 24 },
    { id: 'm2', tilemapId: 'lv2_reactor_spine', requiredCards: 1, requiredTerminals: 1, enemyBudget: 32 },
    { id: 'm3', tilemapId: 'lv5_queen_cathedral', requiredCards: 1, requiredTerminals: 1, enemyBudget: 40 },
    { id: 'm4', tilemapId: 'lv6_hydroponics_array', requiredCards: 2, requiredTerminals: 1, enemyBudget: 46 },
    { id: 'm5', tilemapId: 'lv9_docking_ring', requiredCards: 2, requiredTerminals: 2, enemyBudget: 56 },
];

function checkMissionObjectives(mission, level) {
    const issues = [];
    const cardTiles = findAllMarkers(level.markers, 3); // marker 3 = card/terminal
    const terminalTiles = findAllMarkers(level.markers, 4); // marker 4 = card target
    
    // Actually check: marker 3 maps to terminalTargets (value 3) and marker 4 maps to cardTargets (value 4) in MissionFlow
    // Wait - MissionFlow uses marker 4 for cardTargets and marker 3 for terminalTargets
    // Let me re-read...
    // From MissionFlow: this.cardTargets = collectMarkerTiles(tilemap?.markers, 4);  // marker 4 = cards
    //                   this.terminalTargets = collectMarkerTiles(tilemap?.markers, 3); // marker 3 = terminals
    
    // So marker 3 = terminal, marker 4 = card
    const terminalCount = cardTiles.length; // marker 3 = terminals
    const cardCount = terminalTiles.length; // marker 4 = cards
    
    if (cardCount < mission.requiredCards) {
        issues.push(`Need ${mission.requiredCards} card markers (value 4) but map has ${cardCount}. MissionFlow will inject fallback locations.`);
    }
    if (terminalCount < mission.requiredTerminals) {
        issues.push(`Need ${mission.requiredTerminals} terminal markers (value 3) but map has ${terminalCount}. MissionFlow will inject fallback locations.`);
    }
    
    // Check alien spawn markers (5 or 6)
    const alienSpawns = findAllMarkers(level.markers, 5).concat(findAllMarkers(level.markers, 6));
    if (alienSpawns.length === 0) {
        issues.push('No alien spawn markers (5 or 6). Will fallback to all walkable tiles.');
    }
    
    return { cardCount, terminalCount, alienSpawnCount: alienSpawns.length, issues };
}

// ---- AutoTile checks ----
function checkAutoTile(terrain) {
    // Verify wall bitmask consistency
    const issues = [];
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (terrain[y][x] !== 1) continue;
            // Check for isolated single-tile walls (no adjacent walls)
            let adjWalls = 0;
            if (y > 0 && terrain[y-1][x] === 1) adjWalls++;
            if (y < HEIGHT-1 && terrain[y+1][x] === 1) adjWalls++;
            if (x > 0 && terrain[y][x-1] === 1) adjWalls++;
            if (x < WIDTH-1 && terrain[y][x+1] === 1) adjWalls++;
            
            // Single-tile wall pillars get bitmask 0 (isolated), which is valid but looks odd
            // Only flag if they're in the interior (not border)
            if (adjWalls === 0 && x > 0 && y > 0 && x < WIDTH-1 && y < HEIGHT-1) {
                issues.push({ x, y, problem: 'isolated_wall_pillar' });
            }
        }
    }
    return issues;
}

// ---- Run audit ----
console.log('='.repeat(80));
console.log('MAP SYSTEM AUDIT');
console.log('='.repeat(80));

let totalBugs = 0;
let totalWarnings = 0;

for (const level of levels) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Level: ${level.id}`);
    console.log(`${'─'.repeat(60)}`);
    
    const floorCount = countFloorTiles(level.terrain);
    console.log(`  Floor tiles: ${floorCount}`);
    
    // 1. Check connectivity
    const regions = checkDisconnectedRegions(level.terrain, level.doors);
    if (regions.unreachable.length > 0) {
        console.log(`  🔴 BUG: ${regions.unreachable.length} unreachable floor tiles in ${regions.regionCount} regions`);
        // Show first few
        for (const t of regions.unreachable.slice(0, 5)) {
            console.log(`      unreachable at (${t.x}, ${t.y})`);
        }
        if (regions.unreachable.length > 5) console.log(`      ... and ${regions.unreachable.length - 5} more`);
        totalBugs++;
    } else {
        console.log(`  ✅ All floor tiles connected (${regions.regionCount} region)`);
    }
    
    // 2. Spawn-extraction reachability
    const reach = checkSpawnExtractionReachability(level.terrain, level.doors, level.markers);
    if (reach.error) {
        console.log(`  🔴 BUG: ${reach.error}`);
        totalBugs++;
    } else {
        console.log(`  Spawn: (${reach.spawn.x}, ${reach.spawn.y}), Extract: (${reach.extract.x}, ${reach.extract.y})`);
        if (!reach.reachableWithDoors) {
            console.log(`  🔴 BUG: Extraction NOT reachable from spawn (even through doors!)`);
            totalBugs++;
        } else {
            console.log(`  ✅ Extraction reachable from spawn (through doors)`);
        }
        if (!reach.reachableWithoutDoors) {
            console.log(`  ⚠️  Extraction NOT reachable without opening doors (expected for gated maps)`);
        }
        console.log(`  Reachable tiles from spawn: ${reach.reachableTileCount}/${floorCount}`);
    }
    
    // 3. Door placement checks
    const doorOnFloor = checkDoorsOnFloor(level.terrain, level.doors);
    if (doorOnFloor.length > 0) {
        console.log(`  ⚠️  ${doorOnFloor.length} door tiles on floor terrain (not necessarily a bug - corridor mouth doors)`);
        for (const d of doorOnFloor) {
            console.log(`      door value ${d.value} at (${d.x}, ${d.y}) on floor`);
        }
        totalWarnings += doorOnFloor.length;
    } else {
        console.log(`  ✅ All door tiles on wall terrain`);
    }
    
    const doorNoFloor = checkDoorsOnWall(level.terrain, level.doors);
    if (doorNoFloor.length > 0) {
        console.log(`  🔴 BUG: ${doorNoFloor.length} door tiles with NO adjacent floor`);
        for (const d of doorNoFloor) {
            console.log(`      door value ${d.value} at (${d.x}, ${d.y}) - no floor neighbor`);
        }
        totalBugs += doorNoFloor.length;
    }
    
    const doorAnchor = checkDoorAnchoringIssues(level.terrain, level.doors);
    if (doorAnchor.length > 0) {
        console.log(`  🔴 BUG: ${doorAnchor.length} door anchoring issues:`);
        for (const d of doorAnchor) {
            const pos = d.tiles.map(t => `(${t.x},${t.y})`).join(', ');
            console.log(`      ${d.problem} at ${pos}`);
        }
        totalBugs += doorAnchor.length;
    } else {
        console.log(`  ✅ All doors properly anchored with floor on both sides`);
    }
    
    // 4. Marker placement
    const markerIssues = checkMarkersOnWalkable(level.terrain, level.markers);
    if (markerIssues.length > 0) {
        console.log(`  🔴 BUG: ${markerIssues.length} markers on wall tiles:`);
        for (const m of markerIssues) {
            console.log(`      marker ${m.marker} at (${m.x}, ${m.y}) on wall`);
        }
        totalBugs += markerIssues.length;
    } else {
        console.log(`  ✅ All markers on walkable tiles`);
    }
    
    // 5. Corridor width
    const narrow = checkCorridorWidth(level.terrain);
    if (narrow.length > 0) {
        // Group by contiguous runs for readability
        const uniqueLocations = new Map();
        for (const n of narrow) {
            const key = n.dir === 'horizontal_1wide' ? `hrow_${n.y}` : `vcol_${n.x}`;
            if (!uniqueLocations.has(key)) uniqueLocations.set(key, []);
            uniqueLocations.get(key).push(n);
        }
        console.log(`  ⚠️  ${uniqueLocations.size} narrow (1-tile-wide) passages found:`);
        for (const [key, tiles] of uniqueLocations) {
            const range = tiles.length > 1
                ? `(${tiles[0].x},${tiles[0].y}) to (${tiles[tiles.length-1].x},${tiles[tiles.length-1].y})`
                : `(${tiles[0].x},${tiles[0].y})`;
            console.log(`      ${key}: ${tiles.length} tiles ${range}`);
        }
        totalWarnings += uniqueLocations.size;
    } else {
        console.log(`  ✅ No single-tile-wide corridors`);
    }
    
    // 6. AutoTile
    const autoIssues = checkAutoTile(level.terrain);
    if (autoIssues.length > 0) {
        console.log(`  ⚠️  ${autoIssues.length} isolated wall pillars (autotile bitmask 0)`);
        totalWarnings += autoIssues.length;
    } else {
        console.log(`  ✅ No isolated wall pillars`);
    }
    
    // 7. Mission objective check
    const mission = MISSIONS.find(m => m.tilemapId === level.id);
    if (mission) {
        const objCheck = checkMissionObjectives(mission, level);
        console.log(`  Mission ${mission.id}: needs ${mission.requiredCards} cards, ${mission.requiredTerminals} terminals`);
        console.log(`    Map has: ${objCheck.cardCount} card markers (4), ${objCheck.terminalCount} terminal markers (3), ${objCheck.alienSpawnCount} alien spawn markers`);
        for (const issue of objCheck.issues) {
            console.log(`    ⚠️  ${issue}`);
            totalWarnings++;
        }
    }
    
    // 8. Door count summary
    const doorTiles = getDoorTiles(level.doors);
    console.log(`  Door tiles: ${doorTiles.length} (${doorTiles.length / 2} doors)`);
}

console.log(`\n${'='.repeat(80)}`);
console.log(`SUMMARY: ${totalBugs} bugs, ${totalWarnings} warnings`);
console.log('='.repeat(80));
