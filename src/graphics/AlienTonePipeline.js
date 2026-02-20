// Simple post-processing shader inspired by the Aliens (1986) film tone: bloom, vignette, subtle film noise.
import { CONFIG } from '../config.js';

export class AlienTonePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    constructor(game) {
        super({
            game,
            renderTarget: true,
            fragShader: `
            precision mediump float;
            uniform vec2 uResolution;
            uniform float uTime;
            uniform sampler2D uMainSampler;
            varying vec2 outTexCoord;

            float random(vec2 co) {
                return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
            }

            void main() {
                vec2 uv = outTexCoord;
                vec2 centered = (uv - 0.5);
                vec4 color = texture2D(uMainSampler, uv);
                float aspect = uResolution.x / max(1.0, uResolution.y);
                float dist = length(centered * vec2(aspect, 1.0));
                float vignette = smoothstep(0.76, 0.5, dist);
                float glow = (1.0 - vignette) * 0.14;
                vec3 accent = vec3(1.0, 0.6, 0.34) * glow;
                float noise = (random(uv * uResolution + uTime * 0.13) - 0.5) * 0.04;
                color.rgb += accent;
                color.rgb = mix(color.rgb, vec3(0.02, 0.04, 0.1), vignette * 0.9);
                color.rgb += noise;
                color.rgb = color.rgb * (0.92 + glow * 0.14);
                gl_FragColor = color;
            }`,
        });
        this.elapsed = 0;
    }

    onPreRender() {
        this.elapsed += 0.008;
        this.set2f('uResolution', this.renderer.width, this.renderer.height);
        this.set1f('uTime', this.elapsed);
    }
}
