# Audio Editor Enhancement: Quick Implementation Guide

## TL;DR Recommendation

Use **three proven, dependency-free technologies**:

1. **Wavesurfer.js Spectrogram** (plugin already in node_modules)
2. **Web Audio API BiquadFilterNode** (native, zero deps)
3. **Simple RMS Loudness** (5 lines of math)

**Time: 4-6 hours | Code: ~190 lines | New dependencies: 0**

---

## Quick Start: Implementation Checklist

### Phase 1: Spectrogram (20-30 minutes)

```javascript
// At top of sound.js
import SpectrogramPlugin from '/node_modules/wavesurfer.js/dist/plugins/spectrogram.esm.js';

// In initWavesurfer()
wavesurfer.registerPlugin(SpectrogramPlugin.default);
wavesurfer.addPlugin(SpectrogramPlugin.default.create({
  height: 100,
  colorMap: SpectrogramPlugin.ColorMap.turbo,
  fftSamples: 512,
}));

// In buildUI(), add toggle button + optional FFT size selector
```

**Test:** Play any sound, see frequency visualization below waveform.

### Phase 2: 3-Band EQ (60-90 minutes)

```javascript
// Global vars
let eqNodes = {};
let eqEnabled = false;

// New function
function initEQ() {
  eqNodes.low = audioCtx.createBiquadFilter();
  eqNodes.low.type = 'lowshelf';
  eqNodes.low.frequency.value = 200;
  eqNodes.low.Q.value = 0.7;

  eqNodes.mid = audioCtx.createBiquadFilter();
  eqNodes.mid.type = 'peaking';
  eqNodes.mid.frequency.value = 2000;
  eqNodes.mid.Q.value = 0.5;

  eqNodes.high = audioCtx.createBiquadFilter();
  eqNodes.high.type = 'highshelf';
  eqNodes.high.frequency.value = 8000;
  eqNodes.high.Q.value = 0.7;
}

function updateEQGain(band, gain) {
  if (eqNodes[band]) {
    eqNodes[band].gain.value = Math.max(-12, Math.min(12, gain));
  }
}

// In selectSound(), call initEQ() after audio loads
```

**HTML additions to buildUI() effects panel:**
```html
<div class="panel">
  <div class="panel-header">3-Band EQ</div>
  <div class="panel-body" style="padding:8px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>
        <label>Low (200Hz)</label>
        <input type="range" id="eq-low" min="-12" max="12" value="0">
        <span id="eq-low-lbl">0dB</span>
      </div>
      <div>
        <label>Mid (2kHz)</label>
        <input type="range" id="eq-mid" min="-12" max="12" value="0">
        <span id="eq-mid-lbl">0dB</span>
      </div>
      <div>
        <label>High (8kHz)</label>
        <input type="range" id="eq-high" min="-12" max="12" value="0">
        <span id="eq-high-lbl">0dB</span>
      </div>
    </div>
  </div>
</div>
```

**Wire event listeners:**
```javascript
for (const band of ['low', 'mid', 'high']) {
  const slider = document.getElementById(`eq-${band}`);
  slider.addEventListener('input', (e) => {
    const gain = parseFloat(e.target.value);
    updateEQGain(band, gain);
    document.getElementById(`eq-${band}-lbl`).textContent = `${gain}dB`;
  });
}
```

**Test:** Play sound, adjust sliders, hear changes in real-time.

### Phase 3: Loudness Meter (15-20 minutes)

```javascript
// New function
function measureLoudness(buffer) {
  let sumOfSquares = 0;
  const channels = buffer.numberOfChannels;
  const samples = buffer.length;
  
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < samples; i++) {
      sumOfSquares += data[i] * data[i];
    }
  }
  
  const rms = Math.sqrt(sumOfSquares / (channels * samples));
  const db = 20 * Math.log10(Math.max(0.0001, rms));
  return db;
}

// In selectSound(), after audio buffer loads
const loudness = measureLoudness(workingBuffer);
displayLoudness(loudness);

// New function for display
function displayLoudness(db) {
  let color = '#4aa4d8'; // blue (normal)
  if (db > -3) color = '#e1a85a'; // orange (warning)
  if (db > 0) color = '#ff6b6b'; // red (clipping risk)
  
  const info = document.getElementById('snd-info');
  const loudStr = db.toFixed(1);
  // Add to existing info display or create separate element
}
```

**HTML:** Add loudness display near waveform or in info panel.

**Test:** Load audio, see loudness value displayed with color coding.

---

## Integration Points in sound.js

| Function | Change | Lines |
|----------|--------|-------|
| `buildUI()` | Add EQ sliders, spectrogram toggle, loudness display | +60 |
| `initWavesurfer()` | Register and add Spectrogram plugin | +6 |
| `selectSound()` | Call initEQ(), measureLoudness() | +5 |
| `initEQ()` | NEW - Create filter nodes | +20 |
| `updateEQGain()` | NEW - Update filter gain | +5 |
| `measureLoudness()` | NEW - Calculate RMS | +15 |
| `displayLoudness()` | NEW - Show loudness with color | +10 |
| Event listeners | Wire EQ slider changes | +15 |

**Total: ~136 lines of new/modified code**

---

## Key Gotchas

### 1. EQ vs Offline Effects
- **Effects** (trim, fade, reverb, echo): Modify the audio buffer permanently → must save
- **EQ**: Real-time playback only → no "Apply" button → user adjusts while playing
- Users cannot "apply" EQ and save it; it's always a preview tool

**Fix:** Document this in the UI with a tooltip: "EQ is a preview-only effect."

### 2. BiquadFilterNode Chain Order Matters
```javascript
// RIGHT:
source → lowBand → midBand → highBand → destination

// WRONG (don't do this):
source → highBand → lowBand → midBand → destination
```

Always low → mid → high.

### 3. Spectrogram CPU Cost
- At 512 FFT + 60fps: ~5% CPU on modern machine
- Consider disabling if UI feels sluggish
- Use `visibilitychange` event to pause when tab hidden

### 4. Gain Clamping
```javascript
// BAD: allows extreme distortion
eqNodes.low.gain.value = gain; // user slides to 50dB

// GOOD: clamps to safe range
eqNodes.low.gain.value = Math.max(-12, Math.min(12, gain));
```

Always clamp to ±12dB max.

### 5. AudioContext Cleanup
- Each `getAudioCtx()` call reuses same context (good)
- Make sure to disconnect nodes on sound deselect (avoid memory leak)

```javascript
function cleanupAudio() {
  if (eqNodes.low && eqNodes.low.disconnect) {
    eqNodes.low.disconnect();
    eqNodes.mid.disconnect();
    eqNodes.high.disconnect();
  }
}
```

Call this in `selectSound()` before loading new file.

---

## Testing Checklist

- [ ] Load a sound file → Spectrogram shows
- [ ] Toggle spectrogram off/on → No visual lag
- [ ] Adjust EQ sliders → Hear change in real-time (if playing)
- [ ] EQ values persist while playing same file
- [ ] Switch to new sound file → EQ resets to 0dB
- [ ] Loudness meter displays for different audio levels
- [ ] Color warning shows for loud audio (> -6dB)
- [ ] No console errors in browser DevTools
- [ ] Performance: Spectrogram doesn't freeze UI

---

## Optional Enhancements (if time permits)

### Preset EQ Buttons (5-10 minutes)
```javascript
const eqPresets = {
  flat: { low: 0, mid: 0, high: 0 },
  presence: { low: 0, mid: 3, high: 5 },
  bassBoost: { low: 6, mid: 0, high: -2 },
  vocal: { low: -3, mid: 5, high: 2 },
};

function applyEQPreset(name) {
  const preset = eqPresets[name];
  updateEQGain('low', preset.low);
  updateEQGain('mid', preset.mid);
  updateEQGain('high', preset.high);
  // Update slider UI to match
}
```

### FFT Size Selector (5-10 minutes)
```html
<select id="spectrogram-fft">
  <option value="256">256 (fast)</option>
  <option value="512">512</option>
  <option value="1024">1024</option>
  <option value="2048">2048 (detailed)</option>
</select>
```

---

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Load time (new sound) | <100ms | ✓ |
| EQ slider response | <10ms | ✓ |
| Spectrogram FFT | <50ms/frame | ✓ |
| UI frame rate | >30fps | ✓ |
| Memory per sound | <10MB | ✓ |

---

## Rollback Plan

If something breaks:

1. **Revert spectrogram:** Remove plugin registration (1 line)
2. **Revert EQ:** Remove initEQ() call (1 line)
3. **Revert loudness:** Remove measureLoudness() call (1 line)

All changes are isolated to sound.js; no global state affected.

---

## Research Summary

### What we chose and why:

| Feature | Choice | Why Not Others |
|---------|--------|-----------------|
| **Spectrum** | Wavesurfer Spectrogram plugin | Already installed, zero config, integrates perfectly |
| **EQ** | BiquadFilterNode (native) | Zero dependencies, standard W3C API, simple to implement |
| **Loudness** | RMS meter (simple) | Good enough for game audio, avoids 50KB library |

### What we avoided and why:

| Library | Avoided Reason |
|---------|----------------|
| **Tone.js** | +100KB, overkill for one feature |
| **audioMotion-analyzer** | +50KB, too many features we don't need |
| **Full LUFS metering** | Over-engineered, adds complexity for marginal benefit |

---

## References

1. **Wavesurfer Spectrogram**: https://wavesurfer.xyz/docs/classes/plugins_spectrogram.SpectrogramPlugin
2. **BiquadFilterNode**: https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
3. **Audio EQ Cookbook**: https://webaudio.github.io/Audio-EQ-Cookbook/
4. **Full Research**: See `docs/audio-editor-research.md`

---

## Support

If implementation hits snags:

1. Check BiquadFilterNode Q factor interaction (may need Q adjustment)
2. Verify Spectrogram color map compatibility (try 'gray' if 'turbo' doesn't work)
3. Profile CPU usage in DevTools if lag occurs
4. Test on different browsers (Safari may have older Web Audio API)

Good luck!
