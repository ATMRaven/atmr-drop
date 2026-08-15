const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\d887a23f-b908-4c00-8df2-bf5a464801fe';

async function runFileVerification() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 850, deviceScaleFactor: 2 });

    console.log('Navigating to send view...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

    // Create temporary dummy files
    const tmpImg = path.join(__dirname, 'test_image.png');
    const tmpDoc = path.join(__dirname, 'test_doc.pdf');
    fs.writeFileSync(tmpImg, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    fs.writeFileSync(tmpDoc, Buffer.from('%PDF-1.4 dummy pdf content', 'utf8'));

    // Upload files via file input
    const fileInput = await page.$('#file-input');
    await fileInput.uploadFile(tmpImg, tmpDoc);

    await page.type('#input-text', 'Minimalist cross-device transfer with 1 photo and 1 PDF document.');
    await page.click('#check-burn');

    await new Promise((r) => setTimeout(r, 600));

    const sendScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_send_files.png');
    await page.screenshot({ path: sendScreenshotPath, fullPage: false });
    console.log('Saved screenshot_send_files.png');

    // Submit drop
    await page.click('#btn-send-drop');
    await page.waitForSelector('#view-share.active', { timeout: 10000 });

    const pinCode = await page.$eval('#share-pin-code', (el) => el.textContent.trim());
    console.log('Files drop created! PIN:', pinCode);

    // Open receiver
    const receiverPage = await browser.newPage();
    await receiverPage.setViewport({ width: 1000, height: 850, deviceScaleFactor: 2 });
    await receiverPage.goto(`http://127.0.0.1:8787/${pinCode}`, { waitUntil: 'networkidle0' });
    await receiverPage.waitForSelector('#view-vault.active', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 800));

    const receiveScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_receive_files.png');
    await receiverPage.screenshot({ path: receiveScreenshotPath, fullPage: false });
    console.log('Saved screenshot_receive_files.png');

    // Clean up
    if (fs.existsSync(tmpImg)) fs.unlinkSync(tmpImg);
    if (fs.existsSync(tmpDoc)) fs.unlinkSync(tmpDoc);

    console.log('✅ File upload & retrieval test passed!');
  } finally {
    await browser.close();
  }
}

runFileVerification().catch((err) => {
  console.error('File verification failed:', err);
  process.exit(1);
});
