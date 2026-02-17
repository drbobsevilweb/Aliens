export const CAMPAIGN_PROGRESS_KEY = 'aliens_campaign_progress_v1';

function normalizeMissionOrder(missionOrder = []) {
    const seen = new Set();
    const out = [];
    for (const id of missionOrder || []) {
        const key = String(id || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    if (out.length === 0) out.push('m1');
    return out;
}

function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function sanitizeProgress(progress, missionOrder = []) {
    const order = normalizeMissionOrder(missionOrder);
    const last = order.length - 1;
    const unlockedIndex = clampInt(progress?.unlockedIndex, 0, last, 0);
    const requestedCurrent = String(progress?.currentMissionId || '').trim();
    const currentMissionId = order.includes(requestedCurrent)
        ? requestedCurrent
        : order[Math.min(unlockedIndex, last)];
    const completed = String(progress?.lastCompletedMissionId || '').trim();
    const lastCompletedMissionId = order.includes(completed) ? completed : null;
    return {
        unlockedIndex,
        currentMissionId,
        lastCompletedMissionId,
        updatedAt: Number.isFinite(Number(progress?.updatedAt)) ? Number(progress.updatedAt) : null,
    };
}

export function loadCampaignProgress(missionOrder = []) {
    const order = normalizeMissionOrder(missionOrder);
    const fallback = sanitizeProgress({}, order);
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    try {
        const raw = window.localStorage.getItem(CAMPAIGN_PROGRESS_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return sanitizeProgress(parsed, order);
    } catch {
        return fallback;
    }
}

export function saveCampaignProgress(progress, missionOrder = []) {
    const next = sanitizeProgress(progress, missionOrder);
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            window.localStorage.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify(next));
        } catch {
            // Ignore storage quota/private mode errors.
        }
    }
    return next;
}

export function completeCampaignMission(progress, missionId, missionOrder = []) {
    const order = normalizeMissionOrder(missionOrder);
    const base = sanitizeProgress(progress, order);
    const id = String(missionId || '').trim();
    const idx = order.indexOf(id);
    if (idx < 0) return base;
    const unlockedIndex = Math.max(base.unlockedIndex, Math.min(order.length - 1, idx + 1));
    const currentMissionId = order[Math.min(unlockedIndex, order.length - 1)];
    return {
        ...base,
        unlockedIndex,
        currentMissionId,
        lastCompletedMissionId: id,
        updatedAt: Date.now(),
    };
}
