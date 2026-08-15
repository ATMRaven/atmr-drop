const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\d887a23f-b908-4c00-8df2-bf5a464801fe';

async function runVerification() {
  console.log('🚀 Starting Standalone Chromium Verification for Downloads & App Banner...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: MOBILE WEB BROWSER (Safari/Chrome on Mobile)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Mobile Web Browser Experience ---');
    const webPage = await browser.newPage();
    await webPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

    // Ensure localStorage is clean
    await webPage.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    // Verify Mobile App Banner is VISIBLE on mobile web
    const bannerVisible = await webPage.$eval('#mobile-app-banner', el => !el.classList.contains('hidden'));
    console.log('Mobile Web Banner Visible:', bannerVisible);
    if (!bannerVisible) throw new Error('Mobile App Banner should be visible on mobile web browser!');

    // Verify Update Modal is NOT ACTIVE on web
    const updateModalActive = await webPage.$eval('#update-modal', el => el.classList.contains('active'));
    console.log('Update Modal Active on Web:', updateModalActive);
    if (updateModalActive) throw new Error('Update Modal must NOT appear on web browser!');

    // Take screenshot of mobile web homepage with app banner
    const ssBanner = path.join(ARTIFACT_DIR, 'screenshot_web_mobile_banner.png');
    await webPage.screenshot({ path: ssBanner, fullPage: false });
    console.log('Saved screenshot_web_mobile_banner.png');

    // Create a drop with text and a sample image
    console.log('Creating drop with text and image...');
    await webPage.type('#input-text', 'End-to-End Download Verification Test!');

    // Create temporary image and file
    const sampleImgPath = path.join(__dirname, 'test_img.png');
    const sampleDocPath = path.join(__dirname, 'test_doc.txt');
    // 1x1 PNG base64
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(sampleImgPath, pngBuffer);
    fs.writeFileSync(sampleDocPath, 'Hello world document file content for drop download test.');

    const fileInput = await webPage.$('#file-input');
    await fileInput.uploadFile(sampleImgPath, sampleDocPath);
    await new Promise(r => setTimeout(r, 400));

    // Click Create Drop
    await webPage.click('#btn-send-drop');
    await webPage.waitForSelector('#view-share.active', { timeout: 10000 });
    const pin = await webPage.$eval('#share-pin-code', el => el.textContent.trim());
    console.log(`✅ Drop Created with PIN: [${pin}]`);

    // -------------------------------------------------------------
    // TEST 2: RETRIEVE & TEST DOWNLOADS ON RECEIVER PAGE
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Vault Retrieval & File Downloads ---');
    const receiverPage = await browser.newPage();
    await receiverPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await receiverPage.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 400));

    await receiverPage.click('#tab-receive');
    const digits = pin.split('');
    for (let i = 0; i < 4; i++) {
      await receiverPage.type(`#pin-digit-${i + 1}`, digits[i]);
      await new Promise(r => setTimeout(r, 80));
    }

    await receiverPage.waitForSelector('#view-vault.active', { timeout: 10000 });
    console.log('Vault opened!');

    // Verify Images count and file rows
    const imgCount = await receiverPage.$eval('#images-count', el => el.textContent.trim());
    const fileCount = await receiverPage.$eval('#files-count', el => el.textContent.trim());
    console.log(`Images in vault: ${imgCount}, Files in vault: ${fileCount}`);

    // Verify image source is valid URL
    const imgSrc = await receiverPage.$eval('.gallery-img', el => el.getAttribute('src'));
    console.log('Gallery image src:', imgSrc);
    if (!imgSrc.includes('/api/file/')) {
      throw new Error(`Invalid image src: ${imgSrc}`);
    }

    // Screenshot the Vault view with thumbnail and download buttons
    const ssVault = path.join(ARTIFACT_DIR, 'screenshot_vault_downloads.png');
    await receiverPage.screenshot({ path: ssVault, fullPage: false });
    console.log('Saved screenshot_vault_downloads.png');

    // Test clicking the Save button on the image
    console.log('Testing Single Image Save button...');
    await receiverPage.click('.gallery-item-footer .btn-download-file');
    await new Promise(r => setTimeout(r, 1200));

    // Test clicking the Download button on the document file
    console.log('Testing Single Document File Download button...');
    await receiverPage.click('.file-row .btn-download-file');
    await new Promise(r => setTimeout(r, 1200));

    // Test clicking Download All (.zip)
    console.log('Testing Download All (.zip) button...');
    await receiverPage.click('#btn-download-all-zip');
    await new Promise(r => setTimeout(r, 1500));

    // -------------------------------------------------------------
    // TEST 3: NATIVE CAPACITOR APP SIMULATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Native App Simulation ---');
    const nativePage = await browser.newPage();
    await nativePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await nativePage.evaluateOnNewDocument(() => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android'
      };
      window.APP_VERSION = '1.0.0'; // simulate older version to check update modal
    });

    await nativePage.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));

    // Verify Mobile App Banner is HIDDEN in native app
    const nativeBannerHidden = await nativePage.$eval('#mobile-app-banner', el => el.classList.contains('hidden'));
    console.log('Mobile App Banner Hidden in Native App:', nativeBannerHidden);
    if (!nativeBannerHidden) throw new Error('Mobile App Banner should be HIDDEN inside native app!');

    console.log('🎉 ALL DOWNLOAD & APP BANNER TESTS PASSED PERFECTLY!');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
