import { CONFIG } from '../config.js';

/**
 * Handles the targeting reticle, enemy hover indicators, and HUD selection state.
 * Military-grade CRT terminal aesthetic with phosphor glow and context-sensitive colors.
 */
export class TargetingSystem {
    constructor(scene) {
        this.scene = scene;
        this.targetInfoText = null;
        this.reticleGraphics = null;
        this.reticleGlowGraphics = null;
        this._reticlePulse = 0;
        this._reticleScanY = 0;
        this._reticleRotation = 0;
        this._tickPhase = 0;
        this._lockTarget = null;
        this._lockStartTime = 0;
        this._lockProgress = 0;
    }

    init() {
        this.targetInfoText = this.scene.add.text(0, 0, '', {
            fontSize: '10px',
            fontFamily: '"Share Tech Mono", monospace',
            color: '#ff4444',
            backgroundColor: '#1a0000',
            padding: { left: 4, right: 4, top: 2, bottom: 2 },
        });
        this.targetInfoText.setDepth(213);
        this.targetInfoText.setScrollFactor(0);
        this.targetInfoText.setVisible(false);

        // Glow layer drawn beneath the main reticle for phosphor bloom
        this.reticleGlowGraphics = this.scene.add.graphics();
        this.reticleGlowGraphics.setDepth(211);
        this.reticleGlowGraphics.setScrollFactor(0);

        this.reticleGraphics = this.scene.add.graphics();
        this.reticleGraphics.setDepth(212);
        this.reticleGraphics.setScrollFactor(0);
    }

    update(time, delta) {
        this._reticlePulse += delta * 0.006;
        this._reticleScanY = (this._reticleScanY + delta * 0.08) % 50;
        this._reticleRotation += delta * 0.002;
        this._tickPhase += delta * 0.003;

        const pointer = this.scene.input.activePointer;
        const target = this.scene._lastHoveredEnemy;

        // Track lock-on progress for bracket tightening
        if (target !== this._lockTarget) {
            this._lockTarget = target;
            this._lockStartTime = time;
        }
        this._lockProgress = target ? Math.min(1, (time - this._lockStartTime) / 220) : 0;

        this.drawReticle(pointer.x, pointer.y, target);
        this.updateEnemyHover(target, pointer.x, pointer.y);
    }

    drawReticle(x, y, target) {
        const g = this.reticleGraphics;
        const glow = this.reticleGlowGraphics;
        g.clear();
        glow.clear();

        // Context-sensitive color: green=normal, red=enemy, amber=door
        const hoveredDoor = this.scene.doorManager?.getDoorGroupAtWorldPos?.(
            this.scene.input.activePointer.worldX,
            this.scene.input.activePointer.worldY
        );
        const isTargeting = !!target;
        const isDoor = !isTargeting && !!hoveredDoor;

        let color, glowColor;
        if (isTargeting) {
            color = 0xff3333;
            glowColor = 0xff1111;
        } else if (isDoor) {
            color = 0xffb347;
            glowColor = 0xff8800;
        } else {
            color = 0x33ff88;
            glowColor = 0x22cc66;
        }

        const baseAlpha = isTargeting ? 0.95 : 0.85;
        const pulse = Math.sin(this._reticlePulse) * 0.12;
        const alpha = baseAlpha + pulse;

        const outerSize = isTargeting ? 28 : 18;
        const innerSize = isTargeting ? 12 : 8;

        // ---- GLOW LAYER (phosphor bloom) ----
        // Thicker, low-alpha lines underneath for bloom effect
        const glowAlpha = alpha * 0.2;

        // Glow for crosshair arms
        const gap = innerSize * 0.6;
        const length = innerSize;
        glow.lineStyle(5, glowColor, glowAlpha);
        glow.lineBetween(x - gap - length, y, x - gap, y);
        glow.lineBetween(x + gap, y, x + gap + length, y);
        glow.lineBetween(x, y - gap - length, x, y - gap);
        glow.lineBetween(x, y + gap, x, y + gap + length);

        // Glow for center dot
        glow.fillStyle(glowColor, glowAlpha * 1.5);
        glow.fillCircle(x, y, 4);

        // Outer ring glow
        glow.lineStyle(4, glowColor, glowAlpha * 0.6);
        glow.strokeCircle(x, y, outerSize);

        // ---- MAIN RETICLE ----

        // Animated rotating outer ring segments
        g.lineStyle(1, color, alpha * 0.4);
        const segments = 8;
        const segmentAngle = (Math.PI * 2) / segments;
        for (let i = 0; i < segments; i++) {
            const startAngle = this._reticleRotation + i * segmentAngle;
            const endAngle = startAngle + segmentAngle * 0.35;
            g.beginPath();
            g.arc(x, y, outerSize, startAngle, endAngle);
            g.strokePath();
        }

        // Fine crosshair arms with center gap
        g.lineStyle(1.5, color, alpha);
        g.lineBetween(x - gap - length, y, x - gap, y);
        g.lineBetween(x + gap, y, x + gap + length, y);
        g.lineBetween(x, y - gap - length, x, y - gap);
        g.lineBetween(x, y + gap, x, y + gap + length);

        // Tick marks on crosshair arms (military rangefinder style)
        const tickAlpha = alpha * 0.5;
        g.lineStyle(1, color, tickAlpha);
        const tickOff = gap + length * 0.5;
        const tickLen = 2;
        // Horizontal ticks
        g.lineBetween(x - tickOff, y - tickLen, x - tickOff, y + tickLen);
        g.lineBetween(x + tickOff, y - tickLen, x + tickOff, y + tickLen);
        // Vertical ticks
        g.lineBetween(x - tickLen, y - tickOff, x + tickLen, y - tickOff);
        g.lineBetween(x - tickLen, y + tickOff, x + tickLen, y + tickOff);

        // Center dot
        g.fillStyle(color, alpha * 0.9);
        g.fillCircle(x, y, 1.5);

        // Corner brackets — contract from wide to tight as lock-on strengthens
        let bracketSize, bracketAlpha;
        if (isTargeting) {
            const lockT = this._lockProgress || 0;
            bracketSize = 28 - lockT * 12 + Math.sin(this._reticlePulse * 1.5) * (2 - lockT);
            bracketAlpha = alpha;
        } else {
            bracketSize = 14;
            bracketAlpha = alpha * 0.45;
        }
        this.drawBrackets(g, x, y, bracketSize, bracketSize, color, bracketAlpha);

        if (isTargeting) {
            // Lock-on pulse ring
            const lockAlpha = 0.3 + Math.abs(Math.sin(this._reticlePulse * 2)) * 0.5;
            g.lineStyle(1, color, lockAlpha);
            g.strokeCircle(x, y, innerSize + 4);

            // Extra glow pulse when targeting
            glow.lineStyle(8, glowColor, lockAlpha * 0.15);
            glow.strokeCircle(x, y, innerSize + 4);
        }

        if (isDoor) {
            // Amber interaction indicator - pulsing diamond
            const dSize = 6 + Math.sin(this._reticlePulse * 2) * 2;
            g.lineStyle(1, color, alpha * 0.6);
            g.beginPath();
            g.moveTo(x, y - dSize - outerSize * 0.6);
            g.lineTo(x + dSize * 0.5, y - outerSize * 0.6);
            g.lineTo(x, y + dSize - outerSize * 0.6);
            g.lineTo(x - dSize * 0.5, y - outerSize * 0.6);
            g.closePath();
            g.strokePath();
        }

        // HUD scan line sweep
        const scanY = y - outerSize + (this._reticleScanY % (outerSize * 2));
        if (scanY > y - outerSize && scanY < y + outerSize) {
            const scanW = Math.sqrt(Math.pow(outerSize, 2) - Math.pow(scanY - y, 2));
            g.lineStyle(1, color, alpha * 0.25);
            g.lineBetween(x - scanW, scanY, x + scanW, scanY);
        }

        // ---- WEAPON STATE INDICATORS ----
        const wm = this.scene.weaponManager;
        if (wm) {
            const weaponKey = wm.currentWeaponKey || 'pulseRifle';
            const weaponDef = wm.getRuntimeWeaponDef?.(weaponKey);

            // Heat arc (pulse rifle) — fills clockwise from 12 o'clock
            if (weaponKey === 'pulseRifle' && weaponDef) {
                const pulseMax = Math.max(1, Number(wm.pulseMaxAmmo) || 99);
                const pulseAmmo = Phaser.Math.Clamp(Number(wm.pulseAmmo) || 0, 0, pulseMax);
                const heatFrac = Phaser.Math.Clamp(1 - (pulseAmmo / pulseMax), 0, 1);
                if (heatFrac > 0) {
                const heatColor = this._lerpHeatColor(heatFrac);
                const arcRadius = outerSize + 5;
                const startAngle = -Math.PI / 2;
                const sweep = Math.PI * 2 * heatFrac;

                // Dim background track
                g.lineStyle(1, 0x7ecfff, alpha * 0.1);
                g.beginPath();
                g.arc(x, y, arcRadius, 0, Math.PI * 2);
                g.strokePath();

                // Heat fill arc
                g.lineStyle(2, heatColor, alpha * 0.85);
                g.beginPath();
                g.arc(x, y, arcRadius, startAngle, startAngle + sweep);
                g.strokePath();

                // Glow behind heat arc
                glow.lineStyle(4, heatColor, alpha * 0.15);
                glow.beginPath();
                glow.arc(x, y, arcRadius, startAngle, startAngle + sweep);
                glow.strokePath();
                }
            }

            // Overheated warning — pulsing ring + diagonal ticks
            if (wm.isOverheated) {
                const flashAlpha = 0.4 + Math.abs(Math.sin(this._reticlePulse * 4)) * 0.6;
                const warnRadius = outerSize + 9;

                g.lineStyle(1.5, 0xff4444, flashAlpha * alpha);
                g.strokeCircle(x, y, warnRadius);

                const tickLen = 4;
                for (let i = 0; i < 4; i++) {
                    const a = -Math.PI / 4 + i * Math.PI / 2;
                    const tx1 = x + Math.cos(a) * (warnRadius - tickLen);
                    const ty1 = y + Math.sin(a) * (warnRadius - tickLen);
                    const tx2 = x + Math.cos(a) * (warnRadius + tickLen);
                    const ty2 = y + Math.sin(a) * (warnRadius + tickLen);
                    g.lineBetween(tx1, ty1, tx2, ty2);
                }

                glow.lineStyle(6, 0xff4444, flashAlpha * alpha * 0.12);
                glow.strokeCircle(x, y, warnRadius);
            }

            // Jammed indicator — pulsing amber X over reticle
            if (wm.jamUntil && this.scene.time.now < wm.jamUntil) {
                const jamFlash = 0.5 + Math.abs(Math.sin(this._reticlePulse * 5)) * 0.5;
                const jamSize = outerSize * 0.55;
                g.lineStyle(2.5, 0xff8844, jamFlash * alpha);
                g.lineBetween(x - jamSize, y - jamSize, x + jamSize, y + jamSize);
                g.lineBetween(x + jamSize, y - jamSize, x - jamSize, y + jamSize);
                glow.lineStyle(5, 0xff6622, jamFlash * alpha * 0.15);
                glow.lineBetween(x - jamSize, y - jamSize, x + jamSize, y + jamSize);
                glow.lineBetween(x + jamSize, y - jamSize, x - jamSize, y + jamSize);
            }

            // Ammo dots (limited weapons: shotgun, pistol)
            if (weaponDef && weaponDef.ammoType === 'limited') {
                const ammo = wm.ammo[weaponKey] || 0;
                const maxAmmo = weaponDef.maxAmmo || 1;
                const dotCount = 12;
                const dotRadius = outerSize + 10;
                const ammoPerDot = maxAmmo / dotCount;

                for (let i = 0; i < dotCount; i++) {
                    const dotAngle = -Math.PI / 2 + (i / dotCount) * Math.PI * 2;
                    const dx = x + Math.cos(dotAngle) * dotRadius;
                    const dy = y + Math.sin(dotAngle) * dotRadius;
                    const filled = ammo > i * ammoPerDot;

                    if (filled) {
                        g.fillStyle(0x7ecfff, alpha * 0.7);
                        g.fillCircle(dx, dy, 1.5);
                    } else {
                        g.fillStyle(0x7ecfff, alpha * 0.15);
                        g.fillCircle(dx, dy, 1);
                    }
                }
            }
        }
    }

    drawBrackets(g, x, y, w, h, color, alpha) {
        const len = 6;
        const thickness = 1.5;
        g.lineStyle(thickness, color, alpha);

        // Top-left
        g.beginPath();
        g.moveTo(x - w, y - h + len);
        g.lineTo(x - w, y - h);
        g.lineTo(x - w + len, y - h);
        g.strokePath();
        // Top-right
        g.beginPath();
        g.moveTo(x + w - len, y - h);
        g.lineTo(x + w, y - h);
        g.lineTo(x + w, y - h + len);
        g.strokePath();
        // Bottom-left
        g.beginPath();
        g.moveTo(x - w, y + h - len);
        g.lineTo(x - w, y + h);
        g.lineTo(x - w + len, y + h);
        g.strokePath();
        // Bottom-right
        g.beginPath();
        g.moveTo(x + w - len, y + h);
        g.lineTo(x + w, y + h);
        g.lineTo(x + w, y + h - len);
        g.strokePath();
    }

    _lerpHeatColor(t) {
        // cyan #7ecfff → yellow #ffff44 → red #ff4444
        let r, gr, b;
        if (t < 0.5) {
            const f = t * 2;
            r = 0x7e + (0xff - 0x7e) * f;
            gr = 0xcf + (0xff - 0xcf) * f;
            b = 0xff + (0x44 - 0xff) * f;
        } else {
            const f = (t - 0.5) * 2;
            r = 0xff;
            gr = 0xff + (0x44 - 0xff) * f;
            b = 0x44;
        }
        return (Math.round(r) << 16) | (Math.round(gr) << 8) | Math.round(b);
    }

    updateEnemyHover(enemy, screenX, screenY) {
        if (!enemy || enemy.active === false || enemy.visible === false) {
            if (this.targetInfoText) this.targetInfoText.setVisible(false);
            return;
        }

        if (this.targetInfoText) {
            this.targetInfoText.setVisible(true);
            const name = String(enemy.enemyType || 'unknown').toUpperCase();
            const health = Math.ceil(enemy.health || 0);
            const maxHealth = Math.ceil(enemy.maxHealth || 100);
            const dist = Math.round(Phaser.Math.Distance.Between(this.scene.leader.x, this.scene.leader.y, enemy.x, enemy.y) / 10);

            this.targetInfoText.setText(`${name}\nHP: ${health}/${maxHealth}\nRANGE: ${dist}M`);
            this.targetInfoText.setPosition(screenX + 25, screenY + 10);

            // Pulse color if critical
            if (health / maxHealth < 0.25) {
                this.targetInfoText.setColor('#ffffff');
                this.targetInfoText.setBackgroundColor('#ff0000');
            } else {
                this.targetInfoText.setColor('#ff4444');
                this.targetInfoText.setBackgroundColor('#1a0000');
            }
        }
    }

    destroy() {
        if (this.targetInfoText) {
            this.targetInfoText.destroy();
            this.targetInfoText = null;
        }
        if (this.reticleGlowGraphics) {
            this.reticleGlowGraphics.destroy();
            this.reticleGlowGraphics = null;
        }
        if (this.reticleGraphics) {
            this.reticleGraphics.destroy();
            this.reticleGraphics = null;
        }
    }
}
