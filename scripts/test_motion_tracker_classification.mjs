#!/usr/bin/env node
import assert from 'node:assert/strict';
import { MotionTracker } from '../src/ui/MotionTracker.js';

function installPhaserMock() {
    const prevPhaser = globalThis.Phaser;
    globalThis.Phaser = {
        Math: {
            Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
            Linear: (a, b, t) => a + ((b - a) * t),
            Distance: {
                Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
            },
        },
    };
    return () => {
        if (typeof prevPhaser === 'undefined') delete globalThis.Phaser;
        else globalThis.Phaser = prevPhaser;
    };
}

function makeDisplayObject() {
    return {
        alpha: 1,
        visible: true,
        tint: null,
        scale: 1,
        text: '',
        setDepth() { return this; },
        setAlpha(v) { this.alpha = v; return this; },
        setDisplaySize() { return this; },
        setOrigin() { return this; },
        setTint(v) { this.tint = v; return this; },
        setVisible(v) { this.visible = v; return this; },
        setLoop() { return this; },
        setMute() { return this; },
        play() { return this; },
        setText(v) { this.text = v; return this; },
        setColor(v) { this.color = v; return this; },
        setScale(v) { this.scale = v; return this; },
        preFX: { addBlur() {}, addGlow() {} },
    };
}

function makeScene() {
    return {
        add: {
            container() {
                return {
                    alpha: 1,
                    x: 0,
                    y: 0,
                    setDepth() { return this; },
                    setAlpha(v) { this.alpha = v; return this; },
                    setPosition(x, y) { this.x = x; this.y = y; return this; },
                    add() { return this; },
                    destroy() {},
                };
            },
            image() { return makeDisplayObject(); },
            video() { return makeDisplayObject(); },
            text() { return makeDisplayObject(); },
        },
        tweens: {
            killTweensOf() {},
            add() {},
            chain() {},
        },
        game: { loop: { delta: 16 } },
        time: { now: 0 },
    };
}

function testClassificationPriority() {
    const restore = installPhaserMock();
    try {
        const tracker = new MotionTracker(makeScene());
        tracker.update(0, 0, 0, [
            { x: 64, y: 0, confidence: 0.82, tracked: true },
            { x: 96, y: 0, confidence: 0.25, isPhantom: true },
        ], 1000);
        assert.equal(tracker._signalProfile.classification, 'confirmed');
        assert.equal(tracker._signalProfile.confirmedCount, 1);
        assert.equal(tracker.countLabel.color, '#ff8f7a');
    } finally {
        restore();
    }
}

function testUncertainAndVentStates() {
    const restore = installPhaserMock();
    try {
        const tracker = new MotionTracker(makeScene());
        tracker.update(0, 0, 0, [
            { x: 128, y: 0, confidence: 0.32, isPhantom: true },
        ], 1000);
        assert.equal(tracker._signalProfile.classification, 'uncertain');
        assert.equal(tracker.countLabel.color, '#ffd36b');

        tracker.update(0, 0, 0, [
            { x: 128, y: 0, confidence: 0.4, vent: true },
        ], 1200);
        assert.equal(tracker._signalProfile.classification, 'vent');
        assert.equal(tracker.countLabel.color, '#7dd8ff');
    } finally {
        restore();
    }
}

function testTrackedStateWithoutConfirmation() {
    const restore = installPhaserMock();
    try {
        const tracker = new MotionTracker(makeScene());
        tracker.update(0, 0, 0, [
            { x: 256, y: 0, confidence: 0.51, tracked: true },
        ], 1000);
        assert.equal(tracker._signalProfile.classification, 'tracked');
        assert.equal(tracker.countLabel.color, '#66ff99');
    } finally {
        restore();
    }
}

testClassificationPriority();
testUncertainAndVentStates();
testTrackedStateWithoutConfirmation();
console.log('motionTrackerClassification.spec: ok');