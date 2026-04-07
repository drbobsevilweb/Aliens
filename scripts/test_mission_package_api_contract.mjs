#!/usr/bin/env node
import assert from 'node:assert/strict';

function buildWrappedFetch(responses) {
    let index = 0;
    return async (url) => {
        const next = responses[index++];
        if (!next) throw new Error(`Unexpected fetch call for ${url}`);
        return {
            ok: next.ok !== false,
            async json() {
                return next.body;
            },
        };
    };
}

async function loadRuntimeModule(label) {
    const url = new URL('../src/settings/missionPackageRuntime.js', import.meta.url);
    url.searchParams.set('t', `${label}-${Date.now()}-${Math.random()}`);
    return import(url.href);
}

async function testWrappedMissionPackageResponse() {
    global.window = {
        location: { search: '?package=local' },
    };
    global.fetch = buildWrappedFetch([
        {
            body: {
                ok: true,
                package: {
                    version: '1.0',
                    maps: [{ id: 'map_a', width: 40, height: 26, terrain: [], doors: [], markers: [] }],
                    missions: [{ id: 'm1', mapId: 'map_a', difficulty: 'normal' }],
                    directorEvents: [{ id: 'evt_a', trigger: 'time:5', action: 'spawn_pack', params: { size: 3 } }],
                    audioCues: [{ id: 'cue_a', textCue: 'CONTACT', priority: 7 }],
                },
            },
        },
    ]);

    const runtime = await loadRuntimeModule('wrapped-package');
    await runtime.initRuntimeOverrides();

    assert.deepEqual(runtime.getMissionPackageSummary(), {
        maps: 1,
        missions: 1,
        directorEvents: 1,
        audioCues: 1,
        storyPoints: 0,
    });
    assert.equal(runtime.getMissionDirectorEventsForMission('m1').length, 1);
    assert.equal(runtime.getMissionAudioCuesForMission('m1')[0]?.textCue, 'CONTACT');
}

async function testWrappedEditorStateFallback() {
    global.window = {
        location: { search: '?package=local' },
        buildPackageFromEditorState(editorState) {
            return {
                version: '1.0',
                maps: Array.isArray(editorState.tilemaps) ? editorState.tilemaps : [],
                missions: Array.isArray(editorState.missions) ? editorState.missions : [],
                directorEvents: Array.isArray(editorState.directorEvents) ? editorState.directorEvents : [],
                audioCues: Array.isArray(editorState.audioCues) ? editorState.audioCues : [],
            };
        },
    };
    global.fetch = buildWrappedFetch([
        { ok: false, body: {} },
        {
            body: {
                ok: true,
                state: {
                    tilemaps: [
                        {
                            id: 'map_b',
                            width: 40,
                            height: 26,
                            terrain: [],
                            doors: [],
                            markers: [],
                            storyPoints: [{ id: 'sp_1', tileX: 4, tileY: 7, title: 'Beat' }],
                        },
                    ],
                    missions: [{ id: 'm2', mapId: 'map_b', difficulty: 'hard' }],
                    directorEvents: [{ id: 'evt_b', trigger: 'wave:2', action: 'spawn_pack', params: { size: 4 } }],
                    audioCues: [{ id: 'cue_b', textCue: 'THUMP', priority: 6 }],
                },
            },
        },
    ]);

    const runtime = await loadRuntimeModule('wrapped-editor-state');
    await runtime.initRuntimeOverrides();

    assert.deepEqual(runtime.getMissionPackageSummary(), {
        maps: 1,
        missions: 1,
        directorEvents: 1,
        audioCues: 1,
        storyPoints: 1,
    });
    assert.equal(runtime.getMissionStoryPointsForMission('m2')[0]?.title, 'Beat');
    assert.equal(runtime.getMissionDirectorEventsForMission('m2')[0]?.id, 'evt_b');
}

async function main() {
    await testWrappedMissionPackageResponse();
    await testWrappedEditorStateFallback();
    console.log('test_mission_package_api_contract: ok');
}

main().finally(() => {
    delete global.window;
    delete global.fetch;
});
