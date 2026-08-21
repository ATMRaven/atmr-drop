const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860, isMobile: true, hasTouch: true });

  await page.goto('https://drop.atmr.workers.dev/', { waitUntil: 'networkidle2' });

  // Mock an older app version
  await page.evaluate(() => {
    window.APP_VERSION = '1.0.18';
    const footerVer = document.getElementById('footer-version-val');
    if (footerVer) footerVer.textContent = '1.0.18';
  });

  // Trigger check update
  await page.click('#btn-check-update');
  await new Promise(r => setTimeout(r, 1200));

  await page.screenshot({ path: 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e\\screenshot_test_v21_modal.png' });

  // Click Update Now
  await page.click('#btn-update-now');
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e\\screenshot_test_v21_downloading.png' });

  // Wait for completion
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'C:\\Users\\acer nitro\\.gemini\\antigravity-ide\\brain\\b131d9d8-c8f7-420f-9452-1833ef95560e\\screenshot_test_v21_complete.png' });

  await browser.close();
  console.log('Visual verification complete');
})();
