import { chromium } from 'playwright';
import fs from 'node:fs';

async function run() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Listen for console logs
    page.on('console', msg => console.log(`[browser] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[browser error] ${err.message}`));
    page.on('requestfailed', request => {
        console.error(`[request failed] ${request.url()}: ${request.failure().errorText}`);
    });

    try {
        console.log('Navigating to game...');
        await page.goto('http://127.0.0.1:8192/game/?renderer=canvas&mission=m1');
        
        // Wait for game to be ready (look for HUD)
        console.log('Waiting for HUD...');
        await page.waitForTimeout(5000); // Give it time to load fonts and init
        
        // Check actual font used by text elements
        const renderedFonts = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            // Phaser renders to canvas, so we can't easily check DOM elements.
            // But we can check if there are any errors or if the font-face is active.
            return {
                ready: document.fonts.status,
                check: document.fonts.check('24px SevenSegment'),
                count: document.fonts.size
            };
        });
        console.log('Rendered font check:', JSON.stringify(renderedFonts, null, 2));

        // Take a screenshot of the HUD area
        console.log('Taking screenshot...');
        await page.screenshot({ path: 'output/font-check.png' });
        
        console.log('Screenshot saved to output/font-check.png');

    } catch (e) {
        console.error('Error during font check:', e);
    } finally {
        await browser.close();
    }
}

run();
