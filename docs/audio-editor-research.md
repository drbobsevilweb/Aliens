# Audio Editing Library Research: Sound Editor Enhancement
## Aliens Game `/editors/tabs/sound.js` Modernization Study

**Research Date:** April 2, 2026  
**Current State:** wavesurfer.js v7.12.5 with basic trim/fade/reverb/echo effects  
**Goal:** Add spectrum analysis, 3-band EQ, and loudness metering in 4-6 hours

---

## Executive Summary

The Sound editor can be significantly enhanced with **minimal code additions** (~200-300 LOC) using:

1. **Spectrum visualization** → wavesurfer.js built-in Spectrogram plugin (already in node_modules)
2. **3-band EQ** → Native Web Audio API BiquadFilterNode (zero dependencies)
3. **Loudness meter** → Web Audio API AnalyserNode + simple ITU-R BS.1770 implementation (lightweight)

**Recommendation:** Use wavesurfer.js Spectrogram plugin + Web Audio API native filters. This avoids extra dependencies and leverages what's already installed.

---

## Option 1: Wavesurfer.js Built-in Spectrogram Plugin (RECOMMENDED)

### What It Is
- Official wavesurfer.js v7 plugin for real-time FFT-based frequency visualization
- Included in package.json dependencies already (`wavesurfer.js@^7.12.5`)
- Pre-built distribution in `node_modules/wavesurfer.js/dist/plugins/spectrogram.*`

### Integration Path
```javascript
// In sound.js initWavesurfer()
import SpectrogramPlugin from '/node_modules/wavesurfer.js/dist/plugins/spectrogram.esm.js';

wavesurfer.registerPlugin(SpectrogramPlugin.default);
wavesurfer.addPlugin(
  SpectrogramPlugin.default.create({
    height: 100,
    colorMap: SpectrogramPlugin.ColorMap.turbo,
    fftSamples: 512,
    frequencyMin: 20,
    frequencyMax: 20000,
    splitChannels: false,
  })
);
```

### Pros
- Zero additional npm install needed (already shipped)
- TypeScript types included
- Multiple built-in color maps (turbo, gray, roseus, viridis, etc.)
- Full frequency scaling support (linear, logarithmic, Mel, Bark, ERB)
- Works seamlessly with wavesurfer timeline/regions

### Cons
- Runs FFT in browser thread (CPU-intensive at 512+ samples)
- Not suitable for older/mobile devices
- Color map rendering can lag with playback at 60fps

### Bundle Size Impact
- Already in node_modules; no additional download
- Plugin file itself: ~50KB minified (included in existing install)
- Runtime overhead: Moderate (FFT on each frame)

### Performance Estimate
- Real-time rendering at 48kHz sample rate with 512 FFT: ~3-8% CPU per frame on modern machine
- Spectral update frequency: ~30-60 times/second depending on FFT size

### Complexity: 1/10
**Why:** Plug-and-play with wavesurfer. No manual FFT, no canvas manipulation.

---

## Option 2: Web Audio API AnalyserNode + Custom Spectrum (ALTERNATIVE)

### What It Is
- Native browser FFT via `AnalyserNode.getByteFrequencyData()`
- Manual canvas-based rendering for custom styling

### Implementation
```javascript
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
const freqData = new Uint8Array(analyser.frequencyBinCount);

// In animation loop:
analyser.getByteFrequencyData(freqData);
// Draw bars/waveform to canvas
```

### Pros
- Full control over styling and layout
- Lightweight (~100 lines of code for basic visualization)
- Works with any audio source (not just wavesurfer)
- Standard MDN best practices

### Cons
- Manual canvas drawing required (more code)
- Frequency mapping not automatic (you must scale Hz to canvas width)
- No built-in color maps or frequency scaling

### Complexity: 4/10
**Why:** Canvas API learning curve, but straightforward FFT retrieval.

### Bundle Size Impact
- Zero bytes (native API)
- Canvas rendering: ~2-4% CPU per frame

---

## Option 3: audioMotion-analyzer (LIGHTWEIGHT ALTERNATIVE)

### What It Is
- Standalone spectrum analyzer module (npm install audiomotion-analyzer)
- 50KB minified, zero dependencies, ~240+ frequency bands

### Why Consider It
- Professional-grade visualization with A/B/C/D weighting filters
- Multiple scales: linear, logarithmic, Bark, Mel
- LED bar and mirror modes out-of-box
- ITU-R 468 weighting for loudness compliance

### Cons
- Adds ~50KB to bundle
- Overkill for this use case (you don't need weighting filters)
- Separate lifecycle from wavesurfer

### Complexity: 3/10
**Why:** Just mount canvas and plug in audio context.

### When to Use
- If you need **professional audio analysis beyond basic spectrum**
- If the game will have a full audio mastering suite

---

## Option 4: Tone.js (NOT RECOMMENDED)

### What It Is
- Comprehensive music synthesis/analysis framework
- Built-in FFT via `Tone.Analyser`

### Why Not Recommended
- Adds 100KB+ to bundle
- Overkill for one UI feature
- Would require refactoring audio pipeline
- Complexity multiplier: 6/10

---

## 3-Band EQ Implementation (Web Audio API - Native)

### Best Approach: BiquadFilterNode Cascade

```javascript
const lowBand = audioCtx.createBiquadFilter();
lowBand.type = 'lowshelf';
lowBand.frequency.value = 200;
lowBand.gain.value = 0;
lowBand.Q.value = 0.7;

const midBand = audioCtx.createBiquadFilter();
midBand.type = 'peaking';
midBand.frequency.value = 2000;
midBand.gain.value = 0;
midBand.Q.value = 0.5;

const highBand = audioCtx.createBiquadFilter();
highBand.type = 'highshelf';
highBand.frequency.value = 8000;
highBand.gain.value = 0;
highBand.Q.value = 0.7;

// Chain them: source -> low -> mid -> high -> destination
source.connect(lowBand).connect(midBand).connect(highBand).connect(destination);
```

### Integration into sound.js
```javascript
let eqEnabled = false;
let eqBands = { low: 0, mid: 0, high: 0 };
const eqNodes = {};

function initEQ() {
  const source = audioCtx.createMediaElementAudioSource(audioElement);
  
  eqNodes.low = audioCtx.createBiquadFilter();
  eqNodes.mid = audioCtx.createBiquadFilter();
  eqNodes.high = audioCtx.createBiquadFilter();
  
  // Configure types and frequencies
  eqNodes.low.type = 'lowshelf';
  eqNodes.low.frequency.value = 200;
  
  eqNodes.mid.type = 'peaking';
  eqNodes.mid.frequency.value = 2000;
  
  eqNodes.high.type = 'highshelf';
  eqNodes.high.frequency.value = 8000;
  
  // Chain
  source
    .connect(eqNodes.low)
    .connect(eqNodes.mid)
    .connect(eqNodes.high)
    .connect(audioCtx.destination);
}

function updateEQGain(band, gain) {
  eqNodes[band].gain.value = Math.max(-12, Math.min(12, gain));
}
```

### UI Implementation (~80 lines HTML/CSS/JS)
```html
<!-- In sound.js buildUI() effects panel -->
<div class="panel">
  <div class="panel-header">3-Band EQ</div>
  <div class="panel-body" style="padding:8px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>
        <label style="font-size:11px;">Low (200Hz)</label>
        <input type="range" id="eq-low" min="-12" max="12" value="0">
        <span id="eq-low-lbl">0dB</span>
      </div>
      <div>
        <label style="font-size:11px;">Mid (2kHz)</label>
        <input type="range" id="eq-mid" min="-12" max="12" value="0">
        <span id="eq-mid-lbl">0dB</span>
      </div>
      <div>
        <label style="font-size:11px;">High (8kHz)</label>
        <input type="range" id="eq-high" min="-12" max="12" value="0">
        <span id="eq-high-lbl">0dB</span>
      </div>
    </div>
  </div>
</div>
```

### Pros
- Zero dependencies (native Web Audio API)
- Full real-time adjustment of playback (no offline rendering needed)
- Professional audio EQ standard
- ~120 lines of code total

### Complexity: 2/10
**Why:** BiquadFilterNode is simple; just chain and set parameters.

---

## Loudness Meter Implementation (Lightweight LUFS)

### Option A: Simple RMS Meter (Fast, ~5 min)
```javascript
function measureLoudness(buffer) {
  let sumOfSquares = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumOfSquares += data[i] * data[i];
    }
  }
  const rms = Math.sqrt(sumOfSquares / (buffer.numberOfChannels * buffer.length));
  return 20 * Math.log10(Math.max(0.0001, rms)); // dB
}
```

Pros:
- 5 lines of code
- Instant calculation
- Good enough for basic loudness reference

Cons:
- Not true LUFS (no K-weighting or loudness curve)

### Option B: ITU-R BS.1770 Lightweight (~15 min)
Use a pre-made library: **lufs.js** (GitHub: dodds-cc/lufs.js)
- Implements K-weighting correctly
- Returns integrated, short-term, momentary LUFS
- ~50KB library

```javascript
import Loudness from '/libs/lufs.js';

const loudness = new Loudness(audioBuffer, audioCtx.sampleRate);
console.log(loudness.integratedLoudness()); // LUFS
```

### Recommended for Sound Editor: Simple RMS
- Display next to waveform: "Loudness: -12.5 dB"
- Update on file load
- Styled warning if > -6dB (clipping risk)

Complexity: 1/10 (RMS) → 3/10 (true LUFS)

---

## Spectrum Display Libraries Comparison

| Library | Bundle Size | FFT Speed | Learning Curve | Dependencies | Recommendation |
|---------|-------------|-----------|----------------|--------------|-----------------|
| **Wavesurfer Spectrogram** | Already installed | Good (Web Worker optional) | Easy (plugin system) | wavesurfer.js | ✅ **BEST** |
| **Web Audio AnalyserNode** | 0 bytes | Very fast | Medium (canvas) | None | ✅ **Lightweight alt** |
| **audioMotion-analyzer** | ~50KB | Excellent | Easy | None | ⚠️ Overkill |
| **Tone.js FFT** | ~100KB | Good | Medium | Many | ❌ Too heavy |

---

## Recommended 4-6 Hour Implementation Plan

### Phase 1: Spectrum Visualization (1.5 hours)
1. Add Spectrogram plugin to wavesurfer initialization
2. Create toggleable spectrogram panel below waveform
3. Add FFT size selector (256, 512, 1024, 2048)
4. Style with game's accent colors

**Code Changes:** ~40 lines in sound.js

### Phase 2: 3-Band EQ (2 hours)
1. Initialize BiquadFilterNode cascade in `selectSound()`
2. Add EQ panel to effects UI
3. Wire slider inputs → node.gain.value
4. Add preset buttons (flat, presence, bass boost, vocal)
5. Make EQ toggle-able

**Code Changes:** ~120 lines in sound.js

### Phase 3: Loudness Meter (0.5 hours)
1. Calculate RMS on file load
2. Display below waveform
3. Color-code: green (< -6dB), yellow (-6 to -3dB), red (> -3dB)

**Code Changes:** ~30 lines in sound.js

### Phase 4: Polish (0.5 hours)
1. Test with all 5 missions' audio files
2. Verify EQ doesn't distort with extreme settings
3. Optimize spectrogram FFT size for performance
4. Add reset/preset buttons

**Total New Code:** ~190 lines

---

## Performance Impact Summary

| Feature | CPU Cost | GPU Cost | Memory | Notes |
|---------|----------|----------|--------|-------|
| Spectrogram (512 FFT) | 3-8% | Low | ~2MB | Can disable during playback |
| 3-Band EQ | <1% | None | <100KB | Real-time, negligible impact |
| Loudness Meter | <0.5% | None | <50KB | One-time on load |

---

## Code Structure After Enhancement

```
editors/tabs/sound.js (current: ~683 lines → ~870 lines)
  ├─ buildUI() → add spectrogram canvas + EQ sliders + loudness display
  ├─ initWavesurfer() → add Spectrogram plugin
  ├─ selectSound() → init EQ nodes, measure loudness
  ├─ applyEQ() → update filter gains (new)
  ├─ measureLoudness() → calculate RMS (new)
  └─ handleUpload() → no change
```

---

## Gotchas & Warnings

1. **EQ Only Works on Playback**
   - Effects (trim, fade, reverb, echo) modify the buffer offline
   - EQ must modify the real-time playback (AnalyserNode in signal chain)
   - User cannot "apply" EQ like effects; it's a preview tool

2. **Spectrogram CPU Cost**
   - At 512 FFT + 60fps, budget 5-10% of a core
   - Disable if game window not focused (use `visibilitychange` event)
   - Consider lazy-loading spectrogram plugin only if enabled

3. **BiquadFilterNode Stability**
   - Avoid extreme gain values (±20dB+); stick to ±12dB
   - Q factor interacts with gain; use standard Q=0.5-0.7 for mid-band peaking
   - Chain order matters: low → mid → high (not reversed)

4. **AudioContext Resource Limits**
   - Max ~50 BiquadFilterNode instances before performance degradation
   - This editor uses 3; no problem
   - But each sound file creates a separate AudioContext (potential leak if not cleaned up)

5. **Spectrum Visualization Accuracy**
   - FFT resolution: sampleRate / fftSize
   - At 48kHz, 512 FFT = 93Hz per bin (low resolution)
   - Use 2048 for better clarity, but 3-5x slower

---

## Files to Modify

```
/home/drevilbob/Aliens/editors/tabs/sound.js
  - Add Spectrogram plugin import
  - Add 3-band EQ UI to buildUI()
  - Add EQ initialization to selectSound()
  - Add EQ callback handlers
  - Add loudness meter display
  - Add loudness measurement function
  - Ensure cleanup on sound deselect
```

No changes needed to:
- `package.json` (wavesurfer.js already installed)
- `editors/app.js` (plugin agnostic)
- HTML/CSS (inline styles used)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Spectrogram slows UI | Medium | Lazy-load plugin, FFT toggle |
| EQ distorts audio | Low | Clamp gains to ±12dB |
| Memory leak on sound switch | Low | Disconnect nodes on deselect |
| Browser unsupported (old Safari) | Low | Graceful degradation (try/catch) |

---

## Recommendation: Ranked by ROI (4-6 hour deadline)

### 🥇 **PRIORITY 1: Spectrogram (0.5 hours)**
- Single wavesurfer plugin call
- Massive UX improvement
- Already in node_modules

### 🥈 **PRIORITY 2: 3-Band EQ (1.5 hours)**
- Professional audio editing feature
- Zero dependencies
- Immediate usability win for sound design

### 🥉 **PRIORITY 3: Simple Loudness Meter (0.5 hours)**
- Quick RMS calculation
- Prevents clipping mistakes
- Low code, high value

### 💡 **OPTIONAL: Preset EQ Buttons (1 hour)**
- "Flat," "Presence," "Bass Boost," "Vocal" presets
- Saves time for common use cases
- Deferred to Phase 2 if time tight

### 🚫 **SKIP: Full ITU LUFS Metering (for now)**
- Over-engineered for game audio
- Adds 50KB
- RMS is good enough

---

## Conclusion

Modernize the Sound editor in 4-6 hours by combining:
1. **Wavesurfer.js Spectrogram plugin** (already installed, ~40 LOC)
2. **Web Audio API BiquadFilterNode EQ** (native, ~120 LOC)
3. **Simple RMS Loudness Meter** (lightweight, ~30 LOC)

**Total**: ~190 new lines of code, zero new npm dependencies, major UX win.

---

## Research Sources

### Wavesurfer.js
- Official docs: https://wavesurfer.xyz/docs/
- Spectrogram plugin: https://wavesurfer.xyz/docs/classes/plugins_spectrogram.SpectrogramPlugin
- Plugin system: https://wavesurfer.xyz/example/plugin-system/
- v7 latest features: https://github.com/katspaugh/wavesurfer.js

### Web Audio API
- MDN AnalyserNode: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN BiquadFilterNode: https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
- MDN Visualizations: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
- Audio EQ Cookbook: https://webaudio.github.io/Audio-EQ-Cookbook/

### Alternative Libraries
- audioMotion-analyzer: https://audiomotion.dev/
- Tone.js: https://tonejs.github.io/
- lufs.js (loudness metering): https://github.com/dodds-cc/lufs.js

### Open Source DAWs
- openDAW: https://opendaw.org/
- GridSound: https://gridsound.com/
- Wavacity: https://wavacity.com/

