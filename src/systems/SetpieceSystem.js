import { CONFIG } from '../config.js';

/**
 * Handles director-driven setpiece spawns, corridor surges, and mission-authored events.
 * Extracted from GameScene to improve modularity.
 */
export class SetpieceSystem {
    constructor(scene) {
        this.scene = scene;
        
        // Internalized state
        this.nextCorridorSetpieceAt = 0;
        this.nextSetpieceCueAt = 0;
        this.lastSetpieceDir = '';
        this.firedMissionSetpieceIds = new Set();
        this.commandFormationUntil = 0;
        this.nextMissionSetpieceScanAt = 0;
    }

    init(time) {
        this.nextCorridorSetpieceAt = time + 9000;
        this.nextSetpieceCueAt = 0;
        this.lastSetpieceDir = '';
        this.firedMissionSetpieceIds = new Set();
        this.commandFormationUntil = 0;
        this.nextMissionSetpieceScanAt = 0;
    }

    getMissionSetpieceTemplates() {
        const raw = this.scene.activeMission?.setpieces;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        return raw.filter((s) => s && typeof s === 'object');
    }

    buildMissionCueWorldFromDir(rawDir = null) {
        const s = this.scene;
        let dir = String(rawDir || '').toUpperCase().trim();
        if (!['N', 'S', 'E', 'W'].includes(dir)) {
            dir = Phaser.Utils.Array.GetRandom(['N', 'S', 'E', 'W']);
        }
        const dist = CONFIG.TILE_SIZE * 9;
        if (dir === 'N') return { x: s.leader.x, y: s.leader.y - dist };
        if (dir === 'S') return { x: s.leader.x, y: s.leader.y + dist };
        if (dir === 'E') return { x: s.leader.x + dist, y: s.leader.y };
        return { x: s.leader.x - dist, y: s.leader.y };
    }

    spawnDirectorPack(params = {}, time = this.scene.time.now, marines = null) {
        const s = this.scene;
        if (s.stageFlow?.state === 'extract') return 0;
        if (s.isStagingSafeActive(time)) return 0;
        if (!s.enemyManager || s.stageFlow?.isEnded?.()) return 0;
        const source = String(params.source || 'idle').toLowerCase() === 'gunfire' ? 'gunfire' : 'idle';
        
        const slots = s.reinforcementSystem.getAvailableReinforcementSlots(source);
        if (slots <= 0) return 0;
        
        const aliveNow = s.enemyManager.getAliveCount();
        const marList = Array.isArray(marines) && marines.length > 0 ? marines : s.squadSystem.getAllMarines();
        const softCap = s.getDynamicAliveSoftCap(marList);
        const capRoom = Math.max(0, softCap - aliveNow);
        if (capRoom <= 0) return 0;
        
        const requestedSize = Phaser.Math.Clamp(Math.floor(Number(params.size) || 3), 1, 16);
        const packSize = Math.min(slots, capRoom, requestedSize);
        if (packSize <= 0) return 0;
        
        const forcedType = params.type ? String(params.type) : '';
        const preferredDir = String(params.dir || '').toUpperCase().trim();
        const view = s.cameras.main ? s.cameras.main.worldView : null;
        let spawned = 0;
        
        for (let i = 0; i < packSize; i++) {
            const world = s.reinforcementSystem.pickIdlePressureSpawnWorld(view, marList, time, preferredDir);
            if (!world) continue;
            
            const type = forcedType || s.reinforcementSystem.pickReinforcementType(source, i, time);
            const enemy = s.enemyManager.spawnEnemyAtWorld(type, world.x, world.y, s.stageFlow.currentWave || 1);
            if (!enemy) continue;
            
            s.reinforcementSystem.noteReinforcementTypeSpawn(type, time);
            enemy.dynamicReinforcement = true;
            enemy.reinforcementSource = source;
            const target = marList[Math.floor(Math.random() * marList.length)] || s.leader;
            enemy.alertUntil = Math.max(enemy.alertUntil, time + 3800);
            enemy.investigatePoint = { x: target.x, y: target.y, power: 1.05 };
            enemy.investigateUntil = time + 3200;
            spawned++;
        }
        
        if (spawned > 0) {
            s.reinforcementSystem.noteReinforcementSpawn(time, source, spawned);
            s.markCombatAction(time);
        }
        return spawned;
    }

    tryMissionAuthoredSetpiece(time, marines, pressure) {
        const s = this.scene;
        const templates = this.getMissionSetpieceTemplates();
        if (templates.length === 0) return false;
        if (time < this.nextMissionSetpieceScanAt) return false;
        this.nextMissionSetpieceScanAt = time + 220;
        const elapsed = Math.max(0, time - s.sessionStartTime);
        const state = s.getDirectorState();
        
        for (let i = 0; i < templates.length; i++) {
            const tpl = templates[i];
            const id = String(tpl.id || `tpl_${i}`);
            const once = tpl.once !== false;
            if (once && this.firedMissionSetpieceIds.has(id)) continue;
            
            const atMs = Math.max(0, Number(tpl.atMs) || 0);
            if (atMs > 0 && elapsed < atMs) continue;
            
            const minPressure = Phaser.Math.Clamp(Number(tpl.minPressure) || 0, 0, 1);
            const maxPressure = Phaser.Math.Clamp(Number(tpl.maxPressure) || 1, 0, 1);
            if (pressure < minPressure || pressure > maxPressure) continue;
            
            const stateReq = String(tpl.state || '').trim().toLowerCase();
            if (stateReq && stateReq !== state) continue;
            
            const source = String(tpl.source || '').toLowerCase() === 'gunfire' ? 'gunfire' : 'idle';
            const size = Phaser.Math.Clamp(Math.floor(Number(tpl.size) || 3), 1, 12);
            const dirRaw = String(tpl.dir || '').toUpperCase().trim();
            const dir = ['N', 'E', 'S', 'W'].includes(dirRaw) ? dirRaw : '';
            const type = tpl.type ? String(tpl.type) : '';
            
            let spawned = this.spawnDirectorPack({ size, source, dir, type }, time, marines);
            const facehuggerBurst = Phaser.Math.Clamp(Math.floor(Number(tpl.facehuggers) || 0), 0, 4);
            for (let h = 0; h < facehuggerBurst; h++) {
                const extra = this.spawnDirectorPack({ size: 1, source, dir, type: 'facehugger' }, time, marines);
                if (extra <= 0) break;
                spawned += extra;
            }
            if (spawned <= 0) continue;
            
            const cue = this.buildMissionCueWorldFromDir(dir);
            const cueWord = String(tpl.cueWord || s.getMissionAudioCueText('cue_motion_near', 'SURGE'));
            s.showEdgeWordCue(cueWord, cue.x, cue.y, String(tpl.cueColor || '#8fcfff'));
            
            const text = String(tpl.text || `CORRIDOR SURGE ${dir || s.getDirectionBucket(cue.x, cue.y)}: HOLD FORMATION`);
            if (time >= this.nextSetpieceCueAt) {
                s.showFloatingText(s.leader.x, s.leader.y - 38, text, '#ffc6ab');
                const chatter = s.getCommanderCueLine('surge');
                if (chatter) s.showFloatingText(s.leader.x, s.leader.y - 56, chatter, '#ffcebc');
                this.nextSetpieceCueAt = time + 3200;
            }
            
            const formationMs = Math.max(0, Math.floor(Number(tpl.formationMs) || 6400));
            if (formationMs > 0) {
                this.commandFormationUntil = Math.max(this.commandFormationUntil || 0, time + formationMs);
            }
            
            const directive = String(tpl.directive || `HOLD FORMATION ${dir || ''}`).trim();
            const durationMs = Math.max(1200, Math.floor(Number(tpl.directiveMs) || 5800));
            s.commanderSystem.setDirectiveOverride(directive, time, durationMs);
            
            this.lastSetpieceDir = dir || this.lastSetpieceDir || 'N';
            const cooldownMs = Math.max(2000, Math.floor(Number(tpl.cooldownMs) || 17000));
            this.nextCorridorSetpieceAt = time + cooldownMs;
            
            if (once) this.firedMissionSetpieceIds.add(id);
            return true;
        }
        return false;
    }

    updateCorridorSetpieces(time, marines) {
        const s = this.scene;
        if (s.isStagingSafeActive(time)) return;
        if (!s.enemyManager || s.stageFlow.isEnded()) return;
        if (s.stageFlow.state === 'intermission') return;
        if (time < this.nextCorridorSetpieceAt) return;
        
        // Use reinforcementSystem's spawn throttle
        if (time < s.reinforcementSystem.nextReinforcementSpawnAt) return;
        
        if (s.getDirectorState() === 'release') {
            this.nextCorridorSetpieceAt = time + Phaser.Math.Between(5000, 9000);
            return;
        }
        const pressure = s.getCombatPressure();
        if (this.tryMissionAuthoredSetpiece(time, marines, pressure)) {
            return;
        }
        if (pressure < 0.54) {
            this.nextCorridorSetpieceAt = time + Phaser.Math.Between(3400, 6800);
            return;
        }
        const source = pressure >= 0.72 ? 'gunfire' : 'idle';
        if (s.reinforcementSystem.getAvailableReinforcementSlots(source) <= 0) {
            this.nextCorridorSetpieceAt = time + Phaser.Math.Between(2600, 4800);
            return;
        }
        
        const dirs = ['N', 'E', 'S', 'W'];
        const lanes = s.commanderSystem.summarizeThreatLanes(marines, CONFIG.TILE_SIZE * 16);
        const picked = dirs.reduce((best, dir) => {
            const recentPenalty = s.reinforcementSystem.getDoorNoisePenalty(dir, time);
            const repeatPenalty = (dir === this.lastSetpieceDir) ? 1200 : 0;
            const laneBias = lanes[dir] * 180;
            const score = recentPenalty + repeatPenalty + laneBias + Phaser.Math.Between(0, 140);
            if (!best || score < best.score) return { dir, score };
            return best;
        }, null);
        
        const dir = (picked && picked.dir) || Phaser.Utils.Array.GetRandom(dirs);
        const size = Math.max(2, Math.min(8, Math.round(3 + pressure * 4)));
        let spawned = this.spawnDirectorPack({ size, source, dir }, time, marines);
        
        const facehuggerSlots = Math.max(0, Math.min(2, Math.floor(pressure * 2)));
        for (let i = 0; i < facehuggerSlots; i++) {
            const extra = this.spawnDirectorPack({ size: 1, source, dir, type: 'facehugger' }, time, marines);
            if (extra <= 0) break;
            spawned += extra;
        }
        
        if (spawned <= 0) {
            this.nextCorridorSetpieceAt = time + Phaser.Math.Between(2600, 5200);
            return;
        }
        
        const cue = this.buildMissionCueWorldFromDir(dir);
        s.showEdgeWordCue(s.getMissionAudioCueText('cue_motion_near', 'SURGE'), cue.x, cue.y, '#8fcfff');
        
        if (time >= this.nextSetpieceCueAt) {
            s.showFloatingText(
                s.leader.x,
                s.leader.y - 38,
                `CORRIDOR SURGE ${dir}: HOLD FORMATION`,
                '#ffc6ab'
            );
            const chatter = s.getCommanderCueLine('surge');
            if (chatter) s.showFloatingText(s.leader.x, s.leader.y - 56, chatter, '#ffcebc');
            this.nextSetpieceCueAt = time + 3200;
        }
        
        this.commandFormationUntil = Math.max(this.commandFormationUntil || 0, time + 6400);
        s.commanderSystem.setDirectiveOverride(`HOLD FORMATION ${dir}`, time, 5800);
        this.lastSetpieceDir = dir;
        this.nextCorridorSetpieceAt = time + Math.floor(Phaser.Math.Linear(22000, 15000, pressure));
    }
}
