const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e';

async function runTest() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 880 });
  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // Staging a >1GB simulated file
  await page.evaluate(() => {
    // Select 24 hours first
    const select = document.getElementById('select-ttl');
    select.value = '86400';

    // Simulate file input drop of 2.4 GB file
    const file = new File([new ArrayBuffer(1024)], 'raw_video_recording.mov', { type: 'video/quicktime' });
    Object.defineProperty(file, 'size', { value: 2.4 * 1024 * 1024 * 1024 });

    // Trigger change on fileInput
    const input = document.getElementById('file-input');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change'));
  });

  await new Promise(r => setTimeout(r, 400));

  // Verify TTL value auto-capped to 1 hour (3600) and notice shown
  const ttlVal = await page.$eval('#select-ttl', el => el.value);
  const is24Disabled = await page.$eval('#select-ttl option[value="86400"]', el => el.disabled);
  const isNoticeVisible = await page.$eval('#ttl-limit-notice', el => !el.classList.contains('hidden'));

  console.log('TTL value after >1GB file:', ttlVal);
  console.log('24h option disabled:', is24Disabled);
  console.log('TTL limit notice visible:', isNoticeVisible);

  const ssTtlPath = path.join(ARTIFACT_DIR, 'screenshot_test_ttl_cap_1gb.png');
  await page.screenshot({ path: ssTtlPath });
  console.log('Saved screenshot:', ssTtlPath);

  await browser.close();
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
