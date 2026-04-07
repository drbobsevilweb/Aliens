import re

with open("sound/index.html", "r") as f:
    text = f.read()

# Replace block with trim UI
text = re.sub(
    r'<div class="fx-section">\s*<button class="btn fx-toggle" type="button"><span>⚙ FX</span><span class="fx-arrow">▶</span></button>[\s\S]*?<div class="fx-grid">[\s\S]*?<div class="fx-row"><label class="fx-label">Echo feedback</label><input type="number" class="fx-input fx-echo-fb" min="0" max="0.9" step="0.05" value="0"></div>\s*</div>\s*</div>\s*</div>',
    """<div class="fx-section">
                        <button class="btn fx-toggle" type="button"><span>⚙ FX & Trim</span><span class="fx-arrow">▶</span></button>
                        <div class="fx-body" style="display:none;">
                            <div class="fx-grid">
                                <div class="fx-row"><label class="fx-label">Reverb (wet %)</label><input type="number" class="fx-input fx-reverb" min="0" max="100" step="1" value="0"></div>
                                <div class="fx-row"><label class="fx-label">Echo delay (ms)</label><input type="number" class="fx-input fx-echo-delay" min="0" max="2000" step="10" value="0"></div>
                                <div class="fx-row"><label class="fx-label">Echo feedback</label><input type="number" class="fx-input fx-echo-fb" min="0" max="0.9" step="0.05" value="0"></div>
                                <div class="fx-row" style="margin-top:8px; grid-column: 1 / -1;"><strong class="fx-label" style="color:var(--accent);">Trim & Fade</strong></div>
                                <div class="fx-row"><label class="fx-label">Start (0-1)</label><input type="number" class="fx-input trim-start" min="0" max="0.99" step="0.01" value="0"></div>
                                <div class="fx-row"><label class="fx-label">End (0-1)</label><input type="number" class="fx-input trim-end" min="0.01" max="1" step="0.01" value="1"></div>
                                <div class="fx-row"><label class="fx-label">Fade In (ms)</label><input type="number" class="fx-input trim-fadein" min="0" max="5000" step="10" value="0"></div>
                                <div class="fx-row"><label class="fx-label">Fade Out (ms)</label><input type="number" class="fx-input trim-fadeout" min="0" max="5000" step="10" value="0"></div>
                            </div>
                        </div>
                    </div>""",
    text
)

text = re.sub(
    r'(fxState\.set\(path, \{ \.\.\.\(fxState\.get\(path\) \|\| \{\}\), echoFeedback: parseFloat\(e\.target\.value\) \|\| 0 \}\);\n\s*\}\);)',
    r'''\1
                
                trimState.set(path, trimState.get(path) || { trimStart: 0, trimEnd: 1, fadeIn: 0, fadeOut: 0 });
                const vStart = card.querySelector('.trim-start');
                const vEnd = card.querySelector('.trim-end');
                const vFadeIn = card.querySelector('.trim-fadein');
                const vFadeOut = card.querySelector('.trim-fadeout');
                if (vStart) vStart.addEventListener('input', e => {
                    trimState.set(path, { ...(trimState.get(path) || {}), trimStart: parseFloat(e.target.value) || 0 });
                });
                if (vEnd) vEnd.addEventListener('input', e => {
                    trimState.set(path, { ...(trimState.get(path) || {}), trimEnd: parseFloat(e.target.value) || 1 });
                });
                if (vFadeIn) vFadeIn.addEventListener('input', e => {
                    trimState.set(path, { ...(trimState.get(path) || {}), fadeIn: parseFloat(e.target.value) || 0 });
                });
                if (vFadeOut) vFadeOut.addEventListener('input', e => {
                    trimState.set(path, { ...(trimState.get(path) || {}), fadeOut: parseFloat(e.target.value) || 0 });
                });''',
    text
)

with open("sound/index.html", "w") as f:
    f.write(text)

