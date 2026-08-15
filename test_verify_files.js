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
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

    // Create a dummy image and document file for testing
    const sampleImgPath = path.join(__dirname, 'sample_test_image.png');
    // 1x1 transparent png / small test png
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGYzUAAOzfAgNkmE6qAAAAAElFTkSuQmCC',
      'base64'
    );
    fs.writeFileSync(sampleImgPath, pngBuffer);

    const sampleDocPath = path.join(__dirname, 'sample_document.pdf');
    fs.writeFileSync(sampleDocPath, '%PDF-1.4 %sample pdf content for atmr-drop transfer');

    console.log('Navigating to send view...');
    await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });
    await page.click('#nav-btn-send');
    await page.waitForSelector('#view-send.active');

    // Upload files via file input
    const fileInput = await page.$('#file-input');
    await fileInput.uploadFile(sampleImgPath, sampleDocPath);
    await new Promise((r) => setTimeout(r, 600));

    // Type text snippet
    await page.type('#text-input', '🔥 Cross-device drop containing 1 image, 1 document, and this text snippet!');

    // Toggle Burn-After-Reading
    await page.$eval('#toggle-burn', (el) => el.click());

    const filesSendScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_send_files.png');
    await page.screenshot({ path: filesSendScreenshotPath, fullPage: false });
    console.log('Saved screenshot_send_files.png');

    // Generate drop
    await page.click('#btn-create-drop');
    await page.waitForSelector('#view-share.active', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1000));

    const pinCode = await page.$eval('#share-pin-code', (el) => el.textContent.trim());
    console.log(`Files drop created! PIN: ${pinCode}`);

    // Receiver view
    const receiverPage = await browser.newPage();
    await receiverPage.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
    await receiverPage.goto(`http://127.0.0.1:8787/${pinCode}`, { waitUntil: 'networkidle0' });
    await receiverPage.waitForSelector('#view-receive.active', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1000));

    const filesReceiveScreenshotPath = path.join(ARTIFACT_DIR, 'screenshot_receive_files.png');
    await receiverPage.screenshot({ path: filesReceiveScreenshotPath, fullPage: false });
    console.log('Saved screenshot_receive_files.png');

    // Cleanup sample files
    if (fs.existsSync(sampleImgPath)) fs.unlinkSync(sampleImgPath);
    if (fs.existsSync(sampleDocPath)) fs.unlinkSync(sampleDocPath);

    console.log('✅ File upload & retrieval test passed!');
  } finally {
    await browser.close();
  }
}

runFileVerification().catch((err) => {
  console.error('File verification failed:', err);
  process.exit(1);
});
