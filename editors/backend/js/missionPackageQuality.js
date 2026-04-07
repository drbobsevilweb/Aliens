import { normalizeMissionPackage } from './normalizeMissionPackage.js';

const DEFAULT_ATMO_CUES = Object.freeze([
    { id: 'cue_motion_near', textCue: 'BEEP', priority: 6 },
    { id: 'cue_tracker_active', textCue: 'TRACKER ACTIVE', priority: 7 },
    { id: 'cue_swarm_close', textCue: 'SWARM CLOSE', priority: 9 },
    { id: 'cue_door_thump', textCue: 'THUMP', priority: 6 },
    { id: 'cue_edge_contact', textCue: 'CONTACT', priority: 8 },
    { id: 'cue_jam_callout', textCue: 'WEAPON JAM', priority: 8 },
]);

export const QUALITY_PROFILES = Object.freeze({
    cinematic: Object.freeze({
        idleMul: 1.18,
        gunfireMul: 1.14,
        capMul: 0.86,
        ambushMul: 1.2,
        spawnSizeMul: 0.86,
        spawnSizeBias: -1,
        edgeCueBoost: true,
        trackerBoost: false,
    }),
    balanced: Object.freeze({
        idleMul: 1,
        gunfireMul: 1,
        capMul: 1,
        ambushMul: 1,
        spawnSizeMul: 1,
        spawnSizeBias: 0,
        edgeCueBoost: true,
        trackerBoost: true,
    }),
    hardcore: Object.freeze({
        idleMul: 0.82,
        gunfireMul: 0.78,
        capMul: 1.22,
        ambushMul: 0.8,
        spawnSizeMul: 1.24,
        spawnSizeBias: 1,
        edgeCueBoost: false,
        trackerBoost: true,
    }),
});

export function analyzeMissionPackageQuality(inputPkg) {
    const pkg = normalizeMissionPackage(inputPkg);
    const warnings = [];
    const missions = Array.isArray(pkg.missions) ? pkg.missions : [];
    const events = Array.isArray(pkg.directorEvents) ? pkg.directorEvents : [];
    const cues = Array.isArray(pkg.audioCues) ? pkg.audioCues : [];
    const scopedEventsByMission = buildMissionEventIndex(events);

    const byAction = new Map();
    for (const e of events) {
        const key = String(e?.action || '').toLowerCase();
        byAction.set(key, (byAction.get(key) || 0) + 1);
    }

    if (missions.length < 5) {
        warnings.push(`Only ${missions.length} missions found; campaign pacing benefits from 5 mission arcs.`);
    }
    if ((byAction.get('spawn_pack') || 0) < Math.max(2, Math.ceil(missions.length * 0.6))) {
        warnings.push('Low spawn_pack event coverage; combat pacing may feel flat between scripted waves.');
    }
    if ((byAction.get('edge_cue') || 0) + (byAction.get('door_thump') || 0) + (byAction.get('thump') || 0) < Math.max(2, missions.length)) {
        warnings.push('Atmosphere cue density is low; add edge_cue/door_thump beats for tension.');
    }
    if ((byAction.get('trigger_tracker') || 0) + (byAction.get('start_tracker') || 0) < Math.max(1, Math.floor(missions.length / 2))) {
        warnings.push('Tracker event coverage is low; consider scripted tracker assists in higher-pressure missions.');
    }
    if (cues.length < 6) {
        warnings.push(`Only ${cues.length} audio cues defined; recommended baseline is 6+ reusable cues.`);
    }

    for (const mission of missions) {
        const id = String(mission?.id || '').trim();
        if (!id) continue;
        const scopedEvents = scopedEventsByMission.get(id) || [];
        if (scopedEvents.length === 0) {
            warnings.push(`Mission ${id} has no mission-scoped director events.`);
        }
    }

    const score = Math.max(0, 100 - warnings.length * 8);
    return {
        score,
        warnings,
        metrics: {
            missions: missions.length,
            events: events.length,
            cues: cues.length,
            spawnPackEvents: byAction.get('spawn_pack') || 0,
            atmosphereEvents: (byAction.get('edge_cue') || 0) + (byAction.get('door_thump') || 0) + (byAction.get('thump') || 0),
            trackerEvents: (byAction.get('trigger_tracker') || 0) + (byAction.get('start_tracker') || 0),
        },
    };
}

export function autoTuneMissionPackage(inputPkg) {
    const pkg = normalizeMissionPackage(inputPkg);
    const cues = Array.isArray(pkg.audioCues) ? [...pkg.audioCues] : [];
    const events = Array.isArray(pkg.directorEvents) ? [...pkg.directorEvents] : [];
    const missions = Array.isArray(pkg.missions) ? pkg.missions : [];
    const scopedEventsByMission = buildMissionEventIndex(events);

    const added = { audioCues: 0, directorEvents: 0 };
    const cueIds = new Set(cues.map((c) => String(c?.id || '').trim()).filter(Boolean));
    for (const cue of DEFAULT_ATMO_CUES) {
        if (cueIds.has(cue.id)) continue;
        cues.push({ ...cue });
        cueIds.add(cue.id);
        added.audioCues += 1;
    }

    const eventIds = new Set(events.map((e) => String(e?.id || '').trim()).filter(Boolean));
    const addEvent = (evt) => {
        if (eventIds.has(evt.id)) return;
        events.push(evt);
        eventIds.add(evt.id);
        const scopedMissionIds = getScopedMissionIds(evt);
        for (const missionId of scopedMissionIds) {
            const scopedEvents = scopedEventsByMission.get(missionId) || [];
            scopedEvents.push(evt);
            scopedEventsByMission.set(missionId, scopedEvents);
        }
        added.directorEvents += 1;
    };

    for (const mission of missions) {
        const missionId = String(mission?.id || '').trim();
        if (!missionId) continue;

        const scoped = scopedEventsByMission.get(missionId) || [];
        const hasSpawn = scoped.some((e) => String(e?.action || '').toLowerCase() === 'spawn_pack');
        const hasEdgeCue = scoped.some((e) => {
            const a = String(e?.action || '').toLowerCase();
            return a === 'edge_cue' || a === 'door_thump' || a === 'thump';
        });
        const hasTracker = scoped.some((e) => {
            const a = String(e?.action || '').toLowerCase();
            return a === 'trigger_tracker' || a === 'start_tracker';
        });

        if (!hasSpawn) {
            addEvent({
                id: `auto_evt_${missionId}_spawn_pack`,
                trigger: 'wave:2',
                action: 'spawn_pack',
                missionId,
                params: { size: 2, source: 'idle', dir: 'N' },
            });
        }
        if (!hasEdgeCue) {
            addEvent({
                id: `auto_evt_${missionId}_edge_cue`,
                trigger: 'pressure:0.62',
                action: 'edge_cue',
                missionId,
                params: { cueId: 'cue_edge_contact', word: 'CONTACT' },
            });
            addEvent({
                id: `auto_evt_${missionId}_door_thump`,
                trigger: 'pressure:0.74',
                action: 'door_thump',
                missionId,
                params: { cueId: 'cue_door_thump', word: 'THUMP', dir: 'E' },
            });
        }
        if (!hasTracker) {
            addEvent({
                id: `auto_evt_${missionId}_tracker`,
                trigger: 'time:24',
                action: 'trigger_tracker',
                missionId,
                params: { role: 'tech', force: 0, cueId: 'cue_tracker_active' },
            });
        }
    }

    const tuned = normalizeMissionPackage({ ...pkg, audioCues: cues, directorEvents: events });
    return { pkg: tuned, added };
}

export function applyQualityProfile(inputPkg, profileName = 'balanced') {
    const profile = QUALITY_PROFILES[String(profileName || '').toLowerCase()] || QUALITY_PROFILES.balanced;
    const pkg = normalizeMissionPackage(inputPkg);
    const missions = Array.isArray(pkg.missions) ? pkg.missions.map((m) => ({ ...m, director: { ...(m?.director || {}) } })) : [];
    const events = Array.isArray(pkg.directorEvents) ? pkg.directorEvents.map((e) => ({ ...e, params: { ...(e?.params || {}) } })) : [];

    for (const mission of missions) {
        const d = mission.director || {};
        if (Number.isFinite(Number(d.idlePressureBaseMs))) d.idlePressureBaseMs = clampInt(Number(d.idlePressureBaseMs) * profile.idleMul, 500, 60000);
        if (Number.isFinite(Number(d.idlePressureMinMs))) d.idlePressureMinMs = clampInt(Number(d.idlePressureMinMs) * profile.idleMul, 500, 60000);
        if (Number.isFinite(Number(d.gunfireReinforceBaseMs))) d.gunfireReinforceBaseMs = clampInt(Number(d.gunfireReinforceBaseMs) * profile.gunfireMul, 500, 60000);
        if (Number.isFinite(Number(d.gunfireReinforceMinMs))) d.gunfireReinforceMinMs = clampInt(Number(d.gunfireReinforceMinMs) * profile.gunfireMul, 500, 60000);
        if (Number.isFinite(Number(d.reinforceCap))) d.reinforceCap = clampInt(Number(d.reinforceCap) * profile.capMul, 0, 200);
        if (Number.isFinite(Number(d.reinforceCapIdle))) d.reinforceCapIdle = clampInt(Number(d.reinforceCapIdle) * profile.capMul, 0, 200);
        if (Number.isFinite(Number(d.reinforceCapGunfire))) d.reinforceCapGunfire = clampInt(Number(d.reinforceCapGunfire) * profile.capMul, 0, 200);
        if (Number.isFinite(Number(d.inactivityAmbushMs))) d.inactivityAmbushMs = clampInt(Number(d.inactivityAmbushMs) * profile.ambushMul, 1000, 120000);
        if (Number.isFinite(Number(d.inactivityAmbushCooldownMs))) d.inactivityAmbushCooldownMs = clampInt(Number(d.inactivityAmbushCooldownMs) * profile.ambushMul, 500, 120000);
        mission.director = d;
    }

    for (const event of events) {
        const action = String(event?.action || '').toLowerCase();
        if (action === 'spawn_pack') {
            const size = Number(event?.params?.size);
            if (Number.isFinite(size)) {
                event.params.size = clampInt(size * profile.spawnSizeMul + profile.spawnSizeBias, 1, 16);
            }
        }
    }

    // Ensure profile-specific atmosphere support is present.
    if (profile.edgeCueBoost) {
        const hasEdge = events.some((e) => {
            const action = String(e?.action || '').toLowerCase();
            return action === 'edge_cue' || action === 'door_thump' || action === 'thump';
        });
        if (!hasEdge) {
            events.push({
                id: `profile_evt_${profileName}_edge_cue`,
                trigger: 'pressure:0.58',
                action: 'edge_cue',
                params: { cueId: 'cue_edge_contact', word: 'CONTACT' },
            });
        }
    }
    if (profile.trackerBoost) {
        const hasTracker = events.some((e) => {
            const action = String(e?.action || '').toLowerCase();
            return action === 'trigger_tracker' || action === 'start_tracker';
        });
        if (!hasTracker) {
            events.push({
                id: `profile_evt_${profileName}_tracker`,
                trigger: 'time:28',
                action: 'trigger_tracker',
                params: { role: 'tech', cueId: 'cue_tracker_active' },
            });
        }
    }

    return normalizeMissionPackage({
        ...pkg,
        missions,
        directorEvents: events,
    });
}

function buildMissionEventIndex(events) {
    const byMission = new Map();
    for (const event of events) {
        const missionIds = getScopedMissionIds(event);
        for (const missionId of missionIds) {
            const scopedEvents = byMission.get(missionId) || [];
            scopedEvents.push(event);
            byMission.set(missionId, scopedEvents);
        }
    }
    return byMission;
}

function getScopedMissionIds(entry) {
    const missionIds = [];
    const directMissionId = String(entry?.missionId || entry?.mission || '').trim();
    if (directMissionId) missionIds.push(directMissionId);
    if (Array.isArray(entry?.missionIds)) {
        for (const missionIdRaw of entry.missionIds) {
            const missionId = String(missionIdRaw || '').trim();
            if (!missionId || missionIds.includes(missionId)) continue;
            missionIds.push(missionId);
        }
    }
    return missionIds;
}

function clampInt(v, min, max) {
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, Math.round(v)));
}
