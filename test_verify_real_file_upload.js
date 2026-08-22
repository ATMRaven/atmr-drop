const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testRealUpload() {
  console.log('🧪 Testing Real File Upload via File Input...');

  // Create a temporary test file
  const testFilePath = path.join(__dirname, 'test_sample_upload.png');
  fs.writeFileSync(testFilePath, Buffer.alloc(1024 * 50, 0x41)); // 50 KB sample file

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  const errors = [];
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => {
    console.error('BROWSER PAGE ERROR:', err.message);
    errors.push(err.message);
  });

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // 1. Upload via file input
  console.log('Selecting file via #file-input...');
  const fileInput = await page.$('#file-input');
  await fileInput.uploadFile(testFilePath);
  await new Promise(r => setTimeout(r, 1000));

  const stagedCount = await page.evaluate(() => {
    const list = document.getElementById('staged-files-list');
    return list.querySelectorAll('.staged-chip').length;
  });
  console.log('Staged chips count:', stagedCount);

  // 2. Click Create Drop
  console.log('Clicking Create Drop...');
  await page.click('#btn-send-drop');

  try {
    await page.waitForSelector('#view-share.active', { timeout: 10000 });
    const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
    console.log('✅ File Drop successfully created! PIN:', pin);

    // 3. Now let's test fetching and downloading the file on receive!
    console.log('Switching to Receive tab and entering PIN:', pin);
    await page.click('#tab-receive');
    await new Promise(r => setTimeout(r, 500));

    await page.type('#pin-digit-1', pin); // types into boxes
    await page.waitForSelector('#view-vault.active', { timeout: 10000 });
    console.log('✅ Receiver vault screen reached!');

    const receivedFileName = await page.$eval('.vault-file-name', el => el.textContent.trim());
    console.log('Received file name in vault:', receivedFileName);

  } catch (e) {
    console.error('❌ Failed waiting for share view or vault:', e);
    const ssPath = path.join(__dirname, 'screenshot_upload_failure.png');
    await page.screenshot({ path: ssPath });
    console.log('Saved failure screenshot:', ssPath);
  }

  await browser.close();
  try { fs.unlinkSync(testFilePath); } catch (e) {}

  if (errors.length > 0) {
    throw new Error('Encountered page errors: ' + errors.join('; '));
  }
}

testRealUpload().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
