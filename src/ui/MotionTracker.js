import { CONFIG } from '../config.js';

const TRACKER_READOUT_FONT = 'SevenSegment, Alarm, "Share Tech Mono", monospace';
const TRACKER_CONE_RANGE = (CONFIG.TILE_SIZE || 64) * 23;
const DEFAULT_SIGNAL_PROFILE = Object.freeze({
    classification: 'none',
    confidence: 0,
    proximity: 0,
    coneCount: 0,
    confirmedCount: 0,
    trackedCount: 0,
    ventCount: 0,
    uncertainCount: 0,
    phantomCount: 0,
    echoCount: 0,
    labelColor: '#33ff88',
    bgTint: 0xaaccee,
});

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
        this._signalProfile = { ...DEFAULT_SIGNAL_PROFILE };
        this.range = TRACKER_CONE_RANGE;

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
        const coneRange = this.range || TRACKER_CONE_RANGE;
        const coneContacts = [];
        const rawContacts = Array.isArray(contacts) ? contacts : [];

        // Filter: within 60° cone ahead and within 15-tile range.
        for (const contact of rawContacts) {
            if (!contact) continue;
            const dx = (Number(contact.x) || 0) - leaderX;
            const dy = (Number(contact.y) || 0) - leaderY;
            const distSq = dx * dx + dy * dy;
            if (distSq > coneRange * coneRange) continue;
            const angle = Math.atan2(dy, dx);
            let diff = angle - facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) <= CONE_HALF_ANGLE) coneContacts.push(contact);
        }

        const prevCount = this._coneCount;
        const count = coneContacts.length;
        this._coneCount = count;
        this._signalProfile = this._summarizeConeContacts(leaderX, leaderY, coneContacts, coneRange);

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
        this.bgImage.setTint(this._signalProfile.bgTint || 0xaaccee);
        this._interVid.setTint(this._signalProfile.bgTint || 0xaaccff);
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
            this.countLabel.setColor(this._signalProfile.labelColor || '#33ff88');
            this.countLabel.setAlpha(this._flashOn ? 1 : 0.15);
            this.countLabel.setVisible(true);
            // Subtle scale pulse on count label
            const labelPulse = 1.0 + 0.1 * Math.sin(t * 6.0);
            this.countLabel.setScale(labelPulse);
        } else {
            this.countLabel.setVisible(false);
            this.countLabel.setScale(1);
            this.countLabel.setColor(DEFAULT_SIGNAL_PROFILE.labelColor);
            this.bgImage.setTint(DEFAULT_SIGNAL_PROFILE.bgTint);
            this._interVid.setTint(0xaaccff);
            this._signalProfile = { ...DEFAULT_SIGNAL_PROFILE };
            this._flashTimer = 0;
            this._flashOn = true;
        }
    }

    _summarizeConeContacts(leaderX, leaderY, coneContacts, coneRange) {
        if (!Array.isArray(coneContacts) || coneContacts.length <= 0) {
            return { ...DEFAULT_SIGNAL_PROFILE };
        }

        const profile = {
            classification: 'uncertain',
            confidence: 0,
            proximity: 0,
            coneCount: coneContacts.length,
            confirmedCount: 0,
            trackedCount: 0,
            ventCount: 0,
            uncertainCount: 0,
            phantomCount: 0,
            echoCount: 0,
            labelColor: DEFAULT_SIGNAL_PROFILE.labelColor,
            bgTint: DEFAULT_SIGNAL_PROFILE.bgTint,
        };

        for (const contact of coneContacts) {
            if (!contact) continue;
            const conf = Phaser.Math.Clamp(Number(contact.confidence) || 0, 0, 1);
            const dist = Phaser.Math.Distance.Between(leaderX, leaderY, Number(contact.x) || 0, Number(contact.y) || 0);
            const prox = Phaser.Math.Clamp(1 - (dist / Math.max(1, coneRange)), 0, 1);
            const tracked = contact.tracked === true;
            const phantom = contact.isPhantom === true || String(contact.type || '').toLowerCase() === 'phantom';
            const echo = contact.isEcho === true;
            const vent = contact.vent === true;
            const confirmed = !phantom && !echo && !vent && (conf >= 0.72 || (tracked && conf >= 0.55));

            profile.confidence = Math.max(profile.confidence, conf);
            profile.proximity = Math.max(profile.proximity, prox);

            if (phantom) profile.phantomCount += 1;
            if (echo) profile.echoCount += 1;
            if (vent) profile.ventCount += 1;
            if (confirmed) {
                profile.confirmedCount += 1;
                continue;
            }
            if (tracked && !phantom && !echo && !vent) {
                profile.trackedCount += 1;
                continue;
            }
            profile.uncertainCount += 1;
        }

        if (profile.confirmedCount > 0) {
            profile.classification = 'confirmed';
            if (profile.proximity >= 0.6) {
                profile.labelColor = '#ff8f7a';
                profile.bgTint = 0xffc7b8;
            } else {
                profile.labelColor = '#ffc56e';
                profile.bgTint = 0xe0c29c;
            }
        } else if (profile.trackedCount > 0) {
            profile.classification = 'tracked';
            profile.labelColor = '#66ff99';
            profile.bgTint = 0x9fd9b5;
        } else if (profile.ventCount > 0) {
            profile.classification = 'vent';
            profile.labelColor = '#7dd8ff';
            profile.bgTint = 0x9cccf0;
        } else if (profile.uncertainCount > 0 || profile.phantomCount > 0 || profile.echoCount > 0) {
            profile.classification = 'uncertain';
            profile.labelColor = '#ffd36b';
            profile.bgTint = 0xe1c98e;
        } else {
            profile.classification = 'tracked';
            profile.labelColor = '#66ff99';
            profile.bgTint = 0x9fd9b5;
        }

        return profile;
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
