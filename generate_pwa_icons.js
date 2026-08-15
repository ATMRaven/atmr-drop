const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function generatePwaIcons() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const svgPath = path.join(__dirname, 'public', 'favicon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;

  const iconsDir = path.join(__dirname, 'public', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const standardSizes = [72, 96, 128, 144, 152, 192, 384, 512];
  
  for (const size of standardSizes) {
    await page.setViewport({ width: size, height: size });
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: ${size}px; height: ${size}px; background: transparent; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            img { width: 100%; height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${svgDataUri}" />
        </body>
      </html>
    `, { waitUntil: 'load' });

    const outPath = path.join(iconsDir, `icon-${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
    console.log(`Generated standard icon: ${outPath} (${size}x${size})`);
  }

  // Maskable Icons with safe-zone margin (80% scale centered on dark background)
  const maskableSizes = [192, 512];
  for (const size of maskableSizes) {
    await page.setViewport({ width: size, height: size });
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: ${size}px; height: ${size}px; background: #07090e; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            img { width: 78%; height: 78%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${svgDataUri}" />
        </body>
      </html>
    `, { waitUntil: 'load' });

    const outPath = path.join(iconsDir, `icon-maskable-${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: false });
    console.log(`Generated maskable icon: ${outPath} (${size}x${size})`);
  }

  // Apple touch icon (180x180)
  await page.setViewport({ width: 180, height: 180 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 180px; height: 180px; background: #07090e; display: flex; align-items: center; justify-content: center; overflow: hidden; }
          img { width: 85%; height: 85%; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${svgDataUri}" />
      </body>
    </html>
  `, { waitUntil: 'load' });
  const appleTouchPath = path.join(iconsDir, 'apple-touch-icon.png');
  await page.screenshot({ path: appleTouchPath, omitBackground: false });
  console.log(`Generated Apple Touch Icon: ${appleTouchPath} (180x180)`);

  await browser.close();
  console.log('✅ All PWA icons generated successfully!');
}

generatePwaIcons().catch(err => {
  console.error('Failed to generate PWA icons:', err);
  process.exit(1);
});
