const { app, BrowserWindow } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 376, height: 800, useContentSize: true, frame: false, show: false, backgroundColor: '#000000', webPreferences: { backgroundThrottling: false } });
  w.setOpacity(0); w.showInactive();
  await w.loadFile(path.join(__dirname, process.env.LM_SYSTEM_MENU==='1'?'system-menu-lab.html':'lab.html'), { query: { materialLab: '1' } });
});
app.on('window-all-closed', () => app.quit());
