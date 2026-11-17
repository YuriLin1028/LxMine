import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';

// 整份快照保存应用数据；同步确认只在 flush 完成后返回成功。
export interface AppData {
  sourceScript: string;
  sourcesJson: string;
  activeSourceId: string;
  settingsJson: string;
  playlistsJson: string;
}
let prefs: preferences.Preferences | null = null;
let runtimePrefs: preferences.Preferences | null = null;
export async function initStore(context: common.UIAbilityContext): Promise<void> {
  if (!prefs) prefs = await preferences.getPreferences(context, 'lxlia');
  if (!runtimePrefs) runtimePrefs = await preferences.getPreferences(context, 'lxmine-runtime');
}
async function read(key: string, fallback: string): Promise<string> {
  const value = await prefs?.get(key, fallback);
  return typeof value === 'string' ? value : fallback;
}
export async function loadAppData(): Promise<AppData> {
  const snapshot = await read('appData', '');
  if (snapshot) return JSON.parse(snapshot) as AppData;
  return { sourceScript: await read('sourceScript', ''), sourcesJson: await read('sourcesJson', '[]'), activeSourceId: await read('activeSourceId', ''), settingsJson: await read('settingsJson', '{}'), playlistsJson: await read('playlistsJson', '[]') };
}
export async function saveAppData(data: AppData): Promise<void> {
  if (!prefs) throw new Error('存储尚未初始化');
  const previous = await read('appData', '');
  try {
    await prefs.put('appData', JSON.stringify(data));
    await prefs.flush();
  } catch (error) {
    if (previous) await prefs.put('appData', previous); else await prefs.delete('appData');
    throw error as Error;
  }
}
export async function loadDeviceId(): Promise<string> {
  let id = await read('deviceId', '');
  if (!id) {
    id = `harmony-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    if (!prefs) throw new Error('存储尚未初始化');
    await prefs.put('deviceId', id);
    await prefs.flush();
  }
  return id;
}
export async function saveUiDiagnostics(value: string): Promise<void> {
  if (runtimePrefs) { await runtimePrefs.put('uiDiagnostics', value); await runtimePrefs.flush(); }
}
export async function saveStageDiagnostics(value: string, key: string = 'stageDiagnostics'): Promise<void> {
  if (runtimePrefs) { await runtimePrefs.put(key, value); await runtimePrefs.flush(); }
}

// Playback is device-local and is never overwritten by a LAN settings snapshot.
export async function loadPlaybackSnapshot(): Promise<string> {
  const current = await runtimePrefs?.get('playbackSnapshot', '');
  if (typeof current === 'string' && current) return current;
  const previous = await read('playbackSnapshot', '');
  if (previous) await savePlaybackSnapshot(previous);
  return previous;
}
export async function savePlaybackSnapshot(value: string): Promise<void> {
  if (!runtimePrefs) return;
  await runtimePrefs.put('playbackSnapshot', value);
  await runtimePrefs.flush();
}

// 首页快照按平台缓存：冷启动先渲染，再由 refreshHomeFeed 静默替换。
export async function loadHomeCache(platform: string): Promise<string> { return read(`homeFeed:${platform}`, ''); }
export async function saveHomeCache(platform: string, value: string): Promise<void> {
  if (!prefs) return;
  await prefs.put(`homeFeed:${platform}`, value);
  await prefs.flush();
}

export async function loadRecentSongs(): Promise<string> { return read('recentSongs', '[]'); }
export async function saveRecentSongs(value: string): Promise<void> {
  if (!prefs) return;
  await prefs.put('recentSongs', value);
  await prefs.flush();
}
