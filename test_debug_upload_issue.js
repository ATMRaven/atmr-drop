const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function debugUpload() {
  console.log('🔍 Debugging Upload Issue in Chromium...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => {
    console.log('[BROWSER CONSOLE]', msg.type(), msg.text());
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]', err.message);
  });

  page.on('requestfailed', req => {
    console.error('[REQUEST FAILED]', req.method(), req.url(), req.failure()?.errorText);
    networkErrors.push({ url: req.url(), method: req.method(), error: req.failure()?.errorText });
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.error('[HTTP ERROR]', res.status(), res.url());
    }
  });

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // Test 1: Upload a simple text note
  console.log('\n--- TEST 1: Text-only drop ---');
  await page.type('#input-text', 'Hello World debug text drop');
  await page.click('#btn-send-drop');
  await new Promise(r => setTimeout(r, 2000));

  const textShareActive = await page.evaluate(() => document.getElementById('view-share').classList.contains('active'));
  console.log('Text drop created view-share active:', textShareActive);

  // Test 2: Upload file(s)
  console.log('\n--- TEST 2: File drop ---');
  await page.click('#btn-new-send'); // Return to send screen
  await new Promise(r => setTimeout(r, 1000));

  // Simulate file drop
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const f1 = new File(['This is a sample text file content for debugging upload.'], 'sample.txt', { type: 'text/plain' });
    dt.items.add(f1);
    const dropzone = document.getElementById('dropzone');
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  await new Promise(r => setTimeout(r, 1000));
  const stagedCount = await page.evaluate(() => {
    return document.querySelectorAll('#staged-file-list .staged-file-item').length;
  });
  console.log('Staged files count in DOM:', stagedCount);

  console.log('Clicking Create Drop for file...');
  await page.click('#btn-send-drop');
  await new Promise(r => setTimeout(r, 4000));

  const fileShareActive = await page.evaluate(() => document.getElementById('view-share').classList.contains('active'));
  console.log('File drop created view-share active:', fileShareActive);

  // Let's capture screenshot of what's happening
  const ssPath = path.join(__dirname, 'screenshot_debug_upload.png');
  await page.screenshot({ path: ssPath });
  console.log('Saved debug screenshot:', ssPath);

  await browser.close();
}

debugUpload().catch(err => {
  console.error('Debug script failed:', err);
  process.exit(1);
});
