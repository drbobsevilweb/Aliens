import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = process.argv[2] || 'output/path-audit';
const baseUrl = process.argv[3] || 'http://127.0.0.1:8192/game?renderer=canvas';
const missions = (process.argv[4] || 'm1,m2,m3,m4,m5')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });

function buildMissionUrl(base, missionId) {
    const hasQuery = base.includes('?');
    const sep = hasQuery ? '&' : '?';
    return `${base}${sep}mission=${encodeURIComponent(missionId)}`;
}

const results = [];
for (const missionId of missions) {
    const url = buildMissionUrl(baseUrl, missionId);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try {
        await page.waitForFunction(
            () => {
                const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
                const s = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
                return !!(s && s.pathGrid && s.activeMissionLayout);
            },
            { timeout: 8000 }
        );
    } catch (_) {
        // Fallback to a short settle period; result object will report hasScene=false.
        await page.waitForTimeout(1500);
    }
    const summary = await page.evaluate(() => {
        const game = Array.isArray(window.Phaser?.GAMES) ? window.Phaser.GAMES[0] : null;
        const scene = game?.scene?.keys?.GameScene || window.__ALIENS_DEBUG_SCENE__ || null;
        if (!scene || !scene.pathGrid) return { hasScene: false };

        const grid = scene.pathGrid;
        const width = Number(grid.width) || 0;
        const height = Number(grid.height) || 0;
        const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
        const keyOf = (x, y) => `${x},${y}`;

        const doorTileSet = new Set();
        const doorGroups = Array.isArray(scene?.doorManager?.doorGroups) ? scene.doorManager.doorGroups : [];
        for (const g of doorGroups) {
            for (const t of g?.tiles || []) {
                const tx = Number(t?.x);
                const ty = Number(t?.y);
                if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
                if (!inBounds(tx, ty)) continue;
                doorTileSet.add(keyOf(tx, ty));
            }
        }

        const isWalkableNow = (x, y) => inBounds(x, y) && !!grid.isWalkable(x, y);
        const isWalkableDoorOpen = (x, y) => inBounds(x, y) && (isWalkableNow(x, y) || doorTileSet.has(keyOf(x, y)));

        const startTile = (() => {
            const s = scene.activeMissionLayout?.spawnTile;
            if (s && Number.isFinite(Number(s.x)) && Number.isFinite(Number(s.y))) return { x: Number(s.x), y: Number(s.y) };
            const w = grid.worldToTile(Number(scene?.leader?.x) || 0, Number(scene?.leader?.y) || 0);
            return { x: Number(w?.x) || 0, y: Number(w?.y) || 0 };
        })();
        const extractionTile = (() => {
            const e = scene.activeMissionLayout?.extractionTile;
            if (e && Number.isFinite(Number(e.x)) && Number.isFinite(Number(e.y))) return { x: Number(e.x), y: Number(e.y) };
            return null;
        })();

        const bfs = (sx, sy, predicate) => {
            if (!predicate(sx, sy)) return new Set();
            const seen = new Set([keyOf(sx, sy)]);
            const q = [{ x: sx, y: sy }];
            for (let i = 0; i < q.length; i++) {
                const c = q[i];
                const n = [
                    { x: c.x + 1, y: c.y },
                    { x: c.x - 1, y: c.y },
                    { x: c.x, y: c.y + 1 },
                    { x: c.x, y: c.y - 1 },
                ];
                for (const p of n) {
                    if (!predicate(p.x, p.y)) continue;
                    const k = keyOf(p.x, p.y);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    q.push(p);
                }
            }
            return seen;
        };

        const countByPredicate = (predicate) => {
            let n = 0;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (predicate(x, y)) n++;
                }
            }
            return n;
        };

        const nowTotalWalkable = countByPredicate((x, y) => isWalkableNow(x, y));
        const openTotalWalkable = countByPredicate((x, y) => isWalkableDoorOpen(x, y));
        const nowReachable = bfs(startTile.x, startTile.y, isWalkableNow);
        const openReachable = bfs(startTile.x, startTile.y, isWalkableDoorOpen);

        const extractionNowReachable = extractionTile
            ? nowReachable.has(keyOf(extractionTile.x, extractionTile.y))
            : true;
        const extractionOpenReachable = extractionTile
            ? openReachable.has(keyOf(extractionTile.x, extractionTile.y))
            : true;

        const deadEndDoors = [];
        for (const g of doorGroups) {
            const tiles = (g?.tiles || []).map((t) => ({ x: Number(t?.x), y: Number(t?.y) }))
                .filter((t) => Number.isFinite(t.x) && Number.isFinite(t.y) && inBounds(t.x, t.y));
            if (tiles.length !== 2) continue;
            const a = tiles[0];
            const b = tiles[1];
            let sideA = [];
            let sideB = [];
            if (a.x === b.x && Math.abs(a.y - b.y) === 1) {
                sideA = [{ x: a.x - 1, y: a.y }, { x: b.x - 1, y: b.y }];
                sideB = [{ x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }];
            } else if (a.y === b.y && Math.abs(a.x - b.x) === 1) {
                sideA = [{ x: a.x, y: a.y - 1 }, { x: b.x, y: b.y - 1 }];
                sideB = [{ x: a.x, y: a.y + 1 }, { x: b.x, y: b.y + 1 }];
            } else {
                continue;
            }
            const localDoorSet = new Set(tiles.map((t) => keyOf(t.x, t.y)));
            const predBlockedDoor = (x, y) => isWalkableDoorOpen(x, y) && !localDoorSet.has(keyOf(x, y));
            const seedA = sideA.find((p) => predBlockedDoor(p.x, p.y));
            const seedB = sideB.find((p) => predBlockedDoor(p.x, p.y));
            const reachA = seedA ? bfs(seedA.x, seedA.y, predBlockedDoor).size : 0;
            const reachB = seedB ? bfs(seedB.x, seedB.y, predBlockedDoor).size : 0;
            if (reachA < 10 || reachB < 10) {
                deadEndDoors.push({
                    id: String(g?.id || 'door'),
                    reachA,
                    reachB,
                    tiles,
                });
            }
        }

        return {
            hasScene: true,
            width,
            height,
            doors: doorGroups.length,
            nowTotalWalkable,
            openTotalWalkable,
            nowReachable: nowReachable.size,
            openReachable: openReachable.size,
            nowUnreachable: Math.max(0, nowTotalWalkable - nowReachable.size),
            openUnreachable: Math.max(0, openTotalWalkable - openReachable.size),
            extractionNowReachable,
            extractionOpenReachable,
            deadEndDoorCount: deadEndDoors.length,
            deadEndDoors,
        };
    });

    const result = { missionId, url, summary };
    results.push(result);
    fs.writeFileSync(
        path.join(outDir, `path-audit-${missionId}.json`),
        `${JSON.stringify(result, null, 2)}\n`
    );
}

await browser.close();

const aggregate = {
    outDir,
    missions: results,
};
fs.writeFileSync(path.join(outDir, 'path-audit-summary.json'), `${JSON.stringify(aggregate, null, 2)}\n`);
console.log(JSON.stringify(aggregate, null, 2));
