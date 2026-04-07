export class InputHandler {
    constructor(scene) {
        this.scene = scene;
        this.rightClickTarget = null;
        this.isFiring = false;
        this.suppressFiring = false;
        this.suppressClick = false;
        this.movementLocked = false;
        this.sprintRequested = false;

        // Double-click detection for sprint
        this._lastClickTime = 0;
        this._lastClickX = 0;
        this._lastClickY = 0;
        this._doubleClickMs = 300;
        this._doubleClickDist = 40;
        this._mouseRightHeld = false;

        // Touch state
        this._touchStartTime = 0;
        this._touchStartX = 0;
        this._touchStartY = 0;
        this._touchHeld = false;
        this._touchFiring = false;
        this._longPressMs = 300;
        this._tapMoveTolerance = 20;
        this._lastTouchPointer = null;  // track the touch pointer explicitly

        // Mobile auto-fire: set by GameScene when enemy is in beam sights
        this._mobileAutoFire = false;
        this._isTouchDevice = false;

        this.pointerDownHandler = (pointer) => {
            if (this.movementLocked) return;
            if (this.scene.hud?.isPointerOverButton?.(pointer.x, pointer.y)) return;
            if (this.scene.minimap?.isPointerOverButton?.(pointer.x, pointer.y)) return;
            if (this.suppressClick) {
                this.suppressClick = false;
                return;
            }

            if (pointer.wasTouch) {
                this._isTouchDevice = true;
                // Touch: record start for tap vs hold detection
                this._touchStartTime = scene.time.now;
                this._touchStartX = pointer.worldX;
                this._touchStartY = pointer.worldY;
                this._touchHeld = false;
                this._touchFiring = false;
                this._lastTouchPointer = pointer;
            } else {
                // Mouse LMB: immediate move target
                if (pointer.rightButtonDown?.() || pointer?.event?.button === 2) {
                    this._mouseRightHeld = true;
                }
                const isPrimary = pointer.leftButtonDown?.() || pointer?.event?.button === 0;
                if (isPrimary) {
                    const now = scene.time.now;
                    const cdx = pointer.worldX - this._lastClickX;
                    const cdy = pointer.worldY - this._lastClickY;
                    const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                    if ((now - this._lastClickTime) < this._doubleClickMs && cdist < this._doubleClickDist) {
                        this.sprintRequested = true;
                        this._lastClickTime = 0; // reset so triple-click doesn't re-trigger
                    } else {
                        this._lastClickTime = now;
                    }
                    this._lastClickX = pointer.worldX;
                    this._lastClickY = pointer.worldY;
                    this.rightClickTarget = {
                        worldX: pointer.worldX,
                        worldY: pointer.worldY
                    };
                }
            }
        };

        scene.input.on('pointerdown', this.pointerDownHandler);

        this._pointerUpHandler = (pointer) => {
            if (!pointer.wasTouch) {
                const buttons = Number(pointer?.event?.buttons) || 0;
                this._mouseRightHeld = (buttons & 2) !== 0;
                return;
            }
            if (this._touchFiring) {
                // Was firing — just stop
                this._touchFiring = false;
                this._touchHeld = false;
                this._lastTouchPointer = null;
                return;
            }
            // Short tap — act like left-click (move/target)
            const dt = scene.time.now - this._touchStartTime;
            const dx = pointer.worldX - this._touchStartX;
            const dy = pointer.worldY - this._touchStartY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dt < this._longPressMs && dist < this._tapMoveTolerance) {
                this.rightClickTarget = {
                    worldX: pointer.worldX,
                    worldY: pointer.worldY
                };
            }
            this._touchHeld = false;
            this._lastTouchPointer = null;
        };
        scene.input.on('pointerup', this._pointerUpHandler);
    }

    get pointer() {
        const input = this.scene.input;
        if (this._isTouchDevice && this._lastTouchPointer?.isDown) {
            return this._lastTouchPointer;
        }
        return input?.mousePointer || input?.activePointer;
    }

    update() {
        const pointer = this.pointer;

        // Count active touch pointers for two-finger fire
        let touchCount = 0;
        const pointers = this.scene.input.manager?.pointers;
        if (pointers) {
            for (let i = 0; i < pointers.length; i++) {
                if (pointers[i] && pointers[i].isDown && pointers[i].wasTouch) touchCount++;
            }
        }
        const twoFingerFire = touchCount >= 2;

        // Touch detection using the tracked touch pointer
        const tp = this._lastTouchPointer;
        if (this._isTouchDevice) {
            // Mobile: auto-fire when touching and enemy in beam sights
            if (tp && tp.isDown) {
                this._touchHeld = true;
                this._touchFiring = this._mobileAutoFire;
            } else {
                this._touchFiring = false;
                this._touchHeld = false;
            }
        } else {
            // Desktop: long-press detection as before
            if (tp && tp.isDown && !this._touchHeld && !twoFingerFire) {
                const dt = this.scene.time.now - this._touchStartTime;
                const dx = tp.worldX - this._touchStartX;
                const dy = tp.worldY - this._touchStartY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dt >= this._longPressMs && dist < this._tapMoveTolerance * 3) {
                    this._touchHeld = true;
                    this._touchFiring = true;
                }
            }
            if (this._touchHeld && tp && tp.isDown) {
                this._touchFiring = true;
            } else if (!tp || !tp.isDown) {
                this._touchFiring = false;
                this._touchHeld = false;
            }
        }

        // Firing = RMB (mouse) OR touch-fire OR two-finger OR bot
        const mousePointer = this.scene.input?.mousePointer;
        const mouseButtons = Number(mousePointer?.event?.buttons) || 0;
        const pointerButtons = Number(pointer?.event?.buttons) || 0;
        const rmb = !!(
            (typeof mousePointer?.rightButtonDown === 'function' && mousePointer.rightButtonDown())
            || (typeof pointer?.rightButtonDown === 'function' && pointer.rightButtonDown())
            || (mouseButtons & 2) !== 0
            || (pointerButtons & 2) !== 0
            || this._mouseRightHeld
        );
        if (!rmb && this._mouseRightHeld && mouseButtons === 0 && pointerButtons === 0) {
            this._mouseRightHeld = false;
        }
        this.isFiring = (rmb || this._touchFiring || twoFingerFire || this._botFiring === true) && !this.suppressFiring;
        this.suppressFiring = false;
    }

    consumeRightClick() {
        const target = this.rightClickTarget;
        this.rightClickTarget = null;
        return target;
    }

    consumeSprint() {
        if (this.sprintRequested) {
            this.sprintRequested = false;
            return true;
        }
        return false;
    }

    consumeMenuClick() {
        this.rightClickTarget = null;
        this.suppressFiring = true;
    }

    getPointerWorldPosition() {
        const p = this.pointer;
        return {
            worldX: p.worldX,
            worldY: p.worldY
        };
    }

    destroy() {
        if (this.pointerDownHandler) {
            this.scene.input.off('pointerdown', this.pointerDownHandler);
            this.pointerDownHandler = null;
        }
        if (this._pointerUpHandler) {
            this.scene.input.off('pointerup', this._pointerUpHandler);
            this._pointerUpHandler = null;
        }
    }
}
