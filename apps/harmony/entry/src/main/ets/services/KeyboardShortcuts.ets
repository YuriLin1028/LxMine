export interface ShortcutActionDef {
  id: string;
  label: string;
  detail: string;
  defaultKey: string;
}

export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  { id: 'playPause', label: '播放 / 暂停', detail: '切换当前音乐播放状态', defaultKey: 'Space' },
  { id: 'prevTrack', label: '上一首', detail: '切换到播放队列上一曲', defaultKey: 'Ctrl+Left' },
  { id: 'nextTrack', label: '下一首', detail: '切换到播放队列下一曲', defaultKey: 'Ctrl+Right' },
  { id: 'volUp', label: '调高音量', detail: '将播放音量提高 5%', defaultKey: 'Alt+Up' },
  { id: 'volDown', label: '调低音量', detail: '将播放音量降低 5%', defaultKey: 'Alt+Down' },
  { id: 'mute', label: '静音 / 取消静音', detail: '快速静音或恢复播放音量', defaultKey: 'Alt+M' },
  { id: 'toggleLike', label: '收藏 / 取消收藏', detail: '收藏或取消收藏当前歌曲', defaultKey: 'Ctrl+L' },
  { id: 'openDetail', label: '展开 / 收起播放页', detail: '在播放详情舞台与主页间切换', defaultKey: 'Ctrl+D' },
  { id: 'toggleImmersive', label: '切换沉浸模式', detail: '播放页隐藏或恢复控件（全屏纯享）', defaultKey: 'F11' },
  { id: 'openSearch', label: '快速搜索', detail: '打开全平台聚合搜索栏', defaultKey: 'Ctrl+F' },
  { id: 'toggleDesktopLyrics', label: '桌面歌词开关', detail: '鸿蒙 PC 悬浮桌面歌词显隐', defaultKey: 'Ctrl+Shift+L' },
  { id: 'lockDesktopLyrics', label: '锁定 / 解锁桌面歌词', detail: '切换鸿蒙 PC 桌面歌词鼠标穿透锁定', defaultKey: 'Ctrl+Shift+K' },
  { id: 'toggleWallpaper', label: '壁纸模式开关', detail: '开启或退出鸿蒙 PC 独立壁纸舞台', defaultKey: 'Ctrl+Shift+W' },
  { id: 'toggleEarMonitor', label: '耳返设置', detail: '打开实时耳返与混响控制面板', defaultKey: 'Ctrl+M' },
  { id: 'cycleMode', label: '切换播放顺序', detail: '在列表循环 / 单曲 / 随机 / 顺序间切换', defaultKey: 'Ctrl+R' }
];

export function defaultShortcutBindings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of SHORTCUT_ACTIONS) out[item.id] = item.defaultKey;
  return out;
}

export function normalizeShortcutBindings(raw?: Record<string, Object>): Record<string, string> {
  const out = defaultShortcutBindings();
  if (!raw) return out;
  for (const item of SHORTCUT_ACTIONS) {
    const val = raw[item.id];
    if (typeof val === 'string') out[item.id] = val.trim();
  }
  return out;
}

export function keyNameFromCode(keyCode: number): string {
  // OpenHarmony KeyCode values (ohos.multimodalInput.keyCode)
  if (keyCode === 2050) return 'Space';
  if (keyCode === 2012) return 'Up';
  if (keyCode === 2013) return 'Down';
  if (keyCode === 2014) return 'Left';
  if (keyCode === 2015) return 'Right';
  if (keyCode === 2070) return 'Escape';
  if (keyCode === 2054) return 'Enter';
  if (keyCode === 2055) return 'Backspace';
  if (keyCode === 2071) return 'Delete';
  if (keyCode === 2049) return 'Tab';
  if (keyCode === 2057) return '-';
  if (keyCode === 2058) return '=';
  if (keyCode === 2059) return '[';
  if (keyCode === 2060) return ']';
  if (keyCode === 2043) return ',';
  if (keyCode === 2044) return '.';
  if (keyCode === 2064) return '/';
  if (keyCode >= 2017 && keyCode <= 2042) {
    return String.fromCharCode(65 + (keyCode - 2017)); // A..Z
  }
  if (keyCode >= 2000 && keyCode <= 2009) {
    return String(keyCode - 2000); // 0..9
  }
  if (keyCode >= 2090 && keyCode <= 2101) {
    return `F${keyCode - 2089}`;
  }
  return '';
}

export function formatKeyEventCombo(event: KeyEvent): string {
  const base = keyNameFromCode(event.keyCode);
  if (!base) return '';
  let ctrl = false;
  let shift = false;
  let alt = false;
  try {
    ctrl = event.getModifierKeyState ? (event.getModifierKeyState(['Ctrl']) === true) : false;
    shift = event.getModifierKeyState ? (event.getModifierKeyState(['Shift']) === true) : false;
    alt = event.getModifierKeyState ? (event.getModifierKeyState(['Alt']) === true) : false;
  } catch (_) {}
  const parts: string[] = [];
  if (ctrl) parts.push('Ctrl');
  if (alt) parts.push('Alt');
  if (shift) parts.push('Shift');
  parts.push(base);
  return parts.join('+');
}
