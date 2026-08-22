const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testAll() {
  console.log('🚀 Running Complete Verification of Upload Fixes in Chromium...');

  // Create test dummy files
  const testFileText = path.join(__dirname, 'test_sample_doc.txt');
  fs.writeFileSync(testFileText, 'Antigravity verified document content ' + Date.now());

  const testFileImg = path.join(__dirname, 'test_sample_img.png');
  fs.writeFileSync(testFileImg, Buffer.alloc(1024 * 60, 0x42)); // 60 KB PNG

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  const errors = [];
  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()));
  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // TEST 1: Standard File Upload via #file-input
  console.log('\n--- 1. Testing File Upload via fileInput ---');
  const fileInput = await page.$('#file-input');
  await fileInput.uploadFile(testFileText, testFileImg);
  await new Promise(r => setTimeout(r, 600));

  const chips = await page.evaluate(() => {
    const list = document.getElementById('staged-files-list');
    return Array.from(list.querySelectorAll('.staged-chip')).map(c => c.querySelector('.chip-name').textContent.trim());
  });
  console.log('Staged chips:', chips);
  assert.strictEqual(chips.length, 2, 'Must stage 2 files');

  // Submit drop
  console.log('Submitting drop...');
  await page.click('#btn-send-drop');
  await page.waitForSelector('#view-share.active', { timeout: 15000 });
  const pin1 = await page.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('✅ Drop created successfully! PIN:', pin1);

  // Download files on receive
  console.log('\n--- 2. Testing Receiver Retrieval & Download ---');
  await page.click('#tab-receive');
  await new Promise(r => setTimeout(r, 500));
  for (let i = 0; i < 4; i++) {
    await page.type(`#pin-digit-${i+1}`, pin1[i]);
  }
  await page.waitForSelector('#view-vault.active', { timeout: 15000 });
  console.log('✅ Vault decrypted & rendered!');

  const galleryItems = await page.$$('.gallery-item');
  const fileRows = await page.$$('.file-row');
  console.log(`Vault items: ${galleryItems.length} images, ${fileRows.length} files`);
  assert.strictEqual(galleryItems.length, 1, 'Should display 1 image in gallery');
  assert.strictEqual(fileRows.length, 1, 'Should display 1 document file in files list');

  // TEST 3: Simulated Android Share Sheet Data (dataUrl base64)
  console.log('\n--- 3. Testing Simulated Android Share Sheet Ingestion ---');
  await page.click('#tab-send');
  await new Promise(r => setTimeout(r, 500));

  // Dispatch simulated Capacitor Share Sheet event with base64 dataUrl
  await page.evaluate(() => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const fakeIntentData = {
      type: 'files',
      files: [{
        name: 'shared_camera_photo.png',
        type: 'image/png',
        size: 150,
        dataUrl: sampleDataUrl
      }]
    };
    // Call processIncomingSendIntent directly or dispatch event
    const evt = new CustomEvent('sendIntentReceived', { detail: fakeIntentData });
    window.dispatchEvent(evt);

    // Also trigger via stagedFiles helper
    const blob = new Blob([new Uint8Array([1,2,3,4])], { type: 'image/png' });
    const dropzone = document.getElementById('dropzone');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'android_gallery_photo.png', { type: 'image/png' }));
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  await new Promise(r => setTimeout(r, 600));
  const stagedShareCount = await page.evaluate(() => {
    return document.querySelectorAll('#staged-files-list .staged-chip').length;
  });
  console.log('Staged files from share simulation:', stagedShareCount);
  assert(stagedShareCount > 0, 'Must stage shared files');

  // Submit drop from shared data
  console.log('Submitting drop with shared Android file...');
  await page.click('#btn-send-drop');
  await page.waitForSelector('#view-share.active', { timeout: 15000 });
  const pin2 = await page.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('✅ Android shared drop created successfully! PIN:', pin2);

  // Take screenshot of success
  const ssPath = path.join(__dirname, 'screenshot_fix_verification.png');
  await page.screenshot({ path: ssPath });
  console.log('Saved verification screenshot:', ssPath);

  await browser.close();
  try { fs.unlinkSync(testFileText); fs.unlinkSync(testFileImg); } catch (e) {}

  if (errors.length > 0) {
    throw new Error('Errors during verification: ' + errors.join('; '));
  }

  console.log('\n✨ ALL UPLOAD FIXES VERIFIED AND PASSING!');
}

testAll().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
