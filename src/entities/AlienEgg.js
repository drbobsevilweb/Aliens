export class AlienEgg extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, worldX, worldY) {
        super(scene, worldX, worldY, 'alien_egg');
        this.state = 'closed';
        this.nextReadyAt = 0;
        this.openUntil = 0;
        this.hasReleased = false;
        this.maxHealth = 26;
        this.health = this.maxHealth;
        this.setDepth(10);
        
        // Base scale increased by 30%
        this.baseScale = 1.3;
        this.setScale(this.baseScale);
        
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.body.setImmovable(true);
        this.body.setAllowGravity(false);
        // Adjusted body circle for 30% larger sprite
        this.body.setCircle(15, 1, 1);

        // Shadow at depth 5 — eggs are static so position is set once.
        this.shadowSprite = scene.add.image(worldX, worldY + 2, 'shadow_blob');
        this.shadowSprite.setDepth(5);
        this.shadowSprite.setAlpha(0.3);
        this.shadowSprite.setScale(1.1); // Increased shadow scale to match
    }

    open(untilTime) {
        if (this.hasReleased || this.state === 'spent') return;
        this.state = 'open';
        this.openUntil = untilTime;
        this.setScale(this.baseScale * 1.08);
    }

    close(cooldownUntil) {
        if (this.hasReleased || this.state === 'spent') return;
        this.state = 'closed';
        this.nextReadyAt = cooldownUntil;
        this.setScale(this.baseScale);
    }

    setSpent() {
        this.hasReleased = true;
        this.state = 'spent';
        this.nextReadyAt = Number.MAX_SAFE_INTEGER;
        this.openUntil = 0;
        this.setScale(this.baseScale * 0.96);
    }

    takeDamage(amount) {
        if (!this.active) return false;
        this.health = Math.max(0, this.health - Math.max(0, amount || 0));
        if (this.health > 0) {
            return false;
        }
        this.disableBody(true, true);
        if (this.shadowSprite) this.shadowSprite.setVisible(false);
        this.state = 'destroyed';
        return true;
    }

    destroy(fromScene) {
        if (this.shadowSprite) {
            this.shadowSprite.destroy();
            this.shadowSprite = null;
        }
        super.destroy(fromScene);
    }
}
