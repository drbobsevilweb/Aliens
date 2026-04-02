/**
 * Sprites Tab — Viewer, uploader, and marine-reference comparison tool.
 * All operations save directly to the server via /api/sprites/*.
 */

const API = window.editorAPI;

let container = null;
let spriteList = [];
let marineRef = null;
let selectedSprite = null;
let compareCanvas = null;
let compareCtx = null;
let scaleSlider = null;
let marineImg = null;
let spriteImg = null;
let uploadInput = null;

function buildUI(root) {
    container = root;
    root.innerHTML = `
        <div class="layout-split" style="height:100%">
            <aside class="sidebar" style="width:260px; min-width:200px; display:flex; flex-direction:column;">
                <div class="panel" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="panel-header">
                        <span>Sprites</span>
                        <div style="display:flex;gap:4px;">
                            <button class="btn btn-sm btn-primary" id="spr-upload-btn" title="Upload sprite">+ Upload</button>
                            <button class="btn btn-sm btn-secondary" id="spr-refresh-btn" title="Refresh list">↻</button>
                        </div>
                    </div>
                    <div style="padding:4px 8px;">
                        <select id="spr-category" class="input-sm" style="width:100%;margin-bottom:4px;">
                            <option value="game" selected>Game Sprites</option>
                            <option value="marine">Marines</option>
                            <option value="alien">Aliens</option>
                            <option value="tile">Tiles/Walls</option>
                            <option value="prop">Props</option>
                            <option value="all">All Files</option>
                        </select>
                    </div>
                    <div class="panel-body" style="flex:1; overflow-y:auto; padding:0;">
                        <div id="spr-list"></div>
                    </div>
                </div>
            </aside>

            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div class="toolbar" id="spr-toolbar">
                    <div class="toolbar-group">
                        <label class="toolbar-label">Scale:</label>
                        <input type="range" id="spr-scale" min="0.1" max="5" step="0.1" value="1" style="width:140px;">
                        <span id="spr-scale-lbl" class="toolbar-label" style="min-width:45px;">1.0x</span>
                    </div>
                    <div class="toolbar-group">
                        <label class="toolbar-label">Background:</label>
                        <select id="spr-bg" class="input-sm">
                            <option value="#1a1a2e">Dark</option>
                            <option value="#333">Gray</option>
                            <option value="#0a0a0a">Black</option>
                            <option value="checker">Checker</option>
                        </select>
                    </div>
                    <div class="toolbar-group">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                            <input type="checkbox" id="spr-show-marine" checked> Marine Ref
                        </label>
                    </div>
                    <div class="toolbar-group" style="margin-left:auto;">
                        <button class="btn btn-sm btn-primary" id="spr-save-btn" disabled>Save Scaled</button>
                        <button class="btn btn-sm btn-danger" id="spr-del-btn" disabled>Delete</button>
                    </div>
                </div>

                <div class="canvas-wrap" id="spr-canvas-wrap" style="flex:1; overflow:auto; display:flex; align-items:center; justify-content:center;">
                    <canvas id="spr-canvas" width="512" height="512"></canvas>
                </div>

                <div class="panel" style="max-height:100px;">
                    <div class="panel-body" style="display:flex; gap:20px; padding:6px 12px; font-size:12px;">
                        <div>
                            <div style="color:var(--accent);font-weight:600;">Marine Reference</div>
                            <div id="spr-marine-info" style="color:var(--text-muted);">Loading…</div>
                        </div>
                        <div style="border-left:1px solid var(--border);"></div>
                        <div>
                            <div style="color:var(--accent);font-weight:600;">Selected Sprite</div>
                            <div id="spr-selected-info" style="color:var(--text-muted);">None selected</div>
                        </div>
                        <div style="border-left:1px solid var(--border);"></div>
                        <div>
                            <div style="color:var(--accent);font-weight:600;">Comparison</div>
                            <div id="spr-compare-info" style="color:var(--text-muted);">—</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <input type="file" id="spr-upload-input" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;">
    `;

    compareCanvas = document.getElementById('spr-canvas');
    compareCtx = compareCanvas.getContext('2d');
    scaleSlider = document.getElementById('spr-scale');
    uploadInput = document.getElementById('spr-upload-input');

    scaleSlider.addEventListener('input', () => {
        document.getElementById('spr-scale-lbl').textContent = `${parseFloat(scaleSlider.value).toFixed(1)}x`;
        drawCompare();
    });
    document.getElementById('spr-bg').addEventListener('change', drawCompare);
    document.getElementById('spr-show-marine').addEventListener('change', drawCompare);
    document.getElementById('spr-upload-btn').addEventListener('click', () => uploadInput.click());
    document.getElementById('spr-refresh-btn').addEventListener('click', loadSpriteList);
    document.getElementById('spr-save-btn').addEventListener('click', saveScaledSprite);
    document.getElementById('spr-del-btn').addEventListener('click', deleteSprite);
    document.getElementById('spr-category').addEventListener('change', renderList);
    uploadInput.addEventListener('change', handleUpload);

    // Add "Edit in Piskel" button to toolbar
    const toolbarGroup = document.querySelector('.toolbar-group');
    if (toolbarGroup) {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-secondary';
        editBtn.textContent = '✎ Edit in Piskel';
        editBtn.id = 'spr-edit-piskel-btn';
        editBtn.disabled = true;
        editBtn.title = 'Open selected sprite in Piskel editor';
        toolbarGroup.parentNode.querySelector('.toolbar-group:last-child').insertBefore(editBtn, toolbarGroup.parentNode.querySelector('.toolbar-group:last-child').firstChild);
        editBtn.addEventListener('click', openPiskelEditor);
    }

    const wrap = document.getElementById('spr-canvas-wrap');
    const ro = new ResizeObserver(() => {
        compareCanvas.width = Math.max(400, wrap.clientWidth - 32);
        compareCanvas.height = Math.max(300, wrap.clientHeight - 16);
        drawCompare();
    });
    ro.observe(wrap);
}

async function loadMarineRef() {
    try {
        const resp = await API.apiFetch('/api/sprites/marine-reference');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        marineRef = data;
        marineImg = new Image();
        marineImg.crossOrigin = 'anonymous';
        await new Promise((res, rej) => { marineImg.onload = res; marineImg.onerror = rej; marineImg.src = data.path; });
        const gdw = data.gameDisplayWidth || data.frameWidth;
        const gdh = data.gameDisplayHeight || data.frameHeight;
        document.getElementById('spr-marine-info').textContent =
            `${data.frameWidth}×${data.frameHeight}px source | In-game: ${gdw}×${gdh}px | ${data.frameCount} frames`;
    } catch (err) {
        document.getElementById('spr-marine-info').textContent = 'Failed to load';
    }
}

async function loadSpriteList() {
    try {
        const resp = await API.apiFetch('/api/sprites');
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error);
        spriteList = data.sprites;
        renderList();
    } catch (err) {
        API.toast('Failed to load sprites: ' + err.message, 'error');
    }
}

function renderList() {
    const el = document.getElementById('spr-list');
    const cat = document.getElementById('spr-category')?.value || 'game';
    let filtered = spriteList;
    if (cat === 'game') {
        filtered = spriteList.filter(s => s.category === 'marine' || s.category === 'alien');
    } else if (cat !== 'all') {
        filtered = spriteList.filter(s => s.category === cat);
    }
    if (!filtered.length) { el.innerHTML = '<div style="padding:12px;color:var(--text-muted);">No sprites in this category</div>'; return; }
    el.innerHTML = filtered.map((s) => {
        const idx = spriteList.indexOf(s);
        return `
        <div class="sprite-item ${selectedSprite?.path === s.path ? 'active' : ''}" data-idx="${idx}"
             style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);">
            <img src="${s.path}" alt="" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated;">
            <div style="overflow:hidden;">
                <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
                <div style="font-size:10px;color:var(--text-muted);">${s.dir}</div>
            </div>
        </div>
    `;
    }).join('');
    el.querySelectorAll('.sprite-item').forEach(item => {
        item.addEventListener('click', () => selectSprite(spriteList[parseInt(item.dataset.idx)]));
    });
}

async function selectSprite(sprite) {
    selectedSprite = sprite;
    renderList();
    document.getElementById('spr-save-btn').disabled = false;
    document.getElementById('spr-del-btn').disabled = false;
    document.getElementById('spr-edit-piskel-btn').disabled = false;

    spriteImg = new Image();
    spriteImg.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { spriteImg.onload = res; spriteImg.onerror = rej; spriteImg.src = sprite.path + '?t=' + Date.now(); });
    document.getElementById('spr-selected-info').textContent = `${spriteImg.naturalWidth}×${spriteImg.naturalHeight}px | ${sprite.name}`;
    drawCompare();
}

function drawCompare() {
    if (!compareCanvas || !compareCtx) return;
    const ctx = compareCtx;
    const cw = compareCanvas.width;
    const ch = compareCanvas.height;
    const bg = document.getElementById('spr-bg').value;
    const showMarine = document.getElementById('spr-show-marine')?.checked;

    // Background
    if (bg === 'checker') {
        for (let y = 0; y < ch; y += 16) for (let x = 0; x < cw; x += 16) {
            ctx.fillStyle = ((x / 16 + y / 16) % 2 === 0) ? '#1a1a2e' : '#16162a';
            ctx.fillRect(x, y, 16, 16);
        }
    } else { ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch); }

    const scale = parseFloat(scaleSlider.value);
    const cx = cw / 2, cy = ch / 2;

    // Grid
    ctx.strokeStyle = 'rgba(74,164,216,0.12)'; ctx.lineWidth = 1;
    for (let x = cx % 64; x < cw; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
    for (let y = cy % 64; y < ch; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }

    // Baseline
    let baselineY = cy;

    // Marine ref — draw at in-game display size, not raw pixel size
    if (showMarine && marineImg && marineRef) {
        const mw = marineRef.gameDisplayWidth || marineRef.frameWidth;
        const mh = marineRef.gameDisplayHeight || marineRef.frameHeight;
        const mx = cx - mw - 30;
        const my = cy - mh / 2;
        baselineY = my + mh;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(marineImg, 0, 0, marineRef.frameWidth, marineRef.frameHeight, mx, my, mw, mh);
        ctx.fillStyle = '#33ff66'; ctx.font = '11px "Share Tech Mono",monospace';
        ctx.fillText(`Marine in-game (${mw}×${mh})`, mx, my - 6);
        ctx.strokeStyle = 'rgba(51,255,102,0.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(mx - .5, my - .5, mw + 1, mh + 1);
    }

    // Selected sprite
    if (spriteImg) {
        const sw = spriteImg.naturalWidth * scale, sh = spriteImg.naturalHeight * scale;
        const sx = showMarine ? cx + 30 : cx - sw / 2;
        const sy = (showMarine && marineRef) ? baselineY - sh : cy - sh / 2;
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.drawImage(spriteImg, sx, sy, sw, sh);
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#7ecfff'; ctx.font = '11px "Share Tech Mono",monospace';
        ctx.fillText(`${selectedSprite?.name || 'Sprite'} (${Math.round(sw)}×${Math.round(sh)}) @ ${scale.toFixed(1)}x`, sx, sy - 6);
        ctx.strokeStyle = 'rgba(126,207,255,0.5)'; ctx.lineWidth = 1;
        ctx.strokeRect(sx - .5, sy - .5, sw + 1, sh + 1);

        // Baseline comparison line
        if (showMarine && marineRef) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(0, baselineY); ctx.lineTo(cw, baselineY); ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Update info
    const info = document.getElementById('spr-compare-info');
    if (spriteImg && marineRef) {
        const sw = Math.round(spriteImg.naturalWidth * scale), sh = Math.round(spriteImg.naturalHeight * scale);
        const gmw = marineRef.gameDisplayWidth || marineRef.frameWidth;
        const gmh = marineRef.gameDisplayHeight || marineRef.frameHeight;
        info.textContent = `Scaled: ${sw}×${sh}px | vs Marine in-game (${gmw}×${gmh}): ${(sw / gmw).toFixed(2)}x W, ${(sh / gmh).toFixed(2)}x H`;
    } else { info.textContent = '—'; }
}

async function handleUpload() {
    const file = uploadInput.files[0];
    if (!file) return;
    const { body, footer, close } = API.showModal('Upload Sprite');
    body.innerHTML = `
        <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">Filename:</label>
            <input type="text" id="up-fname" class="input" value="${file.name.replace(/[^a-zA-Z0-9_\-. ]/g, '')}" style="width:100%;">
        </div>
        <div style="margin-bottom:12px;">
            <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">Directory:</label>
            <select id="up-dir" class="input" style="width:100%;">
                <option value="src/graphics">src/graphics</option>
                <option value="src/graphics/generated">src/graphics/generated</option>
                <option value="src/graphics/imported">src/graphics/imported</option>
            </select>
        </div>
        <canvas id="up-preview" style="max-width:200px;max-height:200px;border:1px solid var(--border);image-rendering:pixelated;"></canvas>
    `;
    footer.innerHTML = `<button class="btn btn-secondary" id="up-cancel">Cancel</button> <button class="btn btn-primary" id="up-ok">Upload</button>`;
    const prev = document.getElementById('up-preview');
    const pCtx = prev.getContext('2d');
    const img = new Image();
    img.onload = () => { prev.width = img.naturalWidth; prev.height = img.naturalHeight; pCtx.drawImage(img, 0, 0); };
    img.src = URL.createObjectURL(file);
    document.getElementById('up-cancel').onclick = close;
    document.getElementById('up-ok').onclick = async () => {
        const fname = document.getElementById('up-fname').value.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '');
        const dir = document.getElementById('up-dir').value;
        if (!fname) { API.toast('Invalid filename', 'error'); return; }
        try {
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
            const resp = await API.apiFetch('/api/sprites/save', { method: 'POST', body: JSON.stringify({ filename: fname, dir, dataUrl }) });
            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);
            API.toast(`Uploaded: ${fname}`, 'success'); API.recordSave(); close(); await loadSpriteList();
        } catch (err) { API.toast('Upload failed: ' + err.message, 'error'); }
    };
    uploadInput.value = '';
}

async function saveScaledSprite() {
    if (!selectedSprite || !spriteImg) return;
    const scale = parseFloat(scaleSlider.value);
    if (scale === 1) { API.toast('Scale is 1.0x — no change to save', 'info'); return; }
    const nw = Math.round(spriteImg.naturalWidth * scale), nh = Math.round(spriteImg.naturalHeight * scale);
    const oc = document.createElement('canvas'); oc.width = nw; oc.height = nh;
    const octx = oc.getContext('2d'); octx.imageSmoothingEnabled = scale < 1;
    octx.drawImage(spriteImg, 0, 0, nw, nh);
    try {
        const resp = await API.apiFetch('/api/sprites/save', {
            method: 'POST',
            body: JSON.stringify({ filename: selectedSprite.name, dir: selectedSprite.dir, dataUrl: oc.toDataURL('image/png') }),
        });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        API.toast(`Saved ${selectedSprite.name} at ${scale}x (${nw}×${nh}px)`, 'success'); API.recordSave();
        scaleSlider.value = 1; document.getElementById('spr-scale-lbl').textContent = '1.0x';
        await selectSprite(selectedSprite);
    } catch (err) { API.toast('Save failed: ' + err.message, 'error'); }
}

async function deleteSprite() {
    if (!selectedSprite) return;
    if (!confirm(`Delete ${selectedSprite.name}?`)) return;
    try {
        const resp = await API.apiFetch(`/api/sprites/${encodeURIComponent(selectedSprite.dir)}/${encodeURIComponent(selectedSprite.name)}`, { method: 'DELETE' });
        const result = await resp.json();
        if (!result.ok) throw new Error(result.error);
        API.toast(`Deleted ${selectedSprite.name}`, 'success');
        selectedSprite = null; spriteImg = null;
        document.getElementById('spr-save-btn').disabled = true;
        document.getElementById('spr-del-btn').disabled = true;
        drawCompare(); await loadSpriteList();
    } catch (err) { API.toast('Delete failed: ' + err.message, 'error'); }
}

// ── Piskel.js Integration ─────────────────────────────────────────────────
let piskelWindow = null;
let piskelEditorState = null;  // Track Piskel state during edit session

async function openPiskelEditor() {
    if (!selectedSprite || !spriteImg) {
        API.toast('No sprite selected', 'error');
        return;
    }

    // Convert sprite image to canvas imagedata
    const cv = document.createElement('canvas');
    cv.width = spriteImg.naturalWidth;
    cv.height = spriteImg.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(spriteImg, 0, 0);
    const imageData = ctx.getImageData(0, 0, cv.width, cv.height);

    // Create modal with Piskel iframe
    const { body, footer, close } = API.showModal(`Edit: ${selectedSprite.name}`, { width: '90vw' });
    body.innerHTML = `
        <div style="position:relative;width:100%;height:600px;border:1px solid var(--border);background:#0a0a0a;overflow:hidden;">
            <iframe id="piskel-iframe"
                    src="https://www.piskelapp.com/?embed"
                    style="width:100%;height:100%;border:none;background:#0a0a0a;"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms">
            </iframe>
        </div>
        <div style="margin-top:12px;padding:8px;background:var(--bg-secondary);border-radius:4px;font-size:11px;color:var(--text-muted);">
            <strong>Workflow:</strong> Edit your sprite in Piskel, then click "File" → "Export as PNG" to download. Upload the PNG file back below.
        </div>
        <div style="margin-top:12px;">
            <input type="file" id="piskel-import-input" accept="image/png" style="display:none;">
            <button class="btn btn-sm btn-secondary" id="piskel-upload-btn">Upload Edited Sprite</button>
        </div>
    `;
    footer.innerHTML = `
        <button class="btn btn-secondary" id="piskel-cancel">Cancel</button>
        <button class="btn btn-primary" id="piskel-save" disabled>Save Changes</button>
    `;

    const importInput = document.getElementById('piskel-import-input');
    const uploadBtn = document.getElementById('piskel-upload-btn');
    const saveBtn = document.getElementById('piskel-save');
    const cancelBtn = document.getElementById('piskel-cancel');

    uploadBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const dataUrl = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = rej;
                r.readAsDataURL(file);
            });

            // Create image to verify it loaded
            const img = new Image();
            await new Promise((res, rej) => {
                img.onload = res;
                img.onerror = rej;
                img.src = dataUrl;
            });

            // Store for saving
            piskelEditorState = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
            saveBtn.disabled = false;
            API.toast(`Loaded ${file.name} (${img.naturalWidth}×${img.naturalHeight}px)`, 'success');
        } catch (err) {
            API.toast('Failed to load image: ' + err.message, 'error');
        }
    });

    saveBtn.addEventListener('click', async () => {
        if (!piskelEditorState) return;

        try {
            // Save the edited sprite
            const resp = await API.apiFetch('/api/sprites/save', {
                method: 'POST',
                body: JSON.stringify({
                    filename: selectedSprite.name,
                    dir: selectedSprite.dir,
                    dataUrl: piskelEditorState.dataUrl,
                }),
            });

            const result = await resp.json();
            if (!result.ok) throw new Error(result.error);

            API.toast(`Saved ${selectedSprite.name}`, 'success');
            API.recordSave();
            close();

            // Reload sprite
            await selectSprite(selectedSprite);
            piskelEditorState = null;
        } catch (err) {
            API.toast('Save failed: ' + err.message, 'error');
        }
    });

    cancelBtn.addEventListener('click', () => {
        piskelEditorState = null;
        close();
    });

    // Try to load sprite data into Piskel (future enhancement)
    const iframe = document.getElementById('piskel-iframe');
    if (iframe && iframe.contentWindow) {
        // Note: Direct image load to Piskel is complex due to CORS/sandbox restrictions
        // For now, user exports from Piskel and uploads
        API.setStatus('Loading Piskel editor... You can import the image via "File" → "Import" in Piskel if needed');
    }
}

export default {
    render(root) { buildUI(root); },
    async onShow() { await Promise.all([loadMarineRef(), loadSpriteList()]); drawCompare(); },
    onHide() { piskelEditorState = null; },
    async save() {},
};
