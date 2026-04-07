import { CONFIG } from '../config.js';

const TRACKER_READOUT_FONT = 'SevenSegment, Alarm, "Share Tech Mono", monospace';

// Directional cone: 60° arc (±30° from leader facing), 23 tiles range
const CONE_HALF_ANGLE = Math.PI / 6;

export class MotionTracker {
    constructor(scene) {
        this.scene = scene;
        this._coneCount = 0;
        this._flashTimer = 0;
        this._flashOn = true;
        this._interEndAt = 0;
        this._nextPeriodicAt = 0;
        this._becameActiveAt = 0;

        const W = 36;
        const H = 36;

        // World-space container — repositioned each frame below the leader
        this.container = scene.add.container(0, 0);
        this.container.setDepth(50);
        this.container.setAlpha(0);

        // Background image (physical tracker device art)
        this.bgImage = scene.add.image(0, 0, 'motiontracker_bg');
        this.bgImage.setDisplaySize(W, H);
        this.bgImage.setOrigin(0.5, 0.5);
        this.bgImage.setTint(0xaaccee);
        this.bgImage.setAlpha(0.92);
        if (this.bgImage.preFX) {
            this.bgImage.preFX.addBlur(0, 0.5, 0.5, 0.3);
            this.bgImage.preFX.addGlow(0x1a5588, 2, 0, false, 0.1);
        }

        // Interference video overlay
        this._interVid = scene.add.video(0, 0, 'interrupt_video');
        this._interVid.setMute(true);
        this._interVid.play(true);
        this._interVid.setLoop(true);
        this._interVid.setDisplaySize(W, H);
        this._interVid.setOrigin(0.5, 0.5);
        this._interVid.setAlpha(0);
        this._interVid.setVisible(false);
        this._interVid.setTint(0xaaccff);

        // Count readout — seven-segment font, flashes while enemies in cone
        this.countLabel = scene.add.text(0, 0, '0', {
            fontSize: '14px',
            fontFamily: TRACKER_READOUT_FONT,
            color: '#33ff88',
            fontStyle: 'bold',
            shadow: { offsetX: 0, offsetY: 0, color: '#0a5522', blur: 8, stroke: true, fill: true },
        }).setOrigin(0.5, 0.5);

        this.container.add([this.bgImage, this._interVid, this.countLabel]);
    }

    destroy() {
        if (this.container) this.container.destroy();
    }

    /**
     * Called every frame from GameScene.update().
     * @param {number} leaderX  — world-space X of team leader
     * @param {number} leaderY  — world-space Y of team leader
     * @param {number} facingAngle — radians toward mouse (leader.facingAngle)
     * @param {Array}  contacts — motion contacts from EnemyManager.getMotionContacts()
     * @param {number} time     — scene time (ms)
     */
    update(leaderX, leaderY, facingAngle, contacts, time) {
        const coneRange = (CONFIG.TILE_SIZE || 64) * 23;
        const allContacts = Array.isArray(contacts) ? contacts.filter(Boolean) : [];

        // Filter: within 60° cone ahead and within 15-tile range
        const coneContacts = allContacts.filter(c => {
            const dx = (Number(c.x) || 0) - leaderX;
            const dy = (Number(c.y) || 0) - leaderY;
            const distSq = dx * dx + dy * dy;
            if (distSq > coneRange * coneRange) return false;
            const angle = Math.atan2(dy, dx);
            let diff = angle - facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            return Math.abs(diff) <= CONE_HALF_ANGLE;
        });

        const prevCount = this._coneCount;
        const count = coneContacts.length;
        this._coneCount = count;

        // Anchor below the leader sprite in world space
        this.container.setPosition(leaderX, leaderY + 28);

        const wasVisible = prevCount > 0;
        const isVisible = count > 0;

        if (isVisible && !wasVisible) {
            // Newly acquired contacts — fade in and trigger interference sequence
            this._becameActiveAt = time;
            this.scene.tweens.killTweensOf(this.container);
            this.scene.tweens.add({
                targets: this.container,
                alpha: 0.5,
                duration: 280,
                ease: 'Power2',
            });
            this._triggerInterference();
            this._nextPeriodicAt = time + 6000 + Math.random() * 9000;
        } else if (!isVisible && wasVisible) {
            // Lost all contacts — fade out
            this.scene.tweens.killTweensOf(this.container);
            this.scene.tweens.add({
                targets: this.container,
                alpha: 0,
                duration: 600,
                ease: 'Power2',
            });
            this.scene.tweens.killTweensOf(this._interVid);
            this._interVid.setAlpha(0);
            this._interVid.setVisible(false);
            this._interEndAt = 0;
        }

        // Periodic re-interference while contacts persist
        if (isVisible && time > this._interEndAt && time >= this._nextPeriodicAt
                && (time - this._becameActiveAt) > 2000) {
            this._triggerInterference();
            this._nextPeriodicAt = time + 5000 + Math.random() * 10000;
        }

        // CRT breathing pulse — sine-wave brightness on background and scale on label
        const t = time * 0.001; // seconds
        const bgPulse = 0.85 + 0.15 * Math.sin(t * 4.0);
        this.bgImage.setAlpha(0.92 * bgPulse);

        // Count label — flash while enemies in cone
        if (isVisible) {
            const nearest = coneContacts.reduce((min, c) => {
                const d = Math.hypot(c.x - leaderX, c.y - leaderY);
                return d < min ? d : min;
            }, coneRange);
            const proximity = 1 - Math.min(nearest / coneRange, 1);
            const urgency = Math.min(proximity + count * 0.08, 1);
            const flashInterval = Math.round(Phaser.Math.Linear(1400, 200, urgency));
            this._flashTimer += this.scene.game.loop.delta;
            if (this._flashTimer >= flashInterval) {
                this._flashTimer -= flashInterval;
                this._flashOn = !this._flashOn;
            }
            this.countLabel.setText(String(count));
            this.countLabel.setAlpha(this._flashOn ? 1 : 0.15);
            this.countLabel.setVisible(true);
            // Subtle scale pulse on count label
            const labelPulse = 1.0 + 0.1 * Math.sin(t * 6.0);
            this.countLabel.setScale(labelPulse);
        } else {
            this.countLabel.setVisible(false);
            this.countLabel.setScale(1);
            this._flashTimer = 0;
            this._flashOn = true;
        }
    }

    /** Video bursts in then fades out, revealing the bg art + count label */
    _triggerInterference() {
        const fadeIn = 180;
        const hold = 550;
        const fadeOut = 480;
        this._interEndAt = this.scene.time.now + fadeIn + hold + fadeOut;
        this._interVid.setVisible(true);
        this.scene.tweens.killTweensOf(this._interVid);
        this.scene.tweens.chain({
            targets: this._interVid,
            tweens: [
                { alpha: 0.9, duration: fadeIn, ease: 'Sine.easeIn' },
                { alpha: 0.9, duration: hold },
                { alpha: 0, duration: fadeOut, ease: 'Sine.easeOut',
                  onComplete: () => { if (this._interVid) this._interVid.setVisible(false); } },
            ],
        });
    }
}
