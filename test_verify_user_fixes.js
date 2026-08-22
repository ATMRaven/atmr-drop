const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function testUserFixes() {
  console.log('🔍 Testing Version Display, Live Countdown Clocks, and Delete Drop Actions...');

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 450, height: 900 });

  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });

  // TEST 1: Version on Footer
  console.log('\n--- 1. Testing Footer Version Display ---');
  const footerVer = await page.$eval('#footer-version-val', el => el.textContent.trim());
  console.log('Footer version displayed:', footerVer);
  assert.strictEqual(footerVer, '1.0.29', 'Footer must display v1.0.29');

  // TEST 2: Create Drop and Verify Live Share Countdown + Delete Button
  console.log('\n--- 2. Testing Live Share Countdown & Delete Drop Button ---');
  await page.type('#input-text', 'Live Countdown & Delete Verification Test');
  await page.click('#btn-send-drop');
  await page.waitForSelector('#view-share.active', { timeout: 15000 });

  const pin = await page.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('Created drop PIN:', pin);

  // Check clock tick after 2 seconds
  const initialTime = await page.$eval('#share-time-left', el => el.textContent.trim());
  console.log('Initial Share Clock:', initialTime);
  await new Promise(r => setTimeout(r, 2200));
  const tickedTime = await page.$eval('#share-time-left', el => el.textContent.trim());
  console.log('Share Clock after 2s:', tickedTime);
  assert.notStrictEqual(initialTime, tickedTime, 'Clock must be actively counting down, not stuck');

  // Check Delete Drop button on Share Screen
  const deleteBtnShare = await page.$('#btn-cancel-drop');
  const deleteBtnText = await page.$eval('#btn-cancel-drop', el => el.textContent.trim());
  console.log('Delete button on Share screen:', deleteBtnText);
  assert(deleteBtnShare !== null, 'Delete button must exist on share view');
  assert(deleteBtnText.includes('Delete Drop'), 'Delete button must have clear label');

  // Screenshot of Share Screen
  await page.screenshot({ path: path.join(__dirname, 'screenshot_userfix_share.png') });

  // TEST 3: Receiver Vault Live Countdown & Delete From Server
  console.log('\n--- 3. Testing Receiver Vault Countdown & Delete Button ---');
  await page.click('#tab-receive');
  await new Promise(r => setTimeout(r, 500));
  for (let i = 0; i < 4; i++) {
    await page.type(`#pin-digit-${i+1}`, pin[i]);
  }
  await page.waitForSelector('#view-vault.active', { timeout: 15000 });

  const vaultClock1 = await page.$eval('#receive-expiry-text', el => el.textContent.trim());
  console.log('Vault Initial Clock:', vaultClock1);
  await new Promise(r => setTimeout(r, 2200));
  const vaultClock2 = await page.$eval('#receive-expiry-text', el => el.textContent.trim());
  console.log('Vault Clock after 2s:', vaultClock2);
  assert.notStrictEqual(vaultClock1, vaultClock2, 'Vault clock must tick dynamically');

  // Check Delete From Server button on Vault Screen
  const deleteBtnVault = await page.$('#btn-delete-vault-drop');
  const deleteVaultText = await page.$eval('#btn-delete-vault-drop', el => el.textContent.trim());
  console.log('Delete button on Vault screen:', deleteVaultText);
  assert(deleteBtnVault !== null, 'Delete From Server button must exist on vault screen');
  assert(deleteVaultText.includes('Delete From Server'), 'Delete button must be clearly labeled');

  // Screenshot of Vault Screen
  await page.screenshot({ path: path.join(__dirname, 'screenshot_userfix_vault.png') });

  // TEST 4: Active Banner on Send Screen & Banner Delete Button
  console.log('\n--- 4. Testing Send Tab Active Banner & Quick Delete ---');
  await page.click('#tab-send');
  await new Promise(r => setTimeout(r, 500));
  const bannerVisible = await page.$eval('#active-drop-banner', el => !el.classList.contains('hidden'));
  console.log('Active banner visible on Send tab:', bannerVisible);
  assert(bannerVisible, 'Active banner must be visible');

  const bannerPin = await page.$eval('#active-banner-pin', el => el.textContent.trim());
  const bannerTime = await page.$eval('#active-banner-time', el => el.textContent.trim());
  console.log(`Active Banner PIN: ${bannerPin}, Time: ${bannerTime}`);

  const bannerDeleteBtn = await page.$('#btn-banner-delete');
  assert(bannerDeleteBtn !== null, 'Banner delete button must exist');

  // Screenshot of Send View with Active Banner
  await page.screenshot({ path: path.join(__dirname, 'screenshot_userfix_send_banner.png') });

  await browser.close();
  console.log('\n🎉 ALL 3 USER REPORTED ISSUES VERIFIED FIXED!');
}

testUserFixes().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
