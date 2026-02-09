import { CONFIG } from '../config.js';
import { FLOOR_DATA, WALL_DATA } from './mapData.js';

export class MapBuilder {
    constructor(scene) {
        this.scene = scene;
    }

    build() {
        const map = this.scene.make.tilemap({
            tileWidth: CONFIG.TILE_SIZE,
            tileHeight: CONFIG.TILE_SIZE,
            width: CONFIG.MAP_WIDTH_TILES,
            height: CONFIG.MAP_HEIGHT_TILES
        });

        const tileset = map.addTilesetImage('tileset', 'tileset',
            CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 0, 0);

        // Floor layer
        const floorLayer = map.createBlankLayer('tiles_floor', tileset, 0, 0);
        floorLayer.putTilesAt(FLOOR_DATA, 0, 0);

        // Wall layer (on top of floor)
        const wallLayer = map.createBlankLayer('tiles_walls', tileset, 0, 0);
        wallLayer.putTilesAt(WALL_DATA, 0, 0);
        wallLayer.setCollision(CONFIG.TILE_WALL);

        return { map, floorLayer, wallLayer };
    }
}
