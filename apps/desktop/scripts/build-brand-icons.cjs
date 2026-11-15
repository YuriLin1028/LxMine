// Deterministic raster exports of the shared, original LM vector mark.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const desktop = path.resolve(__dirname, '..');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(desktop, 'build/lm-mark.svg'), 'utf8');
  const window = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, frame: false,
    show: false, opacity: 0, transparent: true, webPreferences: { backgroundThrottling: false } });
  window.showInactive();
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>' + svg));
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(desktop, 'build/icon.png'), image.toPNG());
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map(size => image.resize({ width: size, height: size, quality: 'best' }).toPNG());
  const header = Buffer.alloc(6 + 16 * images.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((png, index) => {
    const at = 6 + index * 16, size = sizes[index];
    header[at] = header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += png.length;
  });
  fs.writeFileSync(path.join(desktop, 'build/icon.ico'), Buffer.concat([header, ...images]));
  const native = path.resolve(desktop, '../harmony/entry/src/main/resources/base/media');
  fs.writeFileSync(path.join(native, 'app_icon.png'), image.resize({ width: 512, height: 512 }).toPNG());
  fs.writeFileSync(path.join(native, 'app_icon_vector.svg'), svg);
  fs.writeFileSync(path.join(native, 'brand_logo.svg'), svg);
  // Harmony's mask uses a separate full-bleed background and transparent foreground.
  const foreground = svg.replace(/<rect[^>]+\/>/, '');
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:transparent}</style>' + foreground));
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(native, 'foreground.png'), (await window.webContents.capturePage()).resize({ width: 512, height: 512 }).toPNG());
  const background = nativeImage.createFromBitmap(Buffer.from([0, 0, 0, 255]), { width: 1, height: 1 }).resize({ width: 512, height: 512 });
  fs.writeFileSync(path.join(native, 'background.png'), background.toPNG());
  const scope = path.resolve(desktop, '../harmony/AppScope/resources/base/media');
  for (const name of ['app_icon.png', 'app_icon_vector.svg', 'foreground.png', 'background.png']) {
    fs.copyFileSync(path.join(native, name), path.join(scope, name));
  }
  console.log('Shared LM mark exported: Windows ICO/PNG and Harmony layered icon.');
  window.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
