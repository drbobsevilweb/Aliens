import { CONFIG } from '../config.js';

/**
 * Handles the APC Commander overlay, threat lane analysis, and tactical directives.
 * Extracted from GameScene to improve modularity and reduce scene complexity.
 */
export class CommanderSystem {
    constructor(scene) {
        this.scene = scene;
        
        // State
        this.currentCommanderDirective = 'ADVANCE & SCAN';
        this.commanderDirectiveOverride = '';
        this.commanderDirectiveUntil = 0;
        this.nextCommanderOverlayAt = 0;
        
        // UI Elements
        this.commanderTitleText = null;
        this.commanderStatusText = null;
    }

    initOverlay() {
        // Overlay UI removed — threat lane logic still runs headless
    }

    summarizeThreatLanes(marines = null, maxDist = CONFIG.TILE_SIZE * 14) {
        const enemies = this.scene.enemyManager?.getAliveEnemies?.() || [];
        const team = Array.isArray(marines) && marines.length > 0
            ? marines
            : (this.scene.squadSystem ? this.scene.squadSystem.getAllMarines() : [this.scene.leader]);
        
        const lanes = { N: 0, E: 0, S: 0, W: 0 };
        const priority = { queen: 3.2, queenLesser: 2.5, warrior: 1.5, drone: 1.2, facehugger: 1.05 };
        
        for (const enemy of enemies) {
            if (!enemy || !enemy.active) continue;
            let nearest = Infinity;
            for (const m of team) {
                if (!m || m.active === false || m.alive === false) continue;
                const d = Phaser.Math.Distance.Between(enemy.x, enemy.y, m.x, m.y);
                if (d < nearest) nearest = d;
            }
            if (!Number.isFinite(nearest) || nearest > maxDist) continue;
            
            // Note: getDirectionBucket is still on GameScene, we call it there
            const dir = this.scene.getDirectionBucket(enemy.x, enemy.y);
            const weight = (priority[enemy.enemyType] || 1) * Phaser.Math.Linear(1.2, 0.55, nearest / maxDist);
            lanes[dir] += weight;
        }
        return lanes;
    }

    parseCommanderLaneDirective(text = '') {
        const s = String(text || '').toUpperCase().trim();
        const split = s.match(/SPLIT\s+([NESW])\/([NESW])/);
        if (split) {
            return { mode: 'split', primary: split[1], secondary: split[2] };
        }
        const anchor = s.match(/ANCHOR\s+([NESW])/);
        if (anchor) return { mode: 'anchor', primary: anchor[1], secondary: null };
        const hold = s.match(/HOLD FORMATION\s+([NESW])/);
        if (hold) return { mode: 'hold', primary: hold[1], secondary: null };
        const fallback = s.match(/FALL BACK\s+([NESW])/);
        if (fallback) return { mode: 'fallback', primary: fallback[1], secondary: null };
        return { mode: 'none', primary: null, secondary: null };
    }

    getRoleAssignedLane(roleKey = '', laneDirective = null) {
        if (!laneDirective || !laneDirective.primary) return null;
        const role = String(roleKey || '').toLowerCase();
        if (role === 'heavy') return laneDirective.primary;
        if (role === 'tech') return laneDirective.secondary || laneDirective.primary;
        return null;
    }

    updateOverlay(time = this.scene.time.now, marines = null) {
        if (!this.commanderStatusText || (this.scene.stageFlow && this.scene.stageFlow.isEnded())) return;
        if (time < (this.nextCommanderOverlayAt || 0)) return;
        this.nextCommanderOverlayAt = time + 180;

        const pressure = this.scene.getCombatPressure ? this.scene.getCombatPressure() : 0;
        const state = this.scene.getDirectorState ? this.scene.getDirectorState() : 'manual';
        
        const lanes = this.summarizeThreatLanes(marines, CONFIG.TILE_SIZE * 14);
        const sorted = Object.entries(lanes).sort((a, b) => b[1] - a[1]);
        const primary = sorted[0] || ['N', 0];
        const secondary = sorted[1] || ['E', 0];
        const laneTotal = Object.values(lanes).reduce((a, b) => a + b, 0);
        
        let directive = `ANCHOR ${primary[0]} LANE`;
        if (laneTotal < 1.4) directive = 'ADVANCE & SCAN';
        else if (primary[1] > 5.8 && secondary[1] > 2.4) directive = `SPLIT ${primary[0]}/${secondary[0]} FIRE`;
        else if (primary[1] > 7.6) directive = `FALL BACK ${primary[0]} ARC`;
        
        if (time <= (this.commanderDirectiveUntil || 0) && this.commanderDirectiveOverride) {
            directive = this.commanderDirectiveOverride;
        }
        
        this.currentCommanderDirective = directive;
        
        const trackerRole = this.scene.trackerOperator?.roleKey ? String(this.scene.trackerOperator.roleKey).toUpperCase() : '';
        const trackerLine = trackerRole && this.scene.isTrackerOperatorLocked(time)
            ? `TRACKER: ${trackerRole} LOCK`
            : 'TRACKER: READY';
            
        this.commanderStatusText.setText(
            `PRESSURE ${Math.round(pressure * 100)}% ${state.toUpperCase()}\n`
            + `LANES N${Math.round(lanes.N)} E${Math.round(lanes.E)} S${Math.round(lanes.S)} W${Math.round(lanes.W)}\n`
            + `${directive}\n`
            + `${trackerLine}`
        );
        
        const tint = pressure > 0.72 ? '#ffb7a6' : (pressure > 0.48 ? '#ffd7a2' : '#9bc7e2');
        this.commanderStatusText.setColor(tint);
    }

    setDirectiveOverride(directive, time, durationMs = 4200) {
        this.commanderDirectiveOverride = directive;
        this.commanderDirectiveUntil = time + durationMs;
    }
}
