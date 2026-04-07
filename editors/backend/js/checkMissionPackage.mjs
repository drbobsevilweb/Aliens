#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { normalizeMissionPackage, validateMissionPackageShape } from './normalizeMissionPackage.js';
import { analyzeMissionPackageQuality } from './missionPackageQuality.js';
import { validateAgainstJsonSchema } from './schemaRuntimeCheck.js';

function main() {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node editors/backend/js/checkMissionPackage.mjs <mission-package.json>');
        process.exit(2);
    }
    const filePath = path.resolve(process.cwd(), arg);
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`Failed to read file: ${filePath}`);
        console.error(err?.message || String(err));
        process.exit(2);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.error(`Invalid JSON in ${filePath}`);
        console.error(err?.message || String(err));
        process.exit(2);
    }

    const normalized = normalizeMissionPackage(parsed);
    const schemaPath = new URL('../schemas/mission-package-v1.schema.json', import.meta.url);
    let schemaErrors = [];
    try {
        const schemaRaw = fs.readFileSync(schemaPath, 'utf8');
        const schema = JSON.parse(schemaRaw);
        schemaErrors = validateAgainstJsonSchema(normalized, schema, '$');
    } catch (err) {
        schemaErrors = [`Schema load failed: ${err?.message || String(err)}`];
    }
    const errors = validateMissionPackageShape(normalized);
    const quality = analyzeMissionPackageQuality(normalized);

    console.log(`Package: ${path.basename(filePath)}`);
    console.log(`Maps: ${normalized.maps.length} | Missions: ${normalized.missions.length} | Events: ${normalized.directorEvents.length} | Cues: ${normalized.audioCues.length}`);
    console.log(`Quality score: ${quality.score}/100`);

    if (schemaErrors.length > 0) {
        console.log('\nSchema errors:');
        for (const e of schemaErrors) console.log(`- ${e}`);
    } else {
        console.log('\nSchema errors: none');
    }

    if (errors.length > 0) {
        console.log('\nErrors:');
        for (const e of errors) console.log(`- ${e}`);
    } else {
        console.log('\nErrors: none');
    }

    if (quality.warnings.length > 0) {
        console.log('\nQuality warnings:');
        for (const w of quality.warnings) console.log(`- ${w}`);
    } else {
        console.log('\nQuality warnings: none');
    }

    process.exit(schemaErrors.length > 0 || errors.length > 0 ? 1 : 0);
}

main();
