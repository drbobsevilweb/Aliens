export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function sanitizeAssetFilename(rawValue, fallback = 'asset') {
    const cleaned = String(rawValue || '')
        .replace(/[^a-zA-Z0-9_. -]/g, '')
        .trim()
        .replace(/\s+/g, '_');
    return cleaned || fallback;
}

export function ensureExtension(filename, extension) {
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;
    return filename.toLowerCase().endsWith(normalizedExt.toLowerCase())
        ? filename
        : `${filename}${normalizedExt}`;
}

export function hexToRgba(hex) {
    const normalized = String(hex || '').replace('#', '');
    const padded = normalized.length === 3
        ? normalized.split('').map((char) => char + char).join('')
        : normalized.padEnd(6, '0').slice(0, 6);

    return {
        r: parseInt(padded.slice(0, 2), 16),
        g: parseInt(padded.slice(2, 4), 16),
        b: parseInt(padded.slice(4, 6), 16),
        a: 255,
    };
}

export function rgbaToHex(r, g, b) {
    return '#' + [r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('');
}

export function colorToCss(color) {
    return `rgba(${color.r},${color.g},${color.b},${(clamp(color.a ?? 255, 0, 255) / 255).toFixed(4)})`;
}

export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

export function loadImage(src, { crossOrigin = 'anonymous' } = {}) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        if (crossOrigin) image.crossOrigin = crossOrigin;
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
    });
}