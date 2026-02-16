export class InputHandler {
    constructor(scene) {
        this.scene = scene;
        this.pointer = scene.input.activePointer;
        this.rightClickTarget = null;
        this.isFiring = false;
        this.suppressFiring = false;

        this.pointerDownHandler = (pointer) => {
            if (pointer.rightButtonDown()) {
                this.rightClickTarget = {
                    worldX: pointer.worldX,
                    worldY: pointer.worldY
                };
            }
        };

        scene.input.on('pointerdown', this.pointerDownHandler);
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

    destroy() {
        if (this.pointerDownHandler) {
            this.scene.input.off('pointerdown', this.pointerDownHandler);
            this.pointerDownHandler = null;
        }
    }
}
