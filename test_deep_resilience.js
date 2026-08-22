const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testResilience() {
  console.log('🛡️ Starting Deep Resilience Test for Web & Mobile Uploads...');

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  const errors = [];
  page.on('console', msg => console.log('[BROWSER]', msg.text()));
  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // TEST 1: E2EE Encrypted File & Image Drop
  console.log('\n--- 1. Testing E2EE Encrypted File & Image Upload ---');
  await page.click('#btn-toggle-advanced');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#check-e2ee');

  await page.type('#input-text', 'Top Secret E2EE note https://atmr.dev');

  // Stage simulated files
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const f1 = new File([new Uint8Array(1024 * 40)], 'secret_doc.pdf', { type: 'application/pdf' });
    const f2 = new File([new Uint8Array(1024 * 50)], 'secret_photo.jpg', { type: 'image/jpeg' });
    dt.items.add(f1);
    dt.items.add(f2);
    const dropzone = document.getElementById('dropzone');
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-send-drop');
  await page.waitForSelector('#view-share.active', { timeout: 15000 });
  const e2eePin = await page.$eval('#share-pin-code', el => el.textContent.trim());
  const e2eeUrl = await page.$eval('#share-direct-url', el => el.value);
  console.log(`✅ E2EE Drop created: PIN ${e2eePin}, URL contains #key=:`, e2eeUrl.includes('#key='));
  assert(e2eeUrl.includes('#key='), 'URL must contain #key= fragment');

  // TEST 2: Receiver E2EE Decryption
  console.log('\n--- 2. Testing Receiver E2EE Decryption ---');
  await page.click('#tab-receive');
  await new Promise(r => setTimeout(r, 500));
  for (let i = 0; i < 4; i++) {
    await page.type(`#pin-digit-${i+1}`, e2eePin[i]);
  }
  await page.waitForSelector('#view-vault.active', { timeout: 15000 });
  console.log('✅ Receiver vault screen decrypted!');

  const decryptedText = await page.$eval('#received-text-content', el => el.textContent.trim());
  console.log('Decrypted text content:', decryptedText);
  assert.strictEqual(decryptedText, 'Top Secret E2EE note https://atmr.dev');

  // TEST 3: Camera Capture Simulation
  console.log('\n--- 3. Testing Camera Capture ---');
  await page.click('#tab-send');
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    // Simulate photo captured from camera
    const blob = new Blob([new Uint8Array(1024 * 30)], { type: 'image/jpeg' });
    const file = new File([blob], 'camera_snap.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropzone = document.getElementById('dropzone');
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  await new Promise(r => setTimeout(r, 600));
  await page.click('#btn-send-drop');
  await page.waitForSelector('#view-share.active', { timeout: 15000 });
  const camPin = await page.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('✅ Camera drop created: PIN', camPin);

  await browser.close();

  if (errors.length > 0) {
    throw new Error('Encountered page errors: ' + errors.join('; '));
  }

  console.log('\n🎉 ALL RESILIENCE TESTS PASSED CLEANLY!');
}

testResilience().catch(err => {
  console.error('❌ Resilience test failed:', err);
  process.exit(1);
});
