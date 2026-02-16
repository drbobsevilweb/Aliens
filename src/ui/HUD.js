import { CONFIG } from '../config.js';
import { WEAPONS } from '../data/weaponData.js';

const CARD_ORDER = Object.freeze([
    { key: 'leader', roleKey: null, label: 'LEADER', color: 0x4b78ff },
    { key: 'tech', roleKey: 'tech', label: 'TECH', color: 0x4dc3ff },
    { key: 'medic', roleKey: 'medic', label: 'MEDIC', color: 0x61d48e },
    { key: 'heavy', roleKey: 'heavy', label: 'HEAVY', color: 0xffb454 },
]);

export class HUD {
    constructor(scene, weaponManager, leader) {
        this.scene = scene;
        this.weaponManager = weaponManager;
        this.leader = leader;
        this.cards = new Map();

        this.createBackground();
        this.createSquadCards();

        weaponManager.onWeaponChange = () => this.refreshNow();
        weaponManager.onAmmoChange = () => this.refreshNow();
        weaponManager.onHeatChange = () => {};
        leader.onHealthChange = () => this.refreshNow();

        this.refreshNow();
    }

    createBackground() {
        const bg = this.scene.add.rectangle(
            CONFIG.GAME_WIDTH / 2,
            CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT / 2,
            CONFIG.GAME_WIDTH,
            CONFIG.HUD_HEIGHT,
            0x0b1119,
            0.93
        );
        bg.setScrollFactor(0);
        bg.setDepth(200);
    }

    createSquadCards() {
        const marginX = 14;
        const topY = CONFIG.GAME_HEIGHT - CONFIG.HUD_HEIGHT + 10;
        const gap = 10;
        const cardW = Math.floor((CONFIG.GAME_WIDTH - marginX * 2 - gap * 3) / 4);
        const cardH = CONFIG.HUD_HEIGHT - 20;

        for (let i = 0; i < CARD_ORDER.length; i++) {
            const def = CARD_ORDER[i];
            const x = marginX + i * (cardW + gap);
            const y = topY;

            const bg = this.scene.add.rectangle(x + cardW / 2, y + cardH / 2, cardW, cardH, 0x132132, 0.94);
            bg.setStrokeStyle(1, 0x2b4a64, 0.9);
            bg.setScrollFactor(0);
            bg.setDepth(201);

            const avatar = this.scene.add.rectangle(x + 24, y + 24, 32, 32, def.color, 1);
            avatar.setStrokeStyle(1, 0xffffff, 0.4);
            avatar.setScrollFactor(0);
            avatar.setDepth(202);

            const name = this.scene.add.text(x + 46, y + 12, def.label, {
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#d6ecff',
            });
            name.setScrollFactor(0);
            name.setDepth(202);

            const ammo = this.scene.add.text(x + 46, y + 30, 'AMMO: --', {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#c3dcf2',
            });
            ammo.setScrollFactor(0);
            ammo.setDepth(202);

            const hp = this.scene.add.text(x + 8, y + 56, 'HEALTH: --', {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#9ff09f',
            });
            hp.setScrollFactor(0);
            hp.setDepth(202);

            const hr = this.scene.add.text(x + 8, y + 74, 'HEARTRATE: -- bpm', {
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#ffd18f',
            });
            hr.setScrollFactor(0);
            hr.setDepth(202);

            const buttonW = 132;
            const buttonH = 22;
            const buttonX = x + cardW - 8 - buttonW / 2;
            const healButtonY = y + cardH - 40;
            const buttonY = y + cardH - 14;
            const healButtonBg = this.scene.add.rectangle(buttonX, healButtonY, buttonW, buttonH, 0x204226, 0.95);
            healButtonBg.setStrokeStyle(1, 0x7cc08a, 0.9);
            healButtonBg.setScrollFactor(0);
            healButtonBg.setDepth(202);
            healButtonBg.setInteractive({ useHandCursor: true });
            healButtonBg.on('pointerdown', (pointer) => {
                const isPrimaryInput = pointer.leftButtonDown()
                    || pointer.button === 0
                    || pointer.wasTouch === true
                    || pointer.pointerType === 'touch';
                if (!isPrimaryInput) return;
                if (typeof this.scene.startHealAction === 'function') {
                    const target = def.key === 'leader'
                        ? this.scene.leader
                        : this.scene?.squadSystem?.getFollowerByRole?.(def.roleKey);
                    if (target) {
                        const ok = this.scene.startHealAction(target, this.scene.time.now, {
                            auto: false,
                            preferredRoleKey: 'medic',
                        });
                        if (!ok && typeof this.scene.showFloatingText === 'function') {
                            this.scene.showFloatingText(this.scene.leader.x, this.scene.leader.y - 22, 'NO HEALER AVAILABLE', '#ffb388');
                        }
                    }
                }
                this.scene.inputHandler.consumeMenuClick();
            });
            const healButtonText = this.scene.add.text(buttonX, healButtonY, 'ORDER HEAL', {
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#b7f7c4',
                align: 'center',
            });
            healButtonText.setOrigin(0.5);
            healButtonText.setScrollFactor(0);
            healButtonText.setDepth(203);

            const trackerButtonBg = this.scene.add.rectangle(buttonX, buttonY, buttonW, buttonH, 0x193646, 0.95);
            trackerButtonBg.setStrokeStyle(1, 0x4f8eb0, 0.9);
            trackerButtonBg.setScrollFactor(0);
            trackerButtonBg.setDepth(202);
            trackerButtonBg.setInteractive({ useHandCursor: true });
            trackerButtonBg.on('pointerdown', (pointer) => {
                const isPrimaryInput = pointer.leftButtonDown()
                    || pointer.button === 0
                    || pointer.wasTouch === true
                    || pointer.pointerType === 'touch';
                if (!isPrimaryInput) return;
                if (typeof this.scene.startMotionTrackerScan === 'function') {
                    const preferredRole = def.key === 'leader' ? 'leader' : def.roleKey;
                    this.scene.startMotionTrackerScan(this.scene.time.now, preferredRole);
                }
                this.scene.inputHandler.consumeMenuClick();
            });
            const trackerProgressBg = this.scene.add.rectangle(buttonX, buttonY + 7, buttonW - 10, 4, 0x10222d, 0.95);
            trackerProgressBg.setScrollFactor(0);
            trackerProgressBg.setDepth(203);
            const trackerProgressFill = this.scene.add.rectangle(
                buttonX - (buttonW - 10) / 2,
                buttonY + 7,
                0,
                4,
                0x7ed9ff,
                0.95
            );
            trackerProgressFill.setOrigin(0, 0.5);
            trackerProgressFill.setScrollFactor(0);
            trackerProgressFill.setDepth(204);

            const trackerButtonText = this.scene.add.text(buttonX, buttonY, 'CHECK MOTION TRACKER', {
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#9ddfff',
                align: 'center',
            });
            trackerButtonText.setOrigin(0.5);
            trackerButtonText.setScrollFactor(0);
            trackerButtonText.setDepth(203);

            this.cards.set(def.key, {
                def,
                bg,
                avatar,
                name,
                ammo,
                hp,
                hr,
                healButtonBg,
                healButtonText,
                trackerButtonBg,
                trackerButtonText,
                trackerProgressBg,
                trackerProgressFill,
                buttonW,
            });
        }
    }

    refreshNow() {
        this.updateSquad(this.scene?.squadSystem?.getAllMarines?.() || [this.leader], this.scene.time.now);
    }

    updateSquad(marines, time) {
        const byRole = new Map();
        for (const marine of marines || []) {
            if (!marine) continue;
            byRole.set(marine.roleKey || 'leader', marine);
        }

        for (const [cardKey, card] of this.cards.entries()) {
            const marine = byRole.get(cardKey);
            const alive = !!(marine && marine.active !== false && marine.alive !== false);
            const maxHp = Math.max(1, Number(marine?.maxHealth) || 100);
            const hp = Math.max(0, Number(marine?.health) || 0);
            const hpPct = hp / maxHp;

            card.hp.setText(`HEALTH: ${Math.ceil(hp)}/${Math.ceil(maxHp)}`);
            card.hp.setColor(!alive ? '#888888' : (hpPct > 0.6 ? '#8af08a' : hpPct > 0.3 ? '#ffd76e' : '#ff8a8a'));

            let ammoText = 'AMMO: INF';
            if (cardKey === 'leader') {
                const weaponKey = this.weaponManager.currentWeaponKey;
                const def = WEAPONS[weaponKey];
                if (def && def.ammoType === 'limited') {
                    const ammo = this.weaponManager.ammo[weaponKey] || 0;
                    ammoText = `AMMO: ${ammo} ${weaponKey.toUpperCase()}`;
                }
            }
            card.ammo.setText(ammoText);

            const morale = Number.isFinite(marine?.morale) ? marine.morale : 0;
            const recentHit = Number.isFinite(marine?.lastDamagedAt) && (time - marine.lastDamagedAt <= 1400);
            const fear = Phaser.Math.Clamp(-morale / 100, 0, 1);
            const confidence = Phaser.Math.Clamp(morale / 100, 0, 1);
            const stress = Phaser.Math.Clamp((1 - hpPct) * 0.7 + fear * 0.3 + (recentHit ? 0.2 : 0) - confidence * 0.14, 0, 1);
            const bpm = Math.round(72 + stress * 84);
            card.hr.setText(`HEARTRATE: ${bpm} bpm`);
            card.hr.setColor(bpm < 95 ? '#b3f2b3' : bpm < 120 ? '#ffd788' : '#ff9f9f');

            const riskLocked = this.scene.isMotionTrackerRiskLocked ? this.scene.isMotionTrackerRiskLocked(time) : false;
            const trackerActive = this.scene.isMotionTrackerActive ? this.scene.isMotionTrackerActive(time) : false;
            const cooldownUntil = Number(this.scene.trackerCooldownUntil) || 0;
            const cooldownLeft = Math.max(0, cooldownUntil - time);
            const isOperator = !!(this.scene.trackerOperator
                && ((card.def.roleKey && this.scene.trackerOperator.roleKey === card.def.roleKey)
                    || (!card.def.roleKey && this.scene.trackerOperator.actor === this.scene.leader)));
            const busy = this.scene.isMarineTrackerBusy ? this.scene.isMarineTrackerBusy(marine, time) : false;
            const enableButton = alive && !busy && (!riskLocked || isOperator);
            const channeling = riskLocked && isOperator && !trackerActive;

            let loadPct = 0;
            if (channeling) {
                const startedAt = Number(this.scene.trackerStartedAt) || time;
                const endAt = Number(this.scene.trackerChannelUntil) || time;
                const span = Math.max(1, endAt - startedAt);
                loadPct = Phaser.Math.Clamp((time - startedAt) / span, 0, 1);
            } else if (trackerActive && isOperator) {
                loadPct = 1;
            }
            const progressW = (card.buttonW - 10) * loadPct;
            card.trackerProgressFill.width = progressW;
            card.trackerProgressFill.setVisible(loadPct > 0.01);
            card.trackerProgressBg.setVisible(channeling || (trackerActive && isOperator));

            if (channeling) {
                card.trackerButtonText.setText(`LOADING ${Math.round(loadPct * 100)}%`);
            } else if (riskLocked && isOperator) {
                card.trackerButtonText.setText('TRACKER ACTIVE');
            } else if (cooldownLeft > 0 && !riskLocked) {
                card.trackerButtonText.setText(`COOLDOWN ${(cooldownLeft / 1000).toFixed(1)}s`);
            } else {
                card.trackerButtonText.setText('CHECK MOTION TRACKER');
            }
            card.trackerButtonText.setColor(enableButton ? '#9ddfff' : '#6c8392');
            card.trackerButtonBg.setFillStyle(enableButton ? 0x193646 : 0x252b31, 0.95);
            card.trackerButtonBg.disableInteractive();
            if (enableButton) card.trackerButtonBg.setInteractive({ useHandCursor: true });

            const healAction = this.scene.healAction || null;
            const trackerBusy = this.scene.isMarineTrackerBusy ? this.scene.isMarineTrackerBusy(marine, time) : false;
            const healTargeted = !!(healAction
                && ((card.def.roleKey && healAction.targetRoleKey === card.def.roleKey)
                    || (!card.def.roleKey && healAction.target === this.scene.leader)));
            const healOperator = !!(healAction
                && ((card.def.roleKey && healAction.operatorRoleKey === card.def.roleKey)
                    || (!card.def.roleKey && healAction.operator === this.scene.leader)));
            const needsHeal = alive && hp < maxHp * 0.98;
            const canOrderHeal = alive && needsHeal && !trackerBusy && !healAction;

            if (healTargeted || healOperator) {
                card.healButtonText.setText('HEALING...');
            } else if (!alive) {
                card.healButtonText.setText('DOWN');
            } else if (!needsHeal) {
                card.healButtonText.setText('HEALTHY');
            } else if (healAction) {
                card.healButtonText.setText('HEAL BUSY');
            } else {
                card.healButtonText.setText('ORDER HEAL');
            }
            card.healButtonText.setColor(canOrderHeal ? '#b7f7c4' : '#7d9785');
            card.healButtonBg.setFillStyle(canOrderHeal ? 0x204226 : 0x26322a, 0.95);
            card.healButtonBg.disableInteractive();
            if (canOrderHeal) card.healButtonBg.setInteractive({ useHandCursor: true });
        }
    }

    updateSelection(_activeKey) {}
    updateAmmo(_weaponKey, _count) {}
    updateHeat(_heat, _isOverheated) {}
    updateHealth(_hp, _maxHp) {
        this.refreshNow();
    }
}
