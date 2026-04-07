import { CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

const params = new URLSearchParams(window.location.search);
const rendererParam = String(params.get('renderer') || '').toLowerCase().trim();
let rendererType = Phaser.AUTO;
if (rendererParam === 'canvas') rendererType = Phaser.CANVAS;
if (rendererParam === 'webgl') rendererType = Phaser.WEBGL;

const config = {
    type: rendererType,
    width: CONFIG.GAME_WIDTH,
    height: CONFIG.GAME_HEIGHT,
    scale: {
        // Keep a fixed 16:9 game surface and letterbox on wider/taller displays.
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: CONFIG.GAME_WIDTH,
        height: CONFIG.GAME_HEIGHT,
    },
    pixelArt: true,
    roundPixels: true,
    fps: {
        // Prevent the spiral-of-death when returning to a backgrounded tab.
        // Any raw delta above ~3 frames is treated as a stall and clamped.
        panicMax: 3,
        smoothStep: true,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false,
            // Cap physics step so a stale delta can't teleport objects.
            maxDeltaTime: 0.05,
        }
    },
    input: {
        activePointers: 3,  // support two-finger touch fire
        mouse: {
            preventDefaultDown: true,
            preventDefaultUp: true,
            preventDefaultMove: false,
            preventDefaultWheel: true
        },
        touch: {
            capture: true
        }
    },
    scene: [BootScene, GameScene]
};

// Ensure custom fonts are loaded and runtime overrides are initialized before Phaser creates canvas text objects
import { initRuntimeOverrides } from './settings/missionPackageRuntime.js';

Promise.all([
    document.fonts.ready,
    initRuntimeOverrides()
]).then(() => {
    const game = new Phaser.Game(config);
});
