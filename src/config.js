export const CONFIG = Object.freeze({
    // Display
    GAME_WIDTH: 1024,
    GAME_HEIGHT: 768,

    // Tile
    TILE_SIZE: 64,

    // Map dimensions (in tiles)
    MAP_WIDTH_TILES: 30,
    MAP_HEIGHT_TILES: 20,

    // Tile indices
    TILE_FLOOR: 0,
    TILE_WALL: 1,

    // Team Leader
    LEADER_SPEED: 180,
    LEADER_SIZE: 40,
    LEADER_COLOR: 0x3366ff,

    // Bullet / Firing
    BULLET_SPEED: 600,
    BULLET_SIZE: 6,
    BULLET_COLOR: 0xffff00,
    BULLET_LIFESPAN: 2000,
    FIRE_RATE: 150,
    BULLET_POOL_SIZE: 50,

    // Camera
    CAMERA_LERP: 0.1,
    CAMERA_DEADZONE_WIDTH: 50,
    CAMERA_DEADZONE_HEIGHT: 50,

    // Pathfinding
    DIAGONAL_COST: 1.414,
    CARDINAL_COST: 1.0,
    PATH_ARRIVAL_THRESHOLD: 4,

    // Placeholder tile colors
    FLOOR_COLOR: 0x333333,
    WALL_COLOR: 0x886644,

    // Door colors
    DOOR_COLOR_CLOSED: 0xcc4444,
    DOOR_COLOR_OPEN: 0x44aa44,
    DOOR_BORDER_CLOSED: 0x882222,
    DOOR_BORDER_OPEN: 0x228822,
    DOOR_COLOR_LOCKED: 0xccaa44,
    DOOR_BORDER_LOCKED: 0x886622,
    DOOR_COLOR_WELDED: 0x6688aa,
    DOOR_BORDER_WELDED: 0x445566,
    DOOR_WELD_MARK: 0xaaccee,

    // Door action durations (ms)
    DOOR_HACK_DURATION: 3000,
    DOOR_WELD_DURATION: 4000,
    DOOR_UNWELD_DURATION: 3000,
});
