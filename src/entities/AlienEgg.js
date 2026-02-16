export class AlienEgg extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, worldX, worldY) {
        super(scene, worldX, worldY, 'alien_egg');
        this.state = 'closed';
        this.nextReadyAt = 0;
        this.openUntil = 0;
        this.maxHealth = 26;
        this.health = this.maxHealth;
        this.setDepth(10);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.body.setImmovable(true);
        this.body.setAllowGravity(false);
        this.body.setCircle(12, 4, 4);
    }

    open(untilTime) {
        this.state = 'open';
        this.openUntil = untilTime;
        this.setTint(0xffcc88);
        this.setScale(1.08);
    }

    close(cooldownUntil) {
        this.state = 'closed';
        this.nextReadyAt = cooldownUntil;
        this.clearTint();
        this.setScale(1);
    }

    takeDamage(amount) {
        if (!this.active) return false;
        this.health = Math.max(0, this.health - Math.max(0, amount || 0));
        if (this.health > 0) {
            this.setTint(0xff8888);
            return false;
        }
        this.disableBody(true, true);
        this.state = 'destroyed';
        return true;
    }
}
