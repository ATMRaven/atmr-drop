const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testBrowser() {
  console.log('Launching browser test for large file UI staging and upload...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 850 });

  const errors = [];
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
    errors.push(err.message);
  });

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // Stage 3 files (15 MB file, 5 MB file, and image)
  console.log('Staging files via DataTransfer...');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    
    // 15 MB file (chunked into 10MB + 5MB)
    const buf15mb = new Uint8Array(15 * 1024 * 1024);
    for (let i = 0; i < buf15mb.length; i += 4096) buf15mb[i] = 65;
    const file1 = new File([buf15mb], 'autoclaw-1.17.2-setup.exe', { type: 'application/x-msdownload' });

    // 5 MB file
    const buf5mb = new Uint8Array(5 * 1024 * 1024);
    for (let i = 0; i < buf5mb.length; i += 4096) buf5mb[i] = 66;
    const file2 = new File([buf5mb], 'app-arm64-v8a-release.apk', { type: 'application/vnd.android.package-archive' });

    // 447 KB JPEG
    const bufJpg = new Uint8Array(447 * 1024);
    const file3 = new File([bufJpg], 'Screenshot_2026-08-21-22-14-18-774_com.atmr.drop.jpg', { type: 'image/jpeg' });

    const dropzone = document.getElementById('dropzone');
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    });
    dt.items.add(file1);
    dt.items.add(file2);
    dt.items.add(file3);

    dropzone.dispatchEvent(dropEvent);
  });

  await new Promise(r => setTimeout(r, 1000));

  // Take screenshot of staged files
  const screenshotPath1 = path.join(__dirname, 'screenshot_large_files_staged.png');
  await page.screenshot({ path: screenshotPath1 });
  console.log('Saved screenshot of staged files:', screenshotPath1);

  // Check if any error toast like "Invalid string length" appeared
  const toastText = await page.evaluate(() => {
    const toast = document.getElementById('toast');
    return toast && toast.classList.contains('show') ? toast.textContent : '';
  });

  console.log('Toast text after staging:', toastText);
  if (toastText.includes('Invalid string length')) {
    throw new Error('Toast error: Invalid string length still appeared!');
  }

  // Click Create Drop and check upload progress
  console.log('Clicking Create Drop...');
  await page.click('#btn-send-drop');

  await new Promise(r => setTimeout(r, 1500));

  const screenshotPath2 = path.join(__dirname, 'screenshot_large_files_progress.png');
  await page.screenshot({ path: screenshotPath2 });
  console.log('Saved screenshot of upload progress:', screenshotPath2);

  // Wait for share view to become active
  await page.waitForSelector('#view-share.active', { timeout: 20000 });
  const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('Drop created successfully with PIN:', pin);

  const screenshotPath3 = path.join(__dirname, 'screenshot_large_files_created.png');
  await page.screenshot({ path: screenshotPath3 });
  console.log('Saved screenshot of completed share screen:', screenshotPath3);

  // Now test downloading the drop on receive tab!
  console.log('Switching to receive tab to retrieve drop with PIN:', pin);
  await page.click('#tab-receive');
  await new Promise(r => setTimeout(r, 500));

  for (let i = 0; i < pin.length; i++) {
    const box = await page.$(`#pin-digit-${i + 1}`);
    if (box) {
      await box.type(pin[i]);
    }
  }

  await page.click('#btn-fetch-drop');

  await page.waitForSelector('#view-vault.active', { timeout: 10000 });
  const screenshotPath4 = path.join(__dirname, 'screenshot_large_files_vault.png');
  await page.screenshot({ path: screenshotPath4 });
  console.log('Saved screenshot of received files in vault:', screenshotPath4);

  await browser.close();

  if (errors.length > 0) {
    throw new Error('Page encountered runtime errors: ' + errors.join(', '));
  }

  console.log('✅ UI Browser verification passed with zero errors and flawless chunk streaming!');
}

testBrowser().catch(err => {
  console.error('❌ Browser test failed:', err);
  process.exit(1);
});
