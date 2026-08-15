const puppeteer = require('puppeteer');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\d887a23f-b908-4c00-8df2-bf5a464801fe';

async function runMobileSimulationTest() {
  console.log('🚀 Launching standalone Chromium in Capacitor Mobile Simulation Mode...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

    // Mock Capacitor Native Environment
    await page.evaluateOnNewDocument(() => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
    });

    // Intercept requests directed to https://drop.atmr.workers.dev and redirect to local dev server http://127.0.0.1:8787
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('https://drop.atmr.workers.dev/api/')) {
        const redirected = url.replace('https://drop.atmr.workers.dev', 'http://127.0.0.1:8787');
        req.continue({ url: redirected });
      } else {
        req.continue();
      }
    });

    console.log('Navigating to http://127.0.0.1:8787 ...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    // Test text input on mobile
    console.log('Typing message on simulated mobile app...');
    await page.waitForSelector('#input-text');
    await page.type('#input-text', 'Mobile Capacitor Test Message from Android App!');

    // Submit Create Drop
    console.log('Tapping Create Drop on mobile...');
    await page.click('#btn-send-drop');

    // Wait for share screen to appear (meaning API request succeeded!)
    await page.waitForSelector('#view-share.active', { timeout: 10000 });
    const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
    console.log(`✅ Mobile Create Drop SUCCESS! PIN generated: [${pin}]`);

    const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_mobile_created.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log('Saved screenshot_mobile_created.png');

    // Now test retrieving from another mobile screen
    const receiverPage = await browser.newPage();
    await receiverPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await receiverPage.evaluateOnNewDocument(() => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      };
    });

    await receiverPage.setRequestInterception(true);
    receiverPage.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('https://drop.atmr.workers.dev/api/')) {
        const redirected = url.replace('https://drop.atmr.workers.dev', 'http://127.0.0.1:8787');
        req.continue({ url: redirected });
      } else {
        req.continue();
      }
    });

    await receiverPage.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 500));

    console.log('Switching to Receive on mobile receiver...');
    await receiverPage.click('#tab-receive');

    console.log(`Entering PIN [${pin}] into mobile receiver...`);
    const digits = pin.split('');
    for (let i = 0; i < 4; i++) {
      await receiverPage.type(`#pin-digit-${i + 1}`, digits[i]);
      await new Promise(r => setTimeout(r, 80));
    }

    await receiverPage.waitForSelector('#view-vault.active', { timeout: 10000 });
    const receivedText = await receiverPage.$eval('#received-text-content', el => el.textContent.trim());
    console.log('Received text on mobile:', receivedText);

    if (!receivedText.includes('Mobile Capacitor Test Message')) {
      throw new Error('Received text does not match mobile message!');
    }

    const mobileVaultScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_mobile_vault.png');
    await receiverPage.screenshot({ path: mobileVaultScreenshotPath, fullPage: false });
    console.log('Saved screenshot_mobile_vault.png');

    console.log('🎉 ALL MOBILE CAPACITOR SIMULATION TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

runMobileSimulationTest().catch((err) => {
  console.error('Mobile test failed:', err);
  process.exit(1);
});
