import { CONFIG } from '../config.js';

/**
 * Handles objective tracking, mission state, and target markers.
 * Extracted from GameScene to improve modularity.
 */
export class ObjectiveSystem {
    constructor(scene) {
        this.scene = scene;
        this.lastObjectiveProgressCount = 0;
        this.objectiveTargetMarker = null;
    }

    createTargetMarker() {
        this.objectiveTargetMarker = this.scene.add.circle(0, 0, 16, 0xffd166, 0.15);
        this.objectiveTargetMarker.setStrokeStyle(2, 0xffd166, 0.9);
        this.objectiveTargetMarker.setDepth(9);
        this.objectiveTargetMarker.setVisible(false);
    }

    updateTargetMarker(targetWorld, time) {
        if (!this.objectiveTargetMarker) return;
        if (!targetWorld) {
            this.objectiveTargetMarker.setVisible(false);
            return;
        }
        this.objectiveTargetMarker.setVisible(true);
        this.objectiveTargetMarker.setPosition(targetWorld.x, targetWorld.y);
        
        // Subtle pulse
        const pulse = 0.8 + 0.2 * Math.sin(time / 240);
        this.objectiveTargetMarker.setScale(pulse);
        this.objectiveTargetMarker.setAlpha(0.4 + 0.3 * Math.sin(time / 240));
    }

    countCompletedObjectives(missionState = null) {
        const state = missionState || this.scene.missionFlow?.getState();
        if (!state || !Array.isArray(state.objectives)) return 0;
        return state.objectives.filter(obj => obj && obj.status === 'complete').length;
    }

    updateObjectives(missionState = null) {
        const state = missionState || this.scene.missionFlow?.getState();
        if (!state) return;

        const completed = this.countCompletedObjectives(state);
        if (completed > this.lastObjectiveProgressCount) {
            const gainStep = Phaser.Math.Clamp(Number(this.scene.runtimeSettings?.marines?.panicObjectiveGain) || 10, 0, 40);
            const gain = (completed - this.lastObjectiveProgressCount) * gainStep;
            
            const team = this.scene.squadSystem?.getAllMarines() || [this.scene.leader];
            for (const marine of team) {
                if (!marine || marine.alive === false) continue;
                marine.morale = Phaser.Math.Clamp((marine.morale || 0) + gain, -100, 100);
            }
            
            this.scene.showFloatingText(this.scene.leader?.x || 0, (this.scene.leader?.y || 0) - 48, 'OBJECTIVE SECURED', '#ffea70');
            this.lastObjectiveProgressCount = completed;
            this.scene?.eventBus?.emit('objectiveCompleted', { completed, total: state.objectives?.length || 0 });
        }
    }

    updatePanel(missionState) {
        if (!this.scene.objectivesPanel) return;
        this.scene.objectivesPanel.update({
            stage: this.scene.stageFlow.state,
            currentWave: this.scene.stageFlow.currentWave,
            totalWaves: this.scene.stageFlow.totalWaves,
            objectiveLines: missionState ? missionState.objectiveLines : null,
            statusLine: this.scene.getMissionPackageHudStatusLine(),
        }, this.scene.time.now, this.scene.game.loop.delta);
    }

    checkMissionCompletion(missionState, time) {
        if (!missionState || this.scene.stageFlow?.isEnded()) return false;

        if (missionState.isComplete) {
            this.scene?.eventBus?.emit('missionComplete', { missionId: this.scene.currentMissionId || 'unknown' });
            this.scene.stageFlow?.completeExtraction?.();
            this.scene.onMissionSuccess(time);
            return true;
        }
        return false;
    }

    destroy() {
        if (this.objectiveTargetMarker) {
            this.objectiveTargetMarker.destroy();
            this.objectiveTargetMarker = null;
        }
    }
}
