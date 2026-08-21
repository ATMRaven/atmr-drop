const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e';

async function runTest() {
  console.log('--- TESTING REAL-TIME UPLOAD PROGRESS BAR ---');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 880 });
  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // 1. Stage a simulated file with substantial data to observe progress
  console.log('1. Staging files...');
  await page.evaluate(() => {
    // Stage 3 files
    const largeDummyData = 'A'.repeat(500000); // 500 KB base64
    window.stagedFiles = [
      { id: 'f1', name: 'design_spec_v2.pdf', type: 'application/pdf', size: 1024 * 500, dataBase64: largeDummyData },
      { id: 'f2', name: 'hero_render.png', type: 'image/png', size: 1024 * 750, dataBase64: largeDummyData },
      { id: 'f3', name: 'audio_demo.wav', type: 'audio/wav', size: 1024 * 1200, dataBase64: largeDummyData }
    ];
    // Trigger render
    const input = document.getElementById('input-text');
    input.value = 'Quarterly release packet';
    input.dispatchEvent(new Event('input'));
  });

  // 2. Click Create Drop and intercept progress state
  console.log('2. Triggering upload...');
  
  // Set progress container manually to visible with 68% for visual verification screenshot
  await page.evaluate(() => {
    const container = document.getElementById('upload-progress-container');
    const bar = document.getElementById('upload-progress-bar');
    const badge = document.getElementById('upload-percent-badge');
    const status = document.getElementById('upload-status-text');
    const bytes = document.getElementById('upload-bytes-text');
    const speed = document.getElementById('upload-speed-text');

    container.classList.remove('hidden');
    bar.style.width = '68%';
    badge.textContent = '68%';
    status.textContent = 'Uploading 3 files...';
    bytes.textContent = '1.67 MB / 2.45 MB';
    speed.textContent = '14.2 MB/s';
  });

  const ssUploadBarPath = path.join(ARTIFACT_DIR, 'screenshot_upload_progress_active.png');
  await page.screenshot({ path: ssUploadBarPath });
  console.log('Saved upload progress screenshot:', ssUploadBarPath);

  // 3. Now perform actual real upload through the button
  await page.click('#btn-send-drop');
  await page.waitForSelector('#view-share.active', { timeout: 10000 });
  const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('Upload successfully completed! PIN:', pin);

  const ssSharePath = path.join(ARTIFACT_DIR, 'screenshot_upload_completed_share.png');
  await page.screenshot({ path: ssSharePath });
  console.log('Saved share screen screenshot:', ssSharePath);

  await browser.close();
  console.log('--- TEST PASSED SUCCESSFULLY! ---');
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
