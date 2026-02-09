export class InputHandler {
    constructor(scene) {
        this.scene = scene;
        this.pointer = scene.input.activePointer;
        this.rightClickTarget = null;
        this.isFiring = false;
        this.suppressFiring = false;

        scene.input.on('pointerdown', (pointer) => {
            if (pointer.rightButtonDown()) {
                this.rightClickTarget = {
                    worldX: pointer.worldX,
                    worldY: pointer.worldY
                };
            }
        });
    }

    update() {
        this.isFiring = this.pointer.leftButtonDown() && !this.suppressFiring;
        this.suppressFiring = false;
    }

    consumeRightClick() {
        const target = this.rightClickTarget;
        this.rightClickTarget = null;
        return target;
    }

    consumeMenuClick() {
        this.suppressFiring = true;
    }

    getPointerWorldPosition() {
        return {
            worldX: this.pointer.worldX,
            worldY: this.pointer.worldY
        };
    }
}
