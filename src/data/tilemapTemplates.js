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

// Doors are placed on wall tiles (or first/last corridor tiles) so they sit
// inside corridor paths and do not intrude into open room interiors.
function addTwoTileDoor(doors, x, y, horizontal, value) {
    doors[y][x] = value;
    if (horizontal) doors[y][x + 1] = value;
    else doors[y + 1][x] = value;
}

function buildLevel1() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // M1 test layout: a readable three-lane cargo concourse with a strong
    // west->east critical path, multiple rotations between lanes, and very few
    // dead ends. This is intentionally easier to read and validate than the
    // old serpentine hallway.
    carveRect(terrain, 6, 24, 22, 44);    // west staging / spawn bay
    carveRect(terrain, 82, 24, 100, 44);  // east freight elevator / extraction
    carveRect(terrain, 32, 6, 54, 22);    // north cargo gallery
    carveRect(terrain, 42, 26, 62, 42);   // central command / card room
    carveRect(terrain, 28, 46, 54, 64);   // south storage deck
    carveRect(terrain, 64, 10, 80, 24);   // northeast loading pocket
    carveRect(terrain, 64, 46, 80, 62);   // southeast service deck

    // Three primary lanes.
    carveRect(terrain, 22, 14, 32, 15);   // west -> north lane
    carveRect(terrain, 22, 34, 42, 35);   // west -> central lane
    carveRect(terrain, 22, 54, 28, 55);   // west -> south lane
    carveRect(terrain, 54, 14, 64, 15);   // north -> northeast
    carveRect(terrain, 62, 34, 82, 35);   // central -> extraction
    carveRect(terrain, 54, 54, 64, 55);   // south -> southeast
    carveRect(terrain, 80, 18, 82, 19);   // northeast -> extraction upper gate
    carveRect(terrain, 80, 50, 82, 51);   // southeast -> extraction lower gate

    // Rotations between the lanes.
    carveRect(terrain, 42, 22, 43, 26);   // north -> central
    carveRect(terrain, 46, 42, 47, 46);   // central -> south
    carveRect(terrain, 68, 24, 69, 34);   // northeast -> central
    carveRect(terrain, 68, 35, 69, 46);   // central -> southeast
    carveRect(terrain, 30, 15, 31, 34);   // west-side north rotation
    carveRect(terrain, 26, 35, 27, 54);   // west-side south rotation

    // Small tactical pockets so pressure waves can flank without becoming a maze.
    carveRect(terrain, 24, 10, 28, 18);
    carveRect(terrain, 56, 28, 60, 32);
    carveRect(terrain, 56, 38, 60, 42);
    carveRect(terrain, 58, 50, 62, 58);

    // Primary choke doors.
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

    markers[34][12] = 1;   // spawn
    markers[34][94] = 2;   // extraction
    markers[34][52] = 4;   // access card (marker 4 = card for MissionFlow)
    markers[14][42] = 6;
    markers[34][32] = 6;
    markers[34][72] = 6;
    markers[54][44] = 6;
    markers[54][72] = 6;

    return {
        id: 'lv1_colony_hub',
        name: 'Level 1: Cargo Concourse',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
        terrainTextures: [],
        props: [],
        lights: [],
        floorTextureKey: 'tile_floor_grill_import',
        wallTextureKey: 'tile_wall_corridor_import',
        spawnPoints: [],
    };
}

function buildLevel2() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // Central hub + 4 wings + top/bottom loop connectors
    carveRect(terrain, 42, 28, 62, 42); // central hub
    carveRect(terrain, 6, 8, 27, 24);   // west command
    carveRect(terrain, 40, 6, 66, 20);  // north reactor
    carveRect(terrain, 76, 8, 98, 24);  // east labs
    carveRect(terrain, 8, 44, 30, 64);  // southwest storage
    carveRect(terrain, 72, 44, 98, 66); // southeast hangar

    // Primary connectors to hub
    carveRect(terrain, 28, 34, 41, 35); // west -> hub
    carveRect(terrain, 63, 34, 75, 35); // hub -> east
    carveRect(terrain, 51, 21, 52, 27); // north -> hub
    carveRect(terrain, 51, 43, 52, 49); // hub -> south

    // Secondary loops and side trunks
    carveRect(terrain, 28, 14, 39, 15); // west -> north loop
    carveRect(terrain, 67, 14, 75, 15); // north -> east loop
    carveRect(terrain, 31, 54, 43, 55); // southwest -> south spine
    carveRect(terrain, 63, 54, 71, 55); // south spine -> southeast
    carveRect(terrain, 18, 25, 19, 43); // west vertical trunk
    carveRect(terrain, 85, 25, 86, 43); // east vertical trunk

    // Room extensions
    carveRect(terrain, 28, 18, 32, 24);   // west command south annex
    carveRect(terrain, 56, 2, 60, 5);     // north reactor observation loft
    carveRect(terrain, 55, 5, 57, 5);     // loft-to-reactor connector
    carveRect(terrain, 99, 12, 101, 18);  // east labs equipment niche
    carveRect(terrain, 31, 52, 36, 58);   // SW storage annex
    carveRect(terrain, 72, 67, 82, 68);   // SE hangar loading dock

    // Corridor alcoves
    carveRect(terrain, 34, 31, 36, 33);   // nook north of west connector
    carveRect(terrain, 68, 31, 70, 33);   // nook north of east connector
    carveRect(terrain, 48, 44, 50, 47);   // alcove south of hub

    // Dead-end room off west trunk
    carveRect(terrain, 14, 30, 17, 36);

    // Hub doors — placed at last/first corridor tile (corridor meets hub without wall gap)
    addTwoTileDoor(doors, 41, 34, false, 1); // west corridor last tile
    addTwoTileDoor(doors, 63, 34, false, 1); // east corridor first tile
    addTwoTileDoor(doors, 51, 27, true, 2);  // north corridor last tile
    addTwoTileDoor(doors, 51, 43, true, 1);  // south corridor first tile

    // Loop doors — moved to corridor-mouth or wall tiles to avoid room intrusion
    addTwoTileDoor(doors, 28, 14, false, 1); // west->north loop first tile
    addTwoTileDoor(doors, 39, 14, false, 2); // west->north loop last tile (was 40 = inside reactor)
    addTwoTileDoor(doors, 67, 14, false, 1); // north->east loop first tile (was 66 = inside reactor)
    addTwoTileDoor(doors, 75, 14, false, 2); // north->east loop last tile
    addTwoTileDoor(doors, 31, 54, false, 1); // SW->south first tile (was 30 = inside storage)
    // Removed blocked-side dead-end door at x=43,y=54 (one side had zero reachable floor).

    // South spine -> SE: wall tiles at x=62 and x=71
    // Removed blocked-side dead-end door at x=62,y=54 (one side had zero reachable floor).
    addTwoTileDoor(doors, 71, 54, false, 2); // last tile of south->SE corridor

    // Vertical trunk doors — moved inside corridor (trunk starts y=25 from rooms at y=24/y=44)
    addTwoTileDoor(doors, 18, 25, true, 2);  // west trunk first tile (was 24 = inside room)
    addTwoTileDoor(doors, 18, 43, true, 1);  // west trunk last tile (was 44 = inside room)
    addTwoTileDoor(doors, 85, 25, true, 2);  // east trunk first tile (was 24 = inside room)
    addTwoTileDoor(doors, 85, 43, true, 1);  // east trunk last tile (was 44 = inside room)

    markers[16][14] = 1; // spawn
    markers[60][92] = 2; // extraction
    markers[12][54] = 3; // terminal objective
    markers[16][84] = 4; // optional high-risk branch
    markers[10][50] = 5; // alien spawn — north reactor
    markers[34][50] = 5; // alien spawn — central hub
    markers[56][84] = 5; // alien spawn — SE hangar
    markers[56][20] = 5; // alien spawn — SW storage

    return {
        id: 'lv2_reactor_spine',
        name: 'Level 2: Reactor Spine',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
        terrainTextures: [],
        props: [],
        lights: [],
        floorTextureKey: 'tile_floor_grill_import',
        wallTextureKey: 'tile_wall_corridor_import',
        spawnPoints: [
            { tileX: 10, tileY: 50, count: 4 },
            { tileX: 34, tileY: 50, count: 4 },
            { tileX: 56, tileY: 84, count: 4 },
            { tileX: 56, tileY: 20, count: 4 },
        ],
    };
}

function buildLevel5() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // Queen cathedral with branch loops and lockdown chokepoints
    carveRect(terrain, 38, 26, 66, 44);  // queen nave
    carveRect(terrain, 10, 6, 33, 22);   // northwest ruins
    carveRect(terrain, 70, 6, 97, 22);   // northeast foundry
    carveRect(terrain, 6, 30, 27, 48);   // west flank hall
    carveRect(terrain, 78, 30, 101, 48); // east flank hall
    carveRect(terrain, 8, 52, 33, 66);   // southwest brood trench
    carveRect(terrain, 68, 52, 99, 66);  // southeast brood trench

    // Core approach trunks
    carveRect(terrain, 34, 34, 37, 35); // west hall -> nave
    carveRect(terrain, 67, 34, 77, 35); // nave -> east hall
    carveRect(terrain, 51, 23, 52, 25); // north entry -> nave
    carveRect(terrain, 51, 45, 52, 51); // nave -> south entry

    // Loopback corridors
    carveRect(terrain, 34, 14, 39, 15); // NW -> north trunk
    carveRect(terrain, 64, 14, 69, 15); // north trunk -> NE
    carveRect(terrain, 34, 58, 39, 59); // SW -> south trunk
    carveRect(terrain, 62, 58, 67, 59); // south trunk -> SE
    carveRect(terrain, 24, 23, 25, 51); // west long flank
    carveRect(terrain, 76, 23, 77, 51); // east long flank

    // Nave side chapels
    carveRect(terrain, 38, 21, 42, 25);   // NW chapel
    carveRect(terrain, 62, 21, 66, 25);   // NE chapel
    carveRect(terrain, 38, 45, 42, 49);   // SW chapel
    carveRect(terrain, 62, 45, 66, 49);   // SE chapel

    // Room extensions
    carveRect(terrain, 3, 12, 9, 18);     // NW ruins west wing
    carveRect(terrain, 98, 12, 100, 18);  // NE foundry east storage
    carveRect(terrain, 3, 54, 7, 60);     // SW brood antechamber
    carveRect(terrain, 100, 54, 102, 60); // SE brood alcove

    // Dead-end rooms off loopback trunks
    carveRect(terrain, 36, 10, 39, 13);   // room above NW trunk
    carveRect(terrain, 64, 10, 67, 13);   // room above NE trunk

    // Flank corridor alcoves
    carveRect(terrain, 20, 32, 23, 36);   // west flank nook
    carveRect(terrain, 78, 32, 81, 36);   // east flank nook

    // Additional connectors to reduce single-lane collapse around the nave.
    carveRect(terrain, 28, 38, 37, 39);   // west service bypass into nave-side approach
    carveRect(terrain, 30, 40, 33, 42);   // west bypass equipment pocket
    carveRect(terrain, 67, 30, 75, 31);   // east upper bypass into foundry approach

    // Core doors — placed at corridor tiles not room tiles
    // Removed blocked-side dead-end door at x=33,y=34 (one side had zero reachable floor).
    addTwoTileDoor(doors, 67, 34, false, 2); // east corridor first tile
    addTwoTileDoor(doors, 51, 25, true, 4);  // north corridor last tile (welded — queen lockdown)
    addTwoTileDoor(doors, 51, 45, true, 3);  // south corridor first tile (locked)

    // Loop/wing doors — moved to corridor mouths (not room interiors)
    addTwoTileDoor(doors, 34, 14, false, 1); // NW->north first tile (was 33 = inside ruins)
    // Removed blocked-side dead-end doors at x=40,y=14 and x=63,y=14.
    addTwoTileDoor(doors, 69, 14, false, 2); // north->NE last tile
    addTwoTileDoor(doors, 34, 58, false, 1); // SW->south first tile (was 33 = inside brood)
    // Removed blocked-side dead-end doors at x=40,y=58 and x=61,y=58.
    addTwoTileDoor(doors, 67, 58, false, 2); // south->SE last tile

    // Long flank corridor doors — moved inside corridors (corridors start y=23, rooms end y=22/52)
    addTwoTileDoor(doors, 24, 23, true, 3);  // west flank first tile (was 22 = inside ruins)
    addTwoTileDoor(doors, 24, 51, true, 2);  // west flank last tile (was 52 = inside brood)
    addTwoTileDoor(doors, 76, 23, true, 3);  // east flank first tile (was 22 = inside foundry)
    addTwoTileDoor(doors, 76, 51, true, 2);  // east flank last tile (was 52 = inside brood)

    markers[12][14] = 1;  // spawn
    markers[60][96] = 2;  // extraction
    markers[34][22] = 3;  // side objective (was 24,18 — on wall; moved into west flank hall)
    markers[34][52] = 4;  // queen spawn marker
    markers[16][80] = 5;  // ambient steam zone (was 18,58 — on wall; moved into NE foundry)
    markers[56][88] = 5;  // ambient steam zone
    markers[54][30] = 5;  // cathedral haze zone (was 54,34 — on wall; moved into SW brood trench)

    return {
        id: 'lv5_queen_cathedral',
        name: 'Level 3: Queen Cathedral',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
        terrainTextures: [],
        props: [],
        lights: [],
        floorTextureKey: 'tile_floor_grill_import',
        wallTextureKey: 'tile_wall_corridor_import',
        spawnPoints: [
            { tileX: 16, tileY: 80, count: 4 },
            { tileX: 56, tileY: 88, count: 4 },
            { tileX: 54, tileY: 30, count: 4 },
        ],
    };
}

function buildLevel6() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // Hydroponics array: long central greenhouse corridor flanked by grow-bays
    carveRect(terrain, 2, 4, 20, 22);    // west entry bay
    carveRect(terrain, 42, 4, 60, 22);   // north grow-bay A
    carveRect(terrain, 42, 48, 60, 66);  // south grow-bay B
    carveRect(terrain, 82, 4, 100, 22);  // east processing bay
    carveRect(terrain, 82, 48, 100, 66); // east storage bay
    carveRect(terrain, 2, 48, 20, 66);   // west refuge bay

    // Central spine corridors
    carveRect(terrain, 21, 12, 41, 13); // C1 west->north
    carveRect(terrain, 61, 12, 81, 13); // C2 north->east
    carveRect(terrain, 21, 57, 41, 58); // C3 west->south
    carveRect(terrain, 61, 57, 81, 58); // C4 south->east
    carveRect(terrain, 11, 23, 12, 47); // C5 west vert
    carveRect(terrain, 51, 23, 52, 47); // C6 centre vert
    carveRect(terrain, 91, 23, 92, 47); // C7 east vert

    // Vestibule areas — wider approaches between bays and corridors
    carveRect(terrain, 21, 4, 28, 11);    // north vestibule west
    carveRect(terrain, 74, 4, 81, 11);    // north vestibule east
    carveRect(terrain, 21, 58, 28, 66);   // south vestibule west
    carveRect(terrain, 74, 58, 81, 66);   // south vestibule east

    // Corridor alcoves
    carveRect(terrain, 30, 9, 32, 11);    // alcove north of C1
    carveRect(terrain, 70, 9, 72, 11);    // alcove north of C2
    carveRect(terrain, 30, 59, 32, 61);   // alcove south of C3
    carveRect(terrain, 70, 59, 72, 61);   // alcove south of C4

    // Side rooms off vertical corridors
    carveRect(terrain, 6, 32, 10, 36);    // room off C5
    carveRect(terrain, 46, 32, 50, 38);   // room off C6
    carveRect(terrain, 86, 32, 90, 36);   // room off C7

    // Cross-passages linking vertical corridors (connected through C6)
    carveRect(terrain, 13, 34, 50, 35);   // west cross-passage (C5 to C6)
    carveRect(terrain, 53, 34, 90, 35);   // east cross-passage (C6 to C7)

    // All horizontal corridor doors moved to corridor mouth tiles (rooms and corridors share
    // no wall gap, so doors sit at the first/last corridor tile rather than inside rooms)
    addTwoTileDoor(doors, 21, 12, false, 1); // C1 west end — first corridor tile
    addTwoTileDoor(doors, 41, 12, false, 2); // C1 east end — last corridor tile
    addTwoTileDoor(doors, 61, 12, false, 1); // C2 west end — first corridor tile
    addTwoTileDoor(doors, 81, 12, false, 2); // C2 east end — last corridor tile
    addTwoTileDoor(doors, 21, 57, false, 1); // C3 west end
    addTwoTileDoor(doors, 41, 57, false, 2); // C3 east end
    addTwoTileDoor(doors, 61, 57, false, 1); // C4 west end
    addTwoTileDoor(doors, 81, 57, false, 2); // C4 east end

    // Vertical corridor doors — moved to first corridor tile (corridors start y=23, rooms end y=22)
    addTwoTileDoor(doors, 11, 23, true, 1);  // C5 top — first corridor tile
    addTwoTileDoor(doors, 51, 23, true, 2);  // C6 top
    addTwoTileDoor(doors, 91, 23, true, 1);  // C7 top

    markers[5][3] = 1;    // spawn
    markers[62][97] = 2;  // extract
    markers[14][52] = 3;  // terminal objective
    markers[14][92] = 4;  // access card — east processing bay
    markers[58][8] = 4;   // access card — west refuge bay
    markers[34][30] = 5;  // alien spawn — west cross-passage
    markers[34][70] = 5;  // alien spawn — east cross-passage
    markers[12][70] = 5;  // alien spawn — C2 corridor
    markers[57][30] = 5;  // alien spawn — C3 corridor

    return {
        id: 'lv6_hydroponics_array',
        name: 'Level 4: Hydroponics Array',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
        terrainTextures: [],
        props: [],
        lights: [],
        floorTextureKey: 'tile_floor_grill_import',
        wallTextureKey: 'tile_wall_corridor_import',
        spawnPoints: [
            { tileX: 34, tileY: 30, count: 4 },
            { tileX: 34, tileY: 70, count: 4 },
            { tileX: 12, tileY: 70, count: 4 },
            { tileX: 57, tileY: 30, count: 4 },
        ],
    };
}

function buildLevel9() {
    const terrain = makeGrid(1);
    const doors = makeGrid(0);
    const markers = makeGrid(0);

    // Docking ring: ring shape with wall-gated column access.
    // Columns are intentionally separated from the ring spines by 1-tile wall gaps
    // so doors sit correctly in those walls rather than inside open floor space.
    carveRect(terrain, 6, 4, 19, 66);    // west access column  (ends at x=19; wall at x=20)
    carveRect(terrain, 84, 4, 97, 66);   // east access column  (starts at x=84; wall at x=83)
    carveRect(terrain, 21, 4, 82, 18);   // upper dock spine    (x=21..82)
    carveRect(terrain, 21, 52, 82, 66);  // lower dock spine    (x=21..82)
    carveRect(terrain, 28, 24, 74, 46);  // central airlock bay

    // Spoke corridors (connect upper/lower spine to airlock)
    carveRect(terrain, 28, 19, 29, 23);
    carveRect(terrain, 50, 19, 51, 23);
    carveRect(terrain, 72, 19, 73, 23);
    carveRect(terrain, 28, 47, 29, 51);
    carveRect(terrain, 50, 47, 51, 51);
    carveRect(terrain, 72, 47, 73, 51);

    // Column alcoves — side rooms off access columns
    carveRect(terrain, 2, 15, 5, 25);     // west column north nook
    carveRect(terrain, 2, 45, 5, 55);     // west column south nook
    carveRect(terrain, 98, 15, 101, 25);  // east column north nook
    carveRect(terrain, 98, 45, 101, 55);  // east column south nook

    // Spine extensions — bays extending from dock spines
    carveRect(terrain, 34, 1, 42, 3);     // upper spine north bay
    carveRect(terrain, 60, 1, 68, 3);     // upper spine north bay (mirror)
    carveRect(terrain, 34, 67, 42, 69);   // lower spine south bay
    carveRect(terrain, 60, 67, 68, 69);   // lower spine south bay (mirror)

    // Airlock approach chambers
    carveRect(terrain, 21, 30, 27, 40);   // west approach chamber
    carveRect(terrain, 75, 30, 82, 40);   // east approach chamber

    // Mid-transfer conduits from access columns into approach chambers.
    // These reduce reliance on top/bottom gates and keep both sides navigable under pressure.
    carveRect(terrain, 16, 33, 20, 36);   // west transfer vestibule (opens through x=20 wall)
    carveRect(terrain, 83, 33, 87, 36);   // east transfer vestibule (opens through x=83 wall)

    // Dead-end rooms near spokes
    carveRect(terrain, 24, 20, 27, 23);   // room near west upper spoke
    carveRect(terrain, 74, 20, 78, 23);   // room near east upper spoke

    // Spoke doors — y=22 is inside the spoke corridor (19..23); correct placement
    addTwoTileDoor(doors, 28, 22, true, 1);
    addTwoTileDoor(doors, 50, 22, true, 2);
    addTwoTileDoor(doors, 72, 22, true, 1);
    addTwoTileDoor(doors, 28, 47, true, 2);
    addTwoTileDoor(doors, 50, 47, true, 1);
    addTwoTileDoor(doors, 72, 47, true, 2);

    // Column-to-spine gates — x=20 and x=83 are wall tiles after the restructure above
    addTwoTileDoor(doors, 20, 10, false, 2); // west upper gate (wall tile x=20)
    addTwoTileDoor(doors, 83, 10, false, 2); // east upper gate (wall tile x=83; was 82=spine floor)
    addTwoTileDoor(doors, 20, 58, false, 1); // west lower gate
    addTwoTileDoor(doors, 83, 58, false, 1); // east lower gate

    markers[6][8] = 1;    // spawn
    markers[62][90] = 2;  // extract
    markers[34][51] = 3;  // terminal — central airlock bay
    markers[60][50] = 3;  // terminal — lower dock spine
    markers[12][30] = 4;  // access card — upper dock spine
    markers[58][70] = 4;  // access card — lower dock spine
    markers[10][40] = 5;  // alien spawn — upper spine
    markers[60][40] = 5;  // alien spawn — lower spine
    markers[34][34] = 5;  // alien spawn — airlock west
    markers[34][70] = 5;  // alien spawn — airlock east

    return {
        id: 'lv9_docking_ring',
        name: 'Level 5: Docking Ring',
        width: WIDTH,
        height: HEIGHT,
        terrain,
        doors,
        markers,
        terrainTextures: [],
        props: [],
        lights: [],
        floorTextureKey: 'tile_floor_grill_import',
        wallTextureKey: 'tile_wall_corridor_import',
        spawnPoints: [
            { tileX: 10, tileY: 40, count: 4 },
            { tileX: 60, tileY: 40, count: 4 },
            { tileX: 34, tileY: 34, count: 4 },
            { tileX: 34, tileY: 70, count: 4 },
        ],
    };
}

function buildCorridorTest() {
    // Simple long corridor for testing corridor tile textures.
    // Corridor is 8 tiles wide (2 wall + 4 floor + 2 wall) running north-south.
    const W = 30;
    const H = 40;
    const terrain = Array.from({ length: H }, () => Array(W).fill(1));
    const doors = Array.from({ length: H }, () => Array(W).fill(0));
    const markers = Array.from({ length: H }, () => Array(W).fill(0));
    const terrainTextures = Array.from({ length: H }, () => Array(W).fill(null));

    // Vertical corridor from row 2 to 37.
    // Wall tiles (terrain=1, blocking): columns 8-9 (left outer), 22-23 (right outer)
    // Wall texture overlay: columns 10-11 (left wall art), 20-21 (right wall art)
    //   — these are also terrain=1 (walls) so marines can't walk on them
    // Walkable floor: columns 12-19 (8 tiles wide)
    const FLOOR_LEFT = 12;
    const FLOOR_RIGHT = 19;
    const WALL_L_OUTER = 10;  // left wall outer texture
    const WALL_L_INNER = 11;  // left wall inner texture (hazard stripe)
    const WALL_R_INNER = 20;  // right wall inner texture (hazard stripe)
    const WALL_R_OUTER = 21;  // right wall outer texture
    const CY_START = 2;
    const CY_END = 37;

    // Carve only the walkable floor area
    for (let y = CY_START; y <= CY_END; y++) {
        for (let x = FLOOR_LEFT; x <= FLOOR_RIGHT; x++) {
            terrain[y][x] = 0; // floor — walkable
        }
        // Wall texture columns stay as terrain=1 (walls)
    }

    // Apply corridor textures
    for (let y = CY_START; y <= CY_END; y++) {
        // Right wall textures (on wall tiles)
        terrainTextures[y][WALL_R_OUTER] = 'corridor_wall_outer';
        terrainTextures[y][WALL_R_INNER] = 'corridor_wall_inner';
        // Left wall textures (flipped, on wall tiles)
        terrainTextures[y][WALL_L_OUTER] = 'corridor_wall_outer_flip';
        terrainTextures[y][WALL_L_INNER] = 'corridor_wall_inner_flip';
        // Floor tiles
        for (let x = FLOOR_LEFT; x <= FLOOR_RIGHT; x++) {
            terrainTextures[y][x] = ((x + y) % 2 === 0) ? 'corridor_floor' : 'corridor_floor_alt';
        }
    }

    // Spawn at bottom, extraction at top (center of corridor)
    const midX = Math.floor((FLOOR_LEFT + FLOOR_RIGHT) / 2);
    markers[CY_END - 2][midX] = 1; // spawn
    markers[CY_START + 2][midX] = 2; // extraction

    return {
        id: 'corridor_test',
        name: 'Corridor Test',
        width: W,
        height: H,
        terrain,
        doors,
        markers,
        terrainTextures,
        floorTextureKey: 'corridor_floor',
        spawnPoints: [],
    };
}

export const TILEMAP_TEMPLATES = Object.freeze([
    buildLevel1(),
    buildLevel2(),
    buildLevel5(),
    buildLevel6(),
    buildLevel9(),
    buildCorridorTest(),
]);
