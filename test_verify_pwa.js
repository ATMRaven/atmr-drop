const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\d887a23f-b908-4c00-8df2-bf5a464801fe';

async function runPwaVerification() {
  console.log('🚀 Launching Standalone Chromium for Comprehensive PWA Verification...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

    // 1. Verify Manifest
    console.log('1. Checking manifest.json...');
    const manifestUrl = 'http://127.0.0.1:8787/manifest.json';
    const manifestRes = await page.goto(manifestUrl);
    if (manifestRes.status() !== 200) {
      throw new Error(`Failed to load manifest.json (status: ${manifestRes.status()})`);
    }
    const manifestText = await manifestRes.text();
    const manifest = JSON.parse(manifestText);
    console.log(`✅ Manifest valid! App Name: "${manifest.name}", Display: "${manifest.display}", Icons: ${manifest.icons.length}`);
    if (manifest.display !== 'standalone') throw new Error('Manifest display should be standalone');

    // 2. Verify Service Worker file
    console.log('2. Checking sw.js...');
    const swRes = await page.goto('http://127.0.0.1:8787/sw.js');
    if (swRes.status() !== 200) {
      throw new Error(`Failed to load sw.js (status: ${swRes.status()})`);
    }
    console.log('✅ Service worker file accessible!');

    // 3. Verify App Homepage & PWA meta tags
    console.log('3. Checking PWA tags in HTML head...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    const manifestLink = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
    const themeColor = await page.$eval('meta[name="theme-color"]', el => el.getAttribute('content'));
    const appleCapable = await page.$eval('meta[name="apple-mobile-web-app-capable"]', el => el.getAttribute('content'));
    const appleIcon = await page.$eval('link[rel="apple-touch-icon"]', el => el.getAttribute('href'));

    console.log(`✅ Manifest Link: ${manifestLink}`);
    console.log(`✅ Theme Color: ${themeColor}`);
    console.log(`✅ Apple Web App Capable: ${appleCapable}`);
    console.log(`✅ Apple Touch Icon: ${appleIcon}`);

    if (manifestLink !== '/manifest.json') throw new Error('Manifest link missing or incorrect');
    if (themeColor !== '#07090e') throw new Error('Theme color mismatch');

    // 4. Verify icons are accessible
    console.log('4. Checking icon assets...');
    for (const icon of manifest.icons) {
      const iconRes = await page.goto(`http://127.0.0.1:8787${icon.src}`);
      if (iconRes.status() !== 200) {
        throw new Error(`Failed to load icon ${icon.src}`);
      }
    }
    console.log('✅ All PWA icons (standard & maskable) successfully verified!');

    // 5. Test Homepage UI & take screenshot
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    const pwaScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_pwa_mobile.png');
    await page.screenshot({ path: pwaScreenshotPath, fullPage: false });
    console.log(`Saved screenshot: ${pwaScreenshotPath}`);

    console.log('🎉 PWA VERIFICATION PASSED 100%!');
  } finally {
    await browser.close();
  }
}

runPwaVerification().catch((err) => {
  console.error('PWA Verification failed:', err);
  process.exit(1);
});
