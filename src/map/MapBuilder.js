import { CONFIG } from '../config.js';
import { FLOOR_DATA, WALL_DATA } from './mapData.js';

export class MapBuilder {
    constructor(scene, layout = null) {
        this.scene = scene;
        this.layout = layout;
    }

    build() {
        const floorData = this.layout?.floorData || FLOOR_DATA;
        const wallData = this.layout?.wallData || WALL_DATA;
        const width = this.layout?.width || CONFIG.MAP_WIDTH_TILES;
        const height = this.layout?.height || CONFIG.MAP_HEIGHT_TILES;

        const map = this.scene.make.tilemap({
            tileWidth: CONFIG.TILE_SIZE,
            tileHeight: CONFIG.TILE_SIZE,
            width,
            height
        });

        const tileset = map.addTilesetImage('tileset', 'tileset',
            CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, 0, 0);

        // Floor layer
        const floorLayer = map.createBlankLayer('tiles_floor', tileset, 0, 0);
        floorLayer.putTilesAt(floorData, 0, 0);

        // Wall layer (on top of floor)
        const wallLayer = map.createBlankLayer('tiles_walls', tileset, 0, 0);
        wallLayer.putTilesAt(wallData, 0, 0);
        wallLayer.setCollision(CONFIG.TILE_WALL);

        return { map, floorLayer, wallLayer };
    }
}
