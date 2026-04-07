
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8192';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('response', response => {
        if (response.status() === 404) {
            console.log(`404: ${response.url()}`);
        }
    });

    console.log('Checking /editors ...');
    await page.goto(`${BASE}/editors`, { waitUntil: 'networkidle' });
    
    console.log('Checking /game ...');
    await page.goto(`${BASE}/game`, { waitUntil: 'networkidle' });

    await browser.close();
})();
