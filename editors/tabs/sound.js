/**
 * Sound Tab — Audio editor using wavesurfer.js
 * Supports trim, reverb, echo, fade, upload, and categorized sound management.
 * All operations save directly to server via /api/sounds/*.
 */

const API = window.editorAPI;

let soundList = [];
let selectedSound = null;
let wavesurfer = null;
let audioCtx = null;
let originalBuffer = null;
let workingBuffer = null;
let segments = [];

// Categories for organization
const CATEGORIES = [
    { key: 'sfx',      label: 'Sound Effects', pattern: /\bsfx\b/i },
    { key: 'weapon',   label: 'Weapons',   pattern: /pulse_rifle|shotgun|pistol|bullet/i },
    { key: 'alien',    label: 'Aliens',     pattern: /alien|hiss|screech|queen|facehugger|egg/i },
    { key: 'door',     label: 'Doors',      pattern: /door|weld/i },
    { key: 'ambient',  label: 'Ambient',    pattern: /ambient|steam|vent|atmosphere|hum/i },
    { key: 'ui',       label: 'UI/Tracker', pattern: /motion|tracker|beep|click/i },
    { key: 'speech',   label: 'Speech',     pattern: /speech|voice|radio|callout/i },
    { key: 'music',    label: 'Music',      pattern: /music|theme|score/i },
    { key: 'other',    label: 'Other',      pattern: /.*/ },
];

function categorize(sound) {
    const path = sound.path.toLowerCase();
    // Path-based categorization for spec directories takes precedence
    if (path.includes('/assets/audio/sfx/')) return 'sfx';
    if (path.includes('/assets/audio/ui/')) return 'ui';
    if (path.includes('/assets/audio/ambient/')) return 'ambient';
    if (path.includes('/assets/audio/music/')) return 'music';
    const name = sound.name.toLowerCase() + path;
    for (const cat of CATEGORIES) {
        if (cat.key !== 'other' && cat.pattern.test(name)) return cat.key;
    }
    return 'other';
}

function buildUI(root) {
    root.innerHTML = `
        <div class="layout-split" style="height:100%">
            <!-- Left: sound list -->
            <aside class="sidebar" style="width:260px; display:flex; flex-direction:column;">
                <div class="panel" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="panel-header">
                        <span>Sound Files</span>
                        <div style="display:flex;gap:4px;">
                            <button class="btn btn-sm btn-primary" id="snd-upload-btn">+ Upload</button>
                            <button class="btn btn-sm btn-secondary" id="snd-refresh-btn">↻</button>
                        </div>
                    </div>
                    <div style="padding:4px;">
                        <input type="text" class="input input-sm" id="snd-search" placeholder="Filter sounds…" style="width:100%;">
                    </div>
                    <div class="panel-body" style="flex:1; overflow-y:auto; padding:0;" id="snd-list"></div>
                </div>
            </aside>

            <!-- Main: waveform + effects -->
            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <!-- Transport toolbar -->
                <div class="toolbar" id="snd-toolbar">
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="snd-play" disabled title="Play (Space)">▶ Play</button>
                        <button class="btn btn-sm btn-secondary" id="snd-stop" disabled title="Stop">⏹ Stop</button>
                        <button class="btn btn-sm btn-secondary" id="snd-loop" disabled title="Toggle loop">🔁 Loop</button>
                    </div>
                    <div class="toolbar-separator"></div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-secondary" id="snd-zoom-in" disabled>Zoom +</button>
                        <button class="btn btn-sm btn-secondary" id="snd-zoom-out" disabled>Zoom −</button>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <span id="snd-time" style="font-size:11px;color:var(--text-muted);min-width:140px;">0:00.000 / 0:00.000</span>
                    </div>
                    <div class="toolbar-group">
                        <button class="btn btn-sm btn-primary" id="snd-save" disabled>Save</button>
                        <button class="btn btn-sm btn-danger" id="snd-delete" disabled>Delete</button>
                    </div>
                </div>

                <!-- Waveform -->
                <div id="snd-waveform" style="flex:0 0 180px; padding:8px; background:#0d1117; border-bottom:1px solid var(--border);"></div>

                <!-- Spectrum + Meter -->
                <div style="padding:8px; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:center;">
                    <div style="flex:1;">
                        <canvas id="snd-spectrum" style="width:100%;height:80px;background:#0a0a0a;border:1px solid var(--border);"></canvas>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px; min-width:100px;">
                        <div style="text-align:center;">
                            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Loudness</div>
                            <div id="snd-meter-db" style="font-size:16px;font-weight:600;color:#4fdb8e;font-family:monospace;">-∞ dB</div>
                            <div id="snd-meter-bar" style="width:100px;height:12px;background:#0a0a0a;border:1px solid var(--border);margin:4px auto;overflow:hidden;">
                                <div style="height:100%;background:linear-gradient(90deg,#4fdb8e 0%,#ffcc00 50%,#ff4444 100%);width:0%;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Effects panel -->
                <div style="flex:1; overflow-y:auto; padding:8px;">
                    <!-- EQ Section -->
                    <div class="panel" style="margin-bottom:8px;">
                        <div class="panel-header">3-Band EQ (Real-Time)</div>
                        <div class="panel-body" style="padding:8px;">
                            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                <label style="font-size:11px;min-width:40px;">Low (200Hz):</label>
                                <input type="range" id="snd-eq-low" min="-12" max="12" step="0.5" value="0" style="width:100px;">
                                <span id="snd-eq-low-lbl" style="font-size:11px;min-width:30px;">0 dB</span>
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                <label style="font-size:11px;min-width:40px;">Mid (2kHz):</label>
                                <input type="range" id="snd-eq-mid" min="-12" max="12" step="0.5" value="0" style="width:100px;">
                                <span id="snd-eq-mid-lbl" style="font-size:11px;min-width:30px;">0 dB</span>
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                                <label style="font-size:11px;min-width:40px;">High (8kHz):</label>
                                <input type="range" id="snd-eq-high" min="-12" max="12" step="0.5" value="0" style="width:100px;">
                                <span id="snd-eq-high-lbl" style="font-size:11px;min-width:30px;">0 dB</span>
                            </div>
                            <button class="btn btn-sm btn-secondary" id="snd-eq-reset">Reset EQ</button>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <!-- Trim -->
                        <div class="panel">
                            <div class="panel-header">Trim</div>
                            <div class="panel-body" style="padding:8px;">
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <label style="font-size:11px;min-width:40px;">Start:</label>
                                    <input type="number" class="input input-sm" id="snd-trim-start" value="0" min="0" step="0.01" style="width:80px;">
                                    <span style="font-size:11px;color:var(--text-muted);">sec</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                                    <label style="font-size:11px;min-width:40px;">End:</label>
                                    <input type="number" class="input input-sm" id="snd-trim-end" value="0" min="0" step="0.01" style="width:80px;">
                                    <span style="font-size:11px;color:var(--text-muted);">sec</span>
                                </div>
                                <button class="btn btn-sm btn-secondary" id="snd-apply-trim">Apply Trim</button>
                            </div>
                        </div>

                        <!-- Fade -->
                        <div class="panel">
                            <div class="panel-header">Fade</div>
                            <div class="panel-body" style="padding:8px;">
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <label style="font-size:11px;min-width:50px;">Fade In:</label>
                                    <input type="range" id="snd-fade-in" min="0" max="5" step="0.1" value="0" style="width:100px;">
                                    <span id="snd-fade-in-lbl" style="font-size:11px;min-width:30px;">0s</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                                    <label style="font-size:11px;min-width:50px;">Fade Out:</label>
                                    <input type="range" id="snd-fade-out" min="0" max="5" step="0.1" value="0" style="width:100px;">
                                    <span id="snd-fade-out-lbl" style="font-size:11px;min-width:30px;">0s</span>
                                </div>
                                <button class="btn btn-sm btn-secondary" id="snd-apply-fade">Apply Fade</button>
                            </div>
                        </div>

                        <!-- Reverb -->
                        <div class="panel">
                            <div class="panel-header">Reverb</div>
                            <div class="panel-body" style="padding:8px;">
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <label style="font-size:11px;min-width:50px;">Duration:</label>
                                    <input type="range" id="snd-reverb-dur" min="0.1" max="5" step="0.1" value="1" style="width:100px;">
                                    <span id="snd-reverb-dur-lbl" style="font-size:11px;min-width:30px;">1s</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <label style="font-size:11px;min-width:50px;">Decay:</label>
                                    <input type="range" id="snd-reverb-decay" min="0.1" max="10" step="0.1" value="2" style="width:100px;">
                                    <span id="snd-reverb-decay-lbl" style="font-size:11px;min-width:30px;">2</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                                    <label style="font-size:11px;min-width:50px;">Mix:</label>
                                    <input type="range" id="snd-reverb-mix" min="0" max="1" step="0.05" value="0.3" style="width:100px;">
                                    <span id="snd-reverb-mix-lbl" style="font-size:11px;min-width:30px;">30%</span>
                                </div>
                                <button class="btn btn-sm btn-secondary" id="snd-apply-reverb">Apply Reverb</button>
                            </div>
                        </div>

                        <!-- Echo -->
                        <div class="panel">
                            <div class="panel-header">Echo</div>
                            <div class="panel-body" style="padding:8px;">
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <label style="font-size:11px;min-width:50px;">Delay:</label>
                                    <input type="range" id="snd-echo-delay" min="0.05" max="2" step="0.05" value="0.3" style="width:100px;">
                                    <span id="snd-echo-delay-lbl" style="font-size:11px;min-width:30px;">0.3s</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
                                    <label style="font-size:11px;min-width:50px;">Feedback:</label>
                                    <input type="range" id="snd-echo-feedback" min="0" max="0.9" step="0.05" value="0.4" style="width:100px;">
                                    <span id="snd-echo-feedback-lbl" style="font-size:11px;min-width:30px;">40%</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                                    <label style="font-size:11px;min-width:50px;">Mix:</label>
                                    <input type="range" id="snd-echo-mix" min="0" max="1" step="0.05" value="0.3" style="width:100px;">
                                    <span id="snd-echo-mix-lbl" style="font-size:11px;min-width:30px;">30%</span>
                                </div>
                                <button class="btn btn-sm btn-secondary" id="snd-apply-echo">Apply Echo</button>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <button class="btn btn-sm btn-secondary" id="snd-undo" disabled>↩ Undo to Original</button>
                        <button class="btn btn-sm btn-secondary" id="snd-normalize" disabled>Normalize</button>
                    </div>

                    <!-- Segments -->
                    <div class="panel" style="margin-top:8px;">
                        <div class="panel-header">Multi-Segment Export</div>
                        <div class="panel-body" style="padding:8px;">
                            <div style="display:grid;grid-template-columns:1fr 80px 80px auto;gap:6px;align-items:center;margin-bottom:6px;">
                                <input type="text" class="input input-sm" id="snd-seg-name" placeholder="Segment name">
                                <input type="number" class="input input-sm" id="snd-seg-start" placeholder="Start" value="0" min="0" step="0.01" title="Start (seconds)">
                                <input type="number" class="input input-sm" id="snd-seg-end" placeholder="End" value="0" min="0" step="0.01" title="End (seconds)">
                                <button class="btn btn-sm btn-secondary" id="snd-seg-add">+ Add</button>
                            </div>
                            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">Start / End in seconds. Files export to the same directory as the loaded sound.</div>
                            <div id="snd-seg-list" style="margin-bottom:8px;max-height:120px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;background:#0a0a0a;">
                                <div style="padding:8px;color:var(--text-muted);font-size:11px;">No segments defined</div>
                            </div>
                            <button class="btn btn-sm btn-primary" id="snd-seg-export-all" disabled>Export All Segments</button>
                        </div>
                    </div>

                    <!-- Sound info -->
                    <div class="panel" style="margin-top:8px;">
                        <div class="panel-header">Sound Info</div>
                        <div class="panel-body" style="padding:8px;font-size:11px;" id="snd-info">
                            <div style="color:var(--text-muted);">Select a sound file to begin editing</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <input type="file" id="snd-upload-input" accept="audio/*" style="display:none;">
    `;

    // Wire events
    document.getElementById('snd-upload-btn').addEventListener('click', () => document.getElementById('snd-upload-input').click());
    document.getElementById('snd-refresh-btn').addEventListener('click', loadSoundList);
    document.getElementById('snd-upload-input').addEventListener('change', handleUpload);
    document.getElementById('snd-play').addEventListener('click', play);
    document.getElementById('snd-stop').addEventListener('click', stop);
    document.getElementById('snd-loop').addEventListener('click', toggleLoop);
    document.getElementById('snd-save').addEventListener('click', saveCurrent);
    document.getElementById('snd-delete').addEventListener('click', deleteCurrent);
    document.getElementById('snd-zoom-in').addEventListener('click', () => { if (wavesurfer) wavesurfer.zoom(wavesurfer.options.minPxPerSec * 1.5); });
    document.getElementById('snd-zoom-out').addEventListener('click', () => { if (wavesurfer) wavesurfer.zoom(Math.max(1, wavesurfer.options.minPxPerSec / 1.5)); });

    document.getElementById('snd-apply-trim').addEventListener('click', applyTrim);
    document.getElementById('snd-apply-fade').addEventListener('click', applyFade);
    document.getElementById('snd-apply-reverb').addEventListener('click', applyReverb);
    document.getElementById('snd-apply-echo').addEventListener('click', applyEcho);
    document.getElementById('snd-undo').addEventListener('click', undoToOriginal);
    document.getElementById('snd-normalize').addEventListener('click', applyNormalize);
    document.getElementById('snd-seg-add').addEventListener('click', addSegment);
    document.getElementById('snd-seg-export-all').addEventListener('click', exportAllSegments);

    document.getElementById('snd-search').addEventListener('input', renderSoundList);

    // EQ controls (real-time)
    for (const band of ['low', 'mid', 'high']) {
        const slider = document.getElementById(`snd-eq-${band}`);
        if (slider) {
            slider.addEventListener('input', () => {
                const v = parseFloat(slider.value);
                document.getElementById(`snd-eq-${band}-lbl`).textContent = `${v > 0 ? '+' : ''}${v} dB`;
                updateEQNodes();
            });
        }
    }
    document.getElementById('snd-eq-reset').addEventListener('click', () => {
        document.getElementById('snd-eq-low').value = 0;
        document.getElementById('snd-eq-mid').value = 0;
        document.getElementById('snd-eq-high').value = 0;
        document.getElementById('snd-eq-low-lbl').textContent = '0 dB';
        document.getElementById('snd-eq-mid-lbl').textContent = '0 dB';
        document.getElementById('snd-eq-high-lbl').textContent = '0 dB';
        updateEQNodes();
    });

    // Slider labels
    for (const [id, lbl, suffix] of [
        ['snd-fade-in', 'snd-fade-in-lbl', 's'],
        ['snd-fade-out', 'snd-fade-out-lbl', 's'],
        ['snd-reverb-dur', 'snd-reverb-dur-lbl', 's'],
        ['snd-reverb-decay', 'snd-reverb-decay-lbl', ''],
        ['snd-reverb-mix', 'snd-reverb-mix-lbl', '%'],
        ['snd-echo-delay', 'snd-echo-delay-lbl', 's'],
        ['snd-echo-feedback', 'snd-echo-feedback-lbl', '%'],
        ['snd-echo-mix', 'snd-echo-mix-lbl', '%'],
    ]) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            document.getElementById(lbl).textContent = suffix === '%' ? `${Math.round(v * 100)}%` : `${v}${suffix}`;
        });
    }

    // Initialize spectrum analyzer
    initSpectrumAnalyzer();

    // Keyboard: space to play/pause
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space' && wavesurfer) { e.preventDefault(); wavesurfer.playPause(); }
    });
}

async function initWavesurfer() {
    if (wavesurfer) { wavesurfer.destroy(); wavesurfer = null; }
    const WaveSurfer = (await import('/node_modules/wavesurfer.js/dist/wavesurfer.esm.js')).default;
    wavesurfer = WaveSurfer.create({
        container: '#snd-waveform',
        waveColor: '#4aa4d8',
        progressColor: '#1a6fa0',
        cursorColor: '#7ecfff',
        height: 160,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        responsive: true,
        normalize: true,
    });

    wavesurfer.on('timeupdate', (time) => {
        const dur = wavesurfer.getDuration();
        document.getElementById('snd-time').textContent = `${fmtTime(time)} / ${fmtTime(dur)}`;
    });

    wavesurfer.on('ready', () => {
        const dur = wavesurfer.getDuration();
        document.getElementById('snd-trim-end').value = dur.toFixed(3);
        document.getElementById('snd-time').textContent = `0:00.000 / ${fmtTime(dur)}`;
    });

    return wavesurfer;
}

function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(3);
    return `${m}:${sec.padStart(6, '0')}`;
}

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

// ── Sound list ─────────────────────────────────────────────────────────────
async function loadSoundList() {
    try {
        const resp = await API.apiFetch('/api/sounds');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        soundList = data.sounds;
        renderSoundList();
    } catch (err) {
        API.toast('Failed to load sounds: ' + err.message, 'error');
    }
}

function renderSoundList() {
    const el = document.getElementById('snd-list');
    const filter = (document.getElementById('snd-search')?.value || '').toLowerCase();
    const filtered = filter ? soundList.filter(s => s.name.toLowerCase().includes(filter) || s.path.toLowerCase().includes(filter)) : soundList;

    // Group by category
    const groups = new Map();
    for (const s of filtered) {
        const cat = categorize(s);
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(s);
    }

    let html = '';
    for (const cat of CATEGORIES) {
        const items = groups.get(cat.key);
        if (!items || !items.length) continue;
        html += `<div style="padding:4px 8px;font-size:10px;font-weight:600;color:var(--accent);text-transform:uppercase;border-bottom:1px solid var(--border);">${cat.label}</div>`;
        for (const s of items) {
            const active = selectedSound?.path === s.path;
            html += `
                <div class="snd-item ${active ? 'active' : ''}" data-path="${s.path}"
                     style="padding:5px 8px;cursor:pointer;border-bottom:1px solid var(--border-subtle,#1a2030);font-size:12px;
                            ${active ? 'background:rgba(74,164,216,0.15);color:var(--accent);' : ''}">
                    <div>${s.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${s.dir}</div>
                </div>`;
        }
    }

    el.innerHTML = html || '<div style="padding:12px;color:var(--text-muted);">No sounds found</div>';
    el.querySelectorAll('.snd-item').forEach(item => {
        item.addEventListener('click', () => {
            const sound = soundList.find(s => s.path === item.dataset.path);
            if (sound) selectSound(sound);
        });
    });
}

async function selectSound(sound) {
    selectedSound = sound;
    renderSoundList();

    // Enable controls
    for (const id of ['snd-play', 'snd-stop', 'snd-loop', 'snd-zoom-in', 'snd-zoom-out', 'snd-save', 'snd-delete', 'snd-undo', 'snd-normalize']) {
        document.getElementById(id).disabled = false;
    }

    // Load into wavesurfer
    if (!wavesurfer) await initWavesurfer();
    wavesurfer.load(sound.path);

    // Also load into AudioContext for processing
    try {
        const resp = await fetch(sound.path);
        const arrayBuf = await resp.arrayBuffer();
        const actx = getAudioCtx();
        originalBuffer = await actx.decodeAudioData(arrayBuf);
        workingBuffer = copyBuffer(originalBuffer);
    } catch (err) {
        console.error('Failed to decode audio:', err);
    }

    // Info
    document.getElementById('snd-info').innerHTML = `
        <div><b>File:</b> ${sound.name}</div>
        <div><b>Path:</b> ${sound.path}</div>
        <div><b>Format:</b> ${sound.name.split('.').pop().toUpperCase()}</div>
    `;
}

function copyBuffer(buf) {
    const actx = getAudioCtx();
    const copy = actx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        copy.getChannelData(ch).set(buf.getChannelData(ch));
    }
    return copy;
}

// ── Transport ──────────────────────────────────────────────────────────────
function play() { if (wavesurfer) wavesurfer.play(); }
function stop() { if (wavesurfer) { wavesurfer.stop(); } }
let looping = false;
function toggleLoop() {
    looping = !looping;
    const btn = document.getElementById('snd-loop');
    btn.style.background = looping ? 'var(--accent)' : '';
    btn.style.color = looping ? '#fff' : '';
    // wavesurfer loop on finish
    if (wavesurfer) {
        if (looping) {
            wavesurfer.on('finish', () => { if (looping) wavesurfer.play(); });
        }
    }
}

// ── Effects ────────────────────────────────────────────────────────────────
function applyTrim() {
    if (!workingBuffer) return;
    const start = parseFloat(document.getElementById('snd-trim-start').value) || 0;
    const end = parseFloat(document.getElementById('snd-trim-end').value) || workingBuffer.duration;
    if (start >= end || start < 0) { API.toast('Invalid trim range', 'error'); return; }

    const actx = getAudioCtx();
    const sr = workingBuffer.sampleRate;
    const startSample = Math.floor(start * sr);
    const endSample = Math.min(Math.floor(end * sr), workingBuffer.length);
    const newLen = endSample - startSample;
    const trimmed = actx.createBuffer(workingBuffer.numberOfChannels, newLen, sr);
    for (let ch = 0; ch < workingBuffer.numberOfChannels; ch++) {
        trimmed.getChannelData(ch).set(workingBuffer.getChannelData(ch).subarray(startSample, endSample));
    }
    workingBuffer = trimmed;
    updateWaveform();
    API.toast('Trim applied', 'success');
    API.setDirty(true);
}

function applyFade() {
    if (!workingBuffer) return;
    const fadeIn = parseFloat(document.getElementById('snd-fade-in').value) || 0;
    const fadeOut = parseFloat(document.getElementById('snd-fade-out').value) || 0;
    const sr = workingBuffer.sampleRate;

    for (let ch = 0; ch < workingBuffer.numberOfChannels; ch++) {
        const data = workingBuffer.getChannelData(ch);
        // Fade in
        const fadeInSamples = Math.floor(fadeIn * sr);
        for (let i = 0; i < fadeInSamples && i < data.length; i++) {
            data[i] *= i / fadeInSamples;
        }
        // Fade out
        const fadeOutSamples = Math.floor(fadeOut * sr);
        const fadeOutStart = data.length - fadeOutSamples;
        for (let i = Math.max(0, fadeOutStart); i < data.length; i++) {
            data[i] *= (data.length - i) / fadeOutSamples;
        }
    }
    updateWaveform();
    API.toast('Fade applied', 'success');
    API.setDirty(true);
}

async function applyReverb() {
    if (!workingBuffer) return;
    const dur = parseFloat(document.getElementById('snd-reverb-dur').value);
    const decay = parseFloat(document.getElementById('snd-reverb-decay').value);
    const mix = parseFloat(document.getElementById('snd-reverb-mix').value);

    const actx = getAudioCtx();
    const sr = workingBuffer.sampleRate;
    const impLen = Math.floor(dur * sr);
    const impulse = actx.createBuffer(workingBuffer.numberOfChannels, impLen, sr);

    for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < impLen; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impLen, decay);
        }
    }

    // Offline convolution
    const outLen = workingBuffer.length + impLen;
    const offline = new OfflineAudioContext(workingBuffer.numberOfChannels, outLen, sr);
    const src = offline.createBufferSource();
    src.buffer = workingBuffer;
    const conv = offline.createConvolver();
    conv.buffer = impulse;

    const dry = offline.createGain();
    dry.gain.value = 1 - mix;
    const wet = offline.createGain();
    wet.gain.value = mix;

    src.connect(dry).connect(offline.destination);
    src.connect(conv).connect(wet).connect(offline.destination);
    src.start();

    const rendered = await offline.startRendering();
    workingBuffer = rendered;
    updateWaveform();
    API.toast('Reverb applied', 'success');
    API.setDirty(true);
}

async function applyEcho() {
    if (!workingBuffer) return;
    const delay = parseFloat(document.getElementById('snd-echo-delay').value);
    const feedback = parseFloat(document.getElementById('snd-echo-feedback').value);
    const mix = parseFloat(document.getElementById('snd-echo-mix').value);

    const actx = getAudioCtx();
    const sr = workingBuffer.sampleRate;
    const delaySamples = Math.floor(delay * sr);
    const echoRepeat = 6;
    const outLen = workingBuffer.length + delaySamples * echoRepeat;
    const result = actx.createBuffer(workingBuffer.numberOfChannels, outLen, sr);

    for (let ch = 0; ch < workingBuffer.numberOfChannels; ch++) {
        const src = workingBuffer.getChannelData(ch);
        const dst = result.getChannelData(ch);
        // Copy dry signal
        for (let i = 0; i < src.length; i++) dst[i] = src[i];
        // Add echoes
        let gain = mix;
        for (let rep = 1; rep <= echoRepeat; rep++) {
            const offset = delaySamples * rep;
            for (let i = 0; i < src.length; i++) {
                if (i + offset < dst.length) dst[i + offset] += src[i] * gain;
            }
            gain *= feedback;
        }
    }

    workingBuffer = result;
    updateWaveform();
    API.toast('Echo applied', 'success');
    API.setDirty(true);
}

function applyNormalize() {
    if (!workingBuffer) return;
    let max = 0;
    for (let ch = 0; ch < workingBuffer.numberOfChannels; ch++) {
        const data = workingBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            const abs = Math.abs(data[i]);
            if (abs > max) max = abs;
        }
    }
    if (max === 0) return;
    const gain = 1 / max;
    for (let ch = 0; ch < workingBuffer.numberOfChannels; ch++) {
        const data = workingBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) data[i] *= gain;
    }
    updateWaveform();
    API.toast('Normalized', 'success');
    API.setDirty(true);
}

function undoToOriginal() {
    if (!originalBuffer) return;
    workingBuffer = copyBuffer(originalBuffer);
    updateWaveform();
    API.toast('Reverted to original', 'info');
    API.setDirty(false);
}

function updateWaveform() {
    if (!wavesurfer || !workingBuffer) return;
    // Convert buffer to blob and reload
    bufferToWavBlob(workingBuffer).then(blob => {
        wavesurfer.loadBlob(blob);
    });
}

function bufferToWavBlob(buffer) {
    return new Promise(resolve => {
        const numCh = buffer.numberOfChannels;
        const sr = buffer.sampleRate;
        const len = buffer.length;
        const bytesPerSample = 2;
        const dataSize = len * numCh * bytesPerSample;
        const bufferSize = 44 + dataSize;
        const ab = new ArrayBuffer(bufferSize);
        const view = new DataView(ab);

        // WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);  // fmt chunk size
        view.setUint16(20, 1, true);   // PCM
        view.setUint16(22, numCh, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * numCh * bytesPerSample, true);
        view.setUint16(32, numCh * bytesPerSample, true);
        view.setUint16(34, 16, true);  // bits per sample
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Interleave channels
        let offset = 44;
        for (let s = 0; s < len; s++) {
            for (let ch = 0; ch < numCh; ch++) {
                const val = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[s]));
                view.setInt16(offset, val < 0 ? val * 0x8000 : val * 0x7FFF, true);
                offset += 2;
            }
        }
        resolve(new Blob([ab], { type: 'audio/wav' }));
    });
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// ── Save / Delete / Upload ─────────────────────────────────────────────────
async function saveCurrent() {
    if (!selectedSound || !workingBuffer) return;
    try {
        const blob = await bufferToWavBlob(workingBuffer);
        const reader = new FileReader();
        const b64 = await new Promise((res, rej) => {
            reader.onload = () => res(reader.result.split(',')[1]);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
        });

        // Keep saves in the same pipeline they came from.
        // Runtime audio still loads from /src/audio and /src/music, while asset-audio
        // remains available for editor-managed categorized libraries.
        let savePath = selectedSound.path;
        if (savePath.startsWith('/src/audio/') || savePath.startsWith('/src/music/')) {
            savePath = savePath.replace(/\.[^.]+$/, '.wav');
        } else {
            savePath = savePath.replace(/\.[^.]+$/, '.ogg');
        }

        const resp = await API.apiFetch('/api/sounds/save', {
            method: 'POST',
            body: JSON.stringify({ filePath: savePath, data: b64 }),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        API.toast(`Saved: ${savePath}`, 'success');
        API.recordSave();
        originalBuffer = copyBuffer(workingBuffer);
        // Update selected sound path and refresh list
        selectedSound = { ...selectedSound, name: savePath.split('/').pop(), path: savePath };
        await loadSoundList();
    } catch (err) {
        API.toast('Save failed: ' + err.message, 'error');
    }
}

async function deleteCurrent() {
    if (!selectedSound) return;
    if (!confirm(`Delete ${selectedSound.name}?`)) return;
    try {
        const resp = await API.apiFetch('/api/sounds', {
            method: 'DELETE',
            body: JSON.stringify({ filePath: selectedSound.path }),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        API.toast(`Deleted: ${selectedSound.name}`, 'success');
        selectedSound = null;
        if (wavesurfer) wavesurfer.empty();
        await loadSoundList();
    } catch (err) {
        API.toast('Delete failed: ' + err.message, 'error');
    }
}

async function handleUpload() {
    const file = document.getElementById('snd-upload-input').files[0];
    if (!file) return;

    const { body, footer, close } = API.showModal('Upload Sound');
    body.innerHTML = `
        <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">Filename:</label>
            <input type="text" id="sup-fname" class="input" value="${file.name}" style="width:100%;">
        </div>
        <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">Category:</label>
            <select id="sup-cat" class="input" style="width:100%;">
                <option value="assets/audio/sfx">Sound Effects (SFX) — /assets/audio/sfx/</option>
                <option value="assets/audio/ui">UI / Tracker Sounds — /assets/audio/ui/</option>
                <option value="assets/audio/ambient">Ambient / Atmosphere — /assets/audio/ambient/</option>
                <option value="assets/audio/music">Music / Themes — /assets/audio/music/</option>
                <option value="src/audio">Legacy — src/audio/</option>
                <option value="src/music">Legacy — src/music/</option>
            </select>
        </div>
    `;
    footer.innerHTML = `<button class="btn btn-secondary" id="sup-cancel">Cancel</button> <button class="btn btn-primary" id="sup-ok">Upload</button>`;
    document.getElementById('sup-cancel').onclick = close;
    document.getElementById('sup-ok').onclick = async () => {
        const fname = document.getElementById('sup-fname').value.trim();
        const dir = document.getElementById('sup-cat').value;
        if (!fname) { API.toast('Invalid filename', 'error'); return; }
        try {
            const formData = new FormData();
            formData.append('audio', file);
            formData.append('path', `/${dir}/${fname}`);
            const resp = await fetch('/api/sounds/upload', { method: 'POST', body: formData });
            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);
            API.toast(`Uploaded: ${fname}`, 'success'); API.recordSave(); close(); await loadSoundList();
        } catch (err) { API.toast('Upload failed: ' + err.message, 'error'); }
    };
    document.getElementById('snd-upload-input').value = '';
}

// ── Spectrum & EQ & Metering ──────────────────────────────────────────────────
let analyser = null;
let spectrumCanvas = null;
let spectrumCtx = null;
let eqNodes = { low: null, mid: null, high: null };
let analyserAnimId = null;

function initSpectrumAnalyzer() {
    spectrumCanvas = document.getElementById('snd-spectrum');
    if (!spectrumCanvas) return;
    spectrumCtx = spectrumCanvas.getContext('2d');
    drawSpectrum();
}

function setupEQChain() {
    if (!wavesurfer) return;
    const actx = getAudioCtx();

    // Create analyzer for spectrum display
    if (!analyser) analyser = actx.createAnalyser();
    analyser.fftSize = 256;

    // Create 3-band EQ nodes (low, mid, high shelf)
    if (!eqNodes.low) {
        eqNodes.low = actx.createBiquadFilter();
        eqNodes.low.type = 'lowshelf';
        eqNodes.low.frequency.value = 200;
        eqNodes.low.gain.value = 0;
    }
    if (!eqNodes.mid) {
        eqNodes.mid = actx.createBiquadFilter();
        eqNodes.mid.type = 'peaking';
        eqNodes.mid.frequency.value = 2000;
        eqNodes.mid.Q.value = 1;
        eqNodes.mid.gain.value = 0;
    }
    if (!eqNodes.high) {
        eqNodes.high = actx.createBiquadFilter();
        eqNodes.high.type = 'highshelf';
        eqNodes.high.frequency.value = 8000;
        eqNodes.high.gain.value = 0;
    }

    // Chain: EQ → analyser
    eqNodes.low.connect(eqNodes.mid);
    eqNodes.mid.connect(eqNodes.high);
    eqNodes.high.connect(analyser);

    // Start visualization loop
    if (!analyserAnimId) animateSpectrum();
}

function updateEQNodes() {
    if (!eqNodes.low || !eqNodes.mid || !eqNodes.high) setupEQChain();

    const low = parseFloat(document.getElementById('snd-eq-low').value) || 0;
    const mid = parseFloat(document.getElementById('snd-eq-mid').value) || 0;
    const high = parseFloat(document.getElementById('snd-eq-high').value) || 0;

    eqNodes.low.gain.value = Math.min(12, Math.max(-12, low));
    eqNodes.mid.gain.value = Math.min(12, Math.max(-12, mid));
    eqNodes.high.gain.value = Math.min(12, Math.max(-12, high));
}

function drawSpectrum() {
    if (!spectrumCanvas || !analyser) {
        spectrumCtx?.clearRect(0, 0, spectrumCanvas?.width || 0, spectrumCanvas?.height || 0);
        return;
    }

    const bufferLen = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLen);
    analyser.getByteFrequencyData(dataArray);

    const width = spectrumCanvas.width;
    const height = spectrumCanvas.height;
    spectrumCtx.fillStyle = '#0a0a0a';
    spectrumCtx.fillRect(0, 0, width, height);

    // Draw spectrum bars
    const barWidth = width / bufferLen * 2.5;
    let x = 0;
    spectrumCtx.fillStyle = '#4aa4d8';
    for (let i = 0; i < bufferLen; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        spectrumCtx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }

    // Border
    spectrumCtx.strokeStyle = 'var(--border, #333)';
    spectrumCtx.lineWidth = 1;
    spectrumCtx.strokeRect(0, 0, width, height);
}

function animateSpectrum() {
    drawSpectrum();
    calculateLoudness();
    analyserAnimId = requestAnimationFrame(animateSpectrum);
}

function calculateLoudness() {
    if (!analyser) return;

    const bufferLen = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLen);
    analyser.getByteFrequencyData(dataArray);

    // Calculate RMS (root mean square) → dB
    let sum = 0;
    for (let i = 0; i < bufferLen; i++) {
        const norm = dataArray[i] / 255;
        sum += norm * norm;
    }
    const rms = Math.sqrt(sum / bufferLen);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

    // Update meter display
    const meterDb = document.getElementById('snd-meter-db');
    const meterBar = document.querySelector('#snd-meter-db ~ div > div');

    if (meterDb) {
        if (db === -Infinity) {
            meterDb.textContent = '-∞ dB';
        } else {
            meterDb.textContent = `${db.toFixed(1)} dB`;
            meterDb.style.color = db > -3 ? '#ff4444' : (db > -6 ? '#ffcc00' : '#4fdb8e');
        }
    }

    if (meterBar) {
        // Map dB range -40 to 0 to bar width 0-100%
        const clampedDb = Math.max(-40, Math.min(0, db));
        const percent = ((clampedDb + 40) / 40) * 100;
        meterBar.style.width = `${percent}%`;
    }
}

// ── Segments ─────────────────────────────────────────────────────────────
function addSegment() {
    const name = document.getElementById('snd-seg-name').value.trim();
    const start = parseFloat(document.getElementById('snd-seg-start').value) || 0;
    const end = parseFloat(document.getElementById('snd-seg-end').value) || 0;
    if (!name) { API.toast('Enter a segment name', 'error'); return; }
    if (start >= end) { API.toast('Start must be less than end (seconds)', 'error'); return; }
    segments.push({ name, start, end });
    document.getElementById('snd-seg-name').value = '';
    renderSegments();
}

function removeSegment(index) {
    segments.splice(index, 1);
    renderSegments();
}

function renderSegments() {
    const el = document.getElementById('snd-seg-list');
    if (!el) return;
    if (!segments.length) {
        el.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:11px;">No segments defined</div>';
        const btn = document.getElementById('snd-seg-export-all');
        if (btn) btn.disabled = true;
        return;
    }
    el.innerHTML = segments.map((seg, i) => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border-subtle,#1a2030);font-size:11px;">
            <span style="flex:1;font-weight:600;">${seg.name}</span>
            <span style="color:var(--text-muted);">${seg.start.toFixed(2)}s &rarr; ${seg.end.toFixed(2)}s</span>
            <button class="btn btn-sm btn-danger" data-seg-idx="${i}" style="padding:2px 6px;font-size:10px;">✕</button>
        </div>`).join('');
    el.querySelectorAll('[data-seg-idx]').forEach(btn => {
        btn.addEventListener('click', () => removeSegment(parseInt(btn.dataset.segIdx)));
    });
    const exportBtn = document.getElementById('snd-seg-export-all');
    if (exportBtn) exportBtn.disabled = false;
}

async function exportAllSegments() {
    if (!workingBuffer) { API.toast('No audio loaded', 'error'); return; }
    if (!segments.length) { API.toast('No segments defined', 'error'); return; }
    const actx = getAudioCtx();
    let successCount = 0;
    for (const seg of segments) {
        try {
            const sr = workingBuffer.sampleRate;
            const startSample = Math.floor(seg.start * sr);
            const endSample = Math.min(Math.floor(seg.end * sr), workingBuffer.length);
            const newLen = endSample - startSample;
            if (newLen <= 0) { API.toast(`Segment "${seg.name}": zero-length, skipped`, 'error'); continue; }
            const segBuf = actx.createBuffer(workingBuffer.numberOfChannels, newLen, sr);
            for (let ch = 0; ch < workingBuffer.numberOfChannels; ch++) {
                segBuf.getChannelData(ch).set(workingBuffer.getChannelData(ch).subarray(startSample, endSample));
            }
            const blob = await bufferToWavBlob(segBuf);
            const reader = new FileReader();
            const b64 = await new Promise((res, rej) => {
                reader.onload = () => res(reader.result.split(',')[1]);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
            });
            // Derive export dir from selected sound path, fallback to assets/audio/sfx
            const baseDir = selectedSound
                ? selectedSound.path.replace(/\/[^\/]+$/, '')
                : '/assets/audio/sfx';
            const segName = seg.name.includes('.') ? seg.name : `${seg.name}.ogg`;
            const savePath = `${baseDir}/${segName}`;
            const resp = await API.apiFetch('/api/sounds/save', {
                method: 'POST',
                body: JSON.stringify({ filePath: savePath, data: b64 }),
            });
            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);
            successCount++;
        } catch (err) {
            API.toast(`Segment "${seg.name}" failed: ${err.message}`, 'error');
        }
    }
    if (successCount > 0) {
        API.toast(`Exported ${successCount} of ${segments.length} segment(s)`, 'success');
        await loadSoundList();
    }
}

// ── Exports ────────────────────────────────────────────────────────────────
export default {
    render(root) { buildUI(root); },
    async onShow() { await loadSoundList(); setupEQChain(); },
    onHide() { if (wavesurfer) wavesurfer.pause(); if (analyserAnimId) cancelAnimationFrame(analyserAnimId); },
    async save() { if (selectedSound && workingBuffer) await saveCurrent(); },
};
