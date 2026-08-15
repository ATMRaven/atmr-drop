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

    // Test Case 1: Same version (no update modal should appear)
    console.log('Test 1: Testing identical version (v1.0.8 == v1.0.8)...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));

    const isSameVersionModalActive = await page.$eval('#update-modal', (el) => el.classList.contains('active'));
    console.log('Is modal active on same version:', isSameVersionModalActive);
    if (isSameVersionModalActive) {
      throw new Error('Update modal should NOT show when local and remote versions match!');
    }
    console.log('✅ Correct: No update popup when versions match.');

    // Test Case 2: Newer version available (v1.0.9 > v1.0.8)
    console.log('Test 2: Testing newer version available (v1.0.9 > v1.0.8)...');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('/api/version')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            version: '1.0.9',
            mandatory: false,
            downloadUrl: 'https://github.com/ATMRaven/atmr-drop/releases/latest/download/atmr-drop.apk',
            releaseNotes: '⚡ 5 GB+ streaming uploads, in-app update checker, and flagship Apple Pro design.',
          }),
        });
      } else {
        req.continue();
      }
    });

    await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#update-modal.active', { timeout: 10000 });
    console.log('Update modal is active and visible for newer version!');

    await new Promise((r) => setTimeout(r, 600));

    const updateScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_update_modal.png');
    await page.screenshot({ path: updateScreenshotPath, fullPage: false });
    console.log('Saved screenshot_update_modal.png');

    // Test clicking "Later"
    console.log('Clicking Later button...');
    await page.click('#btn-update-later');
    await new Promise((r) => setTimeout(r, 300));

    const isModalActiveAfterLater = await page.$eval('#update-modal', (el) => el.classList.contains('active'));
    console.log('Is modal active after Later click:', isModalActiveAfterLater);
    if (isModalActiveAfterLater) throw new Error('Modal should be dismissed after clicking Later');

    // Screenshot of Send desk with updated "up to 5 GB" label
    const sendScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_send_5gb.png');
    await page.screenshot({ path: sendScreenshotPath, fullPage: false });
    console.log('Saved screenshot_send_5gb.png');

    console.log('🎉 ALL IN-APP UPDATE TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

runUpdateModalVerification().catch((err) => {
  console.error('Update modal test failed:', err);
  process.exit(1);
});
