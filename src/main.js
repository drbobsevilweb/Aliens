import { CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

const config = {
    type: Phaser.AUTO,
    width: CONFIG.GAME_WIDTH,
    height: CONFIG.GAME_HEIGHT,
    pixelArt: true,
    roundPixels: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    input: {
        mouse: {
            preventDefaultDown: true,
            preventDefaultUp: true,
            preventDefaultMove: false,
            preventDefaultWheel: true
        }
    },
    scene: [BootScene, GameScene]
};

const game = new Phaser.Game(config);
