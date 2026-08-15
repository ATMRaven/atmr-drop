const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\d887a23f-b908-4c00-8df2-bf5a464801fe';

async function runUpdateModalVerification() {
  console.log('🚀 Testing In-App Update Checker with standalone Chromium...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 2 });

    // Mock the /api/version route to return a newer version
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('/api/version')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: '1.0.7',
            mandatory: false,
            downloadUrl: 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
            releaseNotes: '⚡ 5 GB+ streaming uploads, in-app update checker, and flagship Apple Pro design.',
          }),
        });
      } else {
        req.continue();
      }
    });

    console.log('Navigating to http://127.0.0.1:8787 ...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

    // Wait for the update modal to appear
    await page.waitForSelector('#update-modal.active', { timeout: 10000 });
    console.log('Update modal is active and visible!');

    await new Promise((r) => setTimeout(r, 600));

    const updateScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_update_modal.png');
    await page.screenshot({ path: updateScreenshotPath, fullPage: false });
    console.log('Saved screenshot_update_modal.png');

    // Test clicking "Later"
    console.log('Clicking Later button...');
    await page.click('#btn-update-later');
    await new Promise((r) => setTimeout(r, 300));

    const isModalActive = await page.$eval('#update-modal', (el) => el.classList.contains('active'));
    console.log('Is modal active after Later click:', isModalActive);
    if (isModalActive) throw new Error('Modal should be dismissed after clicking Later');

    console.log('✅ In-App Update Checker test PASSED!');
  } finally {
    await browser.close();
  }
}

runUpdateModalVerification().catch((err) => {
  console.error('Update modal test failed:', err);
  process.exit(1);
});
