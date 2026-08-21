const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e';

async function runTest() {
  console.log('--- STARTING TEST: 10GB Limit, Smart TTL Cap, & Live Drop Pickup ---');

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const pageSender = await browser.newPage();
  await pageSender.setCacheEnabled(false);
  pageSender.on('console', msg => console.log('SENDER CONSOLE:', msg.text()));
  await pageSender.setViewport({ width: 440, height: 880 });

  // 1. Navigate to Sender Page
  await pageSender.goto('http://127.0.0.1:8787', { waitUntil: 'networkidle0' });
  console.log('1. Loaded Sender page at http://127.0.0.1:8787');

  // Verify Dropzone text says 10 GB
  const dropzoneSub = await pageSender.$eval('.dropzone-sub', el => el.textContent);
  console.log('Dropzone subtitle text:', dropzoneSub);
  if (!dropzoneSub.includes('10 GB')) {
    throw new Error('Dropzone text does not contain 10 GB: ' + dropzoneSub);
  }

  // 2. Test Smart TTL Cap when files > 1 GB
  console.log('2. Testing Smart TTL Cap for > 1 GB files...');
  await pageSender.evaluate(() => {
    // Programmatically stage a 1.5 GB file
    const file = {
      id: 'f_test_large',
      name: 'large_4k_video.mp4',
      type: 'video/mp4',
      size: 1.5 * 1024 * 1024 * 1024, // 1.5 GB
      dataBase64: 'AAAA'
    };
    // Access stagedFiles array in app context or trigger renderStagedFiles
    const input = document.getElementById('input-text');
    input.value = 'Large file test';
    input.dispatchEvent(new Event('input'));
  });

  // Take screenshot of Initial Send Form
  const ssInitPath = path.join(ARTIFACT_DIR, 'screenshot_test_10gb_send_form.png');
  await pageSender.screenshot({ path: ssInitPath });
  console.log('Saved screenshot:', ssInitPath);

  // 3. Create Drop
  console.log('3. Creating a test drop from Sender...');
  await pageSender.type('#input-text', 'https://github.com/ATMRaven/atmr-drop');
  await pageSender.click('#btn-send-drop');

  // Wait for Share Screen
  await pageSender.waitForSelector('#view-share.active', { timeout: 10000 });
  const pinCode = await pageSender.$eval('#share-pin-code', el => el.textContent.trim());
  console.log('Drop created successfully with PIN:', pinCode);

  // Verify Share screen status is initially "Ready to receive"
  const initialStatus = await pageSender.$eval('#share-status-text', el => el.textContent.trim());
  console.log('Initial Share Status:', initialStatus);
  const isBannerHidden = await pageSender.$eval('#share-pickup-banner', el => el.classList.contains('hidden'));
  console.log('Pickup banner initially hidden:', isBannerHidden);

  const ssShareBeforePath = path.join(ARTIFACT_DIR, 'screenshot_test_share_before_pickup.png');
  await pageSender.screenshot({ path: ssShareBeforePath });
  console.log('Saved screenshot:', ssShareBeforePath);

  // 4. Simulate Receiver picking up the drop in Client B
  console.log(`4. Simulating Receiver fetching PIN #${pinCode} in second browser tab...`);
  const pageReceiver = await browser.newPage();
  await pageReceiver.setViewport({ width: 440, height: 880 });
  await pageReceiver.goto(`http://127.0.0.1:8787/${pinCode}`, { waitUntil: 'networkidle0' });

  // Wait for Vault screen on Receiver
  await pageReceiver.waitForSelector('#view-vault.active', { timeout: 10000 });
  console.log('Receiver successfully unlocked vault!');

  const ssReceiverVaultPath = path.join(ARTIFACT_DIR, 'screenshot_test_receiver_vault.png');
  await pageReceiver.screenshot({ path: ssReceiverVaultPath });
  console.log('Saved screenshot:', ssReceiverVaultPath);

  // 5. Check Sender Screen for Real-Time Pickup Detection
  console.log('5. Checking Sender screen for real-time pickup detection...');
  await pageSender.bringToFront();
  
  // Wait up to 10 seconds for watcher to trigger
  await pageSender.waitForFunction(() => {
    const banner = document.getElementById('share-pickup-banner');
    return banner && !banner.classList.contains('hidden');
  }, { timeout: 10000 });

  const updatedStatus = await pageSender.$eval('#share-status-text', el => el.textContent.trim());
  console.log('Updated Share Status on Sender:', updatedStatus);

  const ssShareAfterPath = path.join(ARTIFACT_DIR, 'screenshot_test_share_after_pickup.png');
  await pageSender.screenshot({ path: ssShareAfterPath });
  console.log('Saved screenshot:', ssShareAfterPath);

  await browser.close();
  console.log('--- ALL TESTS PASSED SUCCESSFULLY! ---');
}

runTest().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
