'use strict';

/**
 * Minimal Electron host for tools/smoke.cjs when Playwright's Chromium/Edge
 * channels are unavailable. The URL is passed through HX_DEMO_URL.
 */

const { app, BrowserWindow } = require('electron');

const url = process.env.HX_DEMO_URL;
if (!url) {
  console.error('HX_DEMO_URL is required');
  app.exit(2);
}

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadURL(url);
  win.webContents.once('did-finish-load', () => {
    win.show();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());
