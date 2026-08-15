import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROMIUM_PATH = 'C:\\Users\\acer nitro\\.gemini\\tools\\chromium\\chrome.exe';

async function generateIcons() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const svgPath = path.join(__dirname, 'public', 'favicon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  // Convert SVG to data URI
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;

  const iconTasks = [
    { out: path.join(__dirname, 'public', 'icon.png'), size: 512 },
    { out: path.join(__dirname, 'public', 'icon-192.png'), size: 192 },
    // Android mipmaps
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), size: 48 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png'), size: 48 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png'), size: 48 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png'), size: 72 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png'), size: 72 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png'), size: 72 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png'), size: 96 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png'), size: 96 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png'), size: 96 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png'), size: 144 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png'), size: 144 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png'), size: 144 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'), size: 192 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png'), size: 192 },
    { out: path.join(__dirname, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'), size: 192 },
    // Splash screens
    { out: path.join(__dirname, 'android/app/src/main/res/drawable/splash.png'), size: 512 },
    { out: path.join(__dirname, 'android/app/src/main/res/drawable-port-hdpi/splash.png'), size: 512 },
    { out: path.join(__dirname, 'android/app/src/main/res/drawable-port-mdpi/splash.png'), size: 320 },
    { out: path.join(__dirname, 'android/app/src/main/res/drawable-port-xhdpi/splash.png'), size: 640 },
    { out: path.join(__dirname, 'android/app/src/main/res/drawable-port-xxhdpi/splash.png'), size: 960 },
    { out: path.join(__dirname, 'android/app/src/main/res/drawable-port-xxxhdpi/splash.png'), size: 1280 }
  ];

  for (const item of iconTasks) {
    const dir = path.dirname(item.out);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await page.setViewport({ width: item.size, height: item.size });
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: ${item.size}px; height: ${item.size}px; background: #0A0A0A; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            img { width: 100%; height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${svgDataUri}" />
        </body>
      </html>
    `, { waitUntil: 'load' });

    await page.screenshot({ path: item.out, omitBackground: false });
    console.log(`Generated: ${item.out} (${item.size}x${item.size})`);
  }

  await browser.close();
  console.log('✅ All Art Deco icons and splash assets successfully generated!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
