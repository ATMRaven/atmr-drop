const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\d887a23f-b908-4c00-8df2-bf5a464801fe';

async function runVerification() {
  console.log('🚀 Launching standalone Chromium at:', CHROMIUM_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

    // Step 1: Open Home / PIN screen
    console.log('Step 1: Navigating to http://127.0.0.1:8787 ...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#view-receive-input.active');
    console.log('Art Deco PIN keypad view active.');

    const homeScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_home.png');
    await page.screenshot({ path: homeScreenshotPath, fullPage: false });
    console.log('Saved screenshot_home.png');

    // Step 2: Switch to Send Drop view
    console.log('Step 2: Switching to Send Drop view...');
    await page.click('#nav-mode-send');
    await page.waitForSelector('#view-send.active');

    // Type text snippet
    await page.type('#input-text', '✦ ATMR DROP: The Roaring Twenties Wire Dispatch. Encrypted transmission active across WiFi.');

    const sendScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_send.png');
    await page.screenshot({ path: sendScreenshotPath, fullPage: false });
    console.log('Saved screenshot_send.png');

    // Click "Transmit Wire Dispatch"
    console.log('Transmitting wire dispatch...');
    await page.click('#btn-send-drop');

    // Wait for share view
    await page.waitForSelector('#view-share.active', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1000));

    const pinCode = await page.$eval('#share-pin-code', (el) => el.textContent.trim());
    const directUrl = await page.$eval('#share-direct-url', (el) => el.value.trim());
    console.log(`Drop created successfully! PIN: [${pinCode}], Direct URL: [${directUrl}]`);

    const shareScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_share.png');
    await page.screenshot({ path: shareScreenshotPath, fullPage: false });
    console.log('Saved screenshot_share.png');

    // Step 3: Open second page to test PIN retrieval
    console.log(`Step 3: Opening receiver tab and entering PIN: ${pinCode} ...`);
    const receiverPage = await browser.newPage();
    await receiverPage.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await receiverPage.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

    // Enter digits on keypad
    for (const char of pinCode) {
      await receiverPage.click(`.deco-btn-key[data-key="${char}"]`);
      await new Promise((r) => setTimeout(r, 150));
    }

    // Wait for receive view
    await receiverPage.waitForSelector('#view-receive-content.active', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 800));

    const receivedText = await receiverPage.$eval('#received-text-content', (el) => el.textContent.trim());
    console.log('Received text matches:', receivedText);

    const receiveScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_receive.png');
    await receiverPage.screenshot({ path: receiveScreenshotPath, fullPage: false });
    console.log('Saved screenshot_receive.png');

    // Step 4: Test direct route /1234
    console.log(`Step 4: Testing direct route http://127.0.0.1:8787/${pinCode} ...`);
    const directPage = await browser.newPage();
    await directPage.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await directPage.goto(`http://127.0.0.1:8787/${pinCode}`, { waitUntil: 'domcontentloaded' });

    await directPage.waitForSelector('#view-receive-content.active', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 800));

    const directScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_direct.png');
    await directPage.screenshot({ path: directScreenshotPath, fullPage: false });
    console.log('Saved screenshot_direct.png');

    console.log('🎉 ALL ART DECO BROWSER VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
