import { CONFIG } from '../config.js';
import { MapBuilder } from '../map/MapBuilder.js';
import { TeamLeader } from '../entities/TeamLeader.js';
import { BulletPool } from '../entities/BulletPool.js';
import { InputHandler } from '../systems/InputHandler.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { PathGrid } from '../pathfinding/PathGrid.js';
import { AStar } from '../pathfinding/AStar.js';
import { DoorManager } from '../entities/DoorManager.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { DoorActionSystem } from '../systems/DoorActionSystem.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    create() {
        // Build tilemap
        const mapBuilder = new MapBuilder(this);
        const { map, floorLayer, wallLayer } = mapBuilder.build();
        this.wallLayer = wallLayer;

        // Pathfinding
        this.pathGrid = new PathGrid(wallLayer, CONFIG.MAP_WIDTH_TILES, CONFIG.MAP_HEIGHT_TILES);
        this.astar = new AStar();

        // Team Leader
        this.leader = new TeamLeader(this, 4, 3);

        // Bullet pool
        this.bulletPool = new BulletPool(this);

        // Input
        this.inputHandler = new InputHandler(this);

        // Movement
        this.movementSystem = new MovementSystem();

        // Doors
        this.doorManager = new DoorManager(this, this.pathGrid);

        // Context menu and door action system
        this.contextMenu = new ContextMenu(this);
        this.doorActionSystem = new DoorActionSystem(
            this, this.pathGrid, this.astar, this.movementSystem
        );

        // Physics colliders
        this.physics.add.collider(this.leader, wallLayer);
        this.physics.add.collider(this.bulletPool, wallLayer, (bullet) => {
            bullet.deactivate();
        });
        this.physics.add.collider(this.leader, this.doorManager.getPhysicsGroup());
        this.physics.add.collider(this.bulletPool, this.doorManager.getPhysicsGroup(), (bullet) => {
            bullet.deactivate();
        });

        // Camera
        const mapWidthPx = CONFIG.MAP_WIDTH_TILES * CONFIG.TILE_SIZE;
        const mapHeightPx = CONFIG.MAP_HEIGHT_TILES * CONFIG.TILE_SIZE;
        this.cameras.main.setBounds(0, 0, mapWidthPx, mapHeightPx);
        this.cameras.main.startFollow(this.leader, true, CONFIG.CAMERA_LERP, CONFIG.CAMERA_LERP);
        this.cameras.main.setDeadzone(CONFIG.CAMERA_DEADZONE_WIDTH, CONFIG.CAMERA_DEADZONE_HEIGHT);

        // Physics world bounds
        this.physics.world.setBounds(0, 0, mapWidthPx, mapHeightPx);

        // Prevent browser context menu on right-click
        this.input.mouse.disableContextMenu();
    }

    update(time, delta) {
        this.inputHandler.update();

        // Rotate leader to face cursor
        const pointer = this.inputHandler.getPointerWorldPosition();
        this.leader.facePosition(pointer.worldX, pointer.worldY);

        // Right-click handling
        const rightClick = this.inputHandler.consumeRightClick();
        if (rightClick) {
            const doorGroup = this.doorManager.getDoorGroupAtWorldPos(
                rightClick.worldX, rightClick.worldY
            );

            if (doorGroup) {
                // Right-clicked a door: show context menu
                this.showDoorContextMenu(doorGroup, rightClick.worldX, rightClick.worldY);
            } else {
                // Right-clicked empty space: dismiss menu and move
                this.contextMenu.hide();
                this.doorActionSystem.cancelPending();

                const startTile = this.pathGrid.worldToTile(this.leader.x, this.leader.y);
                const endTile = this.pathGrid.worldToTile(rightClick.worldX, rightClick.worldY);

                if (this.pathGrid.isWalkable(endTile.x, endTile.y)) {
                    const path = this.astar.findPath(
                        startTile.x, startTile.y,
                        endTile.x, endTile.y,
                        this.pathGrid
                    );
                    if (path) {
                        const worldPath = path.map(p => this.pathGrid.tileToWorld(p.x, p.y));
                        this.movementSystem.assignPath(this.leader, worldPath);
                    }
                }
            }
        }

        // Movement first, then check for door action arrival
        this.movementSystem.update(this.leader);
        this.doorActionSystem.update(this.leader, delta);

        // Firing
        if (this.inputHandler.isFiring) {
            this.bulletPool.fire(this.leader.x, this.leader.y, this.leader.rotation, time);
        }
    }

    showDoorContextMenu(doorGroup, worldX, worldY) {
        const actions = doorGroup.getAvailableActions();
        if (actions.length === 0) return;

        this.contextMenu.show(worldX, worldY, actions, (action) => {
            this.inputHandler.consumeMenuClick();
            this.doorActionSystem.queueAction(this.leader, doorGroup, action);
        });
    }
}
