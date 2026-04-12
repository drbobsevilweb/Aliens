#!/usr/bin/env node

import { chromium } from 'playwright';

const BASE_URL = process.env.ALIENS_BASE_URL || 'http://127.0.0.1:8192';
const EDITORS_URL = `${BASE_URL}/editors`;

const results = [];
const consoleErrors = [];
const requestFailures = [];

function pass(name) {
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
}

function fail(name, reason) {
    results.push({ name, ok: false, reason });
    console.log(`  ✗ ${name}`);
    console.log(`    ${reason}`);
}

async function addActionNode(page) {
    const canvas = page.locator('#story-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Story canvas has no bounding box');
    const targetX = box.x + box.width * 0.55;
    const targetY = box.y + box.height * 0.45;
    await page.mouse.click(targetX, targetY, { button: 'right' });
    await page.waitForSelector('#story-ctx-menu', { state: 'visible', timeout: 4000 });
    await page.locator('#story-ctx-menu div').filter({ hasText: 'ACTION' }).first().click();
}

async function expectSelectOptions(page, selector, expectedValues, name) {
    await page.waitForSelector(selector, { state: 'visible', timeout: 4000 });
    const values = await page.locator(`${selector} option`).evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('value') || '')
    );
    const missing = expectedValues.filter((value) => !values.includes(value));
    if (missing.length === 0) {
        pass(name);
    } else {
        fail(name, `Missing options ${JSON.stringify(missing)} from ${JSON.stringify(values)}`);
    }
}

const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
});
page.on('response', async (response) => {
    if (response.status() >= 400) requestFailures.push(`${response.status()} ${response.url()}`);
});

try {
    await page.goto(EDITORS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('button[data-tab="missions"]', { state: 'visible', timeout: 8000 });

    console.log('\n[missions] actions handoff');
    await page.locator('button[data-tab="missions"]').click();
    await page.waitForSelector('#missions-open-actions', { state: 'visible', timeout: 8000 });
    const actionHint = page.locator('#missions-open-actions').locator('..');
    const actionHintText = await actionHint.textContent();
    if (actionHintText?.includes('Use the live Actions tab for node graph editing in the modular editor.')) {
        pass('Missions tab points authors to the live Actions tab');
    } else {
        fail('Missions tab points authors to the live Actions tab', `Unexpected text: ${actionHintText}`);
    }

    await page.locator('#add-event').click();
    await page.waitForSelector('[data-event-card]', { state: 'visible', timeout: 4000 });
    await page.locator('[data-event-card] [data-evt="action"]').first().selectOption('door_action');
    await expectSelectOptions(page, '[data-event-card] select[data-param="doorId"]', ['auto_door_1'], 'Missions door action uses runtime door dropdown options');
    await expectSelectOptions(page, '[data-event-card] select[data-param="action"]', ['open', 'close', 'lock', 'weld'], 'Missions door action mode uses dropdown options');

    await page.locator('#missions-open-actions').click();
    await page.waitForSelector('#story-canvas', { state: 'visible', timeout: 8000 });
    pass('Missions action button opens the Actions tab');

    console.log('\n[story] sound picker');
    await page.locator('#story-new-btn').click();
    await page.waitForSelector('#ng-name', { state: 'visible', timeout: 4000 });
    await page.locator('#ng-name').fill('Sound Picker Audit');
    await page.locator('#ng-create').click();
    await page.waitForSelector('.story-list-item.active', { state: 'visible', timeout: 4000 });
    await addActionNode(page);
    await page.waitForSelector('#action-type-select', { state: 'visible', timeout: 4000 });
    await page.locator('#action-type-select').selectOption('play_sound');
    await page.waitForSelector('#story-props select[data-field="key"]', { state: 'visible', timeout: 4000 });

    const soundOptions = await page.locator('#story-props select[data-field="key"] option').evaluateAll((nodes) =>
        nodes.map((node) => ({ value: node.value, label: node.textContent?.trim() || '' }))
    );
    const runtimeOptions = soundOptions.filter((option) => option.value);
    if (runtimeOptions.length >= 1) {
        pass('Play Sound action exposes runtime-loaded sound options');
    } else {
        fail('Play Sound action exposes runtime-loaded sound options', JSON.stringify(soundOptions));
    }

    const expectedKeys = ['motion_tracker_beep', 'pulse_rifle_short', 'steam_hiss'];
    const availableValues = runtimeOptions.map((option) => option.value);
    if (expectedKeys.some((key) => availableValues.includes(key))) {
        pass('Play Sound picker includes known runtime sound keys');
    } else {
        fail('Play Sound picker includes known runtime sound keys', JSON.stringify(availableValues));
    }

    if (availableValues.includes('motion_tracker_beep')) {
        await page.locator('#story-props select[data-field="key"]').selectOption('motion_tracker_beep');
        const selectedValue = await page.locator('#story-props select[data-field="key"]').inputValue();
        if (selectedValue === 'motion_tracker_beep') {
            pass('Play Sound picker updates the node value');
        } else {
            fail('Play Sound picker updates the node value', `Expected motion_tracker_beep, got ${selectedValue}`);
        }
    }

    console.log('\n[story] enum dropdowns');
    await page.locator('#action-type-select').selectOption('spawn_pack');
    await expectSelectOptions(page, '#story-props select[data-field="type"]', ['warrior', 'drone', 'facehugger', 'queenLesser'], 'Spawn Pack enemy type uses dropdown options');
    await expectSelectOptions(page, '#story-props select[data-field="dir"]', ['', 'N', 'S', 'E', 'W'], 'Spawn Pack direction uses dropdown options');
    await page.locator('#story-props select[data-field="type"]').selectOption('drone');
    const spawnPackTypeValue = await page.locator('#story-props select[data-field="type"]').inputValue();
    if (spawnPackTypeValue === 'drone') {
        pass('Spawn Pack enemy type dropdown updates node value');
    } else {
        fail('Spawn Pack enemy type dropdown updates node value', `Expected drone, got ${spawnPackTypeValue}`);
    }

    await page.locator('#action-type-select').selectOption('spawn_alien');
    await expectSelectOptions(page, '#story-props select[data-field="type"]', ['warrior', 'drone', 'facehugger', 'queenLesser', 'queen'], 'Spawn Alien enemy type uses dropdown options');

    await page.locator('#action-type-select').selectOption('door_action');
    await expectSelectOptions(page, '#story-props select[data-field="doorId"]', ['auto_door_1'], 'Door Action door ID uses runtime door dropdown options');
    await expectSelectOptions(page, '#story-props select[data-field="action"]', ['open', 'close', 'lock', 'weld', 'breach'], 'Door Action mode uses dropdown options');
    await page.locator('#story-props select[data-field="action"]').selectOption('weld');
    const doorActionValue = await page.locator('#story-props select[data-field="action"]').inputValue();
    if (doorActionValue === 'weld') {
        pass('Door Action dropdown updates node value');
    } else {
        fail('Door Action dropdown updates node value', `Expected weld, got ${doorActionValue}`);
    }

    await page.locator('#action-type-select').selectOption('force_stage');
    await expectSelectOptions(page, '#story-props select[data-field="stage"]', ['combat', 'intermission', 'extract', 'victory', 'defeat'], 'Force Stage uses dropdown options');
} finally {
    await browser.close();
}

const uniqueConsoleErrors = [...new Set(consoleErrors)];
const uniqueRequestFailures = [...new Set(requestFailures)].filter((entry) => !entry.includes('/favicon.ico'));
const failed = results.filter((result) => !result.ok).length;

console.log('\nSummary');
console.log(`  ${results.length - failed} passed`);
console.log(`  ${failed} failed`);

if (uniqueConsoleErrors.length) {
    console.log('\nConsole errors');
    for (const error of uniqueConsoleErrors) console.log(`  ${error}`);
}

if (uniqueRequestFailures.length) {
    console.log('\nRequest failures');
    for (const failure of uniqueRequestFailures) console.log(`  ${failure}`);
}

if (failed || uniqueConsoleErrors.length || uniqueRequestFailures.length) {
    process.exit(1);
}