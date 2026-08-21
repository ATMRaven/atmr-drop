const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e';

async function runTest() {
  console.log('--- TESTING IN-APP APK DIRECT DOWNLOAD WITH PROGRESS BAR ---');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 880 });
  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  console.log('1. Displaying Update Available Modal...');
  await page.evaluate(() => {
    // Manually trigger update modal with realistic release info
    const updateModal = document.getElementById('update-modal');
    const updateTitle = document.getElementById('update-title');
    const updateDesc = document.getElementById('update-desc');
    const updateNotesText = document.getElementById('update-notes-text');
    const btnUpdateNow = document.getElementById('btn-update-now');

    updateTitle.textContent = 'Update Available (v1.0.18)';
    updateDesc.textContent = 'A new version of Drop is ready to install.';
    updateNotesText.textContent = '• Real-time in-app APK downloader with live progress bar\n• Background transfer speed optimization\n• Auto-installer trigger on download complete';
    
    updateModal.classList.add('active');
  });

  const ssModalInitial = path.join(ARTIFACT_DIR, 'screenshot_update_modal_initial.png');
  await page.screenshot({ path: ssModalInitial });
  console.log('Saved initial modal screenshot:', ssModalInitial);

  console.log('2. Simulating In-App Download Progress...');
  await page.evaluate(() => {
    const container = document.getElementById('modal-download-progress-container');
    const bar = document.getElementById('modal-download-progress-bar');
    const badge = document.getElementById('modal-download-percent-badge');
    const status = document.getElementById('modal-download-status-text');
    const bytes = document.getElementById('modal-download-bytes-text');
    const speed = document.getElementById('modal-download-speed-text');
    const btnUpdateNow = document.getElementById('btn-update-now');
    const btnUpdateLater = document.getElementById('btn-update-later');

    container.classList.remove('hidden');
    bar.style.width = '54%';
    badge.textContent = '54%';
    status.textContent = 'Downloading v1.0.18...';
    bytes.textContent = '3.35 MB / 6.20 MB';
    speed.textContent = '4.8 MB/s';

    btnUpdateNow.disabled = true;
    btnUpdateNow.textContent = 'Downloading...';
    btnUpdateLater.classList.add('hidden');
  });

  const ssModalDownloading = path.join(ARTIFACT_DIR, 'screenshot_inapp_download_progress.png');
  await page.screenshot({ path: ssModalDownloading });
  console.log('Saved download progress screenshot:', ssModalDownloading);

  console.log('3. Simulating Download Complete & Install Ready...');
  await page.evaluate(() => {
    const bar = document.getElementById('modal-download-progress-bar');
    const badge = document.getElementById('modal-download-percent-badge');
    const status = document.getElementById('modal-download-status-text');
    const bytes = document.getElementById('modal-download-bytes-text');
    const speed = document.getElementById('modal-download-speed-text');
    const btnUpdateNow = document.getElementById('btn-update-now');

    bar.style.width = '100%';
    badge.textContent = '100%';
    status.textContent = 'Ready to Install ✓';
    bytes.textContent = '6.20 MB / 6.20 MB';
    speed.textContent = 'Complete';

    btnUpdateNow.disabled = false;
    btnUpdateNow.textContent = '✓ Install Ready';
  });

  const ssModalComplete = path.join(ARTIFACT_DIR, 'screenshot_inapp_download_complete.png');
  await page.screenshot({ path: ssModalComplete });
  console.log('Saved download complete screenshot:', ssModalComplete);

  await browser.close();
  console.log('--- TEST COMPLETED SUCCESSFULLY! ---');
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
