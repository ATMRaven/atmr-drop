const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testLiveBrowser() {
  console.log('🌐 Testing Live Web App in Chromium: https://drop.atmr.workers.dev ...');

  const testFile1 = path.join(__dirname, 'test_sample_1.txt');
  fs.writeFileSync(testFile1, 'Hello from live browser test file 1');

  const testFile2 = path.join(__dirname, 'test_sample_2.png');
  fs.writeFileSync(testFile2, Buffer.alloc(1024 * 80, 0x55));

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    console.log('[BROWSER CONSOLE]', msg.type(), msg.text());
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]', err.message);
    errors.push(err.message);
  });

  await page.goto('https://drop.atmr.workers.dev', { waitUntil: 'networkidle0' });

  // Check version displayed in footer
  const versionText = await page.evaluate(() => {
    const badge = document.getElementById('footer-version') || document.querySelector('.footer-pill, .footer-version');
    return badge ? badge.textContent : 'none';
  });
  console.log('Footer Version displayed:', versionText);

  // Test 1: Upload via file input
  console.log('\n--- 1. Testing file selection via fileInput ---');
  const fileInput = await page.$('#file-input');
  await fileInput.uploadFile(testFile1, testFile2);
  await new Promise(r => setTimeout(r, 800));

  const stagedChips = await page.evaluate(() => {
    const list = document.getElementById('staged-files-list');
    return Array.from(list.querySelectorAll('.staged-chip')).map(c => c.textContent.trim().replace(/\s+/g, ' '));
  });
  console.log('Staged chips after selecting 2 files:', stagedChips);

  // Add text note
  await page.type('#input-text', 'Live test note with files');

  console.log('Clicking Create Drop...');
  await page.click('#btn-send-drop');
  await new Promise(r => setTimeout(r, 3000));

  const shareActive = await page.evaluate(() => document.getElementById('view-share').classList.contains('active'));
  console.log('view-share active:', shareActive);

  if (shareActive) {
    const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
    console.log('Created Drop PIN on live site:', pin);

    // Take screenshot of share screen
    const ssPath = path.join(__dirname, 'screenshot_live_share.png');
    await page.screenshot({ path: ssPath });
    console.log('Saved screenshot:', ssPath);

    // Now test receiver side
    console.log('\n--- 2. Testing Receiver on live site ---');
    await page.click('#tab-receive');
    await new Promise(r => setTimeout(r, 500));

    // Type PIN
    for (let i = 0; i < 4; i++) {
      await page.type(`#pin-digit-${i+1}`, pin[i]);
    }
    await new Promise(r => setTimeout(r, 2000));

    const vaultActive = await page.evaluate(() => document.getElementById('view-vault').classList.contains('active'));
    console.log('view-vault active:', vaultActive);

    const ssPathVault = path.join(__dirname, 'screenshot_live_vault.png');
    await page.screenshot({ path: ssPathVault });
    console.log('Saved vault screenshot:', ssPathVault);
  } else {
    console.error('❌ Failed to transition to share screen on live site!');
    const ssPathFail = path.join(__dirname, 'screenshot_live_fail.png');
    await page.screenshot({ path: ssPathFail });
  }

  await browser.close();
  try { fs.unlinkSync(testFile1); fs.unlinkSync(testFile2); } catch (e) {}

  if (errors.length > 0) {
    console.error('Errors found:', errors);
  }
}

testLiveBrowser().catch(err => {
  console.error('Live browser test error:', err);
  process.exit(1);
});
