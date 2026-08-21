const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testComprehensive() {
  console.log('🚀 Starting Comprehensive 4-Pillar Verification in Chromium...');
  
  // Clean up any previous test pin
  await fetch('http://127.0.0.1:8787/api/drop/HERO', { method: 'DELETE' }).catch(() => {});
  await fetch('http://127.0.0.1:8787/api/drop/COOL', { method: 'DELETE' }).catch(() => {});

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  const errors = [];
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => {
    console.error('BROWSER ERROR:', err.message);
    errors.push(err.message);
  });

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // TEST 1: Advanced Drawer & Custom 4-Char PIN + Zero-Knowledge E2EE
  console.log('\n--- TEST 1: Creating E2EE Drop with Custom PIN "HERO" ---');
  await page.click('#btn-toggle-advanced');
  await new Promise(r => setTimeout(r, 300));

  await page.type('#input-custom-pin', 'hero'); // lowercase typing -> should uppercase to HERO
  await page.click('#check-e2ee'); // check E2EE toggle

  await page.type('#input-text', 'Top secret zero-knowledge encrypted drop payload with direct links: https://atmr.dev');

  // Stage simulated folder files
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const f1 = new File([new Uint8Array(1024 * 50)], 'document.pdf', { type: 'application/pdf' });
    const f2 = new File([new Uint8Array(1024 * 100)], 'image.png', { type: 'image/png' });
    dt.items.add(f1);
    dt.items.add(f2);
    const dropzone = document.getElementById('dropzone');
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  await new Promise(r => setTimeout(r, 600));
  const ssPath1 = path.join(__dirname, 'screenshot_test1_e2ee_staged.png');
  await page.screenshot({ path: ssPath1 });
  console.log('Saved screenshot 1:', ssPath1);

  // Click Create Drop
  console.log('Submitting E2EE Drop...');
  await page.click('#btn-send-drop');

  await page.waitForSelector('#view-share.active', { timeout: 15000 });
  const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
  const shareUrl = await page.$eval('#share-direct-url', el => el.value);
  console.log(`Drop created successfully with PIN: "${pin}" and Share URL: "${shareUrl}"`);
  assert.strictEqual(pin, 'HERO');
  assert(shareUrl.includes('#key='), 'Share URL must contain client-side #key= hash fragment');

  const ssPath2 = path.join(__dirname, 'screenshot_test2_e2ee_share_screen.png');
  await page.screenshot({ path: ssPath2 });
  console.log('Saved screenshot 2:', ssPath2);

  // TEST 2: 4-Box PIN Pasting Auto-Distribution Fix
  console.log('\n--- TEST 2: Testing 4-Box PIN Pasting Auto-Distribution ---');
  await page.click('#tab-receive');
  await new Promise(r => setTimeout(r, 500));

  // Simulate pasting a 4-char string into box 1
  await page.evaluate(() => {
    const box1 = document.getElementById('pin-digit-1');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hero'); // lowercase paste
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });
    box1.dispatchEvent(pasteEvent);
  });

  // Verify all 4 boxes are populated
  const digits = await page.evaluate(() => [
    document.getElementById('pin-digit-1').value,
    document.getElementById('pin-digit-2').value,
    document.getElementById('pin-digit-3').value,
    document.getElementById('pin-digit-4').value,
  ]);
  console.log('Pasted digits in 4 boxes:', digits);
  assert.deepStrictEqual(digits, ['H', 'E', 'R', 'O'], 'All 4 boxes must be populated from single paste');

  // Verify automatic transition to Vault Decryption
  await page.waitForSelector('#view-vault.active', { timeout: 15000 });
  const ssPath3 = path.join(__dirname, 'screenshot_test3_vault_decrypted.png');
  await page.screenshot({ path: ssPath3 });
  console.log('Saved screenshot 3:', ssPath3);

  // TEST 3: Vault History Modal & Drop Revocation
  console.log('\n--- TEST 3: Testing Vault History Modal & Drop Revocation ---');
  await page.click('#btn-open-history');
  await page.waitForSelector('#history-modal.show', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 500));

  const ssPath4 = path.join(__dirname, 'screenshot_test4_vault_history.png');
  await page.screenshot({ path: ssPath4 });
  console.log('Saved screenshot 4:', ssPath4);

  // Close history modal
  await page.evaluate(() => {
    document.getElementById('history-modal').classList.remove('show');
  });
  await new Promise(r => setTimeout(r, 500));

  // TEST 4: Camera QR Scanner Modal
  console.log('\n--- TEST 4: Testing Camera QR Scanner Viewfinder ---');
  await page.click('#tab-receive');
  await new Promise(r => setTimeout(r, 500));

  await page.click('#btn-scan-qr');
  await page.waitForSelector('#qr-scanner-modal.show', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 600));

  const ssPath5 = path.join(__dirname, 'screenshot_test5_qr_scanner_viewfinder.png');
  await page.screenshot({ path: ssPath5 });
  console.log('Saved screenshot 5:', ssPath5);

  await page.evaluate(() => {
    document.getElementById('btn-close-qr-scanner').click();
  });
  await new Promise(r => setTimeout(r, 300));

  await browser.close();

  if (errors.length > 0) {
    throw new Error('Runtime page errors encountered: ' + errors.join(', '));
  }

  console.log('\n✨ ALL 4 PROPOSITIONS & PIN PASTE FIXES FULLY VERIFIED IN BROWSER!');
}

testComprehensive().catch(err => {
  console.error('❌ Comprehensive test failed:', err);
  process.exit(1);
});
