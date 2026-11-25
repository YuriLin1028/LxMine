/* LxMine PC renderer — tablet-first layout, rewritten on top of the existing
   Electron IPC/LX source backend. */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const audio = $('#audio');
  const audioB = $('#audio-b');
  const STORE_KEY = 'lxmine.pc.v1';
  const MINE_STYLES = [
    ['smart-auto', '随声绘色'],
    ['off', '关闭动效'],
    ['mine-0', 'emily专辑封面'], ['mine-1', '滚筒'], ['mine-2', '星球'], ['mine-3', '虚空'],
    ['mine-4', '唱片'], ['mine-5', '星河'], ['mine-6', '安魂'], ['mine-7', '音域回响 · 地形'],
    ['mine-8', '音域回响 · 工坊'], ['mine-9', '月蚀圣环'], ['mine-10', '雨幕霓虹'],
    ['mine-11', '折光蝶群'], ['mine-12', '深海绽放'],
    ['folia-partita', 'Folia · 云阶'], ['folia-pendolo', 'Folia · Pendolo'],
    ['folia-diorama', 'Folia · 镜台'], ['folia-fume', 'Folia · Fume'],
    ['folia-sonnet', 'Folia · 商籁'], ['folia-tempera', 'Folia · 凝彩'],
    ['folia-lumiere', 'Folia · 绘光'], ['folia-monet', 'Folia · Monet'],
    ['folia-cadenza', 'Folia · Mindscape'], ['folia-claddagh', 'Folia · Claddagh'],
    ['folia-tilt', 'Folia · Tilt'], ['folia-classic', 'Folia · Luminous'],
    ['folia-cappella', 'Folia · Cappella']
  ];
  const PLATFORMS = [
    ['all', '聚合', 'all'], ['kw', '酷我', 'kuwo'], ['kg', '酷狗', 'kugou'], ['wy', '网易云', 'netease'], ['tx', 'QQ 音乐', 'qq']
  ];
  const KIND_TABS = [['music', '综合'], ['songlist', '歌单'], ['artist', '歌手'], ['album', '专辑'], ['lyric', '歌词'], ['podcast', '播客']];
  const PROVIDER_LABEL = { kuwo: '酷我', kugou: '酷狗', netease: '网易云', qq: 'QQ 音乐', migu: '咪咕', qishui: '汽水', local: '本地', mineradio: 'LxMine' };
  const SOURCE_OF_PROVIDER = { kuwo: 'kw', kugou: 'kg', netease: 'wy', qq: 'tx' };
  const SEARCH_SOURCES = ['kw', 'kg', 'wy', 'tx'];

  const defaults = {
    tab: 'home', homePlatform:'wy', quality: '128k', mode: '列表循环', styleName: 'mine-7', appearance: 'system', lyricOffset: 0,
    stageBgOpacity: 0.78, pageBgOpacity: 0.35, wallpaperBgOpacity: 0.42, wallpaperOverallOpacity: 0.95,
    resumeOnStartup: false, startupAnimation: false, refreshAlgoOnDoubleTap: true, algoRefreshSeed: 0,
    desktopLyrics: false, desktopLyricsLocked:false, wallpaperMode: false, closeToTray: false, launchAtStartup: false, lanAutoSync: false, favorites: [], recentlyPlayed: [], searchHistory: [], volume: 1,
    lyricShowTranslation: true, lyricShowRomaji: false, lyricFontSize: 1, lyricLineSpacing: 1.2, lyricMaxLines: 0,
    lyricColorMode: 'cover-gradient', lyricColor: '#7dd3fc', lyricColor2: '#a5b4fc',
    desktopLyricLines: 3, desktopLyricSize: 1,
    desktopLyricColorMode: 'cover-gradient', desktopLyricColor: '#7dd3fc', desktopLyricColor2: '#a5b4fc',
    audioFx: { preset: 'off', customBands: [0, 0, 0, 0, 0], spatial: false, spatialMode: 'off', reverb: 'none' },
    earMonitor: { mode: 'off', micVolume: 1.0, vocalVolume: 1.0 },
    shortcuts: {
      toggle: 'Space',
      prev: 'Alt+Left',
      next: 'Alt+Right',
      volUp: 'Alt+Up',
      volDown: 'Alt+Down',
      mute: 'Ctrl+M',
      like: 'Ctrl+L',
      detail: 'Ctrl+P',
      immersive: 'F11',
      search: 'Ctrl+F',
      desktopLyrics: 'Ctrl+Alt+D',
      lockLyrics: 'Ctrl+Alt+L',
      cycleMode: 'Ctrl+Shift+M'
    },
    globalShortcutsEnabled: true,
    autoMixEnabled: false, playPauseFadeEnabled: true, stageResetCameraOnSong: true, dislikedKeys: [], sleepFinishSong: false,
    smartStageCache: { catalogSignature: '', choices: {} },
    mosaicSeed: 0
  };
  const DEFAULT_SHORTCUTS = Object.freeze(Object.assign({}, defaults.shortcuts));
  const SHORTCUT_META = [
    ['toggle', '播放 / 暂停', '控制当前歌曲播放或暂停', true],
    ['prev', '上一首', '切换到播放队列上一首歌曲', true],
    ['next', '下一首', '切换到播放队列下一首歌曲', true],
    ['volUp', '增大音量', '每次提高 5% 音量', true],
    ['volDown', '减小音量', '每次降低 5% 音量', true],
    ['mute', '静音 / 取消静音', '快速切换静音状态', true],
    ['like', '收藏 / 取消收藏', '收藏或取消收藏当前歌曲', true],
    ['detail', '打开 / 关闭播放页', '在主界面与歌词舞台间切换', false],
    ['immersive', '切换沉浸模式', '播放页隐藏/恢复控件（全屏纯享）', false],
    ['search', '打开搜索', '快速定位到搜索输入框', false],
    ['desktopLyrics', '开关桌面歌词', '快速显示或隐藏悬浮桌面歌词', true],
    ['lockLyrics', '锁定 / 解锁桌面歌词', '切换桌面歌词鼠标穿透锁定', true],
    ['cycleMode', '切换播放顺序', '列表循环 / 单曲 / 随机 / 顺序', false]
  ];
  function loadStore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return Object.assign({}, defaults, value || {});
    } catch (_) { return Object.assign({}, defaults); }
  }
  const S = Object.assign(loadStore(), {
    feed: null, feedCache:{}, feedLoading: false, library: [], localTracks: [], downloads: [], devices: [],
    sources: [], activeSourceId: '', sourcesLoading: false,
    search: { open: false, kind: 'music', platform: 'all', query: '', results: [], entities: [], page: 1, hasMore: false, loading: false, historyOnly: true },
    queue: [], queueIndex: -1, current: null, loadedSongKey: '', playingFromSearch: false, searchAddedPlaylistMap: {}, playing: false, playRequested: false, resolving: false, position: 0, duration: 0,
    lyrics: [], lyricIndex: -1,
    resolvedStyleName: 'mine-7', autoMixPreview: '', autoMixActive: false, currentAutoMixPlan: null,
    sleepMode: 'off', sleepEndAt: 0, sleepPendingStop: false, sleepRemainingText: '',
    detailOpen: false, commentsOpen: false, searchOpen: false, searchReturnToPlayer: false, desktopLyricsPushedAt: 0, searchOriginRect: null, homeCompact: false, phoneExpanded: false, dockCompact: false, scrollTravel: 0, lastScroll: null, homeChipAnchor: 'banner', homeChipHoldUntil: 0, playingFeedId: '', viewTransitionToken: 0,
    scrollMemory: {}, commentToken: 0, resolveToken: 0, feedToken: 0,
    currentView: { name: 'home' }, stack: [], routeSeed: 0
  });
  S.recentlyPlayed = Array.isArray(S.recentlyPlayed) ? S.recentlyPlayed.filter(song => song && song.id && song.name) : [];
  S.lyricOffset = Number(S.lyricOffset) || 0;
  S.stageBgOpacity = Number.isFinite(Number(S.stageBgOpacity)) ? Math.max(0, Math.min(1, Number(S.stageBgOpacity))) : 0.78;
  S.stageBgImage = '';
  try { S.stageBgImage = localStorage.getItem(STORE_KEY + '.stageBgImage') || ''; } catch (_) {}
  S.pageBgOpacity = Number.isFinite(Number(S.pageBgOpacity)) ? Math.max(0.10, Math.min(0.85, Number(S.pageBgOpacity))) : 0.35;
  S.wallpaperBgOpacity = Number.isFinite(Number(S.wallpaperBgOpacity)) ? Math.max(0, Math.min(1, Number(S.wallpaperBgOpacity))) : 0.42;
  S.wallpaperOverallOpacity = Number.isFinite(Number(S.wallpaperOverallOpacity)) ? Math.max(0.25, Math.min(1, Number(S.wallpaperOverallOpacity))) : 0.95;
  S.pageBgImage = '';
  try { S.pageBgImage = localStorage.getItem(STORE_KEY + '.pageBgImage') || ''; } catch (_) {}
  S.refreshAlgoOnDoubleTap = S.refreshAlgoOnDoubleTap !== false;
  S.algoRefreshSeed = Math.max(0, Math.floor(Number(S.algoRefreshSeed) || 0));
  S.volume = Number(S.volume);
  if (!Number.isFinite(S.volume) || S.volume < 0) S.volume = 1;
  S.volume = Math.max(0, Math.min(1, S.volume));
  const lyricColorModes = ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'];
  for (const key of ['lyricColorMode', 'desktopLyricColorMode']) {
    if (!lyricColorModes.includes(S[key])) S[key] = 'cover-gradient';
  }
  S.lyricShowTranslation = S.lyricShowTranslation !== false;
  S.lyricShowRomaji = S.lyricShowRomaji === true;
  S.lyricFontSize = Math.max(0.55, Math.min(1.5, Number(S.lyricFontSize) || 1));
  S.lyricLineSpacing = Math.max(0.85, Math.min(1.8, Number(S.lyricLineSpacing) || 1.2));
  S.lyricMaxLines = Math.max(0, Math.min(10, Math.round(Number(S.lyricMaxLines) || 0)));
  S.autoMixEnabled = S.autoMixEnabled === true;
  S.stageResetCameraOnSong = S.stageResetCameraOnSong !== false;
  S.sleepFinishSong = S.sleepFinishSong === true;
  S.dislikedKeys = Array.isArray(S.dislikedKeys) ? S.dislikedKeys.filter(Boolean).slice(0, 300) : [];
  S.audioFx = window.LxMineAudioFx ? window.LxMineAudioFx.normalizeConfig(S.audioFx) : Object.assign({ preset: 'off', customBands: [0,0,0,0,0], spatial: false, reverb: 'none' }, S.audioFx || {});
  if (!S.smartStageCache || typeof S.smartStageCache !== 'object') S.smartStageCache = { catalogSignature: '', choices: {} };
  if (!S.smartStageCache.choices || typeof S.smartStageCache.choices !== 'object') S.smartStageCache.choices = {};
  S.lanAutoSync = S.lanAutoSync === true;
  S.desktopLyricLines = [1, 2, 3, 5].includes(Number(S.desktopLyricLines)) ? Number(S.desktopLyricLines) : 3;
  S.desktopLyricSize = Math.max(0.72, Math.min(1.55, Number(S.desktopLyricSize) || 1));
  S.lyricColor = /^#[0-9a-f]{6}$/i.test(S.lyricColor || '') ? S.lyricColor : '#7dd3fc';
  S.lyricColor2 = /^#[0-9a-f]{6}$/i.test(S.lyricColor2 || '') ? S.lyricColor2 : '#a5b4fc';
  S.desktopLyricColor = /^#[0-9a-f]{6}$/i.test(S.desktopLyricColor || '') ? S.desktopLyricColor : '#7dd3fc';
  S.desktopLyricColor2 = /^#[0-9a-f]{6}$/i.test(S.desktopLyricColor2 || '') ? S.desktopLyricColor2 : '#a5b4fc';
  if (S.lyricColorMode.startsWith('cover-')) {
    if (S.lyricColor.toLowerCase() === '#f4d28a') S.lyricColor = '#7dd3fc';
    if (S.lyricColor2.toLowerCase() === '#8fb2a6') S.lyricColor2 = '#a5b4fc';
  }
  if (S.desktopLyricColorMode.startsWith('cover-')) {
    if (S.desktopLyricColor.toLowerCase() === '#f4d28a') S.desktopLyricColor = '#7dd3fc';
    if (S.desktopLyricColor2.toLowerCase() === '#8fb2a6') S.desktopLyricColor2 = '#a5b4fc';
  }

  let saveStoreTimer = 0;
  function scheduleSaveStore(delayMs = 260) {
    if (saveStoreTimer) clearTimeout(saveStoreTimer);
    saveStoreTimer = setTimeout(() => { saveStoreTimer = 0; saveStore(); }, delayMs);
  }
  let stageMetaPushTimer = 0;
  function scheduleStageMetadataPush(delayMs = 45) {
    if (stageMetaPushTimer) return;
    stageMetaPushTimer = setTimeout(() => { stageMetaPushTimer = 0; pushStageMetadata(); }, delayMs);
  }
  function saveStore() {
    if (saveStoreTimer) { clearTimeout(saveStoreTimer); saveStoreTimer = 0; }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        tab: S.tab, homePlatform:S.homePlatform, quality: S.quality, mode: S.mode, styleName: S.styleName,
        stageBgOpacity: S.stageBgOpacity, pageBgOpacity: S.pageBgOpacity,
        wallpaperBgOpacity: S.wallpaperBgOpacity, wallpaperOverallOpacity: S.wallpaperOverallOpacity,
        lyricOffset: S.lyricOffset, appearance: S.appearance, resumeOnStartup: S.resumeOnStartup === true, startupAnimation: S.startupAnimation,
        refreshAlgoOnDoubleTap: S.refreshAlgoOnDoubleTap !== false, algoRefreshSeed: S.algoRefreshSeed,
        desktopLyrics: S.desktopLyrics, desktopLyricsLocked:S.desktopLyricsLocked, wallpaperMode: S.wallpaperMode, closeToTray: S.closeToTray, launchAtStartup: S.launchAtStartup, lanAutoSync: S.lanAutoSync === true,
        favorites: S.favorites, recentlyPlayed: S.recentlyPlayed, searchHistory: S.searchHistory, volume: S.volume,
        lyricShowTranslation: S.lyricShowTranslation, lyricShowRomaji: S.lyricShowRomaji, lyricFontSize: S.lyricFontSize,
        lyricLineSpacing: S.lyricLineSpacing, lyricMaxLines: S.lyricMaxLines,
        lyricColorMode: S.lyricColorMode, lyricColor: S.lyricColor, lyricColor2: S.lyricColor2,
        desktopLyricLines: S.desktopLyricLines, desktopLyricSize: S.desktopLyricSize,
        desktopLyricColorMode: S.desktopLyricColorMode, desktopLyricColor: S.desktopLyricColor, desktopLyricColor2: S.desktopLyricColor2,
        audioFx: { preset: S.audioFx?.preset || 'off', customBands: (S.audioFx?.customBands || [0,0,0,0,0]).slice(0, 5), spatial: !!S.audioFx?.spatial, spatialMode: S.audioFx?.spatialMode || 'off', reverb: S.audioFx?.reverb || 'none' },
        earMonitor: { mode: S.earMonitor?.mode || 'off', micVolume: Number.isFinite(Number(S.earMonitor?.micVolume)) ? Number(S.earMonitor.micVolume) : 1, vocalVolume: Number.isFinite(Number(S.earMonitor?.vocalVolume)) ? Number(S.earMonitor.vocalVolume) : 1 },
        shortcuts: Object.assign({}, DEFAULT_SHORTCUTS, S.shortcuts || {}),
        globalShortcutsEnabled: S.globalShortcutsEnabled !== false,
        autoMixEnabled: !!S.autoMixEnabled, playPauseFadeEnabled: S.playPauseFadeEnabled !== false, stageResetCameraOnSong: S.stageResetCameraOnSong !== false, dislikedKeys: (S.dislikedKeys || []).slice(0, 300), sleepFinishSong: !!S.sleepFinishSong,
        smartStageCache: S.smartStageCache,
        mosaicSeed: S.mosaicSeed
      }));
    } catch (_) {}
  }
  // 曲库拼贴只随机一次：种子写入 localStorage，之后每次启动都复用同一排列。
  if (!Number.isFinite(Number(S.mosaicSeed)) || Number(S.mosaicSeed) === 0) {
    S.mosaicSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
    saveStore();
  }

  function h(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function installGlassDecorator() { window.LxGlass.install(); }
  const ICONS = {
    ic_home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M10.72 3.28a1.9 1.9 0 0 1 2.56 0l7.15 6.55c.36.33.57.8.57 1.29v7.38A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-7.38c0-.49.21-.96.57-1.29l7.15-6.55ZM12 5.22 5 11.63v6.87c0 .28.22.5.5.5h3.75v-4.25a2.75 2.75 0 1 1 5.5 0V19h3.75a.5.5 0 0 0 .5-.5v-6.87L12 5.22Zm-1.25 9.53a1.25 1.25 0 1 1 2.5 0V19h-2.5v-4.25Z"/></g></svg>',
    ic_library: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.5 3A1.5 1.5 0 0 1 8 1.5h8A1.5 1.5 0 0 1 17.5 3a.75.75 0 0 1-.75.75h-9.5A.75.75 0 0 1 6.5 3ZM4.75 5.75A1.25 1.25 0 0 1 6 4.5h12a1.25 1.25 0 0 1 1.25 1.25.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1-.75-.75ZM5.75 8h12.5A2.75 2.75 0 0 1 21 10.75v7.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25v-7.5A2.75 2.75 0 0 1 5.75 8Zm4.65 3.42a.95.95 0 0 0-1.45.81v4.54a.95.95 0 0 0 1.45.81l3.78-2.27a.95.95 0 0 0 0-1.62l-3.78-2.27Z"/></g></svg>',
    ic_settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M4.2 6.8a.9.9 0 0 1 .9-.9h4.65a2.35 2.35 0 0 1 4.5 0h4.65a.9.9 0 1 1 0 1.8h-4.65a2.35 2.35 0 0 1-4.5 0H5.1a.9.9 0 0 1-.9-.9Zm6.9 0a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0ZM4.2 12a.9.9 0 0 1 .9-.9h1.15a2.35 2.35 0 0 1 4.5 0h8.15a.9.9 0 1 1 0 1.8h-8.15a2.35 2.35 0 0 1-4.5 0H5.1a.9.9 0 0 1-.9-.9Zm3.4 0a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0ZM4.2 17.2a.9.9 0 0 1 .9-.9h8.15a2.35 2.35 0 0 1 4.5 0h1.15a.9.9 0 1 1 0 1.8h-1.15a2.35 2.35 0 0 1-4.5 0H5.1a.9.9 0 0 1-.9-.9Zm10.4 0a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0Z"/></g></svg>',
    ic_play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M7.35 4.86C7.35 3.63 8.7 2.88 9.76 3.52l10.02 6.08c1.01.61 1.01 2.09 0 2.7L9.76 18.38c-1.06.64-2.41-.11-2.41-1.34V4.86Z" transform="translate(0 1.05)"/></g></svg>',
    ic_pause: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.75 4.5A2.25 2.25 0 0 1 9 6.75v10.5a2.25 2.25 0 1 1-4.5 0V6.75A2.25 2.25 0 0 1 6.75 4.5Zm10.5 0a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 1 1-4.5 0V6.75a2.25 2.25 0 0 1 2.25-2.25Z"/></g></svg>',
    ic_next: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M5.2 5.68c0-1.08 1.18-1.74 2.11-1.17l8.22 5.06a1.38 1.38 0 0 1 0 2.34l-8.22 5.06c-.93.57-2.11-.09-2.11-1.17V5.68Zm13.05-.43a1.25 1.25 0 0 1 1.25 1.25v11a1.25 1.25 0 1 1-2.5 0v-11a1.25 1.25 0 0 1 1.25-1.25Z" transform="translate(0 1.25)"/></g></svg>',
    ic_previous: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M5.75 5.25A1.25 1.25 0 0 1 7 6.5v11a1.25 1.25 0 1 1-2.5 0v-11a1.25 1.25 0 0 1 1.25-1.25Zm13.05.43v10.12c0 1.08-1.18 1.74-2.11 1.17l-8.22-5.06a1.38 1.38 0 0 1 0-2.34l8.22-5.06c.93-.57 2.11.09 2.11 1.17Z" transform="translate(0 1.25)"/></g></svg>',
    ic_repeat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M16.72 3.22a.9.9 0 0 1 1.28 0l2.45 2.45a.9.9 0 0 1 0 1.28l-2.45 2.45a.9.9 0 1 1-1.28-1.28l.91-.91H8.25A3.25 3.25 0 0 0 5 10.46v1.29a.9.9 0 1 1-1.8 0v-1.29A5.05 5.05 0 0 1 8.25 5.4h9.38l-.91-.9a.9.9 0 0 1 0-1.28Zm3.18 8.13a.9.9 0 0 1 .9.9v1.29a5.05 5.05 0 0 1-5.05 5.06H6.37l.91.9a.9.9 0 1 1-1.28 1.28l-2.45-2.45a.9.9 0 0 1 0-1.28l2.45-2.45a.9.9 0 1 1 1.28 1.28l-.91.91h9.38A3.25 3.25 0 0 0 19 13.54v-1.29a.9.9 0 0 1 .9-.9Z"/></g></svg>',
    ic_repeat_one: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M16.72 3.22a.9.9 0 0 1 1.28 0l2.45 2.45a.9.9 0 0 1 0 1.28l-2.45 2.45a.9.9 0 1 1-1.28-1.28l.91-.91H8.25A3.25 3.25 0 0 0 5 10.46v1.29a.9.9 0 1 1-1.8 0v-1.29A5.05 5.05 0 0 1 8.25 5.4h9.38l-.91-.9a.9.9 0 0 1 0-1.28Zm3.18 8.13a.9.9 0 0 1 .9.9v1.29a5.05 5.05 0 0 1-5.05 5.06H6.37l.91.9a.9.9 0 1 1-1.28 1.28l-2.45-2.45a.9.9 0 0 1 0-1.28l2.45-2.45a.9.9 0 1 1 1.28 1.28l-.91.91h9.38A3.25 3.25 0 0 0 19 13.54v-1.29a.9.9 0 0 1 .9-.9ZM12.35 8.85a.8.8 0 0 1 .8.8v4.7a.8.8 0 1 1-1.6 0v-3.15l-.68.42a.75.75 0 1 1-.79-1.27l1.45-.9a.8.8 0 0 1 .82-.6Z"/></g></svg>',
    ic_shuffle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M17.22 3.72a.9.9 0 0 1 1.28 0l2.25 2.25a.9.9 0 0 1 0 1.28l-2.25 2.25a.9.9 0 1 1-1.28-1.28l.71-.72h-1.36a3.4 3.4 0 0 0-2.72 1.36l-4.2 5.6A5.2 5.2 0 0 1 5.49 16.5H3.9a.9.9 0 1 1 0-1.8h1.59a3.4 3.4 0 0 0 2.72-1.36l4.2-5.6A5.2 5.2 0 0 1 16.57 5.7h1.36l-.71-.7a.9.9 0 0 1 0-1.28ZM3.9 5.7h1.59a5.2 5.2 0 0 1 4.16 2.08l.76 1.01a.9.9 0 1 1-1.44 1.08l-.76-1.01A3.4 3.4 0 0 0 5.49 7.5H3.9a.9.9 0 0 1 0-1.8Zm9.69 8.43a.9.9 0 0 1 1.26.18l.76 1.01a3.4 3.4 0 0 0 2.72 1.38h.96l-.71-.72a.9.9 0 1 1 1.28-1.28l2.25 2.25a.9.9 0 0 1 0 1.28l-2.25 2.25a.9.9 0 1 1-1.28-1.28l.71-.7h-.96a5.2 5.2 0 0 1-4.16-2.08l-.76-1.01a.9.9 0 0 1 .18-1.28Z"/></g></svg>',
    ic_order_seq: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M4 5.75A.95.95 0 0 1 4.95 4.8h14.1a.95.95 0 1 1 0 1.9H4.95A.95.95 0 0 1 4 5.75Zm0 5.5a.95.95 0 0 1 .95-.95h10.1a.95.95 0 1 1 0 1.9H4.95a.95.95 0 0 1-.95-.95Zm0 5.5a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9h-7.6a.95.95 0 0 1-.95-.95Zm12.05-2.63c0-.72.79-1.16 1.4-.78l3.7 2.28a.92.92 0 0 1 0 1.56l-3.7 2.28c-.61.38-1.4-.06-1.4-.78v-4.56Z"/></g></svg>',
    ic_queue: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M16.25 3.6a.95.95 0 0 1 1.16-.92l3.1.78a.95.95 0 0 1 .72.92v1.65a.95.95 0 0 1-1.18.92l-1.9-.48v8.03a3.25 3.25 0 1 1-1.9-2.96V3.6ZM3.75 6.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h5.1a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Z"/></g></svg>',
    ic_heart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 5.74C10.17 3.92 7.18 3.77 5.2 5.66c-2.06 1.96-2.15 5.23-.26 7.36 1.57 1.77 5.24 4.98 6.4 5.95.38.32.94.32 1.32 0 1.16-.97 4.83-4.18 6.4-5.95 1.89-2.13 1.8-5.4-.26-7.36-1.98-1.89-4.97-1.74-6.8.08Zm-.67 2.02a.95.95 0 0 0 1.34 0l.56-.58c1.19-1.22 3.14-1.32 4.41-.11 1.32 1.26 1.38 3.35.15 4.73-1.25 1.4-4.27 4.05-5.79 5.34-1.52-1.29-4.54-3.94-5.79-5.34-1.23-1.38-1.17-3.47.15-4.73 1.27-1.21 3.22-1.11 4.41.11l.56.58Z"/></g></svg>',
    ic_heart_fill: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 5.82C10.18 3.94 7.16 3.78 5.16 5.69c-2.08 1.98-2.17 5.28-.26 7.43 1.59 1.79 5.29 5.02 6.44 5.99.38.32.94.32 1.32 0 1.15-.97 4.85-4.2 6.44-5.99 1.91-2.15 1.82-5.45-.26-7.43-2-1.91-5.02-1.75-6.84.13Z" fill="#FF4D5A"/><path d="M7.6 7.25a2.6 2.6 0 0 0-1.55 2.4.65.65 0 0 1-1.3 0 3.9 3.9 0 0 1 2.33-3.58.65.65 0 1 1 .52 1.18Z" fill="#FFFFFF" fill-opacity="0.34"/></svg>',
    ic_download: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 3.25a.95.95 0 0 1 .95.95v8.56l2.42-2.42a.95.95 0 1 1 1.34 1.34l-4.04 4.04a.95.95 0 0 1-1.34 0L7.29 11.68a.95.95 0 1 1 1.34-1.34l2.42 2.42V4.2a.95.95 0 0 1 .95-.95ZM4.45 15.4a.95.95 0 0 1 .95.95v1.15c0 .75.6 1.35 1.35 1.35h10.5c.75 0 1.35-.6 1.35-1.35v-1.15a.95.95 0 1 1 1.9 0v1.15A3.25 3.25 0 0 1 17.25 20.75H6.75A3.25 3.25 0 0 1 3.5 17.5v-1.15a.95.95 0 0 1 .95-.95Z"/></g></svg>',
    ic_search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M10.5 3.1a7.4 7.4 0 1 0 4.6 13.2l4.76 4.77a.9.9 0 0 0 1.28-1.27l-4.77-4.77A7.4 7.4 0 0 0 10.5 3.1Zm-5.6 7.4a5.6 5.6 0 1 1 11.2 0 5.6 5.6 0 0 1-11.2 0Z"/></g></svg>',
    ic_back: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M14.78 4.97a1.05 1.05 0 0 1 0 1.48L9.23 12l5.55 5.55a1.05 1.05 0 1 1-1.48 1.48l-6.3-6.29a1.05 1.05 0 0 1 0-1.48l6.3-6.29a1.05 1.05 0 0 1 1.48 0Z"/></g></svg>',
    ic_forward: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" transform="translate(24 0) scale(-1 1)"><path d="M14.78 4.97a1.05 1.05 0 0 1 0 1.48L9.23 12l5.55 5.55a1.05 1.05 0 1 1-1.48 1.48l-6.3-6.29a1.05 1.05 0 0 1 0-1.48l6.3-6.29a1.05 1.05 0 0 1 1.48 0Z"/></g></svg>',
    ic_down: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M5.22 8.97a1.02 1.02 0 0 1 1.44 0L12 14.31l5.34-5.34a1.02 1.02 0 1 1 1.44 1.44l-6.06 6.06a1.02 1.02 0 0 1-1.44 0L5.22 10.41a1.02 1.02 0 0 1 0-1.44Z"/></g></svg>',
    ic_close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.22 6.22a1.02 1.02 0 0 1 1.44 0L12 10.56l4.34-4.34a1.02 1.02 0 1 1 1.44 1.44L13.44 12l4.34 4.34a1.02 1.02 0 1 1-1.44 1.44L12 13.44l-4.34 4.34a1.02 1.02 0 0 1-1.44-1.44L10.56 12 6.22 7.66a1.02 1.02 0 0 1 0-1.44Z"/></g></svg>',
    ic_more: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.25 12a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm7.4 0a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm5.75 1.65a1.65 1.65 0 1 0 0-3.3 1.65 1.65 0 0 0 0 3.3Z"/></g></svg>',
    ic_plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 4.25a1.05 1.05 0 0 1 1.05 1.05v5.65h5.65a1.05 1.05 0 1 1 0 2.1h-5.65v5.65a1.05 1.05 0 1 1-2.1 0v-5.65H5.3a1.05 1.05 0 1 1 0-2.1h5.65V5.3A1.05 1.05 0 0 1 12 4.25Z"/></g></svg>',
    ic_import: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 3.25a.95.95 0 0 1 .95.95v7.86l2.18-2.18a.95.95 0 1 1 1.34 1.34l-3.8 3.8a.95.95 0 0 1-1.34 0l-3.8-3.8a.95.95 0 1 1 1.34-1.34l2.18 2.18V4.2a.95.95 0 0 1 .95-.95ZM6.5 9.25a.9.9 0 0 1 0 1.8h-.75c-.75 0-1.35.6-1.35 1.35v5.1c0 .75.6 1.35 1.35 1.35h12.5c.75 0 1.35-.6 1.35-1.35v-5.1c0-.75-.6-1.35-1.35-1.35h-.75a.9.9 0 1 1 0-1.8h.75A3.15 3.15 0 0 1 21.4 12.4v5.1a3.15 3.15 0 0 1-3.15 3.15H5.75A3.15 3.15 0 0 1 2.6 17.5v-5.1a3.15 3.15 0 0 1 3.15-3.15h.75Z"/></g></svg>',
    refresh: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 3.6a8.4 8.4 0 0 1 6.72 3.36V5.35a.9.9 0 1 1 1.8 0v3.95a.9.9 0 0 1-.9.9h-3.95a.9.9 0 1 1 0-1.8h1.85A6.6 6.6 0 0 0 5.46 11.1a.9.9 0 1 1-1.78-.24A8.4 8.4 0 0 1 12 3.6Zm8.1 9.3a.9.9 0 0 1 .78 1.02A8.4 8.4 0 0 1 5.28 17.04v1.61a.9.9 0 1 1-1.8 0V14.7a.9.9 0 0 1 .9-.9h3.95a.9.9 0 1 1 0 1.8H6.48a6.6 6.6 0 0 0 12.06-2.7.9.9 0 0 1 1.56 0Z"/></g></svg>',
    ic_trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M9.5 3.25A1.75 1.75 0 0 1 11.25 1.5h1.5A1.75 1.75 0 0 1 14.5 3.25v.75h4.25a.9.9 0 1 1 0 1.8h-.92l-.68 11.63A2.75 2.75 0 0 1 14.4 20h-4.8a2.75 2.75 0 0 1-2.75-2.57L6.17 5.8h-.92a.9.9 0 1 1 0-1.8H9.5v-.75Zm1.8.25v.5h1.4v-.5a.25.25 0 0 0-.25-.25h-.9a.25.25 0 0 0-.25.25ZM7.98 5.8l.66 11.52c.03.49.44.88.96.88h4.8c.52 0 .93-.39.96-.88L16.02 5.8H7.98Zm2.27 2.95a.8.8 0 0 1 .8.8v5.2a.8.8 0 1 1-1.6 0v-5.2a.8.8 0 0 1 .8-.8Zm3.5 0a.8.8 0 0 1 .8.8v5.2a.8.8 0 1 1-1.6 0v-5.2a.8.8 0 0 1 .8-.8Z" transform="translate(0 1)"/></g></svg>',
    ic_edit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M15.58 3.58a2.45 2.45 0 0 1 3.46 3.46l-8.95 8.95a2.2 2.2 0 0 1-1.02.58l-3.32.83a.9.9 0 0 1-1.09-1.09l.83-3.32c.1-.4.3-.75.58-1.02l8.95-8.95.56-.44Zm2.18 1.28a.65.65 0 0 0-.92 0l-.98.98.92.92.98-.98a.65.65 0 0 0 0-.92Zm-2.26 2.26-6.95 6.95a.5.5 0 0 0-.13.23l-.47 1.88 1.88-.47a.5.5 0 0 0 .23-.13l6.95-6.95-.92-.92-.59-.59ZM13.5 18.7a.9.9 0 0 1 .9-.9h5.35a.9.9 0 1 1 0 1.8H14.4a.9.9 0 0 1-.9-.9Z"/></g></svg>',
    ic_switch_platform: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M7.25 4.5a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-1.15 2.75a1.15 1.15 0 1 1 2.3 0 1.15 1.15 0 0 1-2.3 0Zm10.65 6.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-1.15 2.75a1.15 1.15 0 1 1 2.3 0 1.15 1.15 0 0 1-2.3 0ZM15.72 3.72a.88.88 0 0 1 1.24 0l2.32 2.32a.88.88 0 0 1 0 1.24l-2.32 2.32a.88.88 0 1 1-1.24-1.24l.82-.82h-4.29a.88.88 0 1 1 0-1.76h4.29l-.82-.82a.88.88 0 0 1 0-1.24ZM8.28 14.4a.88.88 0 0 1 0 1.24l-.82.82h4.29a.88.88 0 1 1 0 1.76H7.46l.82.82a.88.88 0 1 1-1.24 1.24l-2.32-2.32a.88.88 0 0 1 0-1.24l2.32-2.32a.88.88 0 0 1 1.24 0Z"/></g></svg>',
    ic_play_next: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M8 3.25h8A4.75 4.75 0 0 1 20.75 8v8A4.75 4.75 0 0 1 16 20.75H8A4.75 4.75 0 0 1 3.25 16V8A4.75 4.75 0 0 1 8 3.25ZM8 5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8Zm.15 4.18c0-.68.74-1.1 1.33-.75l4.02 2.42c.57.34.57 1.16 0 1.5l-4.02 2.42c-.59.35-1.33-.07-1.33-.75V9.18Zm7.2-.83a.8.8 0 0 1 .8.8v5.7a.8.8 0 1 1-1.6 0v-5.7a.8.8 0 0 1 .8-.8Z"/></g></svg>',
    ic_music: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M18.88 3.28a1.1 1.1 0 0 1 1.37 1.07v10.9a3.5 3.5 0 1 1-1.9-3.11V7.02l-7.6 1.9v8.08a3.5 3.5 0 1 1-1.9-3.11V6.35a1.1 1.1 0 0 1 .83-1.07l9.2-2Z"/></g></svg>',
    ic_comment_official: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M5.5 4.25h13A2.75 2.75 0 0 1 21.25 7v8.25A2.75 2.75 0 0 1 18.5 18h-7.1l-3.95 2.63A.9.9 0 0 1 6.05 19.9V18H5.5a2.75 2.75 0 0 1-2.75-2.75V7A2.75 2.75 0 0 1 5.5 4.25Zm0 1.7A1.05 1.05 0 0 0 4.45 7v8.25c0 .58.47 1.05 1.05 1.05h1.4a.85.85 0 0 1 .85.85v1.18l2.8-1.86a.85.85 0 0 1 .47-.17h7.48c.58 0 1.05-.47 1.05-1.05V7c0-.58-.47-1.05-1.05-1.05h-13ZM8.5 11.1a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Zm4.65 0a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Zm3.5 1.15a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z"/></g></svg>',
    ic_share_official: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M17.5 3.5a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-11 5.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm11 5.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm-8.28-4.76 5.9-3.16a.85.85 0 1 1 .8 1.5l-5.9 3.16a.85.85 0 1 1-.8-1.5Zm0 3.52a.85.85 0 0 1 1.15-.35l5.9 3.16a.85.85 0 1 1-.8 1.5l-5.9-3.16a.85.85 0 0 1-.35-1.15Z"/></g></svg>',
    ic_cast: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M5.75 4.25h12.5A2.75 2.75 0 0 1 21 7v8.5a2.75 2.75 0 0 1-2.75 2.75h-2.1a.9.9 0 1 1 0-1.8h2.1c.52 0 .95-.43.95-.95V7c0-.52-.43-.95-.95-.95H5.75c-.52 0-.95.43-.95.95v1.6a.9.9 0 1 1-1.8 0V7a2.75 2.75 0 0 1 2.75-2.75ZM3.9 11.9a.9.9 0 0 1 .9-.9A8.2 8.2 0 0 1 13 19.2a.9.9 0 1 1-1.8 0 6.4 6.4 0 0 0-6.4-6.4.9.9 0 0 1-.9-.9Zm0 3.6a.9.9 0 0 1 .9-.9 4.6 4.6 0 0 1 4.6 4.6.9.9 0 1 1-1.8 0 2.8 2.8 0 0 0-2.8-2.8.9.9 0 0 1-.9-.9Zm2.35 3.7a1.45 1.45 0 1 1-2.9 0 1.45 1.45 0 0 1 2.9 0Z"/></g></svg>',
    ic_style_wand: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M9.6 3.4c.28-.65 1.18-.65 1.46 0l1.46 3.45 3.45 1.46c.65.28.65 1.18 0 1.46l-3.45 1.46-1.46 3.45c-.28.65-1.18.65-1.46 0l-1.46-3.45-3.45-1.46c-.65-.28-.65-1.18 0-1.46l3.45-1.46L9.6 3.4Z" fill="#FFFFFF"/><path d="M16.95 13.1c.2-.46.86-.46 1.06 0l.82 1.94 1.94.82c.46.2.46.86 0 1.06l-1.94.82-.82 1.94c-.2.46-.86.46-1.06 0l-.82-1.94-1.94-.82c-.46-.2-.46-.86 0-1.06l1.94-.82.82-1.94Z" fill="#64D2FF"/></svg>',
    ic_sparkle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M11.35 2.95c.26-.6 1.04-.6 1.3 0l1.42 3.28 3.28 1.42c.6.26.6 1.04 0 1.3l-3.28 1.42-1.42 3.28c-.26.6-1.04.6-1.3 0L9.93 10.37 6.65 8.95c-.6-.26-.6-1.04 0-1.3l3.28-1.42 1.42-3.28Z" fill="#64D2FF"/><path d="M17.55 13.75c.19-.43.81-.43 1 0l.68 1.52 1.52.68c.43.19.43.81 0 1l-1.52.68-.68 1.52c-.19.43-.81.43-1 0l-.68-1.52-1.52-.68c-.43-.19-.43-.81 0-1l1.52-.68.68-1.52Z" fill="#A5B4FC"/><path d="M6.05 14.35c.16-.36.64-.36.8 0l.5 1.15 1.15.5c.36.16.36.64 0 .8l-1.15.5-.5 1.15c-.16.36-.64.36-.8 0l-.5-1.15-1.15-.5c-.36-.16-.36-.64 0-.8l1.15-.5.5-1.15Z" fill="#FFFFFF"/></svg>',
    fullscreen: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M14.2 4.1a.85.85 0 0 1 .85-.85h4.85a.85.85 0 0 1 .85.85v4.85a.85.85 0 1 1-1.7 0V6.15l-4.25 4.25a.85.85 0 1 1-1.2-1.2l4.25-4.25h-2.8a.85.85 0 0 1-.85-.85ZM9.8 19.9a.85.85 0 0 1-.85.85H4.1a.85.85 0 0 1-.85-.85v-4.85a.85.85 0 1 1 1.7 0v2.8l4.25-4.25a.85.85 0 1 1 1.2 1.2l-4.25 4.25h2.8a.85.85 0 0 1 .85.85Z"/></g></svg>',
    shrink: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M7.8 3.6a.9.9 0 0 1 .9.9v2.1a2.1 2.1 0 0 1-2.1 2.1H4.5a.9.9 0 1 1 0-1.8h2.1a.3.3 0 0 0 .3-.3V4.5a.9.9 0 0 1 .9-.9Zm8.4 0a.9.9 0 0 1 .9.9v2.1c0 .17.13.3.3.3h2.1a.9.9 0 1 1 0 1.8h-2.1a2.1 2.1 0 0 1-2.1-2.1V4.5a.9.9 0 0 1 .9-.9ZM4.5 15.3h2.1a2.1 2.1 0 0 1 2.1 2.1v2.1a.9.9 0 1 1-1.8 0v-2.1a.3.3 0 0 0-.3-.3H4.5a.9.9 0 1 1 0-1.8Zm10.8 2.1a2.1 2.1 0 0 1 2.1-2.1h2.1a.9.9 0 1 1 0 1.8h-2.1a.3.3 0 0 0-.3.3v2.1a.9.9 0 1 1-1.8 0v-2.1Z"/></g></svg>',
    ic_volume: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M11.35 4.52a1.1 1.1 0 0 1 1.9.76v13.44a1.1 1.1 0 0 1-1.9.76L7.38 15.6H4.75A1.75 1.75 0 0 1 3 13.85v-3.7A1.75 1.75 0 0 1 4.75 8.4h2.63l3.97-3.88Zm4.58 3.92a.9.9 0 0 1 1.27-.04 5.25 5.25 0 0 1 0 7.2.9.9 0 1 1-1.31-1.23 3.45 3.45 0 0 0 0-4.74.9.9 0 0 1 .04-1.19Zm2.58-2.46a.9.9 0 0 1 1.27-.03 8.65 8.65 0 0 1 0 12.1.9.9 0 1 1-1.3-1.24 6.85 6.85 0 0 0 0-9.62.9.9 0 0 1 .03-1.21Z"/></g></svg>',
    ic_mute: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M11.35 4.52a1.1 1.1 0 0 1 1.9.76v13.44a1.1 1.1 0 0 1-1.9.76L7.38 15.6H4.75A1.75 1.75 0 0 1 3 13.85v-3.7A1.75 1.75 0 0 1 4.75 8.4h2.63l3.97-3.88Zm4.37 4.7a.9.9 0 0 1 1.27 0L18.5 10.73l1.51-1.51a.9.9 0 1 1 1.27 1.27L19.77 12l1.51 1.51a.9.9 0 1 1-1.27 1.27L18.5 13.27l-1.51 1.51a.9.9 0 1 1-1.27-1.27L17.23 12l-1.51-1.51a.9.9 0 0 1 0-1.27Z"/></g></svg>',
    symbol_clock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM4.8 12a7.2 7.2 0 1 1 14.4 0 7.2 7.2 0 0 1-14.4 0Zm7.2-4.35a.9.9 0 0 1 .9.9v3.1l2.22 1.33a.9.9 0 1 1-.92 1.54l-2.65-1.59a.9.9 0 0 1-.45-.78V8.55a.9.9 0 0 1 .9-.9Z"/></g></svg>',
    chip_music: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M18.88 3.28a1.1 1.1 0 0 1 1.37 1.07v10.9a3.5 3.5 0 1 1-1.9-3.11V7.02l-7.6 1.9v8.08a3.5 3.5 0 1 1-1.9-3.11V6.35a1.1 1.1 0 0 1 .83-1.07l9.2-2Z"/></g></svg>',
    chip_music_on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="#64D2FF" fill-rule="evenodd" clip-rule="evenodd"><path d="M18.88 3.28a1.1 1.1 0 0 1 1.37 1.07v10.9a3.5 3.5 0 1 1-1.9-3.11V7.02l-7.6 1.9v8.08a3.5 3.5 0 1 1-1.9-3.11V6.35a1.1 1.1 0 0 1 .83-1.07l9.2-2Z"/></g></svg>',
    chip_library: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.5 3A1.5 1.5 0 0 1 8 1.5h8A1.5 1.5 0 0 1 17.5 3a.75.75 0 0 1-.75.75h-9.5A.75.75 0 0 1 6.5 3ZM4.75 5.75A1.25 1.25 0 0 1 6 4.5h12a1.25 1.25 0 0 1 1.25 1.25.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1-.75-.75ZM5.75 8h12.5A2.75 2.75 0 0 1 21 10.75v7.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25v-7.5A2.75 2.75 0 0 1 5.75 8Zm4.65 3.42a.95.95 0 0 0-1.45.81v4.54a.95.95 0 0 0 1.45.81l3.78-2.27a.95.95 0 0 0 0-1.62l-3.78-2.27Z"/></g></svg>',
    chip_library_on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="#64D2FF" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.5 3A1.5 1.5 0 0 1 8 1.5h8A1.5 1.5 0 0 1 17.5 3a.75.75 0 0 1-.75.75h-9.5A.75.75 0 0 1 6.5 3ZM4.75 5.75A1.25 1.25 0 0 1 6 4.5h12a1.25 1.25 0 0 1 1.25 1.25.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1-.75-.75ZM5.75 8h12.5A2.75 2.75 0 0 1 21 10.75v7.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25v-7.5A2.75 2.75 0 0 1 5.75 8Zm4.65 3.42a.95.95 0 0 0-1.45.81v4.54a.95.95 0 0 0 1.45.81l3.78-2.27a.95.95 0 0 0 0-1.62l-3.78-2.27Z"/></g></svg>',
    chip_queue: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M16.25 3.6a.95.95 0 0 1 1.16-.92l3.1.78a.95.95 0 0 1 .72.92v1.65a.95.95 0 0 1-1.18.92l-1.9-.48v8.03a3.25 3.25 0 1 1-1.9-2.96V3.6ZM3.75 6.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h5.1a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Z"/></g></svg>',
    chip_queue_on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="#64D2FF" fill-rule="evenodd" clip-rule="evenodd"><path d="M16.25 3.6a.95.95 0 0 1 1.16-.92l3.1.78a.95.95 0 0 1 .72.92v1.65a.95.95 0 0 1-1.18.92l-1.9-.48v8.03a3.25 3.25 0 1 1-1.9-2.96V3.6ZM3.75 6.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h7.6a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Zm0 5.25a.95.95 0 0 1 .95-.95h5.1a.95.95 0 1 1 0 1.9H4.7a.95.95 0 0 1-.95-.95Z"/></g></svg>',
    chip_play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M7.35 4.86C7.35 3.63 8.7 2.88 9.76 3.52l10.02 6.08c1.01.61 1.01 2.09 0 2.7L9.76 18.38c-1.06.64-2.41-.11-2.41-1.34V4.86Z" transform="translate(0 1.05)"/></g></svg>',
    chip_play_on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="#64D2FF" fill-rule="evenodd" clip-rule="evenodd"><path d="M7.35 4.86C7.35 3.63 8.7 2.88 9.76 3.52l10.02 6.08c1.01.61 1.01 2.09 0 2.7L9.76 18.38c-1.06.64-2.41-.11-2.41-1.34V4.86Z" transform="translate(0 1.05)"/></g></svg>',
    chip_more: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.25 12a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm7.4 0a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm5.75 1.65a1.65 1.65 0 1 0 0-3.3 1.65 1.65 0 0 0 0 3.3Z"/></g></svg>',
    chip_more_on: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><g fill="#64D2FF" fill-rule="evenodd" clip-rule="evenodd"><path d="M6.25 12a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm7.4 0a1.65 1.65 0 1 1-3.3 0 1.65 1.65 0 0 1 3.3 0Zm5.75 1.65a1.65 1.65 0 1 0 0-3.3 1.65 1.65 0 0 0 0 3.3Z"/></g></svg>'
  };
  const ICON_ALIASES = {
    home: 'ic_home', library: 'ic_library', settings: 'ic_settings',
    play: 'ic_play', pause: 'ic_pause', next: 'ic_next', previous: 'ic_previous', prev: 'ic_previous',
    repeat: 'ic_repeat', repeatOne: 'ic_repeat_one', shuffle: 'ic_shuffle', orderSeq: 'ic_order_seq',
    queue: 'ic_queue', heart: 'ic_heart', heartFill: 'ic_heart_fill', download: 'ic_download',
    search: 'ic_search', left: 'ic_back', back: 'ic_back', right: 'ic_forward', down: 'ic_down',
    close: 'ic_close', more: 'ic_more', plus: 'ic_plus', import: 'ic_import', refresh: 'refresh',
    trash: 'ic_trash', edit: 'ic_edit', switchPlatform: 'ic_switch_platform', playNext: 'ic_play_next', music: 'ic_music',
    comment: 'ic_comment_official', share: 'ic_share_official', cast: 'ic_cast',
    styleWand: 'ic_style_wand', sparkle: 'ic_sparkle', scan: 'ic_sparkle',
    fullscreen: 'fullscreen', shrink: 'shrink', volume: 'ic_volume', mute: 'ic_mute', clock: 'symbol_clock',
    chipMusic: 'chip_music', chipLibrary: 'chip_library', chipQueue: 'chip_queue', chipPlay: 'chip_play', chipMore: 'chip_more'
  };
  function svgMarkup(name, className) {
    const key = ICONS[name] ? name : (ICON_ALIASES[name] || 'ic_music');
    const raw = ICONS[key] || ICONS.ic_music;
    return className ? raw.replace('<svg ', '<svg class="' + className + '" ') : raw;
  }
  function svgIcon(name, className) {
    const holder = document.createElement('div');
    holder.innerHTML = svgMarkup(name, className);
    return holder.firstElementChild || document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  }
  function iconButton(name, label, handler, className) {
    const btn = h('button', 'icon-btn glass light ' + (className || '').trim());
    btn.type = 'button'; btn.setAttribute('aria-label', label);
    btn.appendChild(svgIcon(name)); btn.onclick = handler;
    return btn;
  }
  function coverUrl(value) {
    if (!value) return '';
    const text = String(value);
    if (/^(local|data|blob|lxmine-file):/i.test(text)) return text;
    if (/^https?:\/\//i.test(text)) return '/api/cover?url=' + encodeURIComponent(text);
    return text;
  }
  function rawCoverOf(item) {
    return String((item && (item.cover || item.coverUrl)) || '').trim();
  }
  function songSource(song) {
    return (song && (song.lxSource || SOURCE_OF_PROVIDER[song.provider] || (['kw','kg','wy','tx'].includes(song.source) ? song.source : ''))) || '';
  }
  function platformName(song) {
    const provider = song && (song.provider === 'netease' ? 'netease' : song.provider);
    return PROVIDER_LABEL[provider] || PROVIDER_LABEL[SOURCE_OF_PROVIDER[songSource(song)]] || (song && song.artist === '本地文件' ? '本地' : '音源');
  }
  function fmtTime(ms) {
    const value = Math.max(0, Number(ms) || 0);
    const total = Math.floor(value / 1000);
    const m = Math.floor(total / 60), s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  function durationOf(song) { return Number(song && (song.durationMs || song.duration || song.dt) || 0); }
  function identity(song) {
    if (!song) return '';
    const src = songSource(song) || song.provider || 'x';
    let rawId = '';
    if (src === 'local' || song.provider === 'local') rawId = song.localFileId || song.localKey || String(song.id || '').replace(/^local:/, '') || song.name || '';
    else if (src === 'tx' || song.provider === 'qq') rawId = song.mid || song.songmid || song.id || song.name || '';
    else if (src === 'kg' || song.provider === 'kugou') rawId = String(song.hash || song.fileHash || song.audioHash || song.id || song.name || '').toLowerCase();
    else rawId = song.id || song.name || '';
    return src + ':' + String(rawId);
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function notify(text, duration) {
    const toast = $('#toast');
    toast.textContent = String(text || '');
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), duration || 2600);
    console.log('[LxMine]', text);
  }
  async function getJson(url, options) {
    const response = await fetch(url, Object.assign({ cache: 'no-store' }, options || {}));
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { throw new Error('服务返回了无效数据'); }
    if (!response.ok || (data && data.error && data.ok === false)) throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
    return data;
  }

  /* ---------------- stage / colours ---------------- */
  const SMART_MODE_ID = (window.LxMineSmartStage && window.LxMineSmartStage.SMART_MODE_ID) || 'smart-auto';
  const SMART_MODE_TIP = (window.LxMineSmartStage && window.LxMineSmartStage.SMART_MODE_TIP) || '依据每首歌的曲风意象与专属声纹特征，智能匹配契合的动效模式（涵盖全部 MineRadio 与 Folia 动效及关闭动效纯享模式）。同一首歌在任意歌单、平台或设备再次播放都将稳定锁定相同的专属动效；未来版本新增动效时会自动重新匹配。';
  function effectiveStyleName() {
    if (S.styleName === SMART_MODE_ID) return S.resolvedStyleName || 'mine-7';
    return S.styleName;
  }
  function resolvedStyleLabel() {
    const eff = effectiveStyleName();
    return (MINE_STYLES.find(item => item[0] === eff) || [])[1] || '';
  }
  let smartStageSaveTimer = 0;
  function scheduleSmartStageSave() {
    clearTimeout(smartStageSaveTimer);
    smartStageSaveTimer = setTimeout(() => { smartStageSaveTimer = 0; saveStore(); }, 1200);
  }
  function updateSmartStage(forceCommit, skipPush) {
    if (S.styleName !== SMART_MODE_ID || !window.LxMineSmartStage) return;
    const candidates = MINE_STYLES.map(item => item[0]).filter(id => id !== SMART_MODE_ID);
    const decision = window.LxMineSmartStage.selectSmartMode({
      song: S.current,
      candidates,
      cache: S.smartStageCache,
      forceCommit: !!forceCommit
    });
    const prev = S.resolvedStyleName;
    S.resolvedStyleName = decision.modeId || 'mine-7';
    if (decision.ready && S.current && decision.songKey) {
      if (S.smartStageCache.catalogSignature !== decision.catalogSignature) {
        S.smartStageCache = { catalogSignature: decision.catalogSignature, choices: {} };
      }
      if (S.smartStageCache.choices[decision.songKey] !== S.resolvedStyleName) {
        S.smartStageCache.choices[decision.songKey] = S.resolvedStyleName;
        const keys = Object.keys(S.smartStageCache.choices);
        if (keys.length > 500) delete S.smartStageCache.choices[keys[0]];
        scheduleSmartStageSave();
      }
    }
    if (!skipPush && prev !== S.resolvedStyleName) pushStageMetadata();
  }
  function openSmartStageInfoModal() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '随声绘色'));
    box.appendChild(h('p', 'muted', SMART_MODE_TIP));
    if (S.styleName === SMART_MODE_ID && resolvedStyleLabel()) {
      const tag = h('p', '', '当前歌曲匹配动效：' + resolvedStyleLabel());
      tag.style.color = 'var(--accent)';
      tag.style.fontSize = '13px';
      box.appendChild(tag);
    }
    const actions = h('div', 'modal-actions');
    const ok = h('button', 'pill-btn accent', '知道了');
    ok.onclick = () => closeModal(backdrop);
    actions.appendChild(ok);
    box.appendChild(actions);
    backdrop.appendChild(box);
  }
  function openPlayTransitionInfoModal() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '混韵天成'));
    box.appendChild(h('p', 'muted', '开启后会自动分析播放队列中相邻两首歌曲的节拍能量与尾奏/前奏区间，提前预载下一首并以等功率曲线平滑衔接，减少切歌冷场与突兀停顿。\n\n若需手动精确对比单曲或使用单曲循环，可随时在此或播放页「更多」中关闭。'));
    const actions = h('div', 'modal-actions');
    const ok = h('button', 'pill-btn accent', '知道了');
    ok.onclick = () => closeModal(backdrop);
    actions.appendChild(ok);
    box.appendChild(actions);
    backdrop.appendChild(box);
  }
  function makeSliderResetBtn(label, onReset, isModified) {
    const btn = h('button', 'slider-reset-btn' + (isModified ? ' modified' : ''));
    btn.type = 'button';
    btn.title = '恢复默认' + (label || '');
    btn.setAttribute('aria-label', '恢复默认' + (label || ''));
    btn.appendChild(svgIcon('refresh'));
    btn.onclick = event => {
      event.stopPropagation();
      if (typeof onReset === 'function') onReset();
    };
    return btn;
  }
  let stageWindowVisible = !document.hidden;
  let previousStageStyle = effectiveStyleName();
  let lastMineStyle = (effectiveStyleName() === 'off' || String(effectiveStyleName() || '').startsWith('folia-')) ? 'mine-7' : effectiveStyleName();
  let lastFoliaStyle = String(effectiveStyleName() || '').startsWith('folia-') ? effectiveStyleName() : 'folia-partita';
  function activeStageFrameId() {
    const eff = effectiveStyleName();
    if (eff === 'off' || S.stageGraphicsFailed) return 'plain-stage-frame';
    return String(eff || '').startsWith('folia-') ? 'folia-stage-frame' : 'stage-frame';
  }
  function syncDynamicStageReadyFlag() {
    const eff = effectiveStyleName();
    if (eff === 'off' || S.stageGraphicsFailed) {
      S.dynamicStageReady = false;
      return;
    }
    S.dynamicStageReady = String(eff || '').startsWith('folia-') ? !!S.foliaStageReady : !!S.mineStageReady;
  }
  function stageWindow() {
    try { return document.getElementById(activeStageFrameId())?.contentWindow || null; } catch (_) { return null; }
  }
  function setDetailImmersive(immersive) {
    const hidden = !!S.detailOpen && !!immersive;
    const prevHidden = document.body.classList.contains('detail-immersive');
    document.body.classList.toggle('detail-immersive', hidden);
    const dock = document.getElementById('dock-stack');
    if (dock) dock.inert = hidden;
    document.querySelectorAll('#detail-head > :not(#immersive-btn)').forEach(node => { node.inert = hidden; });
    const immBtn = $('#immersive-btn');
    if (immBtn) {
      const nextIcon = hidden ? ICONS.shrink : ICONS.fullscreen;
      if (immBtn.dataset.iconState !== (hidden ? 'shrink' : 'fullscreen')) {
        immBtn.dataset.iconState = hidden ? 'shrink' : 'fullscreen';
        immBtn.innerHTML = nextIcon;
      }
      immBtn.setAttribute('aria-label', hidden ? '退出沉浸模式' : '沉浸模式');
    }
    if (prevHidden !== hidden && S.detailOpen) {
      const insets = { topInset: hidden ? 24 : 68, bottomInset: hidden ? 28 : 176 };
      for (const target of stageWindowsForUpdate()) {
        try { target.lxmineStage?.setInsets?.(insets); } catch (_) {}
      }
    }
  }
  function stageWindowsForUpdate() {
    return ['stage-frame', 'folia-stage-frame', 'plain-stage-frame']
      .map(id => document.getElementById(id)?.contentWindow)
      .filter(target => target?.lxmineStage);
  }
  function initStage() {
    ['stage-frame', 'folia-stage-frame', 'plain-stage-frame'].forEach(id => {
      const frame = document.getElementById(id);
      if (!frame) return;
      const isDynamic = id === 'stage-frame' || id === 'folia-stage-frame';
      const degraded = () => {
        if (!isDynamic || S.stageGraphicsFailed) return;
        S.stageGraphicsFailed = true; S.mineStageReady = false; S.foliaStageReady = false;
        S.mineStageMounted = false; S.foliaStageMounted = false;
        S.dynamicStageReady = false; S.dynamicStageMounted = false; S.plainStageMounted = true;
        pushStagePresentation();
        notify('图形资源暂不可用，已临时使用纯文字歌词');
      };
      const visualReady = () => {
        if (!isDynamic || frame.dataset.ready !== '1' || S.stageGraphicsFailed) return;
        if (id === 'stage-frame') S.mineStageReady = true;
        if (id === 'folia-stage-frame') S.foliaStageReady = true;
        const prevReady = !!S.dynamicStageReady;
        syncDynamicStageReadyFlag();
        if (prevReady !== !!S.dynamicStageReady) pushStagePresentation();
      };
      const ready = () => {
        if (frame.contentWindow?.__lxmineStageUnavailable) { degraded(); return; }
        if (!frame.contentWindow?.lxmineStage) return;
        frame.contentWindow.__lxmineNative = { seek: ms => seekTo(Number(ms) || 0), visualReady, degraded,
          immersive: show => {
            if (S.detailOpen && !S.commentsOpen && frame.style.pointerEvents === 'auto' && frame.style.opacity === '1') setDetailImmersive(String(show) !== '1');
          } };
        frame.dataset.ready = '1';
        if (id === 'folia-stage-frame') S.foliaStageReady = true;
        syncDynamicStageReadyFlag();
        pushStagePresentation(); pushStageMetadata(); pushStageClock(true);
      };
      frame.addEventListener('load', ready);
      window.addEventListener('message', event => {
        if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
        if (event.data?.type === 'lxmine-stage-ready') ready();
        if (event.data?.type === 'lxmine-stage-visual-ready') visualReady();
        if (event.data?.type === 'lxmine-stage-degraded') degraded();
      });
    });
  }
  function stageAudioUrl() {
    const url = S.playbackUrl || '';
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return location.origin + '/api/audio?url=' + encodeURIComponent(url);
    return url;
  }
  function stageCoverSource(song) {
    const text = String((song && song.cover) || '');
    if (!text) return '';
    // The stage has its own /api/cover proxy; unwrap ours so the artwork is
    // not fetched through two nested proxies (which breaks window decoding).
    if (text.charAt(0) === '/' || /^https?:\/\//i.test(text)) {
      try {
        const url = new URL(text, location.href);
        if (url.pathname === '/api/cover') {
          const inner = url.searchParams.get('url');
          if (inner) return inner;
        }
        return text;
      } catch (_) { return text; }
    }
    return text;
  }
  function pushStageMetadata() {
    clearTimeout(pushStageMetadata.retryTimer);
    pushStagePresentation();
    if (!S.current) return;
    const win = stageWindow();
    if (!win || !win.lxmineStage) pushStageMetadata.retryTimer = setTimeout(pushStageMetadata, 220);
    const cover = stageCoverSource(S.current);
    const lyricColors = resolveLyricColors('detail');
    const effStyle = effectiveStyleName();
    const scaleVal = Math.max(0.55, Math.min(1.5, Number(S.lyricFontSize) || 1));
    const spacingVal = Math.max(0.85, Math.min(1.8, Number(S.lyricLineSpacing) || 1.2));
    const maxLinesVal = Math.max(0, Math.min(10, Math.round(Number(S.lyricMaxLines) || 0)));
    const data = {
      id: identity(S.current),
      audioUrl: stageAudioUrl(),
      mode: effStyle,
      lines: S.lyrics.map(line => {
        const auxText = [S.lyricShowTranslation ? line.translation : '', S.lyricShowRomaji ? line.romaji : ''].filter(Boolean).join('\n');
        return { timeMs: line.time, text: line.text, ...(auxText ? { translation: auxText } : {}), ...(line.words ? { words: line.words } : {}) };
      }),
      translationLines: S.lyrics
        .filter(line => (S.lyricShowTranslation && line.translation) || (S.lyricShowRomaji && line.romaji))
        .map(line => ({ timeMs: line.time, text: [S.lyricShowTranslation ? line.translation : '', S.lyricShowRomaji ? line.romaji : ''].filter(Boolean).join('\n') })),
      lyricColorMode: S.lyricColorMode.endsWith('gradient') ? 'custom-gradient' : 'custom-solid',
      lyricColors: { primary: lyricColors.primary, secondary: lyricColors.secondary, highlight: lyricColors.gradient ? lyricColors.secondary : lyricColors.highlight, glow: lyricColors.glow },
      name: S.current.name || '',
      singer: S.current.artist || S.current.singer || '',
      cover: cover ? new URL(cover, location.href).href : '',
      duration: S.duration || durationOf(S.current),
      lyricOffset: Number(S.lyricOffset) || 0,
      lyricScale: scaleVal,
      lyricLineSpacing: spacingVal,
      lyricMaxLines: maxLinesVal,
      resetCameraOnSong: S.stageResetCameraOnSong !== false,
      appearance: document.body.classList.contains('light-theme') ? 'light' : 'dark',
      bgImage: S.stageBgImage || '',
      bgOpacity: S.stageBgOpacity,
      wallpaperBgOpacity: S.wallpaperBgOpacity,
      wallpaperOverallOpacity: S.wallpaperOverallOpacity,
      topInset: document.body.classList.contains('detail-immersive') ? 24 : 68,
      bottomInset: document.body.classList.contains('detail-immersive') ? 28 : 176
    };
    document.documentElement.style.setProperty('--lyric-detail-scale', String(scaleVal));
    const playingNow = stageClockPlaying();
    const livePosMs = liveStagePositionMs();
    const isFoliaActive = String(effStyle || '').startsWith('folia-');
    if (effStyle !== 'off') {
      if (isFoliaActive) lastFoliaStyle = effStyle;
      else lastMineStyle = effStyle;
    }
    const mineWin = document.getElementById('stage-frame')?.contentWindow;
    const foliaWin = document.getElementById('folia-stage-frame')?.contentWindow;
    const plainWin = document.getElementById('plain-stage-frame')?.contentWindow;
    if (mineWin?.lxmineStage && !isFoliaActive) {
      try {
        mineWin.lxmineStage.metadata({ ...data, mode: lastMineStyle, positionMs: livePosMs, playing: playingNow });
        mineWin.lxmineStage.clock({ positionMs: livePosMs, playing: playingNow });
      } catch (error) { console.warn('[Stage] mine metadata', error); }
    }
    if (foliaWin?.lxmineStage && isFoliaActive) {
      try {
        foliaWin.lxmineStage.metadata({ ...data, mode: lastFoliaStyle, positionMs: livePosMs, playing: playingNow });
        foliaWin.lxmineStage.clock({ positionMs: livePosMs, playing: playingNow });
      } catch (error) { console.warn('[Stage] folia metadata', error); }
    }
    if (plainWin?.lxmineStage && (effStyle === 'off' || S.stageGraphicsFailed || !S.dynamicStageReady)) {
      try {
        plainWin.lxmineStage.metadata({ ...data, mode: 'off', positionMs: livePosMs, playing: playingNow });
        plainWin.lxmineStage.clock({ positionMs: livePosMs, playing: playingNow });
      } catch (error) { console.warn('[Stage] plain metadata', error); }
    }
    S.wallpaperStage = data;
    if (S.wallpaperMode) window.desktopWindow?.updateWallpaperMode?.({ stage: data, clock: { positionMs: livePosMs, playing: playingNow } }).catch(() => {});
  }
  function applyStageFallbackBg(song) {
    const fallback = document.getElementById('stage-fallback');
    if (!fallback) return;
    const op = Math.max(0, Math.min(1, Number(S.stageBgOpacity)));
    const hasCustom = !!(S.stageBgImage && S.stageBgImage.length > 0);
    fallback.classList.toggle('has-custom-bg', hasCustom);
    if (hasCustom) {
      fallback.style.backgroundImage = 'url("' + S.stageBgImage.replace(/"/g, '%22') + '")';
    } else {
      const cur = song !== undefined ? song : S.current;
      const cover = cur && cur.cover ? coverUrl(cur.cover) : '';
      fallback.style.backgroundImage = cover ? 'url("' + cover.replace(/"/g, '%22') + '")' : 'none';
    }
    fallback.style.opacity = op.toFixed(3);
  }
  function pushStageBackground() {
    applyStageFallbackBg();
    const payload = {
      bgImage: S.stageBgImage || '',
      bgOpacity: S.stageBgOpacity,
      wallpaperBgOpacity: S.wallpaperBgOpacity,
      wallpaperOverallOpacity: S.wallpaperOverallOpacity
    };
    for (const target of stageWindowsForUpdate()) {
      try {
        if (typeof target.lxmineStage?.setBackground === 'function') target.lxmineStage.setBackground(payload);
      } catch (_) {}
    }
    if (S.wallpaperMode && S.wallpaperStage) {
      S.wallpaperStage = Object.assign({}, S.wallpaperStage, payload);
      window.desktopWindow?.updateWallpaperMode?.({ stage: S.wallpaperStage, clock: { positionMs: S.position, playing: !!S.playing } }).catch(() => {});
    }
  }
  function saveStageBgImage(dataUrl) {
    S.stageBgImage = dataUrl || '';
    try {
      if (S.stageBgImage) localStorage.setItem(STORE_KEY + '.stageBgImage', S.stageBgImage);
      else localStorage.removeItem(STORE_KEY + '.stageBgImage');
    } catch (_) {
      notify('图片过大，无法持久保存');
    }
    if (S.stageBgImage) refreshLyricPalette(S.stageBgImage);
    else refreshLyricPalette(S.current && S.current.cover);
    pushStageBackground();
  }
  function pickStageBgImage(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || '');
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1920;
            const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
            canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            saveStageBgImage(canvas.toDataURL('image/jpeg', 0.86));
          } catch (_) {
            saveStageBgImage(raw);
          }
          notify('已更新播放页自定义背景图');
          if (onDone) onDone();
        };
        img.onerror = () => notify('图片读取失败');
        img.src = raw;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
  function applyPageCustomBg() {
    const imgEl = document.getElementById('page-custom-bg-img');
    const hasBg = !!(S.pageBgImage && S.pageBgImage.length > 0);
    document.body.classList.toggle('has-page-custom-bg', hasBg);
    if (!imgEl) return;
    if (hasBg) {
      imgEl.style.backgroundImage = 'url("' + S.pageBgImage.replace(/"/g, '%22') + '")';
      imgEl.style.opacity = Math.max(0.10, Math.min(0.85, Number(S.pageBgOpacity) || 0.35)).toFixed(3);
    } else {
      imgEl.style.backgroundImage = 'none';
    }
  }
  function savePageBgImage(dataUrl) {
    S.pageBgImage = dataUrl || '';
    try {
      if (S.pageBgImage) localStorage.setItem(STORE_KEY + '.pageBgImage', S.pageBgImage);
      else localStorage.removeItem(STORE_KEY + '.pageBgImage');
    } catch (_) {
      notify('图片过大，无法持久保存');
    }
    applyPageCustomBg();
  }
  function pickPageBgImage(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || '');
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1920;
            const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
            canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            savePageBgImage(canvas.toDataURL('image/jpeg', 0.86));
          } catch (_) {
            savePageBgImage(raw);
          }
          notify('已更新页面自定义背景图');
          if (onDone) onDone();
        };
        img.onerror = () => notify('图片读取失败');
        img.src = raw;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
  function liveStagePositionMs() {
    if (audio && audio.readyState >= 1 && !S.resolving && !(typeof seekGuardUntil !== 'undefined' && seekGuardUntil > Date.now())) {
      const live = Number(audio.currentTime);
      if (Number.isFinite(live) && live >= 0) return live * 1000;
    }
    return Math.max(0, Number(S.position) || 0);
  }
  function setStageSong(song, skipPush) {
    refreshLyricPalette(S.stageBgImage || (song && song.cover));
    applyStageFallbackBg(song);
    updateSmartStage(false, true);
    if (!skipPush) pushStageMetadata();
  }
  function stageClockPlaying() {
    // Keep the stage clock advancing smoothly during the 620ms pause fade-out while audio is still
    // audible, and immediately halt whenever the underlying <audio> element is actually paused.
    if (audio && audio.paused) return false;
    if (playPauseFadeMode === 'out') return true;
    return !!S.playing;
  }
  function pushStageClock(force) {
    const posMs = liveStagePositionMs();
    const playingNow = stageClockPlaying();
    const now = performance.now();
    const expectedMs = (pushStageClock.lastPos || 0) + (pushStageClock.lastPlaying ? (now - (pushStageClock.lastAt || now)) : 0);
    const shouldPush = force
      || !pushStageClock.lastAt
      || pushStageClock.lastPlaying !== playingNow
      || Math.abs(posMs - expectedMs) > 90
      || (playingNow && (now - pushStageClock.lastAt) >= 1000);
    if (shouldPush) {
      pushStageClock.lastPos = posMs;
      pushStageClock.lastPlaying = playingNow;
      pushStageClock.lastAt = now;
      const activeId = typeof activeStageFrameId === 'function' ? activeStageFrameId() : '';
      const activeTarget = activeId ? document.getElementById(activeId)?.contentWindow : null;
      if (activeTarget?.lxmineStage) {
        try { activeTarget.lxmineStage.clock({ positionMs: posMs, playing: playingNow }); } catch (_) {}
      } else {
        for (const target of stageWindowsForUpdate()) {
          try { target.lxmineStage.clock({ positionMs: posMs, playing: playingNow }); } catch (_) {}
        }
      }
    }
    if (S.wallpaperMode && (force || Date.now() - (S.wallpaperClockAt || 0) > 1000)) {
      S.wallpaperClockAt = Date.now();
      window.desktopWindow?.updateWallpaperMode?.({ clock: { positionMs: posMs, playing: playingNow } }).catch(() => {});
    }
  }
  function pushStagePresentation() {
    applyAppearance();
    const active = window.desktopWindow ? stageWindowVisible : !document.hidden;
    const effStyle = effectiveStyleName();
    const isFolia = String(effStyle || '').startsWith('folia-');
    if (previousStageStyle !== effStyle) {
      S.stageGraphicsFailed = false;
      previousStageStyle = effStyle;
    }
    if (effStyle !== 'off') {
      if (isFolia) lastFoliaStyle = effStyle;
      else lastMineStyle = effStyle;
    }
    if (active && S.detailOpen) {
      if (effStyle === 'off') S.plainStageMounted = true;
      else if (!S.stageGraphicsFailed) {
        if (isFolia) S.foliaStageMounted = true;
        else S.mineStageMounted = true;
        S.dynamicStageMounted = !!(S.mineStageMounted || S.foliaStageMounted);
      }
    }
    syncDynamicStageReadyFlag();
    const plainVisible = effStyle === 'off' || S.stageGraphicsFailed || (S.plainStageMounted && !S.dynamicStageReady);
    document.body.classList.toggle('plain-stage', !!plainVisible);
    document.getElementById('stage')?.setAttribute('aria-hidden', String(!(S.detailOpen && !S.commentsOpen)));
    const opaqueStageCoversFallback = active && S.detailOpen && !S.commentsOpen && !plainVisible && ((isFolia && !!S.foliaStageReady) || (effStyle === 'mine-8' && !!S.mineStageReady));
    const stageFallbackEl = document.getElementById('stage-fallback');
    if (stageFallbackEl) stageFallbackEl.style.visibility = opaqueStageCoversFallback ? 'hidden' : '';
    const slots = [
      { id: 'stage-frame', mounted: !!S.mineStageMounted && !S.stageGraphicsFailed, url: '/mine-stage/harmony-stage.html', active: effStyle !== 'off' && !isFolia && !S.stageGraphicsFailed, ready: !!S.mineStageReady },
      { id: 'folia-stage-frame', mounted: !!S.foliaStageMounted && !S.stageGraphicsFailed, url: '/mine-stage/folia-stage/index.html', active: effStyle !== 'off' && isFolia && !S.stageGraphicsFailed, ready: !!S.foliaStageReady },
      { id: 'plain-stage-frame', mounted: !!S.plainStageMounted, url: '/mine-stage/plain-stage.html', active: plainVisible, ready: true },
    ];
    for (const slot of slots) {
      const frame = document.getElementById(slot.id);
      if (!frame) continue;
      const path = slot.mounted ? slot.url : 'about:blank';
      if (frame.getAttribute('src') !== path) {
        frame.dataset.ready = '';
        if (slot.id === 'stage-frame') S.mineStageReady = false;
        if (slot.id === 'folia-stage-frame') S.foliaStageReady = false;
        frame.src = path;
      }
      const visible = active && S.detailOpen && !S.commentsOpen && slot.active;
      frame.contentWindow?.lxmineStage?.presentation?.({ visible: !!visible, detail: !!visible });
      frame.style.visibility = visible ? 'visible' : 'hidden';
      frame.style.opacity = visible && slot.ready ? '1' : '0';
      frame.style.pointerEvents = visible && (slot.id === 'plain-stage-frame' ? plainVisible : !plainVisible) ? 'auto' : 'none';
    }
    S.stageReady = document.getElementById(activeStageFrameId())?.dataset.ready === '1';
    syncTimelineAdaptiveTheme();
  }
  const systemAppearance = matchMedia('(prefers-color-scheme: dark)');
  function adaptColorForBackdrop(hex, onDark) {
    const clean = normalizeHexColor(hex, onDark ? '#7dd3fc' : '#2563eb');
    const rgb = [1, 3, 5].map(i => parseInt(clean.slice(i, i + 2), 16));
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    // Strictly preserve the song's cover hue (hsl.h) and saturation; adapt ONLY luminance for readability.
    if (onDark) {
      if (hsl.l < 0.58) hsl.l = 0.58 + (hsl.l / 0.58) * 0.12;
      else if (hsl.l > 0.88) hsl.l = 0.88;
    } else {
      if (hsl.l > 0.46) hsl.l = 0.30 + ((1 - hsl.l) / 0.54) * 0.16;
      else if (hsl.l < 0.22) hsl.l = 0.22;
    }
    return hslToHex(hsl.h, hsl.s, hsl.l);
  }
  function syncTimelineAdaptiveTheme() {
    const timeline = typeof $ === 'function' ? $('#timeline') : null;
    if (!timeline) return;
    const lightTheme = document.body.classList.contains('light-theme');
    const effStyle = typeof effectiveStyleName === 'function' ? effectiveStyleName() : 'mine-0';
    const dynamicActive = effStyle !== 'off' && !S.stageGraphicsFailed;
    const isFolia = String(effStyle || '').startsWith('folia-');
    // Dynamic 3D MineRadio scenes render over a dark stage even when app appearance is Light;
    // Plain stage ('off') and Folia visualizers natively follow light/dark app appearance.
    const onDark = !lightTheme || (dynamicActive && !isFolia);
    const cover = S.coverPalette || lyricFallbackPalette();
    const rawC1 = cover.primary || '#7dd3fc';
    const rawC2 = cover.secondary || rawC1;
    const c1 = adaptColorForBackdrop(rawC1, onDark);
    const c2 = adaptColorForBackdrop(rawC2, onDark);
    const thumb = adaptColorForBackdrop(rawC2, onDark);
    timeline.style.setProperty('--seek-c1', c1);
    timeline.style.setProperty('--seek-c2', c2);
    timeline.style.setProperty('--seek-thumb', thumb);
    if (onDark) {
      timeline.style.setProperty('--seek-track', 'rgba(255,255,255,.34)');
      timeline.style.setProperty('--seek-track-shadow', '0 0 0 0.75px rgba(0,0,0,.46), 0 1px 4px rgba(0,0,0,.58)');
      timeline.style.setProperty('--seek-thumb-shadow', '0 0 0 1.5px rgba(0,0,0,.48), 0 1px 6px rgba(0,0,0,.6)');
      timeline.style.setProperty('--seek-time-color', '#f4f6fa');
      timeline.style.setProperty('--seek-time-shadow', '0 1px 4px rgba(0,0,0,.85)');
    } else {
      timeline.style.setProperty('--seek-track', 'rgba(15,23,42,.26)');
      timeline.style.setProperty('--seek-track-shadow', '0 0 0 0.75px rgba(255,255,255,.65), 0 1px 3px rgba(0,0,0,.16)');
      timeline.style.setProperty('--seek-thumb-shadow', '0 0 0 1.5px rgba(255,255,255,.85), 0 1px 5px rgba(15,23,42,.35)');
      timeline.style.setProperty('--seek-time-color', '#141923');
      timeline.style.setProperty('--seek-time-shadow', '0 1px 3px rgba(255,255,255,.88)');
    }
  }
  function applyAppearance() {
    const light = S.appearance === 'light' || (S.appearance !== 'dark' && !systemAppearance.matches);
    const changed = document.body.classList.contains('light-theme') !== light;
    document.body.classList.toggle('light-theme', light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    const bgHex = light ? '#d0d4db' : '#151619';
    if (applyAppearance.lastBg !== bgHex) {
      applyAppearance.lastBg = bgHex;
      window.desktopWindow?.setBackgroundColor?.(bgHex)?.catch?.(() => {});
    }
    syncTimelineAdaptiveTheme();
    if (changed) { window.LxGlass?.refresh?.(); queueMicrotask(pushStageMetadata); }
  }
  systemAppearance.addEventListener('change', applyAppearance);
  document.addEventListener('visibilitychange', pushStagePresentation);

  /* ---------------- header / navigation ---------------- */
  async function refreshHomeByDoubleTap() {
    const syncAlgo = S.refreshAlgoOnDoubleTap !== false;
    const prevSnapshot = (!syncAlgo && S.feed && S.feed.personalized) ? {
      forYou: (S.feed.forYou || []).slice(),
      dailySongs: (S.feed.dailySongs || []).slice(),
      personalized: true,
      topArtists: (S.feed.topArtists || []).slice(),
      dailyCover: S.feed.daily ? S.feed.daily.cover : ''
    } : null;
    if (syncAlgo) {
      S.algoRefreshSeed = (Math.max(0, Math.floor(Number(S.algoRefreshSeed) || 0)) + 1) % 100000;
      saveStore();
    }
    S.feedLoading = false;
    await loadHome(true, { preservedAlgo: prevSnapshot });
    notify(syncAlgo ? '首页与算法推荐已刷新' : '首页信息已刷新');
  }
  function setHeader(title, subtitle, options) {
    const opts = options || {};
    $('#page-title').textContent = title;
    // 双击左上角标题 = 刷新首页内容；依据设置开关决定是否同步重算算法推荐。
    $('#page-title').ondblclick = () => {
      if (S.tab === 'home' && (!S.currentView || S.currentView.name === 'home') && !S.searchOpen && !S.detailOpen && !S.commentsOpen) {
        void refreshHomeByDoubleTap();
      }
    };
    $('#page-subtitle').textContent = subtitle || '';
    $('#back-btn').classList.toggle('hidden', !opts.back);
    $('#back-btn').onclick = opts.back || null;
    const actions = $('#header-actions');
    actions.replaceChildren();
    (opts.actions || []).forEach(action => {
      if (action.node) actions.appendChild(action.node);
      else actions.appendChild(iconButton(action.icon, action.label, action.onClick));
    });
  }
  function setBodyMode(mode) {
    document.body.classList.toggle('secondary', mode === 'secondary');
    document.body.classList.toggle('search-open', mode === 'search');
    document.body.classList.toggle('detail-open', mode === 'detail' || (mode === 'comments' && S.detailOpen));
    document.body.classList.toggle('comments-open', mode === 'comments');
  }
  function hideSplash() {
    const splash = $('#splash');
    if (!splash || splash.classList.contains('hide')) return;
    requestAnimationFrame(() => {
      splash.classList.add('hide');
      setTimeout(() => {
        splash.style.display = 'none';
        try { const frame = $('#splash-frame'); if (frame) frame.src = 'about:blank'; } catch (_) {}
      }, 560);
    });
  }
  function showSplash() {
    const splash = $('#splash');
    if (true) {
      splash.classList.add('hide'); splash.style.display = 'none';
      try { const frame = $('#splash-frame'); if (frame) frame.src = 'about:blank'; } catch (_) {}
      return;
    }
    const frame = $('#splash-frame');
    if (!frame) return;
    const arm = () => {
      try { frame.contentWindow.__lxStartup = { done: hideSplash }; } catch (_) {}
    };
    frame.addEventListener('load', arm);
    try { if (frame.contentDocument && frame.contentDocument.readyState === 'complete') arm(); } catch (_) {}
    setTimeout(hideSplash, 6200);
    setTimeout(() => { try { if (frame.contentWindow && typeof frame.contentWindow.dismissSplash === 'function') frame.contentWindow.dismissSplash(); } catch (_) {} }, 4600);
  }
  function bindWindowChrome() {
    const controls = $('#window-controls');
    if (!window.desktopWindow || !controls) {
      if (controls) controls.classList.add('hidden');
      const drag = $('#window-drag'); if (drag) drag.classList.add('hidden');
      return;
    }
    $('#win-fullscreen').onclick = () => (window.desktopWindow.toggleFullscreen || window.desktopWindow.toggleMaximize).call(window.desktopWindow).catch(() => {});
    $('#win-minimize').onclick = () => window.desktopWindow.minimize().catch(() => {});
    $('#win-maximize').onclick = () => window.desktopWindow.toggleMaximize().catch(() => {});
    $('#win-close').onclick = () => window.desktopWindow.close().catch(() => {});
    const applyChromeState = state => {
      state = state || {};
      stageWindowVisible = !state.isMinimized && state.isVisible !== false;
      pushStagePresentation();
      document.body.classList.toggle('window-maximized', !!state.isMaximized);
      document.body.classList.toggle('window-fullscreen', !!(state.isFullScreen || state.isNativeFullScreen));
      const maxBtn = $('#win-maximize');
      if (maxBtn) {
        maxBtn.setAttribute('aria-label', state.isMaximized ? '还原' : '最大化');
        maxBtn.classList.toggle('is-restored', !!state.isMaximized);
        const icon = state.isMaximized
          ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8.8 4h9.4A1.8 1.8 0 0 1 20 5.8v9.4a1.8 1.8 0 0 1-1.8 1.8h-.7v-1.6h.6a.3.3 0 0 0 .3-.3V5.9a.3.3 0 0 0-.3-.3H8.9a.3.3 0 0 0-.3.3v.6H7v-.7A1.8 1.8 0 0 1 8.8 4ZM5.8 7.6h9.4A1.8 1.8 0 0 1 17 9.4v8.8a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2V9.4a1.8 1.8 0 0 1 1.8-1.8Zm0 1.6a.2.2 0 0 0-.2.2v8.8c0 .11.09.2.2.2h9.4a.2.2 0 0 0 .2-.2V9.4a.2.2 0 0 0-.2-.2H5.8Z"/></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M6.8 5h10.4A1.8 1.8 0 0 1 19 6.8v10.4a1.8 1.8 0 0 1-1.8 1.8H6.8A1.8 1.8 0 0 1 5 17.2V6.8A1.8 1.8 0 0 1 6.8 5Zm.1 1.75a.15.15 0 0 0-.15.15v10.2c0 .08.07.15.15.15h10.2a.15.15 0 0 0 .15-.15V6.9a.15.15 0 0 0-.15-.15H6.9Z"/></svg>';
        if (maxBtn.dataset.icon !== icon) {
          maxBtn.dataset.icon = icon;
          maxBtn.innerHTML = icon;
        }
      }
    };
    if (window.desktopWindow.getState) window.desktopWindow.getState().then(applyChromeState).catch(() => {});
    if (window.desktopWindow.onStateChange) window.desktopWindow.onStateChange(applyChromeState);
  }

  /* ---------------- playback ---------------- */
  function persistFavoritesToLibrary(touch = false) {
    if (!window.desktopWindow || !window.desktopWindow.syncFavoriteTracks) return Promise.resolve();
    return window.desktopWindow.syncFavoriteTracks(S.favorites, { touch: !!touch }).then(() => {
      if (touch) window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
    }).catch(() => {});
  }
  async function hydrateFavoritesFromLibrary(playlists, forceOverwrite) {
    if (!window.desktopWindow || !window.desktopWindow.readBuiltInPlaylist) return;
    const list = Array.isArray(playlists) ? playlists : [];
    const fav = list.find(item => item && item.isFavorite === true);
    if (!fav) {
      if (forceOverwrite) {
        S.favorites = [];
        saveStore();
        syncAllLikeStates();
        updateDock();
      } else if (S.favorites.length > 0) {
        await persistFavoritesToLibrary(false);
      }
      return;
    }
    if (!forceOverwrite && fav.trackCount === 0 && S.favorites.length > 0) {
      await persistFavoritesToLibrary(false);
      return;
    }
    try {
      const collected = await window.LxPagination.collectAll(async (page, limit) => {
        const data = await window.desktopWindow.readBuiltInPlaylist(fav.id, { offset: (page - 1) * limit, limit });
        if (!data || data.ok === false) throw new Error(data?.error || '歌单不可用');
        return { ...data, items: data.tracks || [] };
      }, { limit: 500 });
      if (forceOverwrite) {
        S.favorites = collected.items;
        saveStore();
        syncAllLikeStates();
        updateDock();
        if (S.currentView?.name === 'playlist' && S.currentView.kind === 'favorites') {
          S.currentView.tracks = S.favorites.slice();
          S.currentView.count = S.favorites.length;
        }
        return;
      }
      if (!S.favorites.length && collected.items.length > 0) {
        S.favorites = collected.items;
        saveStore();
        syncAllLikeStates();
        updateDock();
      } else if (S.favorites.length > 0 && collected.items.length > 0) {
        const prevSig = S.favorites.map(identity).join('|');
        const libSig = collected.items.map(identity).join('|');
        if (prevSig !== libSig) {
          const merged = [];
          const seen = new Set();
          for (const item of [...S.favorites, ...collected.items]) {
            const k = identity(item);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            merged.push(item);
          }
          S.favorites = merged;
          saveStore();
          syncAllLikeStates();
          updateDock();
          await persistFavoritesToLibrary(false);
        }
      }
    } catch (_) {}
  }
  function modeSvg(mode) {
    if (mode === '随机播放') return svgMarkup('shuffle', 'mode-icon');
    if (mode === '单曲循环') return svgMarkup('repeatOne', 'mode-icon');
    if (mode === '顺序播放') return svgMarkup('orderSeq', 'mode-icon');
    return svgMarkup('repeat', 'mode-icon');
  }
  function isFavorite(song) {
    const key = identity(song);
    return !!key && S.favorites.some(item => identity(item) === key);
  }
  function renderLikeButton(btn, liked, pop) {
    if (!btn) return;
    const on = !!liked;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-label', on ? '取消收藏' : '收藏');
    const iconState = on ? 'fill' : 'line';
    if (btn.dataset.iconState !== iconState) {
      btn.dataset.iconState = iconState;
      btn.innerHTML = on ? ICONS.ic_heart_fill : ICONS.ic_heart;
    }
    if (pop) {
      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');
    }
  }
  function syncAllLikeStates(popKey) {
    const favKeySet = new Set((S.favorites || []).map(identity).filter(Boolean));
    const currentKey = identity(S.current);
    const currentLiked = !!currentKey && favKeySet.has(currentKey);
    $$('#dock-controls [data-action="like"]').forEach(btn => {
      renderLikeButton(btn, currentLiked, !!popKey && currentKey === popKey);
    });
    $$('[data-like-key]').forEach(btn => {
      const k = btn.dataset.likeKey || '';
      const liked = !!k && favKeySet.has(k);
      renderLikeButton(btn, liked, !!popKey && k === popKey);
    });
    const favCountNode = $('.mosaic-tile[data-tile-kind="favorites"] .count');
    if (favCountNode) favCountNode.textContent = S.favorites.length + ' 首歌曲';
  }
  async function switchSearchQueueToTarget(songKey, target) {
    if (!songKey || !target) return;
    try {
      let tracks = [];
      if (target.type === 'favorites') {
        tracks = Array.isArray(S.favorites) ? S.favorites.slice() : [];
      } else if (target.type === 'builtin' && target.id) {
        tracks = await loadPlaylistTracks({ kind: 'builtin', id: target.id });
      }
      if (!Array.isArray(tracks) || !tracks.length) return;
      if (!S.current || identity(S.current) !== songKey) return;
      let idx = tracks.findIndex(item => identity(item) === songKey);
      if (idx < 0) {
        tracks.unshift(S.current);
        idx = 0;
      }
      S.queue = tracks;
      S.queueIndex = idx;
      S.playingFromSearch = false;
      if (typeof refreshAutoMixPlan === 'function') refreshAutoMixPlan();
      if (typeof preloadNextQueueTrack === 'function') preloadNextQueueTrack();
    } catch (_) {}
  }
  function toggleFavorite(song) {
    if (!song) return;
    const key = identity(song);
    if (!key) return;
    const index = S.favorites.findIndex(item => identity(item) === key);
    if (index >= 0) S.favorites.splice(index, 1); else S.favorites.unshift(song);
    saveStore();
    syncAllLikeStates(key);
    updateDock();
    void persistFavoritesToLibrary(true);
    if (index < 0) {
      const fromSearch = !!S.searchOpen || (S.current && identity(S.current) === key && S.playingFromSearch);
      if (fromSearch) {
        S.searchAddedPlaylistMap[key] = { type: 'favorites' };
        if (S.current && identity(S.current) === key && S.playingFromSearch) {
          void switchSearchQueueToTarget(key, { type: 'favorites' });
        }
      }
    }
    notify(index >= 0 ? '已取消收藏' : '已添加到「我的收藏」');
  }
  function collectSongsBatch(songs) {
    const valid = (Array.isArray(songs) ? songs : []).filter(item => item && identity(item));
    if (!valid.length) return;
    const existingKeys = new Set((S.favorites || []).map(identity));
    const toAdd = [];
    for (const song of valid) {
      const key = identity(song);
      if (key && !existingKeys.has(key)) {
        existingKeys.add(key);
        toAdd.push(song);
      }
    }
    if (!toAdd.length) {
      notify('所选歌曲均已收藏');
      return;
    }
    S.favorites = toAdd.concat(S.favorites || []);
    saveStore();
    for (const song of toAdd) syncAllLikeStates(identity(song));
    updateDock();
    void persistFavoritesToLibrary(true);
    notify('已批量收藏 ' + toAdd.length + ' 首歌曲');
  }
  function updateDock() {
    const song = S.current;
    const key = identity(song);
    if (key !== updateDock.lastKey) {
      if (key) {
        const copy = $('#dock-copy');
        copy.classList.remove('swap'); void copy.offsetWidth; copy.classList.add('swap');
      }
      $$('.for-you-card[data-song-key], .song-row[data-song-key], .queue-row[data-song-key]').forEach(el => el.classList.toggle('playing', !!key && el.dataset.songKey === key));
    }
    updateDock.lastKey = key;
    $('#dock-title').textContent = song ? song.name : '尚未播放';
    $('#dock-artist').textContent = song ? (song.busy ? '正在准备…' : (song.artist || song.singer || '未知歌手')) : '选择歌曲，开始聆听';
    const rawDockCover = rawCoverOf(song);
    const coverSig = key + '|' + rawDockCover + '|' + (song ? (song.name || '') : '');
    const coverChanged = coverSig !== updateDock.lastCoverSig;
    updateDock.lastCoverSig = coverSig;
    const coverInner = $('#cover-inner');
    if (coverInner && coverChanged) {
      if (rawDockCover) {
        const grad = gradFor((song && (song.name || song.artist)) || 'LxMine');
        coverInner.style.backgroundImage = 'url("' + coverUrl(rawDockCover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
        coverInner.style.backgroundColor = '';
      } else if (song) {
        const grad = gradFor(song.name || song.artist || 'LxMine');
        coverInner.style.backgroundImage = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
        coverInner.style.backgroundColor = '';
      } else {
        coverInner.style.backgroundImage = 'none';
        coverInner.style.backgroundColor = '#1a1c20';
      }
    }
    $('#cover-ring').style.setProperty('--progress', (S.duration > 0 ? Math.min(100, S.position / S.duration * 100) : 0) + '%');
    $$('#dock-controls [data-action="like"]').forEach(btn => renderLikeButton(btn, isFavorite(song), false));
    $('#play-btn').setAttribute('aria-label', S.playing ? '暂停' : '播放');
    const modeBtn = $('#dock-controls [data-action="mode"]');
    if (modeBtn) {
      if (modeBtn.dataset.modeName !== S.mode) {
        modeBtn.dataset.modeName = S.mode;
        modeBtn.innerHTML = modeSvg(S.mode);
      }
      modeBtn.title = '播放顺序：' + S.mode;
      modeBtn.setAttribute('aria-label', '播放顺序：' + S.mode);
    }
    document.body.classList.toggle('playing', S.playing);
    updateDesktopLyricsButton();
    updateVolumeUI();
    document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === S.tab));
    if ('mediaSession' in navigator && song) {
      try {
        if (coverChanged) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: song.name || '', artist: song.artist || song.singer || '', album: song.album || '',
            artwork: coverUrl(rawDockCover) ? [{ src: coverUrl(rawDockCover), sizes: '512x512', type: 'image/jpeg' }] : []
          });
        }
        navigator.mediaSession.playbackState = S.playing ? 'playing' : 'paused';
      } catch (_) {}
    }
  }
  let seekGuardTarget = -1;
  let seekGuardUntil = 0;
  let pendingStartSeekMs = 0;
  let pendingStartSeekToken = 0;
  let nextShuffleKey = '';
  function applyPendingStartSeek() {
    if (pendingStartSeekMs <= 0 || pendingStartSeekToken !== S.resolveToken) return false;
    if (!audio || audio.readyState < 1) return false;
    const targetMs = pendingStartSeekMs;
    const durMs = (Number.isFinite(audio.duration) && audio.duration > 0) ? audio.duration * 1000 : 0;
    const clampedMs = durMs > 1000 ? Math.min(targetMs, Math.max(0, durMs - 500)) : targetMs;
    const targetSec = clampedMs / 1000;
    if (Math.abs((audio.currentTime || 0) - targetSec) <= 0.85) {
      pendingStartSeekMs = 0;
      pendingStartSeekToken = 0;
      return true;
    }
    seekGuardTarget = clampedMs;
    seekGuardUntil = Date.now() + 4500;
    try {
      audio.currentTime = targetSec;
      if (audio.readyState >= 2 && Math.abs((audio.currentTime || 0) - targetSec) <= 1.2) {
        pendingStartSeekMs = 0;
        pendingStartSeekToken = 0;
      }
      return true;
    } catch (_) {
      return false;
    }
  }
  const _progCache = { nowEl: null, totalEl: null, seekEl: null, ringEl: null, nowText: '', totalText: '', seekPct: '', ringPct: '' };
  function updateProgress(overrideMs) {
    const hasOverride = typeof overrideMs === 'number' && Number.isFinite(overrideMs);
    const rawMs = hasOverride ? overrideMs : (audio.currentTime || 0) * 1000;
    if (!hasOverride && seekGuardUntil > 0) {
      if (Date.now() < seekGuardUntil && Math.abs(rawMs - seekGuardTarget) > 2500) {
        return;
      }
      if (Math.abs(rawMs - seekGuardTarget) <= 2500 || Date.now() >= seekGuardUntil) {
        seekGuardUntil = 0;
        seekGuardTarget = -1;
      }
    }
    S.position = Math.max(0, rawMs);
    S.duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : durationOf(S.current);
    if (!_progCache.nowEl) _progCache.nowEl = $('#time-now');
    if (!_progCache.totalEl) _progCache.totalEl = $('#time-total');
    if (!_progCache.seekEl) _progCache.seekEl = $('#seek');
    if (!_progCache.ringEl) _progCache.ringEl = $('#cover-ring');
    const ratioPct = S.duration > 0 ? Math.min(100, (S.position / S.duration) * 100) : 0;
    if (S.detailOpen || hasOverride) {
      const nowStr = fmtTime(S.position);
      if (_progCache.nowEl && nowStr !== _progCache.nowText) {
        _progCache.nowText = nowStr;
        _progCache.nowEl.textContent = nowStr;
      }
      const totalStr = fmtTime(S.duration);
      if (_progCache.totalEl && totalStr !== _progCache.totalText) {
        _progCache.totalText = totalStr;
        _progCache.totalEl.textContent = totalStr;
      }
      const seek = _progCache.seekEl;
      if (seek && seek.dataset.drag !== '1') {
        const maxVal = Math.max(1, S.duration);
        const clampedPos = Math.max(0, Math.min(S.position, maxVal));
        const maxStr = String(maxVal);
        if (seek.max !== maxStr) seek.max = maxStr;
        seek.value = String(clampedPos);
        const pctStr = (S.duration > 0 ? Math.min(100, (clampedPos / maxVal) * 100) : 0).toFixed(3) + '%';
        if (pctStr !== _progCache.seekPct) {
          _progCache.seekPct = pctStr;
          seek.style.setProperty('--seek-pct', pctStr);
        }
      }
    }
    const ringStr = ratioPct.toFixed(2) + '%';
    if (_progCache.ringEl && ringStr !== _progCache.ringPct) {
      _progCache.ringPct = ringStr;
      _progCache.ringEl.style.setProperty('--progress', ringStr);
    }
    syncLyric();
    pushStageClock(false);
    pushDesktopLyrics(false);
    if (S.wallpaperMode) syncWallpaperUi();
    void tickAutoMix(S.position, S.duration);
  }
  function setPlaying(value) {
    S.playing = !!value;
    updateDock();
    pushStageClock(true);
    pushDesktopLyrics(true);
    syncWallpaperUi();
  }
  function friendlyPlayError(err) {
    const msg = String((err && err.message) || err || '').trim();
    if (!msg) return '暂未找到可用完整音源，请稍后重试';
    // 屏蔽原始英文网络/协议报错，统一为友好中文提示。
    if (/^[a-zA-Z0-9_\-:\s./()]+$/.test(msg) || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|socket|status code|timeout|AbortError|NotSupportedError/i.test(msg)) {
      return '当前歌曲暂无法获取完整音源，请稍后重试或检查音源设置';
    }
    return msg;
  }
  async function resolveWithFallback(song, extraOpts) {
    if (song.localUrl) return { url: song.localUrl };
    if (song.url && /^https?:/i.test(song.url) && !(extraOpts && extraOpts.forceResolve)) return { url: song.url };
    const result = await window.lxMusic.resolve(song, S.quality, extraOpts || {});
    if (result && result.url) {
      if (result.sourceId && result.sourceId !== S.activeSourceId) {
        S.activeSourceId = result.sourceId;
      }
      return result;
    }
    throw new Error('暂未找到可用完整音源，请检查网络或导入更多音源');
  }
  let playPauseFadeRaf = 0;
  let playPauseFadeToken = 0;
  let playPauseFadeMode = '';
  function cancelPlayPauseFade(restoreVolume = true) {
    playPauseFadeToken += 1;
    if (playPauseFadeRaf) { cancelAnimationFrame(playPauseFadeRaf); playPauseFadeRaf = 0; }
    playPauseFadeMode = '';
    if (restoreVolume && !S.autoMixActive && audio) {
      try { audio.volume = Math.max(0, Math.min(1, Number(S.volume) || 0)); } catch (_) {}
    }
  }
  let externalCallPaused = false;
  let externalCallResumeTimer = 0;
  function pauseWithFade(fromSession = false) {
    if (!fromSession) {
      externalCallPaused = false;
      clearTimeout(externalCallResumeTimer);
    }
    S.playRequested = false;
    if (typeof cancelActiveCrossfade === 'function') cancelActiveCrossfade();
    if (!audio || audio.paused) {
      cancelPlayPauseFade(true);
      setPlaying(false);
      return;
    }
    const targetVol = Math.max(0, Math.min(1, Number(S.volume) || 0));
    if (S.playPauseFadeEnabled === false || targetVol <= 0.01) {
      cancelPlayPauseFade(true);
      audio.pause();
      return;
    }
    cancelPlayPauseFade(false);
    const token = playPauseFadeToken;
    playPauseFadeMode = 'out';
    const startVol = Math.max(0, Math.min(1, Number(audio.volume) || targetVol));
    const startedAt = performance.now();
    const durationMs = 620;
    // Update UI immediately so pause response feels snappy while audio glides smoothly to silence.
    setPlaying(false);
    const step = now => {
      if (token !== playPauseFadeToken) return;
      const t = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
      const gain = Math.pow(Math.cos(t * Math.PI * 0.5), 1.8);
      try { audio.volume = Math.max(0, Math.min(1, startVol * gain)); } catch (_) {}
      if (t >= 1) {
        playPauseFadeRaf = 0;
        playPauseFadeMode = '';
        try { audio.pause(); } catch (_) {}
        try { audio.volume = Math.max(0, Math.min(1, Number(S.volume) || 0)); } catch (_) {}
        S.position = Math.max(0, (audio.currentTime || 0) * 1000);
        pushStageClock(true);
        return;
      }
      playPauseFadeRaf = requestAnimationFrame(step);
    };
    playPauseFadeRaf = requestAnimationFrame(step);
  }
  function resumeWithFade(startFromZero = false) {
    externalCallPaused = false;
    clearTimeout(externalCallResumeTimer);
    S.playRequested = true;
    if (!audio) return Promise.resolve();
    if (typeof audioFxGraph !== 'undefined' && audioFxGraph && audioFxGraph.ctx.state === 'suspended') {
      try { audioFxGraph.ctx.resume().catch(() => {}); } catch (_) {}
    }
    const targetVol = Math.max(0, Math.min(1, Number(S.volume) || 0));
    if (S.playPauseFadeEnabled === false || targetVol <= 0.01) {
      cancelPlayPauseFade(true);
      return audio.play();
    }
    const wasPaused = audio.paused;
    const fromVol = startFromZero ? 0 : (wasPaused ? 0 : Math.max(0, Math.min(targetVol, Number(audio.volume) || 0)));
    cancelPlayPauseFade(false);
    const token = playPauseFadeToken;
    playPauseFadeMode = 'in';
    try { audio.volume = fromVol; } catch (_) {}
    const playPromise = wasPaused ? audio.play() : Promise.resolve();
    if (!wasPaused) setPlaying(true);
    const startedAt = performance.now();
    const durationMs = (startFromZero || wasPaused) ? 680 : 540;
    const step = now => {
      if (token !== playPauseFadeToken) return;
      const liveTarget = Math.max(0, Math.min(1, Number(S.volume) || 0));
      const t = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
      const ease = Math.pow(t, 1.65);
      try { audio.volume = Math.max(0, Math.min(1, fromVol + (liveTarget - fromVol) * ease)); } catch (_) {}
      if (t >= 1) {
        playPauseFadeRaf = 0;
        playPauseFadeMode = '';
        try { audio.volume = liveTarget; } catch (_) {}
        return;
      }
      playPauseFadeRaf = requestAnimationFrame(step);
    };
    playPauseFadeRaf = requestAnimationFrame(step);
    return playPromise.catch(err => {
      if (token === playPauseFadeToken) cancelPlayPauseFade(true);
      throw err;
    });
  }
  function effectiveExpectedDurationMs(song) {
    const metaDur = durationOf(song);
    if (metaDur >= 45000) return metaDur;
    const lastLyric = Array.isArray(S.lyrics) && S.lyrics.length
      ? Number(S.lyrics[S.lyrics.length - 1].time || 0)
      : 0;
    return Math.max(metaDur, lastLyric > 0 ? lastLyric + 8000 : 0);
  }
  function classifyStreamDurationMismatch(song, actualMs) {
    if (!song || song.localUrl || song.source === 'local' || song.provider === 'local') return 'ok';
    if (!Number.isFinite(actualMs) || actualMs <= 3000) return 'ok';
    const expectedMs = effectiveExpectedDurationMs(song);
    if (expectedMs >= 45000 && actualMs <= 72000 && actualMs < expectedMs * 0.58) {
      return 'preview';
    }
    const metaDur = durationOf(song);
    if (metaDur >= 45000 && Math.abs(actualMs - metaDur) > 8000) {
      return 'wrong';
    }
    return 'ok';
  }
  function recoverVipPreviewOrShortStream(resumeAtMs, reason, onExhausted) {
    if (typeof reason === 'function') {
      onExhausted = reason;
      reason = 'preview';
    }
    const modeReason = reason || 'preview';
    const song = S.current;
    if (!song || song.localUrl || song.source === 'local' || song.provider === 'local' || S.previewRecovering) return false;
    const currentRetry = Number(S.previewRetryCount) || 0;
    if (currentRetry >= 3) return false;
    S.previewRecovering = true;
    if (!Array.isArray(S.previewBadUrls)) S.previewBadUrls = [];
    if (!Array.isArray(S.previewBadSourceIds)) S.previewBadSourceIds = [];
    if (S.playbackUrl && !S.previewBadUrls.includes(S.playbackUrl)) S.previewBadUrls.push(S.playbackUrl);
    if (S.currentResolvedSourceId && !S.previewBadSourceIds.includes(S.currentResolvedSourceId)) {
      S.previewBadSourceIds.push(S.currentResolvedSourceId);
    }
    const token = S.resolveToken;
    const safeResumeSec = modeReason === 'wrong' ? 0 : Math.max(0, Number(resumeAtMs) || 0) / 1000;
    if (currentRetry === 0) {
      notify(modeReason === 'wrong'
        ? '检测到曲目不符，正在自动切换匹配音源…'
        : '检测到试听片段，正在自动切换完整音源…');
    }
    (async () => {
      while ((Number(S.previewRetryCount) || 0) < 3) {
        if (token !== S.resolveToken) return;
        const attempt = Number(S.previewRetryCount) || 0;
        S.previewRetryCount = attempt + 1;
        const hasOtherSource = Array.isArray(S.sources)
          && S.sources.some(src => src && src.id && !S.previewBadSourceIds.includes(src.id));
        if (attempt === 0 && !hasOtherSource) continue;
        const preferCross = attempt >= 1;
        const excludeSourceIds = attempt === 0
          ? S.previewBadSourceIds.slice()
          : (attempt >= 2 ? S.previewBadSourceIds.slice() : []);
        try {
          const resolved = await resolveWithFallback(song, {
            forceResolve: true,
            raceAll: true,
            preferCrossPlatform: preferCross,
            excludeSourceIds,
            excludeUrls: S.previewBadUrls.slice(),
          });
          if (token !== S.resolveToken) return;
          const nextUrl = resolved && (typeof resolved === 'string' ? resolved : resolved.url);
          if (!nextUrl || S.previewBadUrls.includes(nextUrl)) continue;
          const nextSourceId = (resolved && typeof resolved === 'object' && resolved.sourceId)
            ? resolved.sourceId
            : (S.activeSourceId || '');
          S.playbackUrl = nextUrl;
          S.currentResolvedSourceId = nextSourceId;
          setDeckSource(audio, nextUrl);
          S.loadedSongKey = identity(song);
          const metaOk = await new Promise(resolveMeta => {
            let done = false;
            const finish = (ok) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              audio.removeEventListener('loadedmetadata', onMeta);
              audio.removeEventListener('error', onErr);
              resolveMeta(ok);
            };
            const onMeta = () => finish(true);
            const onErr = () => finish(false);
            const timer = setTimeout(() => finish(audio.readyState >= 1), 3500);
            audio.addEventListener('loadedmetadata', onMeta, { once: true });
            audio.addEventListener('error', onErr, { once: true });
            audio.load();
          });
          if (token !== S.resolveToken) return;
          if (!metaOk) {
            if (!S.previewBadUrls.includes(nextUrl)) S.previewBadUrls.push(nextUrl);
            if (nextSourceId && !S.previewBadSourceIds.includes(nextSourceId)) S.previewBadSourceIds.push(nextSourceId);
            continue;
          }
          const nextActualMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
          const nextMismatch = classifyStreamDurationMismatch(song, nextActualMs);
          if (nextMismatch !== 'ok') {
            audio.pause();
            if (!S.previewBadUrls.includes(nextUrl)) S.previewBadUrls.push(nextUrl);
            if (nextSourceId && !S.previewBadSourceIds.includes(nextSourceId)) S.previewBadSourceIds.push(nextSourceId);
            continue;
          }
          S.previewRecovering = false;
          if (safeResumeSec > 1 && Number.isFinite(audio.duration) && audio.duration > safeResumeSec + 4) {
            try { audio.currentTime = safeResumeSec; } catch (_) {}
          }
          if (S.playRequested) audio.play().catch(() => {});
          return;
        } catch (_) {}
      }
      if (token !== S.resolveToken) return;
      S.previewRecovering = false;
      if (typeof onExhausted === 'function') onExhausted();
    })().catch(() => {
      if (token !== S.resolveToken) return;
      S.previewRecovering = false;
      if (typeof onExhausted === 'function') onExhausted();
    });
    return true;
  }
  async function playSong(song, queue, options) {
    if (!song) return;
    externalCallPaused = false;
    clearTimeout(externalCallResumeTimer);
    const opts = options || {};
    const fromAutoAdvance = Boolean(opts.fromAutoAdvance);
    if (!fromAutoAdvance) S.consecutiveAutoSkipCount = 0;
    const token = ++S.resolveToken;
    const songKey = identity(song);
    S.playRequested = opts.autoPlay !== false;
    S.resolving = true;
    S.previewRetryKey = '';
    S.previewRetryCount = 0;
    S.previewBadUrls = [];
    S.previewBadSourceIds = [];
    S.currentResolvedSourceId = '';
    S.previewRecovering = false;
    seekGuardTarget = -1;
    seekGuardUntil = 0;
    nextShuffleKey = '';
    if (!fromAutoAdvance && Array.isArray(queue) && queue !== S.queue && !opts.preserveQueue) {
      upNextKeys = [];
    } else if (songKey) {
      upNextKeys = upNextKeys.filter(k => k !== songKey);
    }
    cancelPlayPauseFade(false);
    // Clear stale media source immediately so offline/failed switches NEVER replay the previous cached track.
    audio.pause();
    audio.removeAttribute('src');
    try { audio.load(); } catch (_) {}
    S.playbackUrl = '';
    S.loadedSongKey = '';
    const preAddedTarget = (opts.fromSearch && !opts.playAllSearch && songKey) ? S.searchAddedPlaylistMap[songKey] : null;
    const preserveQueue = Boolean((opts.fromSearch && !opts.playAllSearch) || opts.preserveQueue);
    let list = Array.isArray(queue) && queue.length ? queue.slice() : [song];
    if (preserveQueue) {
      if (preAddedTarget && preAddedTarget.type === 'favorites' && Array.isArray(S.favorites) && S.favorites.length) {
        list = S.favorites.slice();
        if (!list.some(item => identity(item) === songKey)) list.unshift(song);
      } else if (!(preAddedTarget && preAddedTarget.type === 'builtin' && preAddedTarget.id)) {
        // 搜索、榜单与首页单曲点播不覆盖原播放列表：保留原有队列，如不在原队列中则插播在当前曲目之后，后续继续按原列表播放。
        if (Array.isArray(S.queue) && S.queue.length) {
          const existingIdx = S.queue.findIndex(item => identity(item) === songKey);
          if (existingIdx >= 0) {
            list = S.queue.slice();
          } else {
            const curKey = S.current ? identity(S.current) : '';
            const curIdx = curKey ? S.queue.findIndex(item => identity(item) === curKey) : S.queueIndex;
            const insertAt = curIdx >= 0 ? Math.min(S.queue.length, curIdx + 1) : 0;
            list = S.queue.slice();
            list.splice(insertAt, 0, song);
          }
        } else {
          list = [song];
        }
      }
    }
    const requestedStartMs = Math.max(0, Number(opts.startMs) || 0);
    const index = Math.max(0, list.findIndex(item => identity(item) === songKey));
    S.queue = list; S.queueIndex = index; S.current = song; S.duration = durationOf(song); S.position = requestedStartMs;
    if (S.commentsOpen) void openComments();
    pendingStartSeekMs = requestedStartMs > 200 ? requestedStartMs : 0;
    pendingStartSeekToken = requestedStartMs > 200 ? token : 0;
    if (requestedStartMs > 200) {
      seekGuardTarget = requestedStartMs;
      seekGuardUntil = Date.now() + 9500;
    }
    S.playingFromSearch = Boolean(opts.fromSearch && !preAddedTarget);
    if (preAddedTarget && preAddedTarget.type === 'builtin' && preAddedTarget.id) {
      S.playingFromSearch = true;
      void switchSearchQueueToTarget(songKey, preAddedTarget);
    }
    if (typeof $ === 'function') {
      const seekEl = $('#seek');
      if (seekEl) {
        if (seekEl.dataset) seekEl.dataset.drag = '';
        if (typeof document !== 'undefined' && document.activeElement === seekEl && typeof seekEl.blur === 'function') seekEl.blur();
        const initMax = Math.max(1, S.duration);
        const initVal = Math.max(0, Math.min(S.position, initMax));
        seekEl.max = String(initMax);
        seekEl.value = String(initVal);
        seekEl.style.setProperty('--seek-pct', (S.duration > 0 ? Math.min(100, (initVal / initMax) * 100) : 0).toFixed(3) + '%');
      }
      if (typeof fmtTime === 'function') {
        const tn = $('#time-now'); if (tn) tn.textContent = fmtTime(S.position);
        const tt = $('#time-total'); if (tt) tt.textContent = fmtTime(S.duration);
      }
    }
    if (!opts.keepFeedId) S.playingFeedId = '';
    S.lyrics = []; S.lyricIndex = -1;
    if (typeof cancelAutoMix === 'function') cancelAutoMix();
    S.currentAutoMixPlan = null;
    S.autoMixPreview = '';
    setStageSong(song, true); updateDock();
    if (typeof updateProgress === 'function') updateProgress(S.position);
    renderDetailLyrics(); pushStageMetadata(); pushStageClock(true); pushDesktopLyrics(true); syncWallpaperUi();
    // 立即并发预拉歌词（不再干等音频直链解析完才拉歌词，消除切歌后歌词慢半拍）
    loadLyrics(song, token);
    try {
      const isOnlineTrack = !song.localUrl && song.source !== 'local' && song.provider !== 'local';
      if (isOnlineTrack && typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('OFFLINE_NETWORK');
      }
      const loadAndStartPlayback = async (resolved) => {
        const url = typeof resolved === 'string' ? resolved : resolved.url;
        S.playbackUrl = url;
        S.currentResolvedSourceId = (resolved && typeof resolved === 'object' && resolved.sourceId)
          ? resolved.sourceId
          : (S.activeSourceId || '');
        if (typeof setDeckSource === 'function') setDeckSource(audio, url);
        else audio.src = url;
        S.loadedSongKey = songKey;
        audio.volume = S.volume;
        let loadErrored = false;
        const needMetaGate = isOnlineTrack && audio.readyState < 1;
        if ((pendingStartSeekMs > 200 && pendingStartSeekToken === token) || needMetaGate) {
          if (audio.readyState >= 1) {
            applyPendingStartSeek();
          } else {
            await new Promise(resolve => {
              let done = false;
              const finish = (ev) => {
                if (done) return;
                done = true;
                if (ev && ev.type === 'error') loadErrored = true;
                clearTimeout(timer);
                audio.removeEventListener('loadedmetadata', finish);
                audio.removeEventListener('canplay', finish);
                audio.removeEventListener('error', finish);
                resolve();
              };
              const timer = setTimeout(() => finish(null), 2200);
              audio.addEventListener('loadedmetadata', finish, { once: true });
              audio.addEventListener('canplay', finish, { once: true });
              audio.addEventListener('error', finish, { once: true });
            });
            if (token !== S.resolveToken) return false;
            if (!loadErrored) applyPendingStartSeek();
          }
        }
        if (loadErrored) throw new Error('AUDIO_LOAD_ERROR');
        const actualMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
        const mismatch = classifyStreamDurationMismatch(song, actualMs);
        if (mismatch !== 'ok') {
          audio.pause();
          const stopExhausted = () => {
            if (token !== S.resolveToken) return;
            audio.pause();
            setPlaying(false);
            notify(mismatch === 'wrong'
              ? '检测到音源返回曲目与原曲不符，已拦截，请切换音源或平台'
              : '检测到试听片段且暂无可用完整音源，已停止');
          };
          const started = recoverVipPreviewOrShortStream(0, mismatch, stopExhausted);
          if (!started && !S.previewRecovering) stopExhausted();
          return false;
        }
        if (S.playRequested) {
          await resumeWithFade(true);
          applyPendingStartSeek();
        }
        return true;
      };
      const initialOpts = opts.forceResolve ? { forceResolve: true, raceAll: true } : {};
      let resolved;
      try {
        resolved = await resolveWithFallback(song, initialOpts);
      } catch (firstResolveErr) {
        if (token !== S.resolveToken) return;
        if (isOnlineTrack && !fromAutoAdvance) {
          // 冷启动或首次解析偶发超时时，原地重试当前曲目一次，绝不擅自跳过用户点播的歌。
          await new Promise(r => setTimeout(r, 420));
          if (token !== S.resolveToken) return;
          resolved = await resolveWithFallback(song, { forceResolve: true, raceAll: true });
        } else {
          throw firstResolveErr;
        }
      }
      if (token !== S.resolveToken) return;
      try {
        const started = await loadAndStartPlayback(resolved);
        if (!started || token !== S.resolveToken) return;
      } catch (playErr) {
        if (token !== S.resolveToken) return;
        if (playErr && playErr.name === 'AbortError' && !S.playRequested) return;
        const failedUrl = typeof resolved === 'string' ? resolved : (resolved && resolved.url) || '';
        if (isOnlineTrack) {
          // 直链失效/403/容器不兼容时，先跨源强制重解析当前曲目一次，不直接跳歌。
          const retryResolved = await resolveWithFallback(song, {
            forceResolve: true,
            raceAll: true,
            preferCrossPlatform: true,
            excludeUrls: failedUrl ? [failedUrl] : [],
          });
          if (token !== S.resolveToken) return;
          resolved = retryResolved;
          const startedRetry = await loadAndStartPlayback(retryResolved);
          if (!startedRetry || token !== S.resolveToken) return;
        } else {
          throw playErr;
        }
      }
      if (resolved && resolved.switched && resolved.sourceName) {
        notify('已自动切换至「' + resolved.sourceName + '」');
      }
      pushStageMetadata();
      pushStageClock(true);
      if (typeof refreshAutoMixPlan === 'function') refreshAutoMixPlan();
      if (typeof preloadNextQueueTrack === 'function') preloadNextQueueTrack();
    } catch (error) {
      if (token !== S.resolveToken) return;
      if (error && error.name === 'AbortError' && !S.playRequested) return;
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch (_) {}
      S.playbackUrl = '';
      S.loadedSongKey = '';
      setPlaying(false);
      // 仅在自然切歌（播完自动下一首）遇到失效曲目时允许有界静默跳过；
      // 用户手动点播或重启后点击播放绝不擅自连跳多首歌曲。
      if (fromAutoAdvance && S.playRequested && Array.isArray(S.queue) && S.queue.length > 1 && (S.consecutiveAutoSkipCount || 0) < 2) {
        S.consecutiveAutoSkipCount = (S.consecutiveAutoSkipCount || 0) + 1;
        setTimeout(() => { if (token === S.resolveToken) nextSong(1, { fromAutoAdvance: true }); }, 220);
      }
    } finally {
      if (token === S.resolveToken) S.resolving = false;
    }
  }
  function togglePlayback() {
    if (!S.current) return;
    if (S.resolving) { S.playRequested = true; return; }
    const curKey = identity(S.current);
    if (!audio.getAttribute('src') || !S.playbackUrl || S.loadedSongKey !== curKey) {
      const durMs = durationOf(S.current);
      const safeStartMs = (durMs > 5000 && S.position >= durMs - 2500) ? 0 : Math.max(0, Number(S.position) || 0);
      playSong(S.current, S.queue, { startMs: safeStartMs, fromSearch: S.playingFromSearch, forceResolve: true });
      return;
    }
    if (audio.paused || playPauseFadeMode === 'out') {
      resumeWithFade(false).catch(() => {});
    } else {
      pauseWithFade();
    }
  }
  let upNextKeys = [];
  function resolveUpNextIndex() {
    if (!upNextKeys.length || !Array.isArray(S.queue) || !S.queue.length) return -1;
    const curKey = S.current ? identity(S.current) : '';
    const cleaned = [];
    let foundIdx = -1;
    for (const key of upNextKeys) {
      if (!key || key === curKey) continue;
      const idx = S.queue.findIndex(item => identity(item) === key);
      if (idx >= 0) {
        if (foundIdx < 0) foundIdx = idx;
        cleaned.push(key);
      }
    }
    upNextKeys = cleaned;
    return foundIdx;
  }
  function playNextSong(song) {
    if (!song) return;
    const key = identity(song);
    if (!S.current || !Array.isArray(S.queue) || !S.queue.length) {
      playSong(song, [song]);
      return;
    }
    const curKey = identity(S.current);
    if (key && key === curKey) {
      notify('当前正在播放「' + (song.name || '此歌曲') + '」');
      return;
    }
    const nextQueue = S.queue.filter(item => identity(item) !== key);
    let curIdx = nextQueue.findIndex(item => identity(item) === curKey);
    if (curIdx < 0) curIdx = Math.max(0, Math.min(S.queueIndex, nextQueue.length - 1));
    nextQueue.splice(curIdx + 1, 0, song);
    S.queue = nextQueue;
    S.queueIndex = curIdx;
    if (key) {
      upNextKeys = [key, ...upNextKeys.filter(k => k !== key)];
      nextShuffleKey = key;
    }
    if (typeof cancelAutoMix === 'function') cancelAutoMix();
    if (typeof refreshAutoMixPlan === 'function') refreshAutoMixPlan();
    saveStore();
    notify('已设为下一首播放「' + (song.name || '歌曲') + '」');
  }
  function nextSong(step, options) {
    if (!S.queue.length) return;
    const opts = options || {};
    let index = S.queueIndex;
    const upNextIdx = step > 0 ? resolveUpNextIndex() : -1;
    if (upNextIdx >= 0) {
      index = upNextIdx;
      const chosenKey = identity(S.queue[index]);
      upNextKeys = upNextKeys.filter(k => k !== chosenKey);
    } else if (S.mode === '随机播放' && S.queue.length > 1) {
      const cachedIdx = step > 0 && nextShuffleKey
        ? S.queue.findIndex(item => identity(item) === nextShuffleKey && (!S.current || identity(item) !== identity(S.current)))
        : -1;
      index = cachedIdx >= 0
        ? cachedIdx
        : (index + 1 + Math.floor(Math.random() * (S.queue.length - 1))) % S.queue.length;
    } else {
      index = (index + step + S.queue.length) % S.queue.length;
    }
    nextShuffleKey = '';
    S.queueIndex = index;
    playSong(S.queue[index], S.queue, { fromAutoAdvance: Boolean(opts.fromAutoAdvance) });
  }
  function cycleMode() {
    const modes = ['列表循环', '单曲循环', '随机播放', '顺序播放'];
    S.mode = modes[(modes.indexOf(S.mode) + 1) % modes.length];
    nextShuffleKey = '';
    saveStore();
    notify('播放顺序：' + S.mode);
    updateDock();
    if (typeof refreshAutoMixPlan === 'function') refreshAutoMixPlan();
  }
  function seekTo(ms) {
    const durMs = (Number.isFinite(audio.duration) && audio.duration > 0) ? audio.duration * 1000 : S.duration;
    if (!durMs) return;
    if (typeof cancelActiveCrossfade === 'function') cancelActiveCrossfade();
    pendingStartSeekMs = 0;
    pendingStartSeekToken = 0;
    autoMixTriggeredKey = '';
    autoMixPreloadRetryAt = 0;
    autoMixQuietSince = 0;
    const value = Math.max(0, Math.min(Number(ms) || 0, durMs));
    seekGuardTarget = value;
    seekGuardUntil = Date.now() + 1000;
    try { audio.currentTime = value / 1000; } catch (_) {}
    S.position = value; updateProgress(value); syncLyric(true); pushStageClock(true);
  }
  function downloadCurrent(target) {
    const song = target || S.current;
    if (!song) return;
    if (!window.lxMusic || !window.lxMusic.download) { notify('当前环境不支持下载'); return; }
    window.lxMusic.download(song, S.quality).then(job => {
      if (job) notify('开始下载「' + song.name + '」');
      refreshDownloads();
    }).catch(error => notify('下载失败：' + error.message));
  }

  /* ---------------- Audio FX DSP / Spatial Audio / Ear-Monitor / AI AutoMix / Sleep Timer ---------------- */
  let audioFxGraph = null;
  let preloadNextTimer = 0;
  function preloadNextQueueTrack() {
    clearTimeout(preloadNextTimer);
    if (!window.lxMusic || typeof window.lxMusic.resolve !== 'function') return;
    const next = typeof peekNextQueueSong === 'function' ? peekNextQueueSong() : null;
    if (!next || next.localUrl || next.source === 'local' || next.provider === 'local') return;
    preloadNextTimer = setTimeout(() => {
      window.lxMusic.resolve(next, S.quality, { raceAll: true }).catch(() => {});
    }, 4500);
  }
  function playableUrlForFx(url) {
    const raw = String(url || '');
    if (!raw) return '';
    if (audioFxGraph && /^https?:\/\//i.test(raw) && !raw.startsWith(location.origin)) {
      return location.origin + '/api/audio?url=' + encodeURIComponent(raw);
    }
    return raw;
  }
  function setDeckSource(el, rawUrl) {
    if (!el) return;
    const proxied = playableUrlForFx(rawUrl);
    if (audioFxGraph) el.crossOrigin = 'anonymous';
    else el.removeAttribute('crossorigin');
    el.src = proxied;
  }
  function buildReverbImpulse(ctx, seconds, decay, stereoDecorrelate = true) {
    const rate = ctx.sampleRate || 44100;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buffer.getChannelData(ch);
      let seed = ch === 0 ? 0x1234567 : (stereoDecorrelate ? 0x9e3779b9 : 0x1234567);
      const preDelay = Math.floor(rate * (ch === 0 ? 0.008 : 0.015));
      for (let i = 0; i < length; i += 1) {
        if (i < preDelay) { data[i] = 0; continue; }
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = (seed / 2147483648) - 1;
        const env = Math.pow(1 - (i - preDelay) / Math.max(1, length - preDelay), decay);
        data[i] = white * env;
      }
    }
    return buffer;
  }
  function ensureAudioFxGraph() {
    if (audioFxGraph) return audioFxGraph;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx({ latencyHint: 'interactive' });
      if (audio) audio.crossOrigin = 'anonymous';
      if (audioB) audioB.crossOrigin = 'anonymous';
      const srcA = ctx.createMediaElementSource(audio);
      const srcB = audioB ? ctx.createMediaElementSource(audioB) : null;
      const deckALowShelf = ctx.createBiquadFilter();
      deckALowShelf.type = 'lowshelf'; deckALowShelf.frequency.value = 180; deckALowShelf.gain.value = 0;
      const deckAFilter = ctx.createBiquadFilter();
      deckAFilter.type = 'lowpass'; deckAFilter.frequency.value = 20000; deckAFilter.Q.value = 0.7;
      const deckBLowShelf = ctx.createBiquadFilter();
      deckBLowShelf.type = 'lowshelf'; deckBLowShelf.frequency.value = 180; deckBLowShelf.gain.value = 0;
      const outroAnalyser = ctx.createAnalyser();
      outroAnalyser.fftSize = 512; outroAnalyser.smoothingTimeConstant = 0.72;
      const inputMix = ctx.createGain();
      srcA.connect(deckALowShelf);
      deckALowShelf.connect(deckAFilter);
      deckAFilter.connect(inputMix);
      deckAFilter.connect(outroAnalyser);
      if (srcB) {
        srcB.connect(deckBLowShelf);
        deckBLowShelf.connect(inputMix);
      }
      const bypassGain = ctx.createGain();
      bypassGain.gain.value = 1;
      const fxOutGain = ctx.createGain();
      fxOutGain.gain.value = 0;

      // 5-band parametric EQ (punchy audible Q & shelf response)
      const freqs = (window.LxMineAudioFx && window.LxMineAudioFx.BAND_FREQS) || [60, 230, 910, 3600, 14000];
      const filters = freqs.map((freq, idx) => {
        const f = ctx.createBiquadFilter();
        f.type = idx === 0 ? 'lowshelf' : (idx === freqs.length - 1 ? 'highshelf' : 'peaking');
        f.frequency.value = freq;
        if (f.type === 'peaking') f.Q.value = 1.0;
        f.gain.value = 0;
        return f;
      });
      inputMix.connect(bypassGain);
      bypassGain.connect(ctx.destination);
      let eqOut = inputMix;
      filters.forEach(f => { eqOut.connect(f); eqOut = f; });

      // True Stereo Mid-Side Widener + Asymmetric Haas 3D Surround Matrix
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      eqOut.connect(splitter);
      const lDirect = ctx.createGain(); lDirect.gain.value = 1.0;
      const rDirect = ctx.createGain(); rDirect.gain.value = 1.0;
      const lToRCross = ctx.createGain(); lToRCross.gain.value = 0; // negative widens side image
      const rToLCross = ctx.createGain(); rToLCross.gain.value = 0;
      splitter.connect(lDirect, 0);
      splitter.connect(rDirect, 1);
      splitter.connect(lToRCross, 0);
      splitter.connect(rToLCross, 1);
      lDirect.connect(merger, 0, 0);
      rToLCross.connect(merger, 0, 0);
      rDirect.connect(merger, 0, 1);
      lToRCross.connect(merger, 0, 1);

      // Asymmetric Haas Stereo Surround Branch (L->R 15ms, R->L 22ms through 260Hz HPF)
      const haasHpL = ctx.createBiquadFilter(); haasHpL.type = 'highpass'; haasHpL.frequency.value = 260;
      const haasHpR = ctx.createBiquadFilter(); haasHpR.type = 'highpass'; haasHpR.frequency.value = 260;
      const delayLtoR = ctx.createDelay(0.06); delayLtoR.delayTime.value = 0.015;
      const delayRtoL = ctx.createDelay(0.06); delayRtoL.delayTime.value = 0.022;
      const haasGainL = ctx.createGain(); haasGainL.gain.value = 0;
      const haasGainR = ctx.createGain(); haasGainR.gain.value = 0;
      splitter.connect(haasHpL, 0);
      haasHpL.connect(delayLtoR);
      delayLtoR.connect(haasGainR);
      haasGainR.connect(merger, 0, 1);
      splitter.connect(haasHpR, 1);
      haasHpR.connect(delayRtoL);
      delayRtoL.connect(haasGainL);
      haasGainL.connect(merger, 0, 0);

      // True Binaural HRTF Spatial Audio Stage (#18)
      const hrtfPannerL = ctx.createPanner();
      hrtfPannerL.panningModel = 'HRTF';
      hrtfPannerL.distanceModel = 'inverse';
      hrtfPannerL.positionX.value = -1.65; hrtfPannerL.positionY.value = 0.25; hrtfPannerL.positionZ.value = -1.1;
      const hrtfPannerR = ctx.createPanner();
      hrtfPannerR.panningModel = 'HRTF';
      hrtfPannerR.distanceModel = 'inverse';
      hrtfPannerR.positionX.value = 1.65; hrtfPannerR.positionY.value = 0.25; hrtfPannerR.positionZ.value = -1.1;
      const hrtfWet = ctx.createGain(); hrtfWet.gain.value = 0;
      splitter.connect(hrtfPannerL, 0);
      splitter.connect(hrtfPannerR, 1);
      hrtfPannerL.connect(hrtfWet);
      hrtfPannerR.connect(hrtfWet);

      const dryGain = ctx.createGain(); dryGain.gain.value = 1;
      const wetGain = ctx.createGain(); wetGain.gain.value = 0;
      const convolver = ctx.createConvolver();
      const smallImpulse = buildReverbImpulse(ctx, 0.72, 2.3, true);
      const hallImpulse = buildReverbImpulse(ctx, 2.15, 1.9, true);
      convolver.buffer = smallImpulse;

      // 4th-Order Sub-Bass (105Hz) + Mid-Side Vocal Suppressor / Zero-Clip Vocal Booster
      const vocalBusIn = ctx.createGain();
      vocalBusIn.gain.value = 1;
      const vcSplit = ctx.createChannelSplitter(2);
      const vcMerge = ctx.createChannelMerger(2);
      const vcLToMid = ctx.createGain(); vcLToMid.gain.value = 0.5;
      const vcRToMid = ctx.createGain(); vcRToMid.gain.value = 0.5;
      const vcLToSide = ctx.createGain(); vcLToSide.gain.value = 0.5;
      const vcRToSide = ctx.createGain(); vcRToSide.gain.value = -0.5;
      const vcMidBus = ctx.createGain(); vcMidBus.gain.value = 1;
      const vcSideBus = ctx.createGain(); vcSideBus.gain.value = 1;
      const vcMidVocalDirect = ctx.createGain(); vcMidVocalDirect.gain.value = 1;
      const vcMidLowLp1 = ctx.createBiquadFilter(); vcMidLowLp1.type = 'lowpass'; vcMidLowLp1.frequency.value = 105; vcMidLowLp1.Q.value = 0.7071;
      const vcMidLowLp2 = ctx.createBiquadFilter(); vcMidLowLp2.type = 'lowpass'; vcMidLowLp2.frequency.value = 105; vcMidLowLp2.Q.value = 0.7071;
      const vcMidLowPreserve = ctx.createGain(); vcMidLowPreserve.gain.value = 0;
      const vcMidVocalBoostEq = ctx.createBiquadFilter(); vcMidVocalBoostEq.type = 'peaking'; vcMidVocalBoostEq.frequency.value = 1850; vcMidVocalBoostEq.Q.value = 0.65; vcMidVocalBoostEq.gain.value = 0;
      const vcMidOut = ctx.createGain(); vcMidOut.gain.value = 1;
      const vcSideVocalNotch = ctx.createBiquadFilter(); vcSideVocalNotch.type = 'peaking'; vcSideVocalNotch.frequency.value = 1550; vcSideVocalNotch.Q.value = 0.52; vcSideVocalNotch.gain.value = 0;
      const vcSidePreserve = ctx.createGain(); vcSidePreserve.gain.value = 1;
      const vcSideInvert = ctx.createGain(); vcSideInvert.gain.value = -1;
      const vcTrimGain = ctx.createGain(); vcTrimGain.gain.value = 1;

      const vcSoftShaper = ctx.createWaveShaper();
      {
        const n = 4096, curve = new Float32Array(n), knee = 0.72, ceiling = 0.94, span = ceiling - knee;
        for (let i = 0; i < n; i += 1) {
          const x = (i * 2) / (n - 1) - 1;
          const ax = Math.abs(x);
          curve[i] = ax <= knee ? x : (x < 0 ? -1 : 1) * (knee + span * Math.tanh((ax - knee) / span));
        }
        vcSoftShaper.curve = curve;
        vcSoftShaper.oversample = '2x';
      }

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 16;
      compressor.ratio.value = 6.0;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.09;

      merger.connect(dryGain);
      dryGain.connect(vocalBusIn);
      hrtfWet.connect(vocalBusIn);
      merger.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(vocalBusIn);
      vocalBusIn.connect(vcSplit);
      vcSplit.connect(vcLToMid, 0); vcSplit.connect(vcRToMid, 1);
      vcSplit.connect(vcLToSide, 0); vcSplit.connect(vcRToSide, 1);
      vcLToMid.connect(vcMidBus); vcRToMid.connect(vcMidBus);
      vcLToSide.connect(vcSideBus); vcRToSide.connect(vcSideBus);
      vcMidBus.connect(vcMidVocalDirect); vcMidVocalDirect.connect(vcMidVocalBoostEq); vcMidVocalBoostEq.connect(vcMidOut);
      vcMidBus.connect(vcMidLowLp1); vcMidLowLp1.connect(vcMidLowLp2); vcMidLowLp2.connect(vcMidLowPreserve); vcMidLowPreserve.connect(vcMidOut);
      vcSideBus.connect(vcSideVocalNotch); vcSideVocalNotch.connect(vcSidePreserve); vcSidePreserve.connect(vcSideInvert);
      vcMidOut.connect(vcMerge, 0, 0); vcSidePreserve.connect(vcMerge, 0, 0);
      vcMidOut.connect(vcMerge, 0, 1); vcSideInvert.connect(vcMerge, 0, 1);
      vcMerge.connect(vcTrimGain);
      vcTrimGain.connect(compressor);
      compressor.connect(vcSoftShaper);
      vcSoftShaper.connect(fxOutGain);
      fxOutGain.connect(ctx.destination);

      audioFxGraph = {
        ctx, filters, dryGain, wetGain, bypassGain, fxOutGain, convolver, smallImpulse, hallImpulse,
        lDirect, rDirect, lToRCross, rToLCross, haasGainL, haasGainR, hrtfWet,
        deckALowShelf, deckAFilter, deckBLowShelf, outroAnalyser,
        vcMidVocalDirect, vcMidLowPreserve, vcMidVocalBoostEq, vcSideVocalNotch, vcSidePreserve, vcTrimGain,
        reverbKind: 'none'
      };
      updateAudioFxBypass(audioFxGraph, ctx.currentTime);
      // If currently playing a direct cross-origin URL, seamlessly switch it to our same-origin /api/audio proxy so Web Audio processes real PCM samples.
      if (S.playbackUrl && /^https?:\/\//i.test(S.playbackUrl) && !audio.src.startsWith(location.origin)) {
        const curTime = audio.currentTime || 0;
        const wasPlaying = !audio.paused;
        audio.src = location.origin + '/api/audio?url=' + encodeURIComponent(S.playbackUrl);
        audio.addEventListener('loadedmetadata', function onReload() {
          audio.removeEventListener('loadedmetadata', onReload);
          try { audio.currentTime = curTime; } catch (_) {}
          if (wasPlaying) audio.play().catch(() => {});
        });
      }
      // If deck B was previously loaded with a non-proxied external URL before audioFxGraph existed, invalidate it so it reloads via /api/audio (preventing CORS silent-zeroes).
      if (audioB && audioB.src && /^https?:\/\//i.test(audioB.src) && !audioB.src.startsWith(location.origin)) {
        autoMixPreloadKey = '';
        autoMixPreloadRetryAt = 0;
        autoMixPreloadedReady = false;
        try { audioB.pause(); audioB.removeAttribute('src'); audioB.load(); } catch (_) {}
      }
      return audioFxGraph;
    } catch (_) {
      return null;
    }
  }
  function audioFxSummary(cfg) {
    const raw = cfg || S.audioFx || {};
    const c = window.LxMineAudioFx ? window.LxMineAudioFx.normalizeConfig(raw) : raw;
    const spMode = raw.spatialMode || 'off';
    const hasSpatialAudio = spMode === 'hrtf' || spMode === 'system';
    if (!c.active && !hasSpatialAudio) return '原声（关闭）';
    const parts = [c.preset === 'off' ? '原声' : (c.shortLabel || c.label || '自定义')];
    if (c.spatial) parts.push('3D 环绕');
    if (spMode === 'hrtf') parts.push('空间音频 HRTF');
    else if (spMode === 'system') parts.push('空间音频直通');
    if (c.reverb === 'hall') parts.push('音乐厅');
    else if (c.reverb === 'small') parts.push('室内混响');
    return parts.join(' · ');
  }
  function updateAudioFxBypass(g, now) {
    if (!g || !g.bypassGain || !g.fxOutGain) return;
    const raw = S.audioFx || {};
    const norm = window.LxMineAudioFx ? window.LxMineAudioFx.normalizeConfig(raw) : raw;
    const spMode = ['off', 'hrtf', 'system'].includes(raw.spatialMode) ? raw.spatialMode : 'off';
    const fxActive = Boolean(norm.active || spMode !== 'off');
    const earActive = Boolean(S.earMonitor && S.earMonitor.mode !== 'off');
    const vocalMix = earActive ? Math.max(0, Math.min(1.5, earNum(S.earMonitor.vocalVolume, 1))) : 1;
    const vocalActive = earActive && Math.abs(vocalMix - 1) > 0.02;
    const useFxChain = fxActive || vocalActive;
    const t = now != null ? now : g.ctx.currentTime;
    // Bit-transparent dry bypass when FX & vocal suppression are off: zero compressor/waveshaper coloration!
    g.bypassGain.gain.setTargetAtTime(useFxChain ? 0 : 1, t, 0.015);
    g.fxOutGain.gain.setTargetAtTime(useFxChain ? 1 : 0, t, 0.015);
  }
  function applyAudioFx(nextConfig, persist = true) {
    const incoming = Object.assign({}, S.audioFx || {}, nextConfig || {});
    const norm = window.LxMineAudioFx
      ? window.LxMineAudioFx.normalizeConfig(incoming)
      : Object.assign({ preset: 'off', bands: [0,0,0,0,0], customBands: [0,0,0,0,0], spatial: false, reverb: 'none', active: false }, incoming);
    const spMode = ['off', 'hrtf', 'system'].includes(incoming.spatialMode) ? incoming.spatialMode : 'off';
    norm.spatialMode = spMode;
    norm.active = norm.active || spMode !== 'off';
    S.audioFx = norm;
    if (persist) saveStore();
    const earActive = S.earMonitor && S.earMonitor.mode !== 'off';
    if (!norm.active && !earActive && !audioFxGraph) return;
    const g = ensureAudioFxGraph();
    if (!g) return;
    if (g.ctx.state === 'suspended' && S.playing) g.ctx.resume().catch(() => {});
    const now = g.ctx.currentTime;
    const bands = norm.bands || [0, 0, 0, 0, 0];
    g.filters.forEach((f, idx) => {
      const db = norm.preset !== 'off' ? (Number(bands[idx]) || 0) * 1.15 : 0;
      f.gain.setTargetAtTime(Math.max(-14, Math.min(14, db)), now, 0.025);
    });
    // True Mid-Side Stereo Widening + Asymmetric Haas Cross-Delay for unmistakable 3D Surround!
    const surroundOn = !!norm.spatial;
    const hrtfOn = spMode === 'hrtf';
    const width = surroundOn ? 1.72 : (spMode === 'system' ? 1.18 : 1.0);
    const dirGain = (1 + width) * 0.5;
    const crossGain = (1 - width) * 0.5;
    g.lDirect.gain.setTargetAtTime(dirGain, now, 0.03);
    g.rDirect.gain.setTargetAtTime(dirGain, now, 0.03);
    g.lToRCross.gain.setTargetAtTime(crossGain, now, 0.03);
    g.rToLCross.gain.setTargetAtTime(crossGain, now, 0.03);
    g.haasGainL.gain.setTargetAtTime(surroundOn ? -0.34 : 0, now, 0.03);
    g.haasGainR.gain.setTargetAtTime(surroundOn ? 0.34 : 0, now, 0.03);
    // HRTF Binaural Spatial Audio blend
    g.hrtfWet.gain.setTargetAtTime(hrtfOn ? 0.85 : 0, now, 0.04);
    const revMode = norm.reverb !== 'none' ? norm.reverb : (surroundOn ? 'small' : 'none');
    if (revMode !== g.reverbKind) {
      g.reverbKind = revMode;
      if (revMode === 'hall') g.convolver.buffer = g.hallImpulse;
      else if (revMode === 'small') g.convolver.buffer = g.smallImpulse;
    }
    const wet = norm.reverb === 'hall' ? 0.44 : norm.reverb === 'small' ? 0.24 : (surroundOn ? 0.14 : 0);
    g.wetGain.gain.setTargetAtTime(wet, now, 0.04);
    const baseDry = hrtfOn ? 0.35 : (1 - wet * 0.22);
    g.dryGain.gain.setTargetAtTime(baseDry, now, 0.04);
    const vocalMix = earActive ? Math.max(0, Math.min(1.5, earNum(S.earMonitor.vocalVolume, 1))) : 1;
    applyVocalSuppressorGains(g, vocalMix, now);
    updateAudioFxBypass(g, now);
  }
  function applyVocalSuppressorGains(g, vocalMix, now) {
    if (!g || !g.vcMidVocalDirect) return;
    const v = Math.max(0, Math.min(1.5, earNum(vocalMix, 1)));
    const suppress = Math.max(0, 1 - Math.min(1, v));
    const boost = Math.max(0, (v - 1.0) * 2.0);
    const midDirect = v <= 1.0 ? (v * v) : 1.0;
    const lowKeep = suppress * (1 + suppress * 0.12);
    const midBoostDb = boost * 5.2;
    const sideNotchDb = suppress > 0 ? (-7.5 * suppress) : (-2.2 * boost);
    const sideGain = suppress > 0 ? (1.0 + suppress * 0.42) : (1.0 - boost * 0.34);
    const trim = 1.0 / (1.0 + boost * 0.24);
    const t = now != null ? now : g.ctx.currentTime;
    g.vcMidVocalDirect.gain.setTargetAtTime(midDirect, t, 0.025);
    g.vcMidLowPreserve.gain.setTargetAtTime(lowKeep, t, 0.025);
    g.vcMidVocalBoostEq.gain.setTargetAtTime(midBoostDb, t, 0.025);
    g.vcSideVocalNotch.gain.setTargetAtTime(sideNotchDb, t, 0.025);
    g.vcSidePreserve.gain.setTargetAtTime(sideGain, t, 0.025);
    if (g.vcTrimGain) g.vcTrimGain.gain.setTargetAtTime(trim, t, 0.025);
  }

  /* ---------------- Ear-Monitor / 耳返低延迟引擎 (#19) ---------------- */
  function earNum(v, fallback = 1) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function earMicPreampGain(micVol) {
    const v = Math.max(0, Math.min(1.5, earNum(micVol, 1)));
    if (v <= 0.001) return 0;
    // Balanced studio preamp (+7.2dB at 100%, +11.6dB at 150%) to avoid amplifying mic noise floor into clipping.
    return Math.pow(v, 1.15) * 2.3;
  }
  function buildEarImpulse(ctx, seconds, decay, earlyDensity, brightness) {
    const rate = ctx.sampleRate || 48000;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buffer.getChannelData(ch);
      let seed = ch === 0 ? 0x243f6a88 : 0x85a308d3;
      let lp = 0;
      const lpCoef = Math.max(0.08, Math.min(0.95, brightness));
      const preSamples = Math.floor(rate * (ch === 0 ? 0.006 : 0.011));
      for (let i = 0; i < length; i += 1) {
        if (i < preSamples) { data[i] = 0; continue; }
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = (seed / 2147483648) - 1;
        lp = lp + lpCoef * (white - lp);
        const t = (i - preSamples) / Math.max(1, length - preSamples);
        const env = Math.pow(1 - t, decay) * (1 + earlyDensity * Math.exp(-t * 14));
        data[i] = lp * env;
      }
    }
    return buffer;
  }
  const EAR_MONITOR_MODES = [
    ['off', '关闭', '关闭实时耳返监听'],
    ['original', '原生', '纯净低延迟干声直通，零混响清晰还原'],
    ['ktv', 'KTV', '高亮人声激励 + 立体声节奏回声与包厢混响'],
    ['theater', '剧场', '温暖厚实木质剧场中低频反射与空间感'],
    ['concert', '音乐厅', '宽广恢弘交响厅堂长混响与空气光泽']
  ];
  let earMonitorRuntime = null;
  function updateEarMonitorButton() {
    const btn = $('#ear-monitor-btn');
    if (!btn) return;
    const on = !!(S.earMonitor && S.earMonitor.mode !== 'off');
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    const modeLabel = (EAR_MONITOR_MODES.find(m => m[0] === (S.earMonitor?.mode || 'off')) || [])[1] || '关闭';
    btn.title = on ? ('耳返：' + modeLabel) : '耳返监听';
  }
  function stopEarMonitor() {
    if (earMonitorRuntime) {
      try { earMonitorRuntime.stream?.getTracks?.().forEach(t => t.stop()); } catch (_) {}
      try { earMonitorRuntime.ctx?.close?.(); } catch (_) {}
      earMonitorRuntime = null;
    }
    if (audioFxGraph) {
      applyVocalSuppressorGains(audioFxGraph, 1, audioFxGraph.ctx.currentTime);
      updateAudioFxBypass(audioFxGraph, audioFxGraph.ctx.currentTime);
    }
    if (audio && Number.isFinite(S.volume)) {
      try { audio.volume = Math.max(0, Math.min(1, S.volume)); } catch (_) {}
    }
    updateEarMonitorButton();
  }
  function applyEarMonitorParams() {
    const cfg = S.earMonitor || { mode: 'off', micVolume: 1, vocalVolume: 1 };
    const vGain = cfg.mode === 'off' ? 1 : Math.max(0, Math.min(1.5, earNum(cfg.vocalVolume, 1)));
    const needVocalDsp = cfg.mode !== 'off' && Math.abs(vGain - 1) > 0.02;
    const g = audioFxGraph || (needVocalDsp ? ensureAudioFxGraph() : null);
    if (g && g.vcMidVocalDirect) {
      if (g.ctx && g.ctx.state === 'suspended' && S.playing) {
        g.ctx.resume().catch(() => {});
      }
      applyVocalSuppressorGains(g, vGain, g.ctx.currentTime);
      updateAudioFxBypass(g, g.ctx.currentTime);
    }
    if (audio && !S.autoMixActive && Number.isFinite(S.volume)) {
      try { audio.volume = Math.max(0, Math.min(1, S.volume)); } catch (_) {}
    }
    if (!earMonitorRuntime) return;
    const {
      ctx, preampGain, eqLow, eqMid, eqAir, dryGain, wetGain, preDelay, wetLp,
      convolver, echoFbL, echoFbR, echoWetGain, masterGain, impulses
    } = earMonitorRuntime;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const micVol = Math.max(0, Math.min(1.5, earNum(cfg.micVolume, 1)));
    preampGain.gain.setTargetAtTime(earMicPreampGain(micVol), now, 0.02);
    masterGain.gain.setTargetAtTime(micVol <= 0.001 ? 0 : 1.0, now, 0.02);
    if (cfg.mode === 'original') {
      eqLow.gain.setTargetAtTime(0.0, now, 0.03);
      eqMid.gain.setTargetAtTime(1.8, now, 0.03);
      eqAir.gain.setTargetAtTime(1.4, now, 0.03);
      dryGain.gain.setTargetAtTime(1.0, now, 0.03);
      wetGain.gain.setTargetAtTime(0.0, now, 0.03);
      echoWetGain.gain.setTargetAtTime(0.0, now, 0.03);
      echoFbL.gain.setTargetAtTime(0.0, now, 0.03);
      echoFbR.gain.setTargetAtTime(0.0, now, 0.03);
    } else if (cfg.mode === 'ktv') {
      if (earMonitorRuntime.activeImpulse !== 'ktv') {
        convolver.buffer = impulses.ktv;
        earMonitorRuntime.activeImpulse = 'ktv';
      }
      eqLow.gain.setTargetAtTime(-1.5, now, 0.03);
      eqMid.gain.setTargetAtTime(5.2, now, 0.03);
      eqAir.gain.setTargetAtTime(4.8, now, 0.03);
      preDelay.delayTime.setTargetAtTime(0.012, now, 0.03);
      wetLp.frequency.setTargetAtTime(8600, now, 0.03);
      dryGain.gain.setTargetAtTime(0.88, now, 0.03);
      wetGain.gain.setTargetAtTime(0.85, now, 0.03);
      echoWetGain.gain.setTargetAtTime(0.72, now, 0.03);
      echoFbL.gain.setTargetAtTime(0.42, now, 0.03);
      echoFbR.gain.setTargetAtTime(0.38, now, 0.03);
    } else if (cfg.mode === 'theater') {
      if (earMonitorRuntime.activeImpulse !== 'theater') {
        convolver.buffer = impulses.theater;
        earMonitorRuntime.activeImpulse = 'theater';
      }
      eqLow.gain.setTargetAtTime(5.2, now, 0.03);
      eqMid.gain.setTargetAtTime(1.2, now, 0.03);
      eqAir.gain.setTargetAtTime(-2.2, now, 0.03);
      preDelay.delayTime.setTargetAtTime(0.028, now, 0.03);
      wetLp.frequency.setTargetAtTime(3200, now, 0.03);
      dryGain.gain.setTargetAtTime(0.74, now, 0.03);
      wetGain.gain.setTargetAtTime(1.30, now, 0.03);
      echoWetGain.gain.setTargetAtTime(0.22, now, 0.03);
      echoFbL.gain.setTargetAtTime(0.18, now, 0.03);
      echoFbR.gain.setTargetAtTime(0.15, now, 0.03);
    } else if (cfg.mode === 'concert') {
      if (earMonitorRuntime.activeImpulse !== 'concert') {
        convolver.buffer = impulses.concert;
        earMonitorRuntime.activeImpulse = 'concert';
      }
      eqLow.gain.setTargetAtTime(1.6, now, 0.03);
      eqMid.gain.setTargetAtTime(2.0, now, 0.03);
      eqAir.gain.setTargetAtTime(5.5, now, 0.03);
      preDelay.delayTime.setTargetAtTime(0.046, now, 0.03);
      wetLp.frequency.setTargetAtTime(11500, now, 0.03);
      dryGain.gain.setTargetAtTime(0.58, now, 0.03);
      wetGain.gain.setTargetAtTime(1.85, now, 0.03);
      echoWetGain.gain.setTargetAtTime(0.26, now, 0.03);
      echoFbL.gain.setTargetAtTime(0.30, now, 0.03);
      echoFbR.gain.setTargetAtTime(0.28, now, 0.03);
    }
  }
  let earMonitorErrorText = '';
  let earMonitorNeedsSystemSettings = false;
  let earMonitorSelectedDeviceId = '';
  async function setEarMonitorMode(mode, opts = {}) {
    S.earMonitor = Object.assign({ mode: 'off', micVolume: 1, vocalVolume: 1 }, S.earMonitor || {}, { mode });
    saveStore();
    earMonitorErrorText = '';
    earMonitorNeedsSystemSettings = false;
    if (mode === 'off') {
      stopEarMonitor();
      return true;
    }
    if (opts.restart && earMonitorRuntime) {
      stopEarMonitor();
    }
    if (!earMonitorRuntime) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        earMonitorErrorText = '当前运行环境不支持麦克风采集接口';
        notify(earMonitorErrorText);
        S.earMonitor.mode = 'off'; saveStore(); updateEarMonitorButton();
        return false;
      }
      if (window.desktopWindow && typeof window.desktopWindow.requestEarMonitorMicPermission === 'function') {
        try {
          const perm = await window.desktopWindow.requestEarMonitorMicPermission();
          if (!perm || perm.granted !== true) {
            earMonitorErrorText = '未授予麦克风权限，无法开启耳返监听';
            notify(earMonitorErrorText);
            S.earMonitor.mode = 'off'; saveStore(); updateEarMonitorButton();
            return false;
          }
        } catch (_) {}
      }
      try {
        const devConstraint = earMonitorSelectedDeviceId ? { deviceId: { exact: earMonitorSelectedDeviceId } } : {};
        const attempts = [
          { audio: Object.assign({ echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 }, devConstraint) },
          { audio: Object.assign({ echoCancellation: false, noiseSuppression: true, autoGainControl: false }, devConstraint) },
          { audio: Object.keys(devConstraint).length ? devConstraint : true },
          { audio: true },
        ];
        let stream = null;
        let lastErr = null;
        for (const constraints of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
          } catch (e) {
            lastErr = e;
            if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) break;
          }
        }
        if (!stream) throw lastErr || new Error('MIC_STREAM_FAILED');
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx({ latencyHint: 'interactive' });
        if (ctx.state === 'suspended') {
          try { await ctx.resume(); } catch (_) {}
        }
        const source = ctx.createMediaStreamSource(stream);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110; hp.Q.value = 0.7071;
        const micLp = ctx.createBiquadFilter(); micLp.type = 'lowpass'; micLp.frequency.value = 9200; micLp.Q.value = 0.7071;
        const preampGain = ctx.createGain(); preampGain.gain.value = earMicPreampGain(S.earMonitor.micVolume);
        const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.65;
        const eqLow = ctx.createBiquadFilter(); eqLow.type = 'peaking'; eqLow.frequency.value = 240; eqLow.Q.value = 0.9; eqLow.gain.value = 0;
        const eqMid = ctx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 3100; eqMid.Q.value = 1.05; eqMid.gain.value = 1.8;
        const eqAir = ctx.createBiquadFilter(); eqAir.type = 'peaking'; eqAir.frequency.value = 6500; eqAir.Q.value = 0.9; eqAir.gain.value = 1.2;

        const sumBus = ctx.createGain(); sumBus.gain.value = 1.0;
        const dryGain = ctx.createGain(); dryGain.gain.value = 1.0;

        // Tailored reverb branch with pre-delay and wet tone shaping
        const preDelay = ctx.createDelay(0.12); preDelay.delayTime.value = 0.015;
        const convolver = ctx.createConvolver();
        convolver.normalize = true;
        const impulses = {
          ktv: buildEarImpulse(ctx, 1.15, 2.0, 0.85, 0.72),
          theater: buildEarImpulse(ctx, 2.15, 1.65, 0.75, 0.36),
          concert: buildEarImpulse(ctx, 3.60, 1.42, 0.45, 0.84),
        };
        convolver.buffer = impulses.ktv;
        const wetLp = ctx.createBiquadFilter(); wetLp.type = 'lowpass'; wetLp.frequency.value = 6800;
        const wetGain = ctx.createGain(); wetGain.gain.value = 0.0;

        // Stereo ping-pong feedback slap-back echo branch (unmistakable KTV / Hall presence)
        const echoDelayL = ctx.createDelay(0.5); echoDelayL.delayTime.value = 0.125;
        const echoDelayR = ctx.createDelay(0.5); echoDelayR.delayTime.value = 0.175;
        const echoFbL = ctx.createGain(); echoFbL.gain.value = 0;
        const echoFbR = ctx.createGain(); echoFbR.gain.value = 0;
        const echoLpL = ctx.createBiquadFilter(); echoLpL.type = 'lowpass'; echoLpL.frequency.value = 4600;
        const echoLpR = ctx.createBiquadFilter(); echoLpR.type = 'lowpass'; echoLpR.frequency.value = 4600;
        const echoMerger = ctx.createChannelMerger(2);
        const echoWetGain = ctx.createGain(); echoWetGain.gain.value = 0;

        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.knee.value = 12;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.08;
        const earShaper = ctx.createWaveShaper();
        {
          const n = 4096, curve = new Float32Array(n), knee = 0.72, ceiling = 0.94, span = ceiling - knee;
          for (let i = 0; i < n; i += 1) {
            const x = (i * 2) / (n - 1) - 1;
            const ax = Math.abs(x);
            curve[i] = ax <= knee ? x : (x < 0 ? -1 : 1) * (knee + span * Math.tanh((ax - knee) / span));
          }
          earShaper.curve = curve;
          earShaper.oversample = '2x';
        }
        const masterGain = ctx.createGain(); masterGain.gain.value = 1;

        source.connect(hp);
        hp.connect(micLp);
        micLp.connect(preampGain);
        preampGain.connect(analyser);
        preampGain.connect(eqLow);
        eqLow.connect(eqMid);
        eqMid.connect(eqAir);

        // Dry
        eqAir.connect(dryGain);
        dryGain.connect(sumBus);

        // Reverb
        eqAir.connect(preDelay);
        preDelay.connect(convolver);
        convolver.connect(wetLp);
        wetLp.connect(wetGain);
        wetGain.connect(sumBus);

        // Stereo Ping-Pong Slap Echo
        eqAir.connect(echoDelayL);
        echoDelayL.connect(echoLpL);
        echoLpL.connect(echoMerger, 0, 0);
        echoLpL.connect(echoFbL);
        echoFbL.connect(echoDelayR);

        eqAir.connect(echoDelayR);
        echoDelayR.connect(echoLpR);
        echoLpR.connect(echoMerger, 0, 1);
        echoLpR.connect(echoFbR);
        echoFbR.connect(echoDelayL);

        echoMerger.connect(echoWetGain);
        echoWetGain.connect(sumBus);

        sumBus.connect(limiter);
        limiter.connect(earShaper);
        earShaper.connect(masterGain);
        masterGain.connect(ctx.destination);

        earMonitorRuntime = {
          stream, ctx, preampGain, analyser, eqLow, eqMid, eqAir, dryGain, wetGain,
          preDelay, wetLp, convolver, echoFbL, echoFbR, echoWetGain, masterGain, impulses,
          activeImpulse: 'ktv'
        };
      } catch (err) {
        const name = String(err && err.name || '');
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          earMonitorErrorText = '系统麦克风权限未开启，请在 Windows 隐私设置中允许桌面应用访问麦克风';
          earMonitorNeedsSystemSettings = true;
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          earMonitorErrorText = '未检测到可用麦克风设备，请确认耳机麦克风已正确连接并设为输入设备';
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          earMonitorErrorText = '麦克风正被其他程序独占使用，请关闭占用麦克风的应用后重试';
        } else {
          earMonitorErrorText = '耳返启动失败：' + (err && err.message ? err.message : '请检查麦克风与耳机连接');
        }
        notify(earMonitorErrorText, 3600);
        S.earMonitor.mode = 'off'; saveStore(); updateEarMonitorButton();
        return false;
      }
    }
    ensureAudioFxGraph();
    applyEarMonitorParams();
    updateEarMonitorButton();
    return true;
  }
  function openEarMonitorSheet() {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    const head = h('div', 'sheet-sticky-head');
    const titleWrap = h('div', 'sheet-title-wrap');
    const title = h('h2', '', '耳返监听'); title.style.margin = '0';
    titleWrap.append(title, h('span', 'beta-pill', 'Beta'));
    const doneBtn = h('button', 'pill-btn', '完成'); doneBtn.type = 'button';
    doneBtn.onclick = () => closeModal(backdrop);
    head.append(titleWrap, doneBtn);
    box.appendChild(head);
    const body = h('div', 'sheet-scroll-body');
    box.appendChild(body);
    let inputDevices = [];
    let meterFill = null;
    let meterRaf = 0;
    const meterBuf = new Uint8Array(128);
    const tickMeter = () => {
      if (!backdrop.isConnected) { meterRaf = 0; return; }
      if (meterFill && earMonitorRuntime && earMonitorRuntime.analyser) {
        earMonitorRuntime.analyser.getByteTimeDomainData(meterBuf);
        let sumSq = 0;
        for (let i = 0; i < meterBuf.length; i += 1) {
          const d = (meterBuf[i] - 128) / 128;
          sumSq += d * d;
        }
        const rms = Math.sqrt(sumSq / meterBuf.length);
        const pct = Math.max(0, Math.min(100, Math.round(rms * 240)));
        meterFill.style.width = pct + '%';
      } else if (meterFill) {
        meterFill.style.width = '0%';
      }
      meterRaf = requestAnimationFrame(tickMeter);
    };
    const loadInputs = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        inputDevices = list.filter(d => d && d.kind === 'audioinput' && d.deviceId);
        draw();
      } catch (_) {}
    };
    const draw = () => {
      body.replaceChildren();
      meterFill = null;
      const cfg = S.earMonitor || { mode: 'off', micVolume: 1, vocalVolume: 1 };
      const curMeta = EAR_MONITOR_MODES.find(m => m[0] === cfg.mode) || EAR_MONITOR_MODES[0];
      const tip = h('p', 'muted', curMeta[2] + '（建议佩戴有线或低延迟耳机以防啸叫）');
      tip.style.margin = '0 0 8px';
      body.appendChild(tip);
      if (earMonitorErrorText) {
        const errBox = h('div', 'more-sheet-panel');
        errBox.style.marginBottom = '10px';
        errBox.style.border = '1px solid rgba(255,107,118,.38)';
        const errP = h('p', '', earMonitorErrorText);
        errP.style.margin = '0'; errP.style.fontSize = '12.5px'; errP.style.color = '#ff8a93';
        errBox.appendChild(errP);
        if (earMonitorNeedsSystemSettings && window.desktopWindow?.openSystemMicSettings) {
          const openBtn = h('button', 'pill-btn accent', '打开 Windows 麦克风权限设置');
          openBtn.type = 'button';
          openBtn.onclick = () => window.desktopWindow.openSystemMicSettings();
          errBox.appendChild(openBtn);
        }
        body.appendChild(errBox);
      }
      const grid = h('div', 'ear-mode-grid');
      EAR_MONITOR_MODES.forEach(([id, label]) => {
        const btn = h('button', 'ear-mode-chip' + (cfg.mode === id ? ' active' : ''), label);
        btn.type = 'button';
        btn.onclick = async () => { await setEarMonitorMode(id); draw(); await loadInputs(); };
        grid.appendChild(btn);
      });
      body.appendChild(grid);

      const panel = h('div', 'more-sheet-panel');
      if (cfg.mode !== 'off') {
        const meterRow = h('div', 'fx-eq-row');
        meterRow.appendChild(h('span', 'fx-eq-label', '收音电平'));
        const track = h('div', '');
        track.style.cssText = 'flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;';
        meterFill = h('div', '');
        meterFill.style.cssText = 'width:0%;height:100%;border-radius:999px;background:linear-gradient(90deg,#34d399,#64d2ff,#fbbf24);transition:width 40ms linear;';
        track.appendChild(meterFill);
        meterRow.appendChild(track);
        panel.appendChild(meterRow);
      }
      if (inputDevices.length > 1) {
        const devRow = h('div', 'fx-inline-row');
        devRow.appendChild(h('span', 'fx-eq-label', '输入源'));
        const sel = document.createElement('select');
        sel.style.cssText = 'flex:1;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:var(--text);padding:0 8px;font-size:12px;';
        const defOpt = document.createElement('option'); defOpt.value = ''; defOpt.textContent = '系统默认麦克风';
        sel.appendChild(defOpt);
        inputDevices.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('麦克风设备 ' + (idx + 1));
          sel.appendChild(opt);
        });
        sel.value = earMonitorSelectedDeviceId;
        sel.onchange = async () => {
          earMonitorSelectedDeviceId = sel.value;
          if (S.earMonitor && S.earMonitor.mode !== 'off') {
            await setEarMonitorMode(S.earMonitor.mode, { restart: true });
            draw();
          }
        };
        devRow.appendChild(sel);
        panel.appendChild(devRow);
      }
      const micRow = h('div', 'fx-eq-row');
      micRow.appendChild(h('span', 'fx-eq-label', '麦克风'));
      const micSlider = h('input'); micSlider.type = 'range'; micSlider.min = '0'; micSlider.max = '150'; micSlider.step = '1';
      micSlider.value = String(Math.round(Math.max(0, Math.min(1.5, earNum(cfg.micVolume, 1))) * 100));
      const micVal = h('span', 'fx-eq-val', micSlider.value + '%');
      const micReset = makeSliderResetBtn('麦克风音量', () => {
        S.earMonitor.micVolume = 1;
        micSlider.value = '100';
        micVal.textContent = '100%';
        micReset.classList.remove('modified');
        applyEarMonitorParams();
        saveStore();
      }, Number(micSlider.value) !== 100);
      micSlider.oninput = () => {
        const pct = Math.round(Number(micSlider.value) || 0);
        S.earMonitor.micVolume = pct / 100;
        micVal.textContent = pct + '%';
        micReset.classList.toggle('modified', pct !== 100);
        applyEarMonitorParams();
      };
      micSlider.onchange = () => saveStore();
      micRow.append(micSlider, micVal, micReset);

      const vocRow = h('div', 'fx-eq-row');
      vocRow.appendChild(h('span', 'fx-eq-label', '原唱人声'));
      const vocSlider = h('input'); vocSlider.type = 'range'; vocSlider.min = '0'; vocSlider.max = '150'; vocSlider.step = '1';
      vocSlider.value = String(Math.round(Math.max(0, Math.min(1.5, earNum(cfg.vocalVolume, 1))) * 100));
      const vocVal = h('span', 'fx-eq-val', vocSlider.value + '%');
      const vocReset = makeSliderResetBtn('原唱人声', () => {
        S.earMonitor.vocalVolume = 1;
        vocSlider.value = '100';
        vocVal.textContent = '100%';
        vocReset.classList.remove('modified');
        applyEarMonitorParams();
        saveStore();
      }, Number(vocSlider.value) !== 100);
      vocSlider.oninput = () => {
        const pct = Math.round(Number(vocSlider.value) || 0);
        S.earMonitor.vocalVolume = pct / 100;
        vocVal.textContent = pct + '%';
        vocReset.classList.toggle('modified', pct !== 100);
        if (S.earMonitor.mode !== 'off') ensureAudioFxGraph();
        applyEarMonitorParams();
      };
      vocSlider.onchange = () => saveStore();
      vocRow.append(vocSlider, vocVal, vocReset);
      const vocHint = h('p', 'muted', '调低可抑制歌曲中心原唱人声，同时保留低频鼓点与立体声伴奏。');
      vocHint.style.cssText = 'margin:2px 0 0;font-size:11px;opacity:.76;';

      panel.append(micRow, vocRow, vocHint);
      body.appendChild(panel);
    };
    draw();
    void loadInputs();
    backdrop.appendChild(box);
    meterRaf = requestAnimationFrame(tickMeter);
  }

  let autoMixPreloadKey = '';
  let autoMixPreloadToken = 0;
  let autoMixPreloadState = 'idle'; // 'idle' | 'resolving' | 'loading' | 'ready' | 'failed'
  let autoMixPreloadStartedAt = 0;
  let autoMixPreloadRetryAt = 0;
  let autoMixPreloadAttempts = 0;
  let autoMixPreloadCleanup = null;
  let autoMixPreloadTimer = 0;
  const autoMixFailedUrls = new Map();
  let autoMixTriggeredKey = '';
  let autoMixNextSong = null;
  let autoMixNextUrl = '';
  let autoMixPreloadedReady = false;
  let autoMixPlanDurationMs = 0;
  let autoMixQuietSince = 0;
  let autoMixHandoffActive = false;
  const autoMixQuietBuf = new Uint8Array(256);
  let autoMixTimer = 0;
  function clearAutoMixPreloadListeners() {
    if (autoMixPreloadTimer) { clearTimeout(autoMixPreloadTimer); autoMixPreloadTimer = 0; }
    if (typeof autoMixPreloadCleanup === 'function') {
      try { autoMixPreloadCleanup(); } catch (_) {}
      autoMixPreloadCleanup = null;
    }
  }
  const autoMixNextLyricsCache = new Map();
  const autoMixNextLyricsPending = new Set();
  function prefetchNextLyricsForAutoMix(next) {
    if (!next || !next.name) return;
    const key = identity(next);
    if (autoMixNextLyricsCache.has(key) || autoMixNextLyricsPending.has(key)) return;
    if (next.localUrl || next.source === 'local' || next.provider === 'local') return;
    if (!window.lxMusic || typeof window.lxMusic.songAssets !== 'function') return;
    autoMixNextLyricsPending.add(key);
    window.lxMusic.songAssets(next)
      .then(payload => {
        autoMixNextLyricsPending.delete(key);
        const raw = payload && (payload.lyric || payload.lxlyric || payload.yrc || '') || '';
        const parsed = raw ? parseLrc(raw) : [];
        autoMixNextLyricsCache.set(key, parsed);
        if (autoMixNextLyricsCache.size > 24) {
          const oldest = autoMixNextLyricsCache.keys().next().value;
          if (oldest != null) autoMixNextLyricsCache.delete(oldest);
        }
        const curNext = peekNextQueueSong();
        if (S.autoMixEnabled && !S.autoMixActive && curNext && identity(curNext) === key) {
          refreshAutoMixPlan();
        }
      })
      .catch(() => {
        autoMixNextLyricsPending.delete(key);
      });
  }
  function resetAutoMixBassFilters() {
    try { if (audio && audio.playbackRate !== 1) audio.playbackRate = 1; } catch (_) {}
    try { if (audioB && audioB.playbackRate !== 1) audioB.playbackRate = 1; } catch (_) {}
    if (!audioFxGraph || !audioFxGraph.deckALowShelf || !audioFxGraph.deckBLowShelf) return;
    const now = audioFxGraph.ctx.currentTime;
    audioFxGraph.deckALowShelf.gain.setTargetAtTime(0, now, 0.04);
    audioFxGraph.deckBLowShelf.gain.setTargetAtTime(0, now, 0.04);
    if (audioFxGraph.deckAFilter) {
      audioFxGraph.deckAFilter.type = 'lowpass';
      audioFxGraph.deckAFilter.frequency.setTargetAtTime(20000, now, 0.04);
      audioFxGraph.deckAFilter.Q.setTargetAtTime(0.7, now, 0.04);
    }
  }
  function peekNextQueueSong() {
    if (!S.current || !Array.isArray(S.queue) || S.queue.length <= 1 || S.mode === '单曲循环') return null;
    const curKey = identity(S.current);
    const upNextIdx = resolveUpNextIndex();
    if (upNextIdx >= 0) {
      const cand = S.queue[upNextIdx];
      if (cand && identity(cand) !== curKey) {
        nextShuffleKey = identity(cand);
        return cand;
      }
    }
    if (S.mode === '顺序播放' && S.queueIndex >= S.queue.length - 1) return null;
    if (S.mode === '随机播放') {
      const cached = nextShuffleKey ? S.queue.find(item => identity(item) === nextShuffleKey && identity(item) !== curKey) : null;
      if (cached) return cached;
      const nextIdx = (S.queueIndex + 1 + Math.floor(Math.random() * (S.queue.length - 1))) % S.queue.length;
      const picked = S.queue[nextIdx];
      if (picked && identity(picked) !== curKey) {
        nextShuffleKey = identity(picked);
        return picked;
      }
      return null;
    }
    nextShuffleKey = '';
    const nextIdx = (S.queueIndex + 1) % S.queue.length;
    const cand = S.queue[nextIdx];
    return cand && identity(cand) !== curKey ? cand : null;
  }
  /** 仅中止正在进行的淡入淡出混音，保留已缓冲完成的下一首音轨，避免暂停/拖动进度条后过渡永久失效。 */
  function cancelActiveCrossfade() {
    if (!S.autoMixActive && !autoMixTimer) return;
    clearInterval(autoMixTimer);
    autoMixTimer = 0;
    S.autoMixActive = false;
    autoMixQuietSince = 0;
    resetAutoMixBassFilters();
    clearAutoMixPreloadListeners();
    if (audioB) {
      try { audioB.pause(); audioB.removeAttribute('src'); audioB.load(); } catch (_) {}
    }
    autoMixPreloadToken += 1;
    autoMixPreloadState = 'idle';
    autoMixPreloadedReady = false;
    autoMixPreloadKey = '';
    autoMixPreloadRetryAt = 0;
    autoMixPreloadAttempts = 0;
    audio.volume = S.volume;
  }
  function cancelAutoMix() {
    clearInterval(autoMixTimer);
    autoMixTimer = 0;
    clearAutoMixPreloadListeners();
    S.autoMixActive = false;
    autoMixPreloadToken += 1;
    autoMixPreloadState = 'idle';
    autoMixPreloadStartedAt = 0;
    autoMixPreloadKey = '';
    autoMixPreloadRetryAt = 0;
    autoMixPreloadAttempts = 0;
    autoMixHandoffActive = false;
    autoMixTriggeredKey = '';
    autoMixNextSong = null;
    autoMixNextUrl = '';
    autoMixPreloadedReady = false;
    autoMixQuietSince = 0;
    resetAutoMixBassFilters();
    if (audioB) {
      try { audioB.pause(); audioB.removeAttribute('src'); audioB.load(); } catch (_) {}
    }
    audio.volume = S.volume;
  }
  /** 主动式、防竞态、支持失败切源重试的下一首副轨预加载引擎：
   *  - 切歌、换歌单、切播放模式、开启开关后立即预热，不再苦等最后 40 秒；
   *  - 同首下一曲已在副轨就绪时直接复用，绝不重复打断；
   *  - 副轨解码/网络失败或 12s 超时自动记入坏链并强制重新跨源解析重试。 */
  async function ensureAutoMixPreload(forceRetry = false) {
    if (!S.autoMixEnabled || !audioB || S.autoMixActive || autoMixHandoffActive || S.sleepMode === 'song' || S.sleepPendingStop) return;
    const cur = S.current;
    const next = peekNextQueueSong();
    if (!cur || !next) return;
    const curKey = identity(cur);
    const nextKey = identity(next);
    const pairKey = curKey + '->' + nextKey;
    const now = Date.now();
    // 若副轨已经为同一首下一曲就绪（且在 WebAudio 已启用时走同源代理），直接复用！
    if (autoMixPreloadedReady && autoMixNextSong && identity(autoMixNextSong) === nextKey && audioB.readyState >= 2) {
      const corsBad = Boolean(audioFxGraph && audioB.src && /^https?:\/\//i.test(audioB.src) && !audioB.src.startsWith(location.origin));
      if (!corsBad) {
        autoMixPreloadKey = pairKey;
        autoMixPreloadState = 'ready';
        return;
      }
    }
    // 同组合正在解析或缓冲中，且未超过 12s 卡死阈值，绝不中途打断！
    if (!forceRetry && autoMixPreloadKey === pairKey && (autoMixPreloadState === 'resolving' || autoMixPreloadState === 'loading')) {
      if (now - autoMixPreloadStartedAt < 12000) return;
    }
    // 冷却期内暂不重试（最多 3 次自动退避重试，避免死循环）
    if (!forceRetry && autoMixPreloadKey === pairKey && autoMixPreloadState === 'failed' && now < autoMixPreloadRetryAt) {
      return;
    }
    if (autoMixPreloadKey !== pairKey) {
      autoMixPreloadAttempts = 0;
    }
    if (autoMixPreloadAttempts >= 3 && !forceRetry) return;
    const attempt = autoMixPreloadAttempts;
    autoMixPreloadAttempts += 1;
    const token = ++autoMixPreloadToken;
    clearAutoMixPreloadListeners();
    autoMixPreloadKey = pairKey;
    autoMixPreloadState = 'resolving';
    autoMixPreloadStartedAt = now;
    autoMixPreloadedReady = false;
    autoMixNextSong = next;
    const badUrls = autoMixFailedUrls.get(nextKey) || [];
    try {
      const resolveOpts = attempt > 0
        ? { forceResolve: true, raceAll: true, preferCrossPlatform: attempt >= 2, excludeUrls: badUrls.slice() }
        : { raceAll: true, excludeUrls: badUrls.slice() };
      const resolved = await resolveWithFallback(next, resolveOpts);
      if (token !== autoMixPreloadToken || !S.autoMixEnabled || !S.current || identity(S.current) !== curKey) return;
      const nextUrl = typeof resolved === 'string' ? resolved : (resolved && resolved.url);
      if (!nextUrl) {
        autoMixPreloadState = 'failed';
        autoMixPreloadRetryAt = Date.now() + 3000;
        return;
      }
      autoMixNextUrl = nextUrl;
      autoMixPreloadState = 'loading';
      autoMixPreloadStartedAt = Date.now();
      try { audioB.pause(); } catch (_) {}
      audioB.preload = 'auto';
      setDeckSource(audioB, nextUrl);
      audioB.volume = 0.001;
      let settled = false;
      const cleanup = () => {
        audioB.removeEventListener('loadeddata', onReady);
        audioB.removeEventListener('canplay', onReady);
        audioB.removeEventListener('canplaythrough', onReady);
        audioB.removeEventListener('error', onErr);
      };
      const markReady = () => {
        if (settled || token !== autoMixPreloadToken) return;
        const isOnlineNext = next && !next.localUrl && next.source !== 'local' && next.provider !== 'local';
        const actualNextMs = Number.isFinite(audioB.duration) ? audioB.duration * 1000 : 0;
        const metaNextMs = durationOf(next);
        if (isOnlineNext && metaNextMs >= 45000 && actualNextMs > 3000) {
          const isWrongNext = Math.abs(actualNextMs - metaNextMs) > 8000;
          const isShortNext = actualNextMs <= 72000 && actualNextMs < metaNextMs * 0.58;
          if (isWrongNext || isShortNext) {
            onErr();
            return;
          }
        }
        settled = true;
        clearAutoMixPreloadListeners();
        const plan = S.currentAutoMixPlan;
        if (plan && plan.nextEntryMs > 200 && Number.isFinite(audioB.duration)) {
          try { audioB.currentTime = Math.min(plan.nextEntryMs / 1000, Math.max(0, audioB.duration - 2)); } catch (_) {}
        }
        autoMixPreloadedReady = true;
        autoMixPreloadState = 'ready';
        autoMixPreloadRetryAt = 0;
        // 如果当前播放进度已经进入混音区间（如用户刚拖到末尾），就绪瞬间立刻补触发！
        if (S.playing && !S.autoMixActive && S.current && identity(S.current) === curKey) {
          void tickAutoMix(S.position, S.duration);
        }
      };
      const onReady = () => markReady();
      const onErr = () => {
        if (settled || token !== autoMixPreloadToken) return;
        settled = true;
        clearAutoMixPreloadListeners();
        if (nextUrl && !badUrls.includes(nextUrl)) {
          badUrls.push(nextUrl);
          autoMixFailedUrls.set(nextKey, badUrls.slice(-4));
        }
        autoMixPreloadedReady = false;
        autoMixPreloadState = 'failed';
        autoMixPreloadRetryAt = Date.now() + 2500;
        if (autoMixPreloadAttempts < 3) {
          autoMixPreloadTimer = setTimeout(() => {
            if (token === autoMixPreloadToken && S.autoMixEnabled) void ensureAutoMixPreload(true);
          }, 1200);
        }
      };
      autoMixPreloadCleanup = cleanup;
      audioB.addEventListener('loadeddata', onReady);
      audioB.addEventListener('canplay', onReady);
      audioB.addEventListener('canplaythrough', onReady);
      audioB.addEventListener('error', onErr);
      autoMixPreloadTimer = setTimeout(() => {
        if (!settled && token === autoMixPreloadToken) {
          if (audioB.readyState >= 2) markReady();
          else onErr();
        }
      }, 11000);
      audioB.load();
      if (audioB.readyState >= 2) markReady();
    } catch (_) {
      if (token !== autoMixPreloadToken) return;
      autoMixPreloadedReady = false;
      autoMixPreloadState = 'failed';
      autoMixPreloadRetryAt = Date.now() + 3000;
    }
  }
  function refreshAutoMixPlan() {
    if (!S.autoMixEnabled || !window.LxAutoMix) {
      S.currentAutoMixPlan = null;
      S.autoMixPreview = '';
      autoMixPlanDurationMs = 0;
      return;
    }
    const cur = S.current;
    const next = peekNextQueueSong();
    if (!cur || !next) {
      S.currentAutoMixPlan = null;
      S.autoMixPreview = next ? '' : '队列末尾无下一首';
      autoMixPlanDurationMs = 0;
      return;
    }
    const nextKey = identity(next);
    const curKey = identity(cur);
    const pairKey = curKey + '->' + nextKey;
    // 队列/歌单切换导致下一曲变更时，立即清理旧曲目的触发锁与失效预载
    if (autoMixTriggeredKey && autoMixTriggeredKey !== pairKey) autoMixTriggeredKey = '';
    if (autoMixNextSong && identity(autoMixNextSong) !== nextKey && !S.autoMixActive && !autoMixHandoffActive) {
      clearAutoMixPreloadListeners();
      autoMixPreloadToken += 1;
      autoMixPreloadState = 'idle';
      autoMixPreloadKey = '';
      autoMixPreloadRetryAt = 0;
      autoMixPreloadAttempts = 0;
      autoMixPreloadedReady = false;
      autoMixNextSong = null;
      autoMixNextUrl = '';
      try { audioB.pause(); audioB.removeAttribute('src'); audioB.load(); } catch (_) {}
    }
    const realAudioMs = Number.isFinite(audio.duration) && audio.duration > 15 ? Math.round(audio.duration * 1000) : 0;
    const effDur = realAudioMs || (S.duration > 15000 ? S.duration : 0) || durationOf(cur);
    autoMixPlanDurationMs = effDur;
    const cachedNextLyrics = autoMixNextLyricsCache.get(nextKey) || [];
    if (!autoMixNextLyricsCache.has(nextKey)) {
      prefetchNextLyricsForAutoMix(next);
    }
    const plan = window.LxAutoMix.planAutoMix(
      Object.assign({}, cur, { durationMs: effDur, lyricLines: S.lyrics }),
      Object.assign({}, next, { lyricLines: cachedNextLyrics })
    );
    S.currentAutoMixPlan = plan && plan.enabled ? plan : null;
    S.autoMixPreview = plan && plan.enabled ? (plan.summary + ' → ' + (next.name || '')) : (plan?.summary || '');
    // 主动式提前预加载：一旦规划就绪且正在播放（或非解析中），立即后台预热副轨，绝不拖到最后 40 秒
    if (S.currentAutoMixPlan && !S.resolving && !S.autoMixActive && S.playing) {
      void ensureAutoMixPreload(false);
    }
  }
  async function tickAutoMix(posMs, durMs) {
    if (!S.autoMixEnabled || !S.playing || !audioB || S.sleepMode === 'song' || S.sleepPendingStop || S.autoMixActive) return;
    const cur = S.current;
    const next = peekNextQueueSong();
    if (!cur || !next) return;
    const realAudioMs = Number.isFinite(audio.duration) && audio.duration > 15 ? Math.round(audio.duration * 1000) : 0;
    const effDur = realAudioMs || (Number(durMs) > 15000 ? Number(durMs) : 0) || durationOf(cur);
    if ((!S.currentAutoMixPlan || Math.abs(effDur - autoMixPlanDurationMs) > 2500) && effDur > 22000) {
      refreshAutoMixPlan();
    }
    const plan = S.currentAutoMixPlan;
    if (!plan || !plan.enabled) return;
    const pairKey = identity(cur) + '->' + identity(next);
    // 播放满 2 秒起就主动保持下一首副轨已预加载（换歌单/拖进度/网络抖动均自动补齐）
    if (posMs >= 2000) {
      void ensureAutoMixPreload(false);
    }
    const remainingMs = Math.max(0, effDur - posMs);
    let quietOutroTrigger = false;
    const quietFloorMs = Math.max(Number(plan.vocalFinishMs || 0) + 2200, effDur * 0.72);
    if (autoMixPreloadedReady && remainingMs <= 14000 && remainingMs >= 2000 && posMs >= quietFloorMs && audioFxGraph && audioFxGraph.outroAnalyser) {
      audioFxGraph.outroAnalyser.getByteTimeDomainData(autoMixQuietBuf);
      let sumSq = 0;
      for (let i = 0; i < autoMixQuietBuf.length; i += 1) {
        const d = (autoMixQuietBuf[i] - 128) / 128;
        sumSq += d * d;
      }
      const rms = Math.sqrt(sumSq / autoMixQuietBuf.length);
      if (rms < 0.018) {
        if (!autoMixQuietSince) autoMixQuietSince = Date.now();
        else if (Date.now() - autoMixQuietSince >= 1100) quietOutroTrigger = true;
      } else {
        autoMixQuietSince = 0;
      }
    } else {
      autoMixQuietSince = 0;
    }
    const shouldMix = (posMs >= plan.mixStartMs || quietOutroTrigger) && remainingMs >= 1600;
    if (shouldMix && autoMixTriggeredKey !== pairKey && autoMixPreloadedReady && autoMixNextSong && identity(autoMixNextSong) === identity(next)) {
      // 防呆：如果 WebAudio 图已建且副轨是外部非同源链接，立即用同源代理重载而非静默放弃。
      if (audioFxGraph && audioB.src && /^https?:\/\//i.test(audioB.src) && !audioB.src.startsWith(location.origin)) {
        autoMixPreloadedReady = false;
        void ensureAutoMixPreload(true);
        return;
      }
      autoMixTriggeredKey = pairKey;
      S.autoMixActive = true;
      const targetSong = autoMixNextSong;
      const targetUrl = autoMixNextUrl;
      const plannedFade = Math.max(2000, Math.min(11000, Number(plan.crossfadeMs) || 7400));
      const fadeDur = Math.max(1800, Math.min(plannedFade, Math.max(1800, remainingMs - 250)));
      const strategy = plan.strategy || 'echo-wash-bridge';
      const filterSweep = plan.filterSweep || 'none';
      const useTempoMatch = Boolean(plan.tempoMatch && Number(plan.rateA) && Number(plan.rateB));
      const targetRateA = useTempoMatch ? Math.max(0.965, Math.min(1.035, Number(plan.rateA) || 1)) : 1;
      const targetRateB = useTempoMatch ? Math.max(0.965, Math.min(1.035, Number(plan.rateB) || 1)) : 1;
      const useBassSwap = Boolean(plan.bassSwap && audioFxGraph && audioFxGraph.deckALowShelf && audioFxGraph.deckBLowShelf);
      const useDeckAFilter = Boolean(filterSweep !== 'none' && audioFxGraph && audioFxGraph.deckAFilter);
      try {
        if (audioFxGraph && audioFxGraph.ctx.state === 'suspended') {
          await audioFxGraph.ctx.resume().catch(() => {});
        }
        // 零突兀弹入：副轨以极低底噪起步，完全由包络曲线自然浮现
        audioB.volume = Math.max(0.002, Math.min(0.01, S.volume * 0.005));
        if (useTempoMatch) {
          try { audio.preservesPitch = true; audioB.preservesPitch = true; audioB.playbackRate = targetRateB; } catch (_) {}
        }
        if (useBassSwap) {
          const now = audioFxGraph.ctx.currentTime;
          audioFxGraph.deckALowShelf.gain.setTargetAtTime(0, now, 0.03);
          audioFxGraph.deckBLowShelf.gain.setTargetAtTime(-8, now, 0.02);
        }
        if (useDeckAFilter) {
          const now = audioFxGraph.ctx.currentTime;
          if (filterSweep === 'lowpass-warm') {
            audioFxGraph.deckAFilter.type = 'lowpass';
            audioFxGraph.deckAFilter.frequency.setTargetAtTime(18500, now, 0.03);
            audioFxGraph.deckAFilter.Q.setTargetAtTime(0.75, now, 0.03);
          } else if (filterSweep === 'highpass-lift') {
            audioFxGraph.deckAFilter.type = 'highpass';
            audioFxGraph.deckAFilter.frequency.setTargetAtTime(24, now, 0.03);
            audioFxGraph.deckAFilter.Q.setTargetAtTime(0.75, now, 0.03);
          }
        }
        await audioB.play();
      } catch (_) {
        cancelAutoMix();
        autoMixPreloadRetryAt = Date.now() + 10000;
        return;
      }
      // 等待副轨真正出声（最多 3500ms），避免在线流短暂缓冲就误判取消过渡。
      const baseSec = Math.max(0, audioB.currentTime || 0);
      const waitStarted = Date.now();
      const waitDeadline = waitStarted + 3500;
      let deckAudible = false;
      while (S.autoMixActive && Date.now() < waitDeadline) {
        if (audioB.error || audioB.ended) break;
        const waited = Date.now() - waitStarted;
        if (!audioB.paused && audioB.readyState >= 2 && ((audioB.currentTime || 0) >= baseSec + 0.015 || waited >= 350)) {
          deckAudible = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 35));
      }
      if (!S.autoMixActive || !deckAudible) {
        cancelAutoMix();
        autoMixPreloadRetryAt = Date.now() + 10000;
        return;
      }
      const startedAt = Date.now();
      clearInterval(autoMixTimer);
      autoMixTimer = setInterval(() => {
        if (!S.autoMixActive) { clearInterval(autoMixTimer); return; }
        const mainEnded = audio.ended || audio.paused;
        const t = mainEnded ? 1 : Math.max(0, Math.min(1, (Date.now() - startedAt) / fadeDur));
        const gains = window.LxAutoMix.equalPowerGains(t, strategy);
        audio.volume = Math.max(0, Math.min(1, S.volume * gains.outGain));
        audioB.volume = Math.max(0, Math.min(1, S.volume * gains.inGain));
        if (useTempoMatch) {
          const rA = 1 + (targetRateA - 1) * Math.min(1, t / 0.65);
          const rB = t <= 0.45 ? targetRateB : (targetRateB + (1 - targetRateB) * ((t - 0.45) / 0.55));
          try { audio.playbackRate = rA; audioB.playbackRate = rB; } catch (_) {}
        }
        if (useBassSwap && audioFxGraph?.deckALowShelf && audioFxGraph?.deckBLowShelf) {
          const now = audioFxGraph.ctx.currentTime;
          const outBass = t <= 0.30 ? 0 : (t >= 0.72 ? -9.5 : -9.5 * ((t - 0.30) / 0.42));
          const inBass = t <= 0.30 ? -7.5 : (t >= 0.68 ? 0 : -7.5 * (1 - (t - 0.30) / 0.38));
          audioFxGraph.deckALowShelf.gain.setTargetAtTime(outBass, now, 0.035);
          audioFxGraph.deckBLowShelf.gain.setTargetAtTime(inBass, now, 0.035);
        }
        if (useDeckAFilter && audioFxGraph?.deckAFilter) {
          const now = audioFxGraph.ctx.currentTime;
          // 前 36% 保持旧歌尾奏完整清晰度，中后段再轻柔退远空间，绝不闷糊
          const sweepU = t <= 0.36 ? 0 : Math.min(1, (t - 0.36) / 0.64);
          if (filterSweep === 'lowpass-warm') {
            const freq = 19000 * Math.pow(4400 / 19000, sweepU);
            audioFxGraph.deckAFilter.frequency.setTargetAtTime(freq, now, 0.04);
          } else if (filterSweep === 'highpass-lift') {
            const freq = 24 * Math.pow(380 / 24, sweepU);
            audioFxGraph.deckAFilter.frequency.setTargetAtTime(freq, now, 0.04);
          }
        }
        if (t >= 1) {
          clearInterval(autoMixTimer);
          autoMixTimer = 0;
          resetAutoMixBassFilters();
          const resumeSec = Math.max(0, audioB.currentTime || 0);
          const nextIdx = S.queue.findIndex(item => identity(item) === identity(targetSong));
          if (nextIdx >= 0) S.queueIndex = nextIdx;
          nextShuffleKey = '';
          S.current = targetSong;
          S.playbackUrl = targetUrl;
          S.previewRetryKey = '';
          S.previewRetryCount = 0;
          S.previewBadUrls = [];
          S.previewBadSourceIds = [];
          S.currentResolvedSourceId = '';
          S.previewRecovering = false;
          S.duration = (Number.isFinite(audioB.duration) && audioB.duration > 5 ? Math.round(audioB.duration * 1000) : 0) || durationOf(targetSong);
          S.position = resumeSec * 1000;
          S.lyrics = []; S.lyricIndex = -1;
          S.currentAutoMixPlan = null;
          autoMixPreloadKey = '';
          autoMixPreloadState = 'idle';
          autoMixPreloadRetryAt = 0;
          autoMixPreloadAttempts = 0;
          autoMixPreloadedReady = false;
          autoMixTriggeredKey = '';
          autoMixQuietSince = 0;
          S.autoMixActive = false;
          autoMixHandoffActive = true;
          const token = ++S.resolveToken;
          setDeckSource(audio, targetUrl);
          S.loadedSongKey = identity(targetSong);
          audio.volume = 0;
          let releasedB = false;
          const releaseB = () => {
            if (releasedB) return;
            releasedB = true;
            autoMixHandoffActive = false;
            audio.removeEventListener('playing', releaseB);
            audio.volume = S.volume;
            try { audioB.pause(); audioB.removeAttribute('src'); audioB.load(); } catch (_) {}
            autoMixPreloadToken += 1;
            autoMixPreloadState = 'idle';
            autoMixPreloadKey = '';
            autoMixPreloadedReady = false;
            autoMixNextSong = null;
            autoMixNextUrl = '';
            refreshAutoMixPlan();
          };
          const handoff = () => {
            audio.removeEventListener('loadedmetadata', handoff);
            const liveSec = Math.max(resumeSec, audioB.currentTime || 0);
            try { audio.currentTime = liveSec; } catch (_) {}
            audio.addEventListener('playing', releaseB, { once: true });
            audio.play().catch(releaseB);
            setTimeout(releaseB, 2500);
          };
          audio.addEventListener('loadedmetadata', handoff);
          audio.load();
          setStageSong(targetSong);
          updateDock();
          renderDetailLyrics();
          pushStageMetadata();
          pushStageClock(true);
          loadLyrics(targetSong, token);
          refreshAutoMixPlan();
          S.recentlyPlayed = [Object.assign({}, targetSong), ...S.recentlyPlayed.filter(item => identity(item) !== identity(targetSong))];
          saveStore();
        }
      }, 35);
    }
  }

  let sleepTimerInterval = 0;
  let sleepFadeTimer = 0;
  function fadeOutAndPause(durationMs = 1400) {
    clearInterval(sleepFadeTimer);
    cancelAutoMix();
    if (audio.paused) { S.playRequested = false; return; }
    const startVol = audio.volume;
    const startedAt = Date.now();
    sleepFadeTimer = setInterval(() => {
      const t = Math.max(0, Math.min(1, (Date.now() - startedAt) / durationMs));
      audio.volume = Math.max(0, startVol * (1 - t));
      if (t >= 1) {
        clearInterval(sleepFadeTimer);
        sleepFadeTimer = 0;
        S.playRequested = false;
        audio.pause();
        audio.volume = S.volume;
      }
    }, 55);
  }
  function updateSleepRemainingLabel() {
    if (S.sleepMode === 'off') { S.sleepRemainingText = ''; return; }
    if (S.sleepMode === 'song' || S.sleepPendingStop) { S.sleepRemainingText = '播完本首后暂停'; return; }
    const leftSec = Math.max(0, Math.floor((S.sleepEndAt - Date.now()) / 1000));
    const m = Math.floor(leftSec / 60), s = leftSec % 60;
    S.sleepRemainingText = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function clearSleepTimer(silent) {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = 0;
    S.sleepMode = 'off';
    S.sleepEndAt = 0;
    S.sleepPendingStop = false;
    S.sleepRemainingText = '';
    if (!silent) notify('已关闭定时关闭');
  }
  function setSleepTimer(modeId, minutes) {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = 0;
    S.sleepPendingStop = false;
    if (modeId === 'off') { clearSleepTimer(false); return; }
    if (modeId === 'song' || minutes < 0) {
      S.sleepMode = 'song';
      S.sleepEndAt = 0;
      S.sleepRemainingText = '播完本首后暂停';
      notify('定时关闭：播完本首后暂停');
      return;
    }
    const mins = Math.max(1, Math.min(480, Math.round(Number(minutes) || 30)));
    S.sleepMode = modeId;
    S.sleepEndAt = Date.now() + mins * 60000;
    updateSleepRemainingLabel();
    notify(`定时关闭：${mins} 分钟后停止播放`);
    sleepTimerInterval = setInterval(() => {
      if (S.sleepMode === 'off' || S.sleepMode === 'song') { clearInterval(sleepTimerInterval); return; }
      if (Date.now() >= S.sleepEndAt) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = 0;
        if (S.sleepFinishSong && S.playing) {
          S.sleepPendingStop = true;
          S.sleepRemainingText = '播完本首后暂停';
          notify('倒计时结束，将播完当前歌曲后暂停');
        } else {
          clearSleepTimer(true);
          fadeOutAndPause(1400);
          notify('定时关闭已到，已暂停播放');
        }
        return;
      }
      updateSleepRemainingLabel();
      document.querySelectorAll('[data-sleep-live="1"]').forEach(node => {
        node.textContent = S.sleepRemainingText || '已开启';
      });
    }, 1000);
  }
  function isSongInUserLibrary(song) {
    if (!song) return false;
    if (song.source === 'local' || song.provider === 'local') return true;
    const key = identity(song);
    if (!key) return false;
    if (isFavorite(song)) return true;
    if ((S.localTracks || []).some(t => identity(t) === key)) return true;
    if ((S.downloads || []).some(d => d && d.state === 'complete' && (identity(d.song || d) === key || String(d.songId || '') === String(song.id || '')))) return true;
    if ((S.library || []).some(pl => Array.isArray(pl.tracks) && pl.tracks.some(t => identity(t) === key))) return true;
    if ((S.librarySampleTracks || []).some(t => identity(t) === key)) return true;
    return false;
  }
  function dislikeCurrentSong() {
    const song = S.current;
    if (!song) return;
    const key = identity(song);
    if (key && !S.dislikedKeys.includes(key)) {
      S.dislikedKeys = [key, ...S.dislikedKeys].slice(0, 300);
      saveStore();
    }
    const dislikedSet = new Set(S.dislikedKeys);
    if (S.feed) {
      if (Array.isArray(S.feed.forYou)) S.feed.forYou = S.feed.forYou.filter(s => !dislikedSet.has(identity(s)));
      if (Array.isArray(S.feed.newSongs)) S.feed.newSongs = S.feed.newSongs.filter(s => !dislikedSet.has(identity(s)));
      if (Array.isArray(S.feed.dailySongs)) S.feed.dailySongs = S.feed.dailySongs.filter(s => !dislikedSet.has(identity(s)));
    }
    notify('已减少此类推荐');
    if (S.queue.length > 1) {
      const nextQueue = S.queue.filter(s => identity(s) !== key);
      const nextIdx = Math.min(S.queueIndex, nextQueue.length - 1);
      S.queue = nextQueue;
      S.queueIndex = Math.max(0, nextIdx);
      playSong(nextQueue[S.queueIndex], nextQueue);
    } else {
      S.playRequested = false;
      audio.pause();
    }
  }
  function clearDislikedSongs() {
    S.dislikedKeys = [];
    saveStore();
    notify('已清空不感兴趣屏蔽列表');
  }
  function viewCurrentArtist() {
    const song = S.current;
    if (!song) return;
    const artist = splitArtists(song.artist || song.singer)[0] || String(song.artist || song.singer || '').trim();
    if (!artist || IGNORED_ARTISTS.has(artist.toLowerCase())) { notify('当前歌曲没有可用的艺人信息'); return; }
    const fromPlayer = !!S.detailOpen;
    if (S.detailOpen) closeDetail({ suppressRestoreSearch: true });
    S.search.kind = 'artist';
    openSearch({ returnToPlayer: fromPlayer });
    const input = $('#search-input');
    if (input) { input.value = artist; $('#search-clear')?.classList.remove('hidden'); }
    S.search.query = artist;
    performSearch(false);
  }
  function viewCurrentAlbum() {
    const song = S.current;
    if (!song) return;
    const rawAlbum = String(song.album || song.albumName || '').trim();
    const album = rawAlbum || String(song.name || '').trim();
    if (!album) { notify('当前歌曲没有可用的专辑信息'); return; }
    const fromPlayer = !!S.detailOpen;
    if (S.detailOpen) closeDetail({ suppressRestoreSearch: true });
    S.search.kind = rawAlbum ? 'album' : 'music';
    openSearch({ returnToPlayer: fromPlayer });
    const input = $('#search-input');
    if (input) { input.value = album; $('#search-clear')?.classList.remove('hidden'); }
    S.search.query = album;
    performSearch(false);
  }
  async function openSimilarSongs() {
    const song = S.current;
    if (!song) return;
    const fromPlayer = !!S.detailOpen;
    const fromSearch = !!S.detailFromSearch && !!S.searchOpen;
    if (S.detailOpen) closeDetail({ suppressRestoreSearch: true });
    const view = { name: 'playlist', kind: 'similar', id: 'similar-' + identity(song), title: '相似歌曲 · ' + (song.name || ''), tracks: null, main: false, returnToPlayer: fromPlayer, returnToSearch: !fromPlayer && fromSearch, preserveQueue: true };
    pushView(view);
    const dislikedSet = new Set(S.dislikedKeys || []);
    const selfKey = identity(song);
    const found = [];
    const seen = new Set([selfKey]);
    try {
      if (window.lxMusic && typeof window.lxMusic.similarSongs === 'function') {
        const res = await window.lxMusic.similarSongs(song);
        for (const item of (res && res.items) || []) {
          const k = identity(item);
          if (k && !dislikedSet.has(k) && !seen.has(k)) { seen.add(k); found.push(item); }
        }
      }
    } catch (_) {}
    if (found.length < 8 && window.lxMusic && typeof window.lxMusic.search === 'function') {
      try {
        const artist = splitArtists(song.artist || song.singer)[0] || song.name || '';
        const res = await window.lxMusic.search({ query: artist, source: songSource(song) || 'wy', page: 1, limit: 24, type: 'music' });
        for (const item of (res && res.items) || []) {
          const k = identity(item);
          if (k && !dislikedSet.has(k) && !seen.has(k)) { seen.add(k); found.push(item); }
        }
      } catch (_) {}
    }
    view.tracks = found;
    view.count = found.length;
    if (S.currentView === view) renderPlaylist(view);
  }


  /* ---------------- retained PC-only modes ---------------- */
  function overlayColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      primary: style.getPropertyValue('--stage-b').trim() || '#38bdf8',
      secondary: '#ffffff',
      highlight: style.getPropertyValue('--stage-a').trim() || '#a5b4fc',
      glow: style.getPropertyValue('--stage-b').trim() || '#38bdf8'
    };
  }
  const LYRIC_COLOR_MODES = [
    ['cover-solid', '封面取色 · 纯色'],
    ['cover-gradient', '封面取色 · 渐变'],
    ['custom-solid', '自定义 · 纯色'],
    ['custom-gradient', '自定义 · 渐变']
  ];
  function normalizeHexColor(value, fallback) {
    const text = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
  }
  function mixHex(a, b, amount) {
    const parse = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const ca = parse(normalizeHexColor(a, '#ffffff'));
    const cb = parse(normalizeHexColor(b, '#000000'));
    const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.max(0, Math.min(1, amount))));
    return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h, s, l };
  }
  function hslToHex(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
      const q = l < .5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue(p, q, h + 1 / 3);
      g = hue(p, q, h);
      b = hue(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
  }
  function readableHex(hex, minLightness) {
    const value = normalizeHexColor(hex, '#7dd3fc');
    const rgb = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (hsl.l < minLightness) hsl.l = minLightness;
    if (hsl.s < .22) hsl.s = .22;
    return hslToHex(hsl.h, hsl.s, hsl.l);
  }
  function lyricFallbackPalette() {
    const primary = '#7dd3fc';
    const secondary = '#a5b4fc';
    return { primary, secondary, highlight: mixHex(primary, '#ffffff', .38), glow: '#38bdf8' };
  }
  function paletteFromImage(image) {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 40;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 40, 40);
    const data = ctx.getImageData(0, 0, 40, 40).data;
    let ar = 0, ag = 0, ab = 0, count = 0;
    let best = null;
    const candidates = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 160) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const hsl = rgbToHsl(r, g, b);
      if (hsl.l < .08 || hsl.l > .94) continue;
      ar += r; ag += g; ab += b; count += 1;
      const score = hsl.s * (0.68 + (1 - Math.abs(hsl.l - .54)) * 0.32);
      const candidate = { hex: rgbToHex(r, g, b), h: hsl.h, s: hsl.s, l: hsl.l, score };
      candidates.push(candidate);
      if (!best || score > best.score) best = candidate;
    }
    if (!count || !best) return null;
    const average = rgbToHex(ar / count, ag / count, ab / count);
    let primary = best.hex;
    let secondary = null;
    const differentHue = candidates
      .filter(item => {
        const diff = Math.abs(item.h - best.h);
        return Math.min(diff, 1 - diff) > .075;
      })
      .sort((a, b) => b.score - a.score)[0];
    if (differentHue) secondary = differentHue.hex;
    if (!secondary) {
      const hsl = rgbToHsl.apply(null, [1, 3, 5].map(i => parseInt(primary.slice(i, i + 2), 16)));
      secondary = hslToHex(hsl.h + .11, Math.max(.42, hsl.s), Math.max(.55, hsl.l));
    }
    primary = readableHex(primary, .62);
    secondary = readableHex(secondary, .60);
    return {
      primary,
      secondary,
      highlight: mixHex(primary, '#ffffff', .38),
      glow: secondary,
      average: readableHex(average, .52)
    };
  }
  function resolveLyricColors(kind) {
    const desktop = kind === 'desktop';
    const mode = desktop ? S.desktopLyricColorMode : S.lyricColorMode;
    const custom1 = normalizeHexColor(desktop ? S.desktopLyricColor : S.lyricColor, '#7dd3fc');
    const custom2 = normalizeHexColor(desktop ? S.desktopLyricColor2 : S.lyricColor2, '#a5b4fc');
    const cover = S.coverPalette || lyricFallbackPalette();
    let primary, secondary, highlight, glow, gradient;
    if (mode === 'custom-solid' || mode === 'custom-gradient') {
      gradient = mode === 'custom-gradient';
      primary = custom1;
      secondary = gradient ? custom2 : primary;
    } else {
      gradient = mode === 'cover-gradient';
      primary = readableHex(cover.primary, .62);
      secondary = gradient ? readableHex(cover.secondary, .60) : primary;
    }
    highlight = gradient ? mixHex(primary, '#ffffff', .38) : primary;
    glow = gradient ? secondary : primary;
    return { primary, secondary, highlight, glow, gradient, mode };
  }
  function applyLyricTheme() {
    const detail = resolveLyricColors('detail');
    const root = document.documentElement;
    root.style.setProperty('--lyric-detail-1', detail.primary);
    root.style.setProperty('--lyric-detail-2', detail.secondary);
    root.style.setProperty('--lyric-detail-glow', detail.glow);
    root.style.setProperty('--lyric-detail-gradient', `linear-gradient(100deg, ${detail.primary} 0%, ${detail.secondary} 58%, ${detail.highlight} 100%)`);
    document.body.classList.toggle('lyric-detail-gradient', detail.gradient);
    syncTimelineAdaptiveTheme();
    pushDesktopLyrics(true);
    pushStageMetadata();
    const preview = document.querySelector('.lyric-settings-preview');
    if (preview) updateLyricPreview(preview);
  }
  let lastUiPopupClosedAt = 0;
  function isUiTransitionOrPopupBusy() {
    return document.body.classList.contains('detail-entering')
      || document.body.classList.contains('detail-leaving')
      || !!document.querySelector('.anchored-menu, .modal.glass')
      || (performance.now() - lastUiPopupClosedAt < 480);
  }
  function refreshLyricPalette(cover) {
    const key = String(cover || '');
    if (S.coverPaletteKey === key && S.coverPalette) return;
    const token = (S.coverPaletteToken || 0) + 1;
    S.coverPaletteToken = token;
    S.coverPaletteKey = key;
    const fallback = lyricFallbackPalette();
    S.coverPalette = fallback;
    applyLyricTheme();
    if (!key) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const commitPalette = () => {
      if (token !== S.coverPaletteToken) return;
      if (isUiTransitionOrPopupBusy()) {
        setTimeout(commitPalette, 320);
        return;
      }
      try {
        const palette = paletteFromImage(image);
        if (palette) {
          S.coverPalette = palette;
          applyLyricTheme();
          updateSmartStage(false);
          if (S.currentView && S.currentView.name === 'lyrics-settings') renderLyricsSettings();
        }
      } catch (_) {
        S.coverPalette = fallback;
        applyLyricTheme();
      }
    };
    image.onload = commitPalette;
    image.onerror = () => { if (token === S.coverPaletteToken) { S.coverPalette = fallback; applyLyricTheme(); } };
    image.src = coverUrl(cover);
  }
  function updateLyricPreview(preview) {
    const detail = resolveLyricColors('detail');
    const desktop = resolveLyricColors('desktop');
    preview.style.setProperty('--preview-detail-1', detail.primary);
    preview.style.setProperty('--preview-detail-2', detail.secondary);
    preview.style.setProperty('--preview-desktop-1', desktop.primary);
    preview.style.setProperty('--preview-desktop-2', desktop.secondary);
    const detailLine = preview.querySelector('.preview-detail-line');
    const desktopLine = preview.querySelector('.preview-desktop-line');
    if (detailLine) detailLine.classList.toggle('gradient', detail.gradient);
    if (desktopLine) desktopLine.classList.toggle('gradient', desktop.gradient);
    preview.querySelectorAll('[data-preview="detail"]').forEach(node => {
      node.style.background = detail.gradient ? `linear-gradient(100deg, ${detail.primary}, ${detail.secondary})` : detail.primary;
    });
    preview.querySelectorAll('[data-preview="desktop"]').forEach(node => {
      node.style.background = desktop.gradient ? `linear-gradient(100deg, ${desktop.primary}, ${desktop.secondary})` : desktop.primary;
    });
  }

  function findLyricIndexAt(targetMs) {
    const list = S.lyrics;
    const len = list.length;
    if (!len) return 0;
    const cur = S.lyricIndex;
    if (cur >= 0 && cur < len && list[cur].time <= targetMs) {
      if (cur + 1 >= len || list[cur + 1].time > targetMs) return cur;
      if (cur + 2 >= len || list[cur + 2].time > targetMs) return cur + 1;
    }
    let lo = 0, hi = len - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].time <= targetMs) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }
  function lyricSnapshot() {
    if (!S.lyrics.length) return { text: '', progress: 0, index: 0 };
    const targetMs = S.position + (Number(S.lyricOffset) || 0);
    const index = findLyricIndexAt(targetMs);
    const line = S.lyrics[index];
    const next = S.lyrics[index + 1];
    const span = Math.max(500, (next ? next.time : line.time + 4200) - line.time);
    return { text: line.text || '', progress: Math.max(0, Math.min(1, (targetMs - line.time) / span)), index };
  }
  function desktopLyricLines(index, count) {
    if (!S.lyrics.length) return [];
    const total = Math.max(1, Math.min(5, Number(count) || 1));
    const active = Math.max(0, Math.min(S.lyrics.length - 1, Number(index) || 0));
    const before = Math.floor((total - 1) / 2);
    const after = total - 1 - before;
    const start = Math.max(0, active - before);
    const end = Math.min(S.lyrics.length, active + after + 1);
    return S.lyrics.slice(start, end).map((line, i) => ({ text: line.text, active: start + i === active }));
  }
  function desktopLyricsPayload(enabled) {
    const lyric = lyricSnapshot();
    const colors = resolveLyricColors('desktop');
    const count = Math.max(1, Math.min(5, Number(S.desktopLyricLines) || 3));
    return {
      enabled: !!enabled,
      text: lyric.text || (S.current ? '暂无歌词' : '尚未播放'),
      lines: desktopLyricLines(lyric.index, count),
      lineCount: count,
      gradient: colors.gradient,
      progress: lyric.progress,
      progressSpan: 0.08,
      title: S.current ? (S.current.name || '') : '',
      artist: S.current ? (S.current.artist || S.current.singer || '') : '',
      playing: !!S.playing,
      size: Math.max(0.72, Math.min(1.55, Number(S.desktopLyricSize) || 1)),
      opacity: 0.94,
      y: 0.82,
      clickThrough: !!S.desktopLyricsLocked,
      lyricGlowParticles: false,
      cinema: true,
      highlightFollow: false,
      frameRate: 120,
      fontFamily: '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei UI",sans-serif',
      fontWeight: 650,
      letterSpacing: 0.02,
      lineHeight: 1.2,
      lyricScale: 1,
      feather: 0.05,
      motion: { lyricGlow: true, lyricGlowBeat: true, lyricGlowStrength: 0.5, highBloom: 0.35, beatGlow: 0.35, beatPulse: 0.35, bass: 0.5 },
      colors: { primary: colors.primary, secondary: colors.secondary, highlight: colors.highlight, glow: colors.glow }
    };
  }
  function pushDesktopLyrics(force) {
    if (!S.desktopLyrics || !window.desktopWindow || !window.desktopWindow.updateDesktopLyrics) return;
    if (!force && !S.playing) return;
    const now = Date.now();
    if (!force && now - (S.desktopLyricsPushedAt || 0) < 240) return;
    S.desktopLyricsPushedAt = now;
    window.desktopWindow.updateDesktopLyrics(desktopLyricsPayload(true)).catch(() => {});
  }
  function updateDesktopLyricsButton() {
    const button = $('#dock-controls [data-action="desktop-lyrics"]');
    if (!button) return;
    const enabled = !!S.desktopLyrics;
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.title = (enabled ? '关闭桌面歌词' : '打开桌面歌词') + '；右键锁定或解锁';
  }
  function applyDesktopLyrics(enabled) {
    const previous = !!S.desktopLyrics;
    S.desktopLyrics = !!enabled;
    saveStore();
    updateDesktopLyricsButton();
    if (!window.desktopWindow || !window.desktopWindow.setDesktopLyricsEnabled) {
      S.desktopLyrics = previous; saveStore(); updateDesktopLyricsButton();
      notify('当前环境不支持桌面歌词'); return;
    }
    window.desktopWindow.setDesktopLyricsEnabled(!!enabled, desktopLyricsPayload(!!enabled))
      .then(result => {
        if (!result || result.ok !== true) {
          S.desktopLyrics = previous; saveStore(); updateDesktopLyricsButton();
          notify('桌面歌词启动失败');
        }
      })
      .catch(error => {
        S.desktopLyrics = previous; saveStore(); updateDesktopLyricsButton();
        notify('桌面歌词失败：' + error.message);
      });
  }
  function updateVolumeUI() {
    const button = $('#volume-btn');
    const percent = Math.round(Math.max(0, Math.min(1, Number(S.volume) || 0)) * 100);
    if (button) {
      const muted = percent <= 0;
      button.classList.toggle('is-muted', muted);
      const volState = muted ? 'mute' : 'vol';
      if (button.dataset.volState !== volState) {
        button.dataset.volState = volState;
        button.innerHTML = muted ? ICONS.ic_mute : ICONS.ic_volume;
      }
      button.setAttribute('aria-label', '音量 ' + percent + '%');
      button.title = '音量 ' + percent + '%';
    }
    const panel = document.querySelector('.volume-popover');
    if (panel) {
      const input = panel.querySelector('input[type="range"]');
      const value = panel.querySelector('.volume-value');
      if (input) input.value = String(percent);
      if (value) value.textContent = percent + '%';
    }
  }
  function setVolume(value, persist) {
    const next = Math.max(0, Math.min(1, Number(value) || 0));
    S.volume = next;
    if (playPauseFadeMode !== 'out' && !S.autoMixActive) {
      audio.volume = next;
    }
    updateVolumeUI();
    if (persist) saveStore();
  }
  function openVolumePopover(anchor) {
    if (!anchor) return;
    document.querySelectorAll('.menu-backdrop').forEach(backdrop => backdrop.click());
    const rect = anchor.getBoundingClientRect();
    const backdrop = h('div', 'menu-backdrop');
    const panel = h('div', 'popover anchored-menu glass volume-popover');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '音量');
    const head = h('div', 'volume-head');
    head.appendChild(h('span', 'volume-label', '音量'));
    const headRight = h('div', 'volume-head-right');
    const value = h('span', 'volume-value', Math.round(S.volume * 100) + '%');
    const resetVolBtn = makeSliderResetBtn('音量', () => {
      setVolume(defaults.volume, true);
      input.value = String(Math.round(defaults.volume * 100));
      value.textContent = Math.round(defaults.volume * 100) + '%';
      resetVolBtn.classList.remove('modified');
    }, Math.abs(S.volume - defaults.volume) > 0.005);
    headRight.append(value, resetVolBtn);
    head.appendChild(headRight);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(Math.round(S.volume * 100));
    input.setAttribute('aria-label', '音量');
    panel.append(head, input);
    panel.style.visibility = 'hidden';
    document.body.append(backdrop, panel);

    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const gap = 8;
    const above = rect.top - gap - size.height >= 12;
    const top = above ? rect.top - gap - size.height : Math.min(window.innerHeight - 12 - size.height, rect.bottom + gap);
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - size.width / 2, window.innerWidth - 16 - size.width));
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.classList.toggle('above', above);
    const originX = rect.left + rect.width / 2 - left;
    const originY = rect.top + rect.height / 2 - top;
    panel.style.transformOrigin = originX + 'px ' + originY + 'px';
    panel.dataset.popupOriginX = String(originX / size.width);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      saveStore();
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', onScroll, true);
      Promise.resolve(window.LxPopupMotion.close(panel)).finally(() => {
        panel.remove(); backdrop.remove();
      });
    };
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    const onScroll = event => { if (!panel.contains(event.target)) close(); };
    input.addEventListener('input', () => {
      setVolume(Number(input.value) / 100, false);
      resetVolBtn.classList.toggle('modified', Math.abs(S.volume - defaults.volume) > 0.005);
    });
    input.addEventListener('change', () => saveStore());
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', onScroll, true);
    window.LxGlass.prepare(panel);
    panel.style.visibility = '';
    window.LxPopupMotion.open(panel);
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    return close;
  }
  function buildWallpaperStageSnapshot() {
    if (S.wallpaperStage && S.current && S.wallpaperStage.id === identity(S.current) && S.wallpaperStage.mode === effectiveStyleName()) {
      return S.wallpaperStage;
    }
    const cover = S.current ? stageCoverSource(S.current) : '';
    const lyricColors = resolveLyricColors('detail');
    const effStyle = effectiveStyleName();
    return {
      id: S.current ? identity(S.current) : 'wallpaper-idle',
      audioUrl: stageAudioUrl(),
      mode: effStyle,
      lines: (S.lyrics || []).map(line => {
        const auxText = [S.lyricShowTranslation ? line.translation : '', S.lyricShowRomaji ? line.romaji : ''].filter(Boolean).join('\n');
        return { timeMs: line.time, text: line.text, ...(auxText ? { translation: auxText } : {}), ...(line.words ? { words: line.words } : {}) };
      }),
      translationLines: (S.lyrics || [])
        .filter(line => (S.lyricShowTranslation && line.translation) || (S.lyricShowRomaji && line.romaji))
        .map(line => ({ timeMs: line.time, text: [S.lyricShowTranslation ? line.translation : '', S.lyricShowRomaji ? line.romaji : ''].filter(Boolean).join('\n') })),
      lyricColorMode: S.lyricColorMode.endsWith('gradient') ? 'custom-gradient' : 'custom-solid',
      lyricColors: { primary: lyricColors.primary, secondary: lyricColors.secondary, highlight: lyricColors.gradient ? lyricColors.secondary : lyricColors.highlight, glow: lyricColors.glow },
      name: S.current ? (S.current.name || '') : '',
      singer: S.current ? (S.current.artist || S.current.singer || '') : '',
      cover: cover ? new URL(cover, location.href).href : '',
      duration: S.duration || (S.current ? durationOf(S.current) : 0),
      lyricOffset: Number(S.lyricOffset) || 0,
      lyricScale: Math.max(0.55, Math.min(1.5, Number(S.lyricFontSize) || 1)),
      lyricLineSpacing: Math.max(0.85, Math.min(1.8, Number(S.lyricLineSpacing) || 1.2)),
      lyricMaxLines: Math.max(0, Math.min(10, Math.round(Number(S.lyricMaxLines) || 0))),
      resetCameraOnSong: S.stageResetCameraOnSong !== false,
      appearance: document.body.classList.contains('light-theme') ? 'light' : 'dark',
      bgImage: S.stageBgImage || '',
      bgOpacity: S.stageBgOpacity,
      wallpaperBgOpacity: S.wallpaperBgOpacity,
      wallpaperOverallOpacity: S.wallpaperOverallOpacity,
      topInset: 96,
      bottomInset: 140
    };
  }
  function wallpaperPayload(enabled) {
    const stageSnap = buildWallpaperStageSnapshot();
    S.wallpaperStage = stageSnap;
    const effStyle = effectiveStyleName();
    return {
      stage: stageSnap,
      clock: { positionMs: S.position, playing: !!S.playing },
      enabled: !!enabled,
      title: S.current ? (S.current.name || '') : '',
      artist: S.current ? (S.current.artist || S.current.singer || '') : '',
      cover: S.current ? (S.current.cover || '') : '',
      playing: !!S.playing,
      mode: effStyle,
      preset: effStyle === 'off' ? -1 : (Number(String(effStyle).replace('mine-', '')) || 0),
      opacity: 1,
      frameRate: 60,
      colors: overlayColors()
    };
  }
  function syncWallpaperUi() {
    // Wallpaper has its own desktop host; the application remains usable.
    document.body.classList.remove('wallpaper-mode');
    const ui = $('#wallpaper-ui');
    ui.classList.add('hidden');
    if (S.currentView?.name === 'settings-general') {
      const wpSwitch = document.querySelector('[data-setting-id="wallpaper-mode"]');
      if (wpSwitch) {
        wpSwitch.classList.toggle('on', !!S.wallpaperMode);
        wpSwitch.setAttribute('aria-checked', String(!!S.wallpaperMode));
      }
    }
    if (!S.wallpaperMode) return;
    $('#wallpaper-title').textContent = S.current ? (S.current.name || '未命名') : '尚未播放';
    $('#wallpaper-artist').textContent = S.current ? (S.current.artist || S.current.singer || '') : '选择一首歌，让画面铺满桌面';
    const lyric = lyricSnapshot();
    $('#wallpaper-lyric').textContent = lyric.text;
  }
  async function applyWallpaperMode(enabled) {
    if (!window.desktopWindow || !window.desktopWindow.setWallpaperMode) { notify('当前环境不支持全屏壁纸模式'); return; }
    try {
      const result = await window.desktopWindow.setWallpaperMode(!!enabled, wallpaperPayload(!!enabled));
      const active = !!(result && (result.enabled === true || (result.status && (result.status.enabled === true || result.status.active === true))));
      S.wallpaperMode = !!enabled && active;
      if (enabled && !active) notify('无法进入壁纸模式：' + ((result && (result.error || result.status && result.status.lastError)) || '系统不支持'));
      saveStore(); syncWallpaperUi();
      if (S.currentView?.name === 'settings-general') renderGeneralSettings();
      if (S.wallpaperMode) notify('壁纸模式已开启（支持无动效与随声绘色），可在设置或托盘菜单关闭');
    } catch (error) {
      S.wallpaperMode = false; saveStore(); syncWallpaperUi();
      if (S.currentView?.name === 'settings-general') renderGeneralSettings();
      notify('壁纸模式失败：' + error.message);
    }
  }
  function initRetainedPcModes() {
    if (!window.desktopWindow) return;
    if (window.desktopWindow.onWallpaperModeState) {
      try {
        window.desktopWindow.onWallpaperModeState(state => {
          const active = !!(state && (state.enabled === true || state.active === true));
          const changed = S.wallpaperMode !== active;
          S.wallpaperMode = active;
          syncWallpaperUi();
          if (changed && (S.currentView?.name === 'settings' || S.currentView?.name === 'settings-general')) {
            if (S.currentView.name === 'settings-general') renderGeneralSettings();
            else renderSettings();
          }
        });
      } catch (_) {}
    }
    if (window.desktopWindow.getWallpaperModeStatus) {
      window.desktopWindow.getWallpaperModeStatus().then(result => {
        const active = !!(result && result.status && (result.status.enabled === true || result.status.active === true));
        S.wallpaperMode = active; syncWallpaperUi();
        if (S.currentView?.name === 'settings-general') renderGeneralSettings();
      }).catch(() => {});
    }
  }

  /* ---------------- lyrics ---------------- */
  function parseLrc(text) {
    if (!text) return [];
    const rows = [];
    const offset = Number(String(text).match(/\[offset:([+-]?\d+)\]/i)?.[1]) || 0;
    const raw = String(text).split(/\r?\n/);
    for (const line of raw) {
      const enhanced = line.match(/^\[(\d+),(\d+)\](.*)$/);
      if (enhanced) {
        const lineStart = Number(enhanced[1]) + offset;
        const payload = enhanced[3] || '';
        const words = [];
        const yrc = Array.from(payload.matchAll(/\((-?\d+),(-?\d+)(?:,-?\d+)?\)([^(\n]*)/g));
        const krc = Array.from(payload.matchAll(/<(-?\d+),(-?\d+)(?:,-?\d+)?>([^<\n]*)/g));
        if (yrc.length) {
          for (const m of yrc) {
            const wStart = Number(m[1]) + offset;
            const wDur = Math.max(20, Number(m[2]) || 0);
            const wText = m[3] || '';
            if (wText) words.push({ startMs: wStart, endMs: wStart + wDur, text: wText });
          }
        } else if (krc.length) {
          for (const m of krc) {
            const wStart = lineStart + Number(m[1]);
            const wDur = Math.max(20, Number(m[2]) || 0);
            const wText = m[3] || '';
            if (wText) words.push({ startMs: wStart, endMs: wStart + wDur, text: wText });
          }
        }
        const body = (words.length ? words.map(w => w.text).join('') : payload.replace(/[<(]-?\d+,-?\d+(?:,-?\d+)?[>)]/g, '')).trim();
        if (body) rows.push({ time: lineStart, text: body, words });
        continue;
      }
      const stamps = Array.from(line.matchAll(/\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g));
      if (!stamps.length) continue;
      const stripped = line.replace(/\[[^\]]*\]/g, '');
      const inlineMatches = Array.from(stripped.matchAll(/<(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)>([^<]*)/g));
      const body = stripped.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>|<-?\d+,-?\d+>/g, '').trim();
      if (!body) continue;
      for (const stamp of stamps) {
        const time = (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000 + offset;
        if (!Number.isFinite(time)) continue;
        const words = [];
        if (inlineMatches.length) {
          for (let wi = 0; wi < inlineMatches.length; wi += 1) {
            const m = inlineMatches[wi];
            const sec = Number(String(m[2]).replace(':', '.'));
            const wStart = (Number(m[1]) * 60 + sec) * 1000 + offset;
            const nextM = inlineMatches[wi + 1];
            const nextStart = nextM
              ? (Number(nextM[1]) * 60 + Number(String(nextM[2]).replace(':', '.'))) * 1000 + offset
              : (wStart + 360);
            const wText = m[3] || '';
            if (wText) words.push({ startMs: wStart, endMs: Math.max(wStart + 20, nextStart), text: wText });
          }
        }
        rows.push({ time, text: body, words });
      }
    }
    return rows.sort((a, b) => a.time - b.time);
  }
  function mergeLyricAux(main, auxiliary, key) {
    if (!auxiliary || !auxiliary.length) return main;
    const exact = new Map();
    auxiliary.forEach(line => exact.set(Math.round(line.time / 100), line.text));
    return main.map(line => {
      let text = exact.get(Math.round(line.time / 100));
      if (!text) {
        let best = null, distance = 650;
        for (const candidate of auxiliary) {
          const diff = Math.abs(candidate.time - line.time);
          if (diff <= distance) { distance = diff; best = candidate; }
        }
        if (best && distance <= 650) text = best.text;
      }
      text = String(text || '').trim();
      if (!text || text === line.text || /^[\/\\\-—–_~·•\s]+$/.test(text)) return line;
      return Object.assign({}, line, { [key]: text });
    });
  }

  async function loadLyrics(song, token, retryCount = 0) {
    clearTimeout(loadLyrics.retryTimer);
    const retryStep = typeof retryCount === 'number' ? retryCount : (retryCount ? 1 : 0);
    if (!retryStep) { S.lyrics = []; S.lyricIndex = -1; renderDetailLyrics(); }
    const songKey = identity(song);
    const activeToken = Number.isFinite(Number(token)) && Number(token) > 0 ? Number(token) : S.resolveToken;
    const isStillCurrent = () => Boolean(S.current && identity(S.current) === songKey && S.resolveToken === activeToken);
    const hasTimedLrc = value => /\[\d{1,3}:\d{2}|\[\d+,\d+\]/.test(String(value || ''));
    let lockedExactIdMatch = false;
    const normBody = s => String(s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const sameContentAsCurrent = candidateLines => {
      if (!S.lyrics.length || !candidateLines.length) return false;
      const refSet = new Set(S.lyrics.map(l => normBody(l.text)).filter(s => s.length >= 2));
      if (!refSet.size) return true;
      let hits = 0;
      const sample = Math.min(candidateLines.length, 14);
      for (let i = 0; i < sample; i += 1) {
        const b = normBody(candidateLines[Math.floor((i * candidateLines.length) / sample)].text);
        if (b && (refSet.has(b) || Array.from(refSet).some(r => r.includes(b) || b.includes(r)))) hits += 1;
      }
      return hits >= Math.max(2, Math.ceil(sample * 0.5));
    };
    const publish = payload => {
      if (!payload || !isStillCurrent()) return;
      const incomingCover = String(payload.coverUrl || payload.cover || '').trim();
      if (incomingCover && incomingCover !== rawCoverOf(song)) {
        propagateSongCover(song, incomingCover, { persistLists: true });
      }
      let mainText = payload.lyric || payload.lxlyric || payload.yrc || '';
      if (!hasTimedLrc(mainText) && payload.instrumental) {
        mainText = '[00:00.00]纯音乐，请欣赏';
      }
      const main = parseLrc(mainText);
      const translated = parseLrc(payload.tlyric || payload.ytlrc || '');
      const romanized = parseLrc(payload.rlyric || payload.romalrc || payload.yromalrc || payload.roma || '');
      if (!main.length && !translated.length && !romanized.length) return;
      const prevTrans = S.lyrics.filter(l => l.translation).map(l => ({ time: l.time, text: l.translation }));
      const prevRoma = S.lyrics.filter(l => l.romaji).map(l => ({ time: l.time, text: l.romaji }));
      const incomingExact = Boolean(payload.exactIdMatch && main.length);
      let lines = S.lyrics;
      if (incomingExact) {
        const prevHasWords = S.lyrics.some(l => Array.isArray(l.words) && l.words.length > 1);
        const mainHasWords = main.some(l => Array.isArray(l.words) && l.words.length > 1);
        lines = (prevHasWords && !mainHasWords && sameContentAsCurrent(main)) ? S.lyrics : main;
        lockedExactIdMatch = true;
      } else if (lockedExactIdMatch) {
        const prevHasWords = S.lyrics.some(l => Array.isArray(l.words) && l.words.length > 1);
        const mainHasWords = main.some(l => Array.isArray(l.words) && l.words.length > 1);
        if (mainHasWords && !prevHasWords && sameContentAsCurrent(main)) {
          lines = main;
        }
      } else if (main.length >= S.lyrics.length) {
        lines = main;
      }
      const effTrans = translated.length ? translated : prevTrans;
      const effRoma = romanized.length ? romanized : prevRoma;
      S.lyrics = mergeLyricAux(mergeLyricAux(lines, effTrans, 'translation'), effRoma, 'romaji');
      S.lyricIndex = -1;
      updateSmartStage(true);
      refreshAutoMixPlan();
      renderDetailLyrics(); syncLyric(true); pushStageMetadata(); pushDesktopLyrics(true);
    };
    const canQueryPublicAssets = Boolean(window.lxMusic && typeof window.lxMusic.songAssets === 'function' && song && song.name);
    const publicPending = canQueryPublicAssets && song.provider !== 'local'
      ? window.lxMusic.songAssets(song).then(publish).catch(() => {})
      : Promise.resolve();
    let payload = null;
    try {
      payload = song.provider === 'local' && song.localFileId
        ? await window.desktopWindow.readLocalMusicLyric(song.localFileId)
        : await window.lxMusic.lyric(song, S.quality);
    } catch (_) {}
    let text = payload && (payload.lyric || payload.lxlyric || payload.yrc || '');
    let translation = payload && (payload.tlyric || payload.ytlrc || '');
    let romaji = payload && (payload.rlyric || payload.romalrc || payload.yromalrc || payload.roma || '');
    let exactIdMatch = Boolean(payload && payload.exactIdMatch);
    if (!hasTimedLrc(text) && (songSource(song) === 'wy' || song.provider === 'netease')) {
      try {
        const data = await getJson('/api/lyric?id=' + encodeURIComponent(song.id));
        text = data && (data.lyric || data.lrc || text || '');
        translation = translation || (data && (data.tlyric || data.ytlrc || ''));
        romaji = romaji || (data && (data.romalrc || data.yromalrc || data.roma || ''));
        if (hasTimedLrc(text)) exactIdMatch = true;
      } catch (_) {}
    }
    publish({ ...(payload || {}), lyric: text, tlyric: translation, romalrc: romaji, exactIdMatch });
    await publicPending;
    if (!isStillCurrent()) return;
    if (canQueryPublicAssets && (!S.lyrics.length || !rawCoverOf(song))) {
      try {
        const fallbackAssets = await window.lxMusic.songAssets(song);
        if (isStillCurrent() && fallbackAssets) publish(fallbackAssets);
      } catch (_) {}
    }
    if (!isStillCurrent()) return;
    // 首轮若因短暂网络抖动未拿到歌词，最多自动静默重试 2 次（1.2s / 3.2s），彻底消除"首播无歌词、切歌再切回才有"
    if (retryStep < 2 && song.provider !== 'local' && !S.lyrics.length) {
      const delay = retryStep === 0 ? 1200 : 3200;
      loadLyrics.retryTimer = setTimeout(() => {
        if (isStillCurrent() && !S.lyrics.length) loadLyrics(S.current, activeToken, retryStep + 1);
      }, delay);
    }
  }
  function renderDetailLyrics() {
    const root = $('#detail-lyrics');
    root.replaceChildren();
    if (!S.lyrics.length) {
      const hint = h('div', 'lyric-line current', S.current ? '暂无歌词 · 正在聆听' : '选择一首歌');
      root.appendChild(hint); return;
    }
    S.lyrics.forEach((line, index) => {
      const node = h('div', 'lyric-line');
      node.dataset.index = String(index);
      node.appendChild(h('span', 'lyric-main', line.text));
      if (S.lyricShowTranslation && line.translation) node.appendChild(h('span', 'trans', line.translation));
      if (S.lyricShowRomaji && line.romaji) node.appendChild(h('span', 'romaji', line.romaji));
      node.onclick = () => seekTo(Math.max(0, line.time - (Number(S.lyricOffset) || 0)));
      root.appendChild(node);
    });
  }
  function syncLyric(force) {
    if (!S.lyrics.length) return;
    const target = (Number(S.position) || 0) + (Number(S.lyricOffset) || 0);
    const index = findLyricIndexAt(target);
    if (!force && index === S.lyricIndex) return;
    S.lyricIndex = index;
    const lines = $$('#detail-lyrics .lyric-line');
    lines.forEach((node, i) => {
      const distance = Math.abs(i - index);
      node.classList.toggle('current', i === index);
      node.classList.toggle('near', distance <= 2 && i !== index);
      node.style.opacity = i === index ? '1' : distance <= 2 ? '.92' : distance <= 5 ? '.5' : distance <= 8 ? '.16' : '0';
    });
    const current = lines[index];
    if (current && S.detailOpen) {
      const box = $('#detail-body');
      const offset = box.clientHeight / 2 - (current.offsetTop + current.clientHeight / 2);
      $('#detail-lyrics').style.transform = 'translateY(' + offset + 'px)';
    }
    pushDesktopLyrics(true);
    if (S.wallpaperMode) syncWallpaperUi();
  }

  /* ---------------- data loaders ---------------- */
  let syncLibraryRefresh = null;
  function refreshSyncedLibrary(syncPayload) {
    if (syncLibraryRefresh) return syncLibraryRefresh;
    syncLibraryRefresh = (async () => {
      S.libraryRevision = (S.libraryRevision || 0) + 1;
      const [library, sources] = await Promise.all([
        window.desktopWindow.listBuiltInPlaylists(), window.lxMusic.sources()
      ]);
      if (!library || library.ok === false || !Array.isArray(library.playlists)) throw new Error('同步后读取曲库失败');
      S.library = library.playlists;
      S.sources = sources.sources || [];
      S.activeSourceId = sources.activeId || '';
      await hydrateFavoritesFromLibrary(S.library, true);
      if (S.currentView?.name === 'playlist' && S.currentView.kind === 'builtin') {
        delete S.currentView.tracks;
      }
      renderCurrent();
      const visibleCount = S.library.filter(item => !item.isFavorite && item.name !== '我喜欢的' && item.name !== '我的收藏').length;
      notify((syncPayload?.autoSync ? '已自动同步歌单：' : '同步已保存：') + visibleCount + ' 个歌单，我的收藏 ' + S.favorites.length + ' 首');
    })().finally(() => { syncLibraryRefresh = null; });
    return syncLibraryRefresh;
  }
  // 每日三十首：日期种子确定性洗牌（与移动端同一规则）。
  function dailyShuffle(songs, dayNumber) {
    let state = (dayNumber ^ 0x9E3779B9) >>> 0;
    const next = () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pool = songs.slice(0, 60);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return pool.slice(0, 30);
  }
  function chartConcept(name) {
    if (!name) return null;
    if (name.includes('飙升') || name.includes('上升')) return '飙升榜';
    if (name.includes('新歌')) return '新歌榜';
    if (name.includes('热歌')) return '热歌榜';
    if (name.includes('原创')) return '原创榜';
    return null;
  }
  function mergeRoundRobin(lists, key) {
    const out = [], seen = new Set();
    for (let round = 0; true; round++) {
      let added = false;
      for (const list of lists) if (round < list.length) {
        if (round + 1 < list.length) added = true;
        const item = list[round], k = key(item);
        if (!seen.has(k)) { seen.add(k); out.push(item); }
      }
      if (!added) return out;
    }
  }
  const IGNORED_ARTISTS = new Set(['未知歌手', '本地文件', '未知', '未知艺人', '群星', '佚名', 'various artists', 'unknown', 'unknown artist']);
  function splitArtists(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/\s*(?:\/|、|&|,|，|;|；|\bfeat\.?\b|\bft\.?\b)\s*/i)
      .map(name => name.trim())
      .filter(name => name && name.length <= 42 && !IGNORED_ARTISTS.has(name.toLowerCase()));
  }
  function songHabitKey(song) {
    if (!song) return '';
    const title = String(song.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const artist = (splitArtists(song.artist || song.singer)[0] || String(song.artist || song.singer || '').trim()).toLowerCase();
    return title ? (title + '::' + artist) : identity(song);
  }
  function buildListeningProfile(extraTracks) {
    const artistScores = new Map();
    const sourceScores = new Map();
    const recentLast5Keys = new Set();
    const favoriteKeys = new Set();
    const addTrackWeight = (song, weight, bucket) => {
      if (!song) return;
      const src = songSource(song);
      if (SEARCH_SOURCES.includes(src)) {
        sourceScores.set(src, (sourceScores.get(src) || 0) + weight);
      }
      const names = splitArtists(song.artist || song.singer);
      names.forEach((name, idx) => {
        const key = name.toLowerCase();
        const factor = idx === 0 ? 1 : 0.65;
        let entry = artistScores.get(key);
        if (!entry) {
          entry = { artist: name, score: 0, favCount: 0, recentCount: 0, playlistCount: 0 };
          artistScores.set(key, entry);
        }
        entry.score += weight * factor;
        if (bucket === 'fav') entry.favCount += 1;
        else if (bucket === 'recent') entry.recentCount += 1;
        else if (bucket === 'playlist') entry.playlistCount += 1;
      });
    };
    const favorites = Array.isArray(S.favorites) ? S.favorites : [];
    const recent = Array.isArray(S.recentlyPlayed) ? S.recentlyPlayed : [];
    recent.slice(0, 5).forEach(song => {
      const id = identity(song), hk = songHabitKey(song);
      if (id) recentLast5Keys.add(id);
      if (hk) recentLast5Keys.add(hk);
    });
    favorites.forEach((song, idx) => {
      const id = identity(song), hk = songHabitKey(song);
      if (id) favoriteKeys.add(id);
      if (hk) favoriteKeys.add(hk);
      addTrackWeight(song, 3 + Math.max(0, (24 - idx) / 24) * 0.45, 'fav');
    });
    recent.forEach((song, idx) => {
      const recencyBoost = Math.pow(0.88, Math.min(idx, 30));
      addTrackWeight(song, 2 * (1 + 0.85 * recencyBoost), 'recent');
    });
    const playlistTracks = [];
    (Array.isArray(S.library) ? S.library : []).forEach(pl => {
      if (pl && !pl.isFavorite && pl.name !== '我喜欢的' && pl.name !== '我的收藏' && Array.isArray(pl.tracks)) {
        playlistTracks.push(...pl.tracks);
      }
    });
    if (Array.isArray(S.librarySampleTracks)) playlistTracks.push(...S.librarySampleTracks);
    if (Array.isArray(extraTracks)) playlistTracks.push(...extraTracks);
    playlistTracks.forEach(song => addTrackWeight(song, 1, 'playlist'));
    const ranked = Array.from(artistScores.values()).sort((a, b) => (
      b.score - a.score || b.favCount - a.favCount || b.recentCount - a.recentCount
    ));
    let preferredSource = 'wy';
    let bestSrcScore = -1;
    for (const [src, sc] of sourceScores) {
      if (sc > bestSrcScore) { bestSrcScore = sc; preferredSource = src; }
    }
    const artistMeta = new Map();
    ranked.forEach(entry => artistMeta.set(entry.artist.toLowerCase(), entry));
    return {
      topArtists: ranked.map(entry => entry.artist),
      artistMeta,
      preferredSource,
      recentLast5Keys,
      favoriteKeys,
      hasHistory: ranked.length > 0
    };
  }
  async function sampleBuiltInPlaylistTracks(playlists) {
    if (!window.desktopWindow || typeof window.desktopWindow.readBuiltInPlaylist !== 'function') return [];
    const candidates = (Array.isArray(playlists) ? playlists : [])
      .filter(pl => pl && !pl.isFavorite && pl.name !== '我喜欢的' && pl.name !== '我的收藏' && (pl.trackCount || 0) > 0)
      .slice(0, 4);
    if (!candidates.length) return [];
    const pages = await Promise.all(candidates.map(pl =>
      window.desktopWindow.readBuiltInPlaylist(pl.id, { offset: 0, limit: 60 })
        .then(res => (res && Array.isArray(res.tracks) ? res.tracks : []))
        .catch(() => [])
    ));
    return pages.flat();
  }
  async function enrichFeedWithHabits(feed, extraTracks, customSearchFn) {
    if (!feed || typeof feed !== 'object') return feed;
    if (!Array.isArray(feed.baseDailySongs)) feed.baseDailySongs = (feed.dailySongs || []).slice();
    const profile = buildListeningProfile(extraTracks);
    const runSearch = typeof customSearchFn === 'function' ? customSearchFn : (window.lxMusic && typeof window.lxMusic.search === 'function' ? payload => window.lxMusic.search(payload) : null);
    if (!profile.topArtists.length || !runSearch) {
      feed.personalized = false;
      feed.topArtists = [];
      feed.forYou = [];
      feed.dailySongs = feed.baseDailySongs.slice(0, 30);
      if (feed.daily) {
        feed.daily.count = feed.dailySongs.length;
        feed.daily.cover = (feed.dailySongs[0] || {}).cover || feed.daily.cover || '';
      }
      return feed;
    }
    const algoSeed = Math.max(0, Math.floor(Number(S.algoRefreshSeed) || 0));
    let top3 = profile.topArtists.slice(0, 3);
    if (algoSeed > 0 && profile.topArtists.length > 3) {
      const pool = profile.topArtists.slice(0, Math.min(8, profile.topArtists.length));
      const anchor = pool[algoSeed % Math.min(2, pool.length)];
      const rest = pool.filter(name => name !== anchor);
      const offset = algoSeed % rest.length;
      const rotated = rest.slice(offset).concat(rest.slice(0, offset));
      top3 = [anchor, ...rotated.slice(0, 2)];
    }
    const fallbackSrc = profile.preferredSource === 'wy' ? 'tx' : 'wy';
    const searchPage = algoSeed > 0 ? ((algoSeed % 2) + 1) : 1;
    const searchArtist = async artist => {
      const fetchOnce = async (source, pageNum) => {
        const res = await runSearch({ query: artist, source, page: pageNum, limit: 12, type: 'music' });
        const list = Array.isArray(res && res.items) ? res.items : (Array.isArray(res && res.list) ? res.list : []);
        return list.filter(song => song && (song.id || song.hash || song.mid) && song.name).map(song => Object.assign({}, song, {
          source: song.source || source,
          artist: song.artist || song.singer || artist
        }));
      };
      try {
        const primary = await fetchOnce(profile.preferredSource, searchPage);
        if (primary.length) return primary;
        if (searchPage > 1) {
          const fallbackPage1 = await fetchOnce(profile.preferredSource, 1);
          if (fallbackPage1.length) return fallbackPage1;
        }
      } catch (_) {}
      try {
        return await fetchOnce(fallbackSrc, 1);
      } catch (_) { return []; }
    };
    const perArtistRaw = await Promise.all(top3.map(artist => searchArtist(artist)));
    // 协同过滤发现：从收藏+最近播放轮换挑 3 首种子曲并发拉取网易云相似曲，打破"只推同一歌手"的机械感
    let collabSongs = [];
    if (window.lxMusic && typeof window.lxMusic.personalizedMix === 'function') {
      const seedPool = [...(S.favorites || []), ...(S.recentlyPlayed || [])].filter(s => s && s.name && s.source !== 'local' && s.provider !== 'local');
      if (seedPool.length) {
        const uniqueSeeds = [];
        const seenSeed = new Set();
        const startOff = algoSeed > 0 ? (algoSeed * 3) % seedPool.length : 0;
        for (let i = 0; i < seedPool.length && uniqueSeeds.length < 3; i++) {
          const cand = seedPool[(startOff + i) % seedPool.length];
          const k = identity(cand) || songHabitKey(cand);
          if (k && !seenSeed.has(k)) { seenSeed.add(k); uniqueSeeds.push(cand); }
        }
        try {
          const mix = await window.lxMusic.personalizedMix({
            seeds: uniqueSeeds,
            excludeKeys: [...(S.dislikedKeys || []), ...profile.recentLast5Keys]
          });
          collabSongs = (mix && Array.isArray(mix.items)) ? mix.items.map(s => Object.assign({}, s, { recommendReason: s.recommendationReason || '猜你喜欢' })) : [];
        } catch (_) {}
      }
    }
    const freshByArtist = [];
    if (collabSongs.length) freshByArtist.push(algoSeed > 0 ? seededShuffle(collabSongs, algoSeed * 193 + 11) : collabSongs);
    const reservePlayed = [];
    top3.forEach((artist, artistIdx) => {
      const meta = profile.artistMeta.get(artist.toLowerCase()) || { favCount: 0, recentCount: 0 };
      const fresh = [];
      let rawList = perArtistRaw[artistIdx] || [];
      if (algoSeed > 0 && rawList.length > 1) {
        rawList = seededShuffle(rawList, algoSeed * 131 + artistIdx * 97 + 7);
      }
      rawList.forEach((song, itemIdx) => {
        const reason = meta.favCount > 0 && (meta.recentCount === 0 || itemIdx % 3 === 1)
          ? '收藏偏好'
          : ('常听 · ' + artist);
        const tagged = Object.assign({}, song, { recommendReason: reason });
        const inLast5 = profile.recentLast5Keys.has(identity(tagged)) || profile.recentLast5Keys.has(songHabitKey(tagged));
        if (inLast5) reservePlayed.push(tagged);
        else fresh.push(tagged);
      });
      freshByArtist.push(fresh);
    });
    const dislikedSet = new Set(S.dislikedKeys || []);
    const artistCap = new Map();
    const dedup = (items, seenIds, seenHabits, maxPerArtist = 2) => {
      const out = [];
      for (const song of items) {
        if (!song) continue;
        const id = identity(song), hk = songHabitKey(song);
        if (id && dislikedSet.has(id)) continue;
        if ((id && seenIds.has(id)) || (hk && seenHabits.has(hk))) continue;
        const artKey = splitArtists(song.artist || song.singer)[0]?.toLowerCase() || '';
        if (maxPerArtist > 0 && artKey && (artistCap.get(artKey) || 0) >= maxPerArtist) continue;
        if (id) seenIds.add(id);
        if (hk) seenHabits.add(hk);
        if (artKey) artistCap.set(artKey, (artistCap.get(artKey) || 0) + 1);
        out.push(song);
      }
      return out;
    };
    const seenIds = new Set(), seenHabits = new Set();
    const interleaved = dedup(mergeRoundRobin(freshByArtist, song => identity(song) || songHabitKey(song)), seenIds, seenHabits);
    if (interleaved.length < 14) {
      const topSet = new Set(top3.map(a => a.toLowerCase()));
      const localMatches = [...(S.favorites || []), ...(feed.newSongs || [])].filter(song => {
        if (!song || song.source === 'local' || song.provider === 'local') return false;
        const matched = splitArtists(song.artist || song.singer).find(a => topSet.has(a.toLowerCase()));
        return !!matched && !profile.recentLast5Keys.has(identity(song)) && !profile.recentLast5Keys.has(songHabitKey(song));
      }).map(song => {
        const matched = splitArtists(song.artist || song.singer).find(a => topSet.has(a.toLowerCase())) || top3[0];
        const isFav = profile.favoriteKeys.has(identity(song)) || profile.favoriteKeys.has(songHabitKey(song));
        return Object.assign({}, song, { recommendReason: isFav ? '收藏偏好' : ('常听 · ' + matched) });
      });
      interleaved.push(...dedup(localMatches, seenIds, seenHabits));
    }
    if (interleaved.length < 12 && reservePlayed.length) {
      interleaved.push(...dedup(reservePlayed, seenIds, seenHabits));
    }
    if (!interleaved.length) {
      feed.personalized = false;
      feed.topArtists = [];
      feed.forYou = [];
      return feed;
    }
    const orderedInterleaved = algoSeed > 0 ? seededShuffle(interleaved, algoSeed * 257 + 19) : interleaved;
    feed.forYou = orderedInterleaved.slice(0, 16);
    const forYouSeenIds = new Set(feed.forYou.map(identity).filter(Boolean));
    const forYouSeenHabits = new Set(feed.forYou.map(songHabitKey).filter(Boolean));
    // 每日三十首：严格避开「猜你喜欢」已展示曲目，优先从新歌尾段取平台探索曲目，避免与「新歌速递」前排重复。
    const remainingPersonal = orderedInterleaved.slice(16).filter(s => {
      const id = identity(s), hk = songHabitKey(s);
      return !(id && forYouSeenIds.has(id)) && !(hk && forYouSeenHabits.has(hk));
    });
    const personalPicks = remainingPersonal.slice(0, 18);
    const dailySeenIds = new Set([...forYouSeenIds, ...personalPicks.map(identity).filter(Boolean)]);
    const dailySeenHabits = new Set([...forYouSeenHabits, ...personalPicks.map(songHabitKey).filter(Boolean)]);
    const tailNew = (feed.newSongs || []).length > 22 ? [...feed.newSongs.slice(20), ...feed.newSongs.slice(0, 20)] : (feed.newSongs || []);
    let platformFresh = [];
    const platformReserve = [];
    for (const song of [...tailNew, ...(feed.baseDailySongs || [])]) {
      const id = identity(song), hk = songHabitKey(song);
      if ((id && dailySeenIds.has(id)) || (hk && dailySeenHabits.has(hk))) continue;
      if (id) dailySeenIds.add(id);
      if (hk) dailySeenHabits.add(hk);
      if (profile.recentLast5Keys.has(id) || profile.recentLast5Keys.has(hk)) platformReserve.push(song);
      else platformFresh.push(song);
    }
    if (algoSeed > 0 && platformFresh.length > 1) {
      platformFresh = seededShuffle(platformFresh, algoSeed * 389 + 41);
    }
    const platformPicks = [...platformFresh, ...platformReserve].slice(0, Math.max(0, 30 - personalPicks.length));
    const blendedDaily = [];
    let pi = 0, fi = 0;
    while ((pi < personalPicks.length || fi < platformPicks.length) && blendedDaily.length < 30) {
      for (let k = 0; k < 2 && pi < personalPicks.length && blendedDaily.length < 30; k++) blendedDaily.push(personalPicks[pi++]);
      for (let k = 0; k < 3 && fi < platformPicks.length && blendedDaily.length < 30; k++) blendedDaily.push(platformPicks[fi++]);
    }
    feed.dailySongs = blendedDaily;
    // 新歌速递前置未在猜你喜欢/每日三十首中出现的新歌，保证三板块几乎零重复。
    const usedInRec = new Set([...forYouSeenHabits, ...blendedDaily.map(songHabitKey).filter(Boolean)]);
    if (Array.isArray(feed.newSongs) && feed.newSongs.length) {
      const visibleNew = feed.newSongs.filter(s => !dislikedSet.has(identity(s)));
      feed.newSongs = [
        ...visibleNew.filter(s => !usedInRec.has(songHabitKey(s))),
        ...visibleNew.filter(s => usedInRec.has(songHabitKey(s)))
      ];
    }
    feed.personalized = true;
    feed.topArtists = [...top3, ...profile.topArtists.filter(a => !top3.includes(a))].slice(0, 6);
    if (feed.daily) {
      feed.daily.count = blendedDaily.length;
      const firstCovered = blendedDaily.find(s => rawCoverOf(s));
      feed.daily.cover = rawCoverOf(firstCovered) || feed.daily.cover || '';
    }
    return feed;
  }
  async function loadMergedFeed(options) {
    const opts = options || {};
    const platforms = ['wy', 'tx', 'kw', 'kg'];
    const parts = await Promise.all(platforms.map(p => window.lxMusic.homeLite(p).catch(() => null)));
    const ok = parts.filter(Boolean);
    if (!ok.length) throw new Error('所有平台的首页都暂不可用');
    const playlistKey = item => (item.source || '') + ':' + item.id;
    const songKeyFn = song => song.source + ':' + song.id;
    const recommend = mergeRoundRobin(ok.map(part => part.recommend || []), playlistKey);
    const hot = mergeRoundRobin(ok.map(part => part.hot || []), playlistKey);
    // 榜单大融合：同概念合并成一个多来源榜单（无角标），其余榜单保留各自角标。
    const charts = [], concepts = new Map();
    for (const part of ok) for (const chart of part.charts || []) {
      const concept = chartConcept(chart.name);
      if (!concept) { charts.push(chart); continue; }
      const mergedItem = concepts.get(concept);
      if (mergedItem) {
        if (!mergedItem.cover && chart.cover) mergedItem.cover = chart.cover;
        mergedItem.count = (mergedItem.count || 0) + (chart.count || 0);
        mergedItem.playCount = (mergedItem.playCount || 0) + (chart.playCount || 0);
        mergedItem.parts.push(chart);
      } else {
        const entry = { id: 'merged-' + concept, name: concept, cover: chart.cover, count: chart.count || 0, playCount: chart.playCount || 0, kind: chart.kind, period: chart.period, parts: [chart] };
        concepts.set(concept, entry); charts.push(entry);
      }
    }
    // 跨平台新歌按规范化歌名+主歌手去重，避免四平台同一热歌重复。
    const rawNewSongs = mergeRoundRobin(ok.map(part => part.newSongs || []), songKeyFn);
    const seenNewHabit = new Set();
    const newSongs = [];
    for (const s of rawNewSongs) {
      const hk = songHabitKey(s) || identity(s);
      if (hk && seenNewHabit.has(hk)) continue;
      if (hk) seenNewHabit.add(hk);
      newSongs.push(s);
    }
    // 补齐所有榜单封面：优先融合子榜封面，其次取歌单/新歌不重复真实封面。
    const fallbackChartCovers = [
      ...recommend.map(p => p && p.cover).filter(Boolean),
      ...hot.map(p => p && p.cover).filter(Boolean),
      ...newSongs.map(s => rawCoverOf(s)).filter(Boolean)
    ];
    const usedChartCovers = new Set(charts.map(c => c && c.cover).filter(Boolean));
    let chartFallbackIdx = 0;
    for (const chart of charts) {
      if (!chart.cover && Array.isArray(chart.parts)) {
        const pc = chart.parts.find(p => p && p.cover);
        if (pc) chart.cover = pc.cover;
      }
      if (!chart.cover && fallbackChartCovers.length) {
        let picked = fallbackChartCovers.find(u => !usedChartCovers.has(u));
        if (!picked) picked = fallbackChartCovers[(chartFallbackIdx++) % fallbackChartCovers.length];
        chart.cover = picked;
        usedChartCovers.add(picked);
      }
    }
    const dayNumber = Math.floor(Date.now() / 86400000) + (Number(S.algoRefreshSeed) || 0) * 7919;
    const bannerCharts = charts.length > 5 ? seededShuffle(charts, dayNumber + 1301).slice(0, 5) : charts.slice(0, 5);
    const coveredPool = [...recommend, ...hot, ...charts].filter(pl => pl && pl.cover);
    const usedCatCovers = new Set();
    const categoryItems = [], categorySeen = new Set();
    let catCoverCursor = 0;
    for (const part of ok) for (const tag of part.categories || []) {
      const name = typeof tag.name === 'string' ? tag.name : '';
      if (!name || categorySeen.has(name)) continue;
      categorySeen.add(name);
      let catCover = String(tag.cover || tag.pic || '').trim();
      if (!catCover && coveredPool.length) {
        const matched = coveredPool.find(pl => !usedCatCovers.has(pl.cover) && String(pl.name || '').includes(name));
        if (matched) {
          catCover = matched.cover;
          usedCatCovers.add(catCover);
        } else {
          const candidate = coveredPool.find(pl => !usedCatCovers.has(pl.cover)) || coveredPool[catCoverCursor % coveredPool.length];
          catCoverCursor += 1;
          if (candidate && candidate.cover) {
            catCover = candidate.cover;
            usedCatCovers.add(catCover);
          }
        }
      }
      categoryItems.push({ id: 'category-' + name, name, cover: catCover, count: 0, playCount: 0, request: { source: part.source || 'wy', type: 'hot', category: name } });
    }
    const tailFirstNew = newSongs.length > 22 ? [...newSongs.slice(20), ...newSongs.slice(0, 20)] : newSongs;
    const dailySongs = dailyShuffle(tailFirstNew, dayNumber);
    const firstDailyCover = rawCoverOf(dailySongs.find(s => rawCoverOf(s))) || (coveredPool[0] && coveredPool[0].cover) || '';
    const daily = { id: 'daily-30', name: '每日三十首', cover: firstDailyCover, count: dailySongs.length, playCount: 0 };
    const sections = [
      { id: 'playlists', title: '推荐歌单', kind: 'playlist', items: recommend },
      { id: 'charts', title: '排行榜', kind: 'playlist', items: charts },
      { id: 'hot', title: '热门歌单', kind: 'playlist', items: hot },
      { id: 'category', title: '歌单分类', kind: 'playlist', items: categoryItems },
    ];
    const feed = { source: 'all', sections, playlists: recommend, newSongs, charts, bannerCharts, daily, dailySongs, baseDailySongs: dailySongs.slice(), forYou: [], personalized: false, topArtists: [] };
    if (opts.preservedAlgo) {
      feed.forYou = opts.preservedAlgo.forYou;
      feed.dailySongs = opts.preservedAlgo.dailySongs;
      feed.personalized = opts.preservedAlgo.personalized;
      feed.topArtists = opts.preservedAlgo.topArtists;
      if (feed.daily) {
        feed.daily.count = feed.dailySongs.length;
        feed.daily.cover = opts.preservedAlgo.dailyCover || rawCoverOf(feed.dailySongs.find(s => rawCoverOf(s))) || feed.daily.cover;
      }
    } else {
      await enrichFeedWithHabits(feed);
    }
    return feed;
  }
  async function loadHome(force, options) {
    const opts = options || {};
    if (S.feedLoading) return;
    if (S.feed && !force) return;
    S.feedLoading = true;
    S.feedLoadingPlatform='all';
    const token = ++S.feedToken;
    const libraryRevision = S.libraryRevision || 0;
    try {
      const libraryPromise = window.desktopWindow && window.desktopWindow.listBuiltInPlaylists
        ? window.desktopWindow.listBuiltInPlaylists().catch(() => ({ playlists: [] })) : Promise.resolve({ playlists: [] });
      const localPromise = window.desktopWindow && window.desktopWindow.listLocalMusicLibrary
        ? window.desktopWindow.listLocalMusicLibrary().catch(() => ({ tracks: [] })) : Promise.resolve({ tracks: [] });
      const downloadsPromise = window.lxMusic && window.lxMusic.downloads
        ? window.lxMusic.downloads().catch(() => []) : Promise.resolve([]);
      const sourcesPromise = window.lxMusic && window.lxMusic.sources
        ? window.lxMusic.sources().catch(() => ({ sources: [], activeId: '' })) : Promise.resolve({ sources: [], activeId: '' });
      const [feed, library, local, downloads, sources] = await Promise.all([
        loadMergedFeed(opts), libraryPromise, localPromise, downloadsPromise, sourcesPromise
      ]);
      S.feedCache['all']=feed;
      if (token !== S.feedToken) return;
      S.feed = feed || { playlists: [], newSongs: [], charts: [] };
      if (libraryRevision === (S.libraryRevision || 0)) {
        const prevTopKey = (S.feed.topArtists || []).slice(0, 3).join('|');
        S.library = (library && library.playlists) || [];
        await hydrateFavoritesFromLibrary(S.library, false);
        S.librarySampleTracks = await sampleBuiltInPlaylistTracks(S.library);
        const nextProfile = buildListeningProfile(S.librarySampleTracks);
        if (!opts.preservedAlgo && token === S.feedToken && nextProfile.topArtists.slice(0, 3).join('|') !== prevTopKey) {
          await enrichFeedWithHabits(S.feed, S.librarySampleTracks);
        }
      }
      S.localTracks = (local && local.tracks) || [];
      S.downloads = Array.isArray(downloads) ? downloads : [];
      if (libraryRevision === (S.libraryRevision || 0)) {
        S.sources = (sources && sources.sources) || [];
        S.activeSourceId = (sources && sources.activeId) || '';
      }
      if (S.feed) {
        void hydrateCovers([
          ...(S.feed.forYou || []),
          ...(S.feed.dailySongs || []),
          ...(S.feed.newSongs || []).slice(0, 36)
        ], () => {
          if (S.feed && S.feed.daily && !S.feed.daily.cover) {
            const firstWithCover = (S.feed.dailySongs || []).find(s => rawCoverOf(s));
            if (firstWithCover) {
              S.feed.daily.cover = rawCoverOf(firstWithCover);
              const dailyBanner = $('.banner-card[data-banner-id="daily-30"]');
              if (dailyBanner) dailyBanner.style.backgroundImage = 'url("' + coverUrl(S.feed.daily.cover).replace(/"/g, '%22') + '")';
            }
          }
        });
      }
      if (S.tab === 'home'&&S.currentView?.name==='home') renderHome(true);
      if (S.tab !== 'home') renderCurrent();
    } catch (error) {
      console.warn('[Home]', error);
      if(token!==S.feedToken)return;
      if (!S.feed) {
        S.feed = { playlists: [], newSongs: [], charts: [], error:error.message };
        if (S.tab === 'home') renderHome(true);
      }
    } finally { if(token===S.feedToken)S.feedLoading = false; }
  }
  function refreshDownloads() {
    if (!window.lxMusic || !window.lxMusic.downloads) return;
    window.lxMusic.downloads().then(jobs => {
      S.downloads = Array.isArray(jobs) ? jobs : [];
      if (S.currentView.name === 'downloads') renderDownloads();
    }).catch(() => {});
  }
  function refreshSources(silent) {
    if (!window.lxMusic || !window.lxMusic.sources) return Promise.resolve();
    S.sourcesLoading = true;
    return window.lxMusic.sources().then(snapshot => {
      S.sources = (snapshot && snapshot.sources) || [];
      S.activeSourceId = (snapshot && snapshot.activeId) || '';
      S.sourcesLoading = false;
      if (S.currentView.name === 'sources') renderSources();
      if (S.currentView.name === 'settings') renderSettings();
    }).catch(error => { S.sourcesLoading = false; if (!silent) notify(error.message); });
  }
  async function loadSyncDevices() {
    if (!window.lxMusic || !window.lxMusic.syncDevices) return [];
    try { S.devices = await window.lxMusic.syncDevices() || []; } catch (_) { S.devices = []; }
    return S.devices;
  }

  /* ---------------- view routing ---------------- */
  function scrollKey(view) {
    if (!view) return 'home';
    return view.name + ':' + (view.section || view.id || '');
  }
  function saveScroll() {
    if (S.currentView && S.currentView.main) S.scrollMemory[scrollKey(S.currentView)] = $('#app').scrollTop;
  }
  function restoreScroll(key) {
    const value = Number(S.scrollMemory[key] || 0);
    const apply = () => { try { $('#app').scrollTop = value; } catch (_) {} };
    requestAnimationFrame(() => requestAnimationFrame(apply));
    setTimeout(apply, 90); setTimeout(apply, 260);
  }
  function transitionView(renderFn, back, axis = 'y') {
    const view = $('#view');
    const token = ++S.viewTransitionToken;
    if (!view || !view.childElementCount) { renderFn(); return; }
    const isX = axis === 'x';
    view.style.transition = 'opacity .12s cubic-bezier(.3,0,.8,.15), transform .12s cubic-bezier(.3,0,.8,.15)';
    view.style.opacity = '0';
    view.style.transform = isX
      ? (back ? 'translateX(22px)' : 'translateX(-14px)')
      : (back ? 'translateY(8px)' : 'translateY(-8px)');
    setTimeout(() => {
      if (token !== S.viewTransitionToken) return;
      S.suppressViewInAnim = true;
      try { renderFn(); } finally { S.suppressViewInAnim = false; }
      view.style.transition = 'none';
      view.style.opacity = '0';
      view.style.transform = isX
        ? (back ? 'translateX(-18px)' : 'translateX(28px)')
        : (back ? 'translateY(-10px)' : 'translateY(14px)');
      requestAnimationFrame(() => {
        if (token !== S.viewTransitionToken) return;
        view.style.transition = 'opacity .26s cubic-bezier(.2,.85,.2,1), transform .32s cubic-bezier(.2,.88,.2,1)';
        view.style.opacity = '1';
        view.style.transform = 'none';
      });
    }, 115);
  }
  function setTab(tab, options) {
    const opts = options || {};
    saveScroll();
    S.tab = tab;
    S.phoneExpanded = false;
    // 换页后滚动基准归零，避免把上一页的偏移当成滑动方向。
    S.lastScroll = null; S.scrollTravel = 0;
    S.stack = [];
    S.currentView = { name: tab, main: true };
    $('#search-overlay').classList.add('hidden');
    $('#detail-overlay').classList.add('hidden');
    $('#comments-overlay').classList.add('hidden');
    S.searchOpen = false; S.detailOpen = false; S.commentsOpen = false; S.searchReturnToPlayer = false;
    setBodyMode(tab === 'home' || tab === 'library' || tab === 'settings' ? 'tab' : 'secondary');
    transitionView(() => {
      if (tab === 'home') renderHome();
      else if (tab === 'library') renderLibrary();
      else renderSettings();
    }, false, 'y');
    restoreScroll(scrollKey(S.currentView));
    updateHomeCompact();
    updateDock();
  }
  function pushView(view) {
    saveScroll();
    S.stack.push(S.currentView);
    S.currentView = view;
    transitionView(() => renderCurrent(), false, 'x');
    try { $('#app').scrollTop = 0; } catch (_) {}
  }
  function isSearchVisible() {
    const overlay = $('#search-overlay');
    return Boolean(S.searchOpen && overlay && !overlay.classList.contains('hidden'));
  }
  function goBack() {
    // Dismiss the visible surface first; Escape must not navigate the page
    // underneath a queue sheet or an anchored material menu.
    const menuBackdrop = $$('.menu-backdrop').at(-1);
    if (menuBackdrop) { menuBackdrop.click(); return; }
    const modalBackdrop = $$('.modal-backdrop').at(-1);
    if (modalBackdrop) {
      if (!modalBackdrop.dataset.busy) closeModal(modalBackdrop);
      return;
    }
    if ($('#detail-overlay').classList.contains('closing')) return;
    if (S.commentsOpen) { closeComments(); return; }
    if (S.detailOpen) { closeDetail(); return; }
    if (isSearchVisible()) { closeSearch(); return; }
    saveScroll();
    const leaving = S.currentView;
    const previous = S.stack.pop();
    if (leaving && leaving.returnToSearch && S.searchOpen) {
      S.currentView = previous || { name: S.tab, main: true };
      $('#search-overlay').classList.remove('hidden');
      setBodyMode('search');
      updateHomeCompact();
      if (leaving.returnToPlayer && S.current) openDetail();
      return;
    }
    if (previous) {
      S.currentView = previous;
      transitionView(() => renderCurrent(), true, 'x');
      restoreScroll(scrollKey(previous));
    } else {
      setTab(S.tab);
    }
    if (leaving && leaving.returnToPlayer && S.current) {
      openDetail();
    }
  }
  function deferPageRefresh() {
    if (!S.detailOpen && !isSearchVisible() && !S.commentsOpen) { S.pageRefreshPending = false; return false; }
    S.pageRefreshPending = true;
    return true;
  }
  function flushPageRefresh() {
    if (!S.pageRefreshPending || S.detailOpen || isSearchVisible() || S.commentsOpen) return;
    const root = $('#app'), scroll = root.scrollTop;
    S.pageRefreshPending = false;
    renderCurrent();
    root.scrollTop = scroll;
    updateHomeCompact();
  }
  function renderCurrent() {
    const view = S.currentView;
    if (!view) return setTab('home');
    if (view.name === 'home') renderHome();
    else if (view.name === 'library') renderLibrary();
    else if (view.name === 'settings') renderSettings();
    else if (view.name === 'settings-playback') renderPlaybackSettings();
    else if (view.name === 'settings-appearance') renderAppearanceSettings();
    else if (view.name === 'settings-general') renderGeneralSettings();
    else if (view.name === 'settings-shortcuts') renderShortcutSettings();
    else if (view.name === 'lyrics-settings') renderLyricsSettings();
    else if (view.name === 'more') renderMore(view);
    else if (view.name === 'playlist') renderPlaylist(view);
    else if (view.name === 'sources') renderSources();
    else if (view.name === 'downloads') renderDownloads();
    else if (view.name === 'local') renderLocal();
  }
  function mainRoot(className, skipAnim) {
    const root = $('#view');
    root.replaceChildren();
    // skipAnim：数据刷新或已由 transitionView 承载过渡时，不叠放第二层 .view-in 动画。
    const wrapper = h('div', ((skipAnim || S.suppressViewInAnim) ? '' : 'view-in ') + (className || ''));
    root.appendChild(wrapper);
    return wrapper;
  }

  /* ---------------- cards / sections ---------------- */
  function formatPlayCount(count) {
    if (count >= 100000000) return (count / 100000000).toFixed(1) + '亿';
    if (count >= 10000) return Math.round(count / 10000) + '万';
    return count > 0 ? String(count) : '';
  }
  // 平台角标：融合数据里 short（wy/tx/kw/kg）与 long（netease/qq/kuwo/kugou）两种
  // source 命名并存（新歌速递是 long），统一映射到 public/lxmine/logo-*.png。
  const BADGE_SOURCE_FILES = { wy: 'wy', netease: 'wy', tx: 'tx', qq: 'tx', tencent: 'tx', kw: 'kw', kuwo: 'kw', kg: 'kg', kugou: 'kg' };
  function srcBadge(source) {
    const file = BADGE_SOURCE_FILES[String(source || '').toLowerCase()];
    if (!file) return null;
    const img = document.createElement('img');
    img.className = 'src-badge';
    img.src = 'lxmine/logo-' + file + '.png';
    img.alt = '';
    return img;
  }
  const GRADS = [['#1E3A8A','#38BDF8'],['#0F5257','#2DD4BF'],['#312E81','#8B5CF6'],['#164E63','#64D2FF'],['#1E293B','#60A5FA'],['#3B0764','#A78BFA']];
  function gradFor(name) {
    const str = String(name || 'LxMine');
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return GRADS[hash % GRADS.length];
  }
  function applyArtSurface(el, rawCover, seedText, fallbackIcon, trackKey) {
    if (!el) return;
    if (trackKey) el.dataset.coverTrackKey = trackKey;
    const grad = gradFor(seedText || 'LxMine');
    const cleanCover = String(rawCover || '').trim();
    const oldGlyph = el.querySelector('.art-fallback-glyph, .for-you-fallback-icon');
    if (cleanCover) {
      if (oldGlyph) oldGlyph.remove();
      el.style.backgroundImage = 'url("' + coverUrl(cleanCover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    } else {
      el.style.backgroundImage = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
      if (fallbackIcon !== null && !oldGlyph) {
        const cls = el.classList.contains('for-you-art') ? 'for-you-fallback-icon' : 'art-fallback-glyph';
        el.prepend(svgIcon(fallbackIcon || 'music', cls));
      }
    }
  }
  const coverAttemptedKeys = new Set();
  const coverInFlightKeys = new Set();
  let persistCoverTimer = 0;
  function propagateSongCover(song, nextCover, opts) {
    const clean = String(nextCover || '').trim();
    if (!song || !clean) return false;
    const key = identity(song);
    const hk = songHabitKey(song);
    song.cover = clean;
    song.coverUrl = clean;
    let touchedFav = false;
    let touchedRecent = false;
    let touchedQueue = false;
    const syncPool = (pool, tag) => {
      if (!Array.isArray(pool)) return;
      for (const item of pool) {
        if (!item) continue;
        if ((key && identity(item) === key) || (hk && songHabitKey(item) === hk && !rawCoverOf(item))) {
          if (rawCoverOf(item) !== clean) {
            item.cover = clean;
            item.coverUrl = clean;
            if (tag === 'fav') touchedFav = true;
            if (tag === 'recent') touchedRecent = true;
            if (tag === 'queue') touchedQueue = true;
          }
        }
      }
    };
    syncPool(S.queue, 'queue');
    syncPool(S.favorites, 'fav');
    syncPool(S.recentlyPlayed, 'recent');
    syncPool(S.search && S.search.results, 'search');
    syncPool(S.currentView && S.currentView.tracks, 'view');
    if (S.feed) {
      syncPool(S.feed.forYou, 'feed');
      syncPool(S.feed.dailySongs, 'feed');
      syncPool(S.feed.newSongs, 'feed');
    }
    if (S.current && ((key && identity(S.current) === key) || (hk && songHabitKey(S.current) === hk && !rawCoverOf(S.current)))) {
      S.current.cover = clean;
      S.current.coverUrl = clean;
      setStageSong(S.current);
      updateDock();
    }
    if (key) {
      document.querySelectorAll('[data-cover-track-key]').forEach(node => {
        if (node.dataset.coverTrackKey === key) {
          applyArtSurface(node, clean, song.name || song.artist || '', null, key);
        }
      });
    }
    if ((opts && opts.persistLists) || touchedFav || touchedRecent || touchedQueue) {
      clearTimeout(persistCoverTimer);
      persistCoverTimer = setTimeout(() => {
        if (touchedFav || touchedRecent) saveStore();
        if (touchedFav) void persistFavoritesToLibrary(true);
        if (touchedQueue) savePlayback();
      }, 600);
    }
    return true;
  }
  async function hydrateCovers(songs, onBatchUpdated) {
    if (!window.lxMusic || typeof window.lxMusic.songCovers !== 'function') return 0;
    const pending = [];
    const seen = new Set();
    for (const song of Array.isArray(songs) ? songs : []) {
      if (!song || song.source === 'local' || song.provider === 'local') continue;
      if (rawCoverOf(song)) continue;
      const key = identity(song);
      if (!key || seen.has(key) || coverAttemptedKeys.has(key) || coverInFlightKeys.has(key)) continue;
      seen.add(key);
      coverInFlightKeys.add(key);
      pending.push(song);
    }
    if (!pending.length) return 0;
    let totalUpdated = 0;
    try {
      for (let offset = 0; offset < pending.length; offset += 24) {
        const chunk = pending.slice(offset, offset + 24);
        let urls = [];
        try {
          urls = await window.lxMusic.songCovers(chunk);
        } catch (_) { urls = []; }
        while (isUiTransitionOrPopupBusy() || S.detailOpen) {
          await new Promise(r => setTimeout(r, 320));
        }
        let chunkUpdated = 0;
        for (let idx = 0; idx < chunk.length; idx += 1) {
          if (idx > 0 && idx % 4 === 0) {
            await new Promise(r => setTimeout(r, 16));
            while (isUiTransitionOrPopupBusy() || S.detailOpen) {
              await new Promise(r => setTimeout(r, 320));
            }
          }
          const song = chunk[idx];
          const key = identity(song);
          coverInFlightKeys.delete(key);
          coverAttemptedKeys.add(key);
          const found = Array.isArray(urls) ? String(urls[idx] || '').trim() : '';
          if (found && propagateSongCover(song, found)) {
            chunkUpdated += 1;
            totalUpdated += 1;
          }
        }
        if (chunkUpdated > 0 && typeof onBatchUpdated === 'function') {
          try { onBatchUpdated(chunkUpdated); } catch (_) {}
        }
      }
    } finally {
      pending.forEach(song => coverInFlightKeys.delete(identity(song)));
    }
    return totalUpdated;
  }
  function playlistCard(item) {
    const node = h('div', 'card');
    const art = h('div', 'art');
    const cover = rawCoverOf(item);
    if (cover) {
      applyArtSurface(art, cover, item.name || '', null);
    } else {
      const grad = gradFor(item.name || '');
      art.style.backgroundImage = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
      art.style.color = '#F2F1F7';
      art.style.fontSize = '28px';
      art.style.fontWeight = '700';
      art.textContent = (item.name || '歌').slice(0, 2);
    }
    const badge = srcBadge(item.source);
    if (badge) art.appendChild(badge);
    node.append(art);
    node.appendChild(h('h3', '', item.name || '未命名歌单'));
    node.appendChild(h('p', '', (item.trackCount||item.count)>0?(item.trackCount||item.count)+' 首':item.kind==='chart'?'排行榜':'歌单'));
    node.onclick = () => openFeedPlaylist(item);
    return node;
  }
  function songCard(song, queue) {
    const node = h('div', 'card song-card');
    const songKey = identity(song);
    if (songKey) node.dataset.songKey = songKey;
    if (S.current && identity(S.current) === songKey) node.classList.add('playing');
    const art = h('div', 'art');
    applyArtSurface(art, rawCoverOf(song), song.name || song.artist || '', 'music', songKey);
    const badge = srcBadge(song.source);
    if (badge) art.appendChild(badge);
    node.append(art);
    node.appendChild(h('h3', '', song.name || '未知歌曲'));
    node.appendChild(h('p', '', (song.artist || song.singer || platformName(song))));
    node.onclick = () => playSong(song, Array.isArray(queue) && queue.length ? queue : [song], { preserveQueue: true });
    node.oncontextmenu = event => { event.preventDefault(); openSongContextMenu(event, song, { onPlay: () => playSong(song, Array.isArray(queue) && queue.length ? queue : [song], { preserveQueue: true }) }); };
    return node;
  }
  function forYouCard(song, queue) {
    const node = h('div', 'for-you-card');
    const songKey = identity(song);
    if (songKey) node.dataset.songKey = songKey;
    if (S.current && identity(S.current) === songKey) node.classList.add('playing');
    const art = h('div', 'for-you-art');
    applyArtSurface(art, rawCoverOf(song), song.name || song.artist || '', 'music', songKey);
    const badge = srcBadge(song.source);
    if (badge) art.appendChild(badge);
    const playCue = h('span', 'for-you-play-cue');
    playCue.appendChild(svgIcon('play'));
    art.appendChild(playCue);
    const copy = h('div', 'for-you-copy');
    if (song.recommendReason) {
      const isFavReason = String(song.recommendReason).includes('收藏') || String(song.recommendReason).includes('红心');
      const pill = h('span', 'for-you-reason' + (isFavReason ? ' is-fav' : ''), song.recommendReason);
      copy.appendChild(pill);
    }
    copy.appendChild(h('strong', 'for-you-title', song.name || '未知歌曲'));
    copy.appendChild(h('span', 'for-you-sub', (song.artist || song.singer || platformName(song)) + (song.album ? ' · ' + song.album : '')));
    node.append(art, copy);
    node.onclick = () => playSong(song, Array.isArray(queue) && queue.length ? queue : [song], { preserveQueue: true });
    node.oncontextmenu = event => { event.preventDefault(); openSongContextMenu(event, song, { onPlay: () => playSong(song, Array.isArray(queue) && queue.length ? queue : [song], { preserveQueue: true }) }); };
    return node;
  }
  function localPlaylistCard(playlist) {
    const node = h('div', 'card');
    const art = h('div', 'art');
    const cover = rawCoverOf(playlist);
    if (cover) applyArtSurface(art, cover, playlist.name || '', null);
    else {
      const grad = gradFor(playlist.name || '');
      art.style.backgroundImage = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
      const heart = svgIcon('music', 'heart'); heart.style.width = '46px'; heart.style.height = '46px';
      heart.style.color = 'rgba(255,255,255,.88)'; art.appendChild(heart);
    }
    node.append(art);
    node.appendChild(h('h3', '', (!playlist.name || playlist.name === '我喜欢的') ? '我的收藏' : playlist.name));
    node.appendChild(h('p', '', (playlist.trackCount || 0) + ' 首歌曲'));
    node.onclick = () => openBuiltIn(playlist);
    return node;
  }
  // 横向行的左右圆形玻璃按钮（PC 独有；滚轮不再横向滚动）。
  function addRowNav(block, row) {
    const left = h('button', 'row-btn glass light left');
    left.type = 'button';
    left.setAttribute('aria-label', '向左滑动');
    left.appendChild(svgIcon('left'));
    left.onclick = () => row.scrollBy({ left: -Math.max(360, row.clientWidth * 0.6), behavior: 'smooth' });
    const right = h('button', 'row-btn glass light right');
    right.type = 'button';
    right.setAttribute('aria-label', '向右滑动');
    right.appendChild(svgIcon('right'));
    right.onclick = () => row.scrollBy({ left: Math.max(360, row.clientWidth * 0.6), behavior: 'smooth' });
    block.appendChild(left);
    block.appendChild(right);
  }
  function sectionBlock(title, note, section, items, kind) {
    const block = h('section', 'section');
    block.dataset.section = section;
    const head = h('div', 'section-head');
    head.appendChild(h('h2', '', title));
    if (note) head.appendChild(h('span', 'note', note));
    head.appendChild(h('div', 'spacer'));
    const more = h('button', 'more-ball glass light');
    more.type = 'button'; more.setAttribute('aria-label', title + '，更多');
    more.appendChild(svgIcon('more'));
    more.onclick = () => openMore(section, title);
    head.appendChild(more);
    block.appendChild(head);
    const wrap = h('div', 'row-wrap');
    const row = h('div', 'row-scroll');
    (items || []).forEach(item => row.appendChild(kind === 'song' ? songCard(item) : playlistCard(item)));
    if (!items || !items.length) row.appendChild(h('div', 'empty-hint', '这里还没有内容'));
    wrap.appendChild(row);
    addRowNav(wrap, row);
    block.appendChild(wrap);
    return block;
  }

  function renderHome(skipAnim) {
    if (deferPageRefresh()) return;
    S.tab = 'home';
    setBodyMode('tab');
    setHeader('LxMine', '', { actions: [] });
    const root = mainRoot('', skipAnim);
    if (!S.feed) {
      root.appendChild(h('div', 'empty-hint', '正在载入首页内容…'));
      loadHome(true);
      return;
    }
    // 快捷胶囊：与移动端同一套（滚动到对应板块），替代旧的四大平台按钮。
    const chipsRow = h('div', 'home-chips');
    [['新歌','newSongs','chipMusic'],['歌单','playlists','chipLibrary'],['排行榜','charts','chipQueue'],['热门','hot','chipPlay'],['分类','category','chipMore']].forEach(([label,anchor,icon])=>{
      const chip=h('button','home-chip glass light'+(S.homeChipAnchor===anchor?' active':''));
      chip.appendChild(svgIcon(icon));
      chip.appendChild(h('span','home-chip-label',label));
      chip.type='button';chip.dataset.anchor=anchor;
      chip.onclick=()=>{
        S.homeChipAnchor=anchor;
        S.homeChipHoldUntil=Date.now()+800;
        chipsRow.querySelectorAll('.home-chip').forEach(node=>node.classList.toggle('active',node.dataset.anchor===anchor));
        const target=document.querySelector('.section[data-section="'+anchor+'"]');
        if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
      };
      chipsRow.appendChild(chip);
    });
    root.appendChild(chipsRow);
    root.appendChild(h('div','home-chips-space'));
    // 头图：竖排长卡片（每日三十首 + 随机推荐融合榜单），卡片贴屏幕物理边缘。
    const bannerItems=[];
    if(S.feed.daily)bannerItems.push(S.feed.daily);
    (S.feed.bannerCharts&&S.feed.bannerCharts.length?S.feed.bannerCharts:(S.feed.charts||[]).slice(0,5)).forEach(chart=>bannerItems.push(chart));
    const bannerBlock=h('section','section banner-section');
    bannerBlock.dataset.section='banner';
    const bannerWrap=h('div','row-wrap');
    const bannerRow=h('div','row-scroll banner-row');
    bannerItems.forEach(item=>{
      const card=h('button','banner-card');
      card.dataset.bannerId = String(item.id || '');
      const grad=gradFor(item.name||'');
      if(item.cover)card.style.backgroundImage='url("'+coverUrl(item.cover).replace(/"/g,'%22')+'"), linear-gradient(135deg,'+grad[0]+','+grad[1]+')';
      else card.style.backgroundImage='linear-gradient(135deg,'+grad[0]+','+grad[1]+')';
      const isDaily = item.id === 'daily-30';
      const isPersonalizedDaily = isDaily && S.feed.personalized && Array.isArray(S.feed.topArtists) && S.feed.topArtists.length > 0;
      const note = isDaily
        ? (new Date().getMonth() + 1) + '月' + new Date().getDate() + '日 · ' + (
            isPersonalizedDaily
              ? '为你定制 · ' + S.feed.topArtists.slice(0, 2).join(' / ') + ' 等 ' + (item.count || 30) + ' 首'
              : '融合推荐 ' + (item.count || 30) + ' 首'
          )
        : ((item.playCount ? formatPlayCount(item.playCount) + '次播放 · ' : '') + (item.count || 0) + ' 首');
      if (isPersonalizedDaily) {
        card.appendChild(h('span', 'banner-tag', '专属定制'));
      }
      const copy=h('div','banner-copy');
      copy.appendChild(h('h3','',item.name));
      copy.appendChild(h('p','',note));
      card.appendChild(copy);
      const play=h('span','banner-play');
      play.dataset.feed=String(item.id);
      play.appendChild(svgIcon('play'));
      play.onclick=event=>{event.stopPropagation();playBanner(item);};
      card.appendChild(play);
      const badge=srcBadge(item.source);
      if(badge)card.appendChild(badge);
      card.onclick=()=>openFeedPlaylist(item);
      bannerRow.appendChild(card);
    });
    if(bannerItems.length){
      bannerWrap.appendChild(bannerRow);
      addRowNav(bannerWrap, bannerRow);
      bannerBlock.appendChild(bannerWrap);
    }
    root.appendChild(bannerBlock);
    if(S.feed?.error){const error=h('div','empty-hint',S.feed.error);const retry=h('button','pill-btn','重新载入');retry.onclick=()=>{S.feed=null;loadHome(true);renderHome();};error.appendChild(retry);root.appendChild(error);}
    // 猜你喜欢：对齐鸿蒙与其他横向板块，统一采用单排正方形大封面卡片横向滑动。
    if (Array.isArray(S.feed.forYou) && S.feed.forYou.length) {
      const forYouBlock = h('section', 'section');
      forYouBlock.dataset.section = 'forYou';
      const forYouHead = h('div', 'section-head');
      forYouHead.appendChild(h('h2', '', '猜你喜欢'));
      forYouHead.appendChild(h('span', 'note', '基于你的常听与收藏歌手'));
      forYouHead.appendChild(h('div', 'spacer'));
      const moreForYou = h('button', 'more-ball glass light');
      moreForYou.type = 'button';
      moreForYou.setAttribute('aria-label', '猜你喜欢，更多');
      moreForYou.appendChild(svgIcon('more'));
      moreForYou.onclick = () => openMore('forYou', '猜你喜欢');
      forYouHead.appendChild(moreForYou);
      forYouBlock.appendChild(forYouHead);
      const forYouWrap = h('div', 'row-wrap');
      const forYouRow = h('div', 'row-scroll');
      S.feed.forYou.forEach(song => forYouRow.appendChild(songCard(song, S.feed.forYou)));
      forYouWrap.appendChild(forYouRow);
      addRowNav(forYouWrap, forYouRow);
      forYouBlock.appendChild(forYouWrap);
      root.appendChild(forYouBlock);
    }
    // 新歌速递：与其他列表页同一种标准歌曲行（song-row），点行播放、整列作为播放队列。
    if ((S.feed.newSongs||[]).length) {
      const tools = S.homeNewTools || (S.homeNewTools = { query: '', mode: 'added', manual: null, searchOpen: false });
      let refreshNewSongs = () => {};
      const block=h('section','section');
      block.dataset.section='newSongs';
      const head=h('div','section-head');
      head.appendChild(h('h2','','新歌速递'));
      head.appendChild(h('span','note','全平台一起看'));
      head.appendChild(h('div','spacer'));
      const more=h('button','more-ball glass light');
      more.type='button';
      more.setAttribute('aria-label','新歌速递，更多');
      more.appendChild(svgIcon('more'));
      more.onclick=()=>openMore('newSongs','新歌速递');
      head.appendChild(more);
      block.appendChild(head);
      const bar = createListBar(S.feed.newSongs, tools, () => refreshNewSongs());
      const play = h('button', 'list-tools-play', '播放全部');
      play.onclick = () => { const list = arrangeSongs(S.feed.newSongs, tools); if (list.length) playSong(list[0], list); };
      const sort = h('button', 'list-tools-sort', '排列');
      sort.onclick = () => openListSortMenu(sort, S.feed.newSongs, tools, () => refreshNewSongs());
      const batchCol = h('button', 'list-tools-sort', '批量收藏');
      batchCol.onclick = () => openBatchCollectModal(arrangeSongs(S.feed.newSongs, tools), '新歌速递');
      bar.node.prepend(play, sort, batchCol);
      const host = h('div', 'list-tools-host');
      block.append(bar.node, host);
      refreshNewSongs = () => {
        const list = arrangeSongs(S.feed.newSongs, tools);
        bar.setCount(list.length);
        host.replaceChildren();
        if (list.length) host.appendChild(songListCard(list.slice(0, 10), list, { preserveQueue: true }));
        else host.appendChild(h('div', 'empty-hint', '没有匹配的歌曲'));
      };
      refreshNewSongs();
      root.appendChild(block);
    }
    const sections=S.feed.sections||[];
    for(const section of sections){const block=sectionBlock(section.title,section.error||'',section.id,section.items,section.kind);if(section.error){const retry=h('button','pill-btn','重试');retry.onclick=()=>loadHome(true);block.appendChild(retry);}root.appendChild(block);}
    syncRowBleed();
    updateHomeCompact();
  }

  function openMore(section, title) {
    const view={name:'more',section,title:title||sectionTitle(section),main:true};
    if (section === 'forYou') {
      view.items = (S.feed && S.feed.forYou) || [];
      view.itemKind = 'song';
    } else {
      const spec=S.feed?.sections?.find(s=>s.id===section);view.items=spec?.items;view.itemKind=spec?.kind;
      if(spec?.request)window.LxPagination.collectAll((page,limit)=>window.lxMusic.homeSection({...spec.request,page,limit}),{limit:spec.request.source==='kg'?20:36,cancelled:()=>S.currentView!==view}).then(result=>{if(S.currentView===view){view.items=result.items;view.warning=result.warning;renderMore(view);}}).catch(error=>{if(S.currentView===view){view.warning=error.message;renderMore(view);}});
    }
    pushView(view);
  }
  function sectionTitle(section) {
    return ({ playlists: '推荐歌单', newSongs: '每周新歌', charts: '排行榜', recent: '最近常听', forYou: '猜你喜欢' })[section] || section;
  }
  function moreItems(view) {
    if(view.items)return view.items;
    if (view.section === 'forYou') return (S.feed && S.feed.forYou) || [];
    if (view.section === 'recent') {
      const list = [];
      if (S.current) list.push(S.current);
      (S.library || []).forEach(item => list.push({ __playlist: true, ...item }));
      return list;
    }
    return (S.feed && S.feed[view.section]) || [];
  }
  function renderMore(view) {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    const tools = view.tools || (view.tools = { query: '', mode: 'added', manual: null, searchOpen: false });
    let toggleListSearch = null;
    let refreshList = () => {};
    setHeader(view.title || sectionTitle(view.section), '', { back: goBack, actions: [
      { icon: 'search', label: '搜索本列表', onClick: () => { if (toggleListSearch) toggleListSearch(); } }
    ] });
    const root = mainRoot();
    requestAnimationFrame(() => syncRowBleed());
    const items = moreItems(view);
    const loadingRow = () => {
      const row = h('div', 'loading-row');
      row.append(h('span', 'loading-spin'), h('span', '', '正在载入板块内容…'));
      return row;
    };
    // 歌曲类列表页（新歌速递/热门/相似等）一律用标准 song-row 列表，与歌单详情一致。
    if (view.itemKind==='song' || view.section==='newSongs' || view.section==='forYou') {
      if(view.warning)root.appendChild(h('div','empty-hint',view.warning));
      const bar = createListBar(items, tools, () => refreshList());
      toggleListSearch = () => { bar.setSearchOpen(!tools.searchOpen); refreshList(); };
      const play = h('button', 'list-tools-play', '播放全部');
      play.onclick = () => { const list = arrangeSongs(items, tools); if (list.length) playSong(list[0], list); };
      const sort = h('button', 'list-tools-sort', '排列');
      sort.onclick = () => openListSortMenu(sort, items, tools, () => refreshList());
      const batchCol = h('button', 'list-tools-sort', '批量收藏');
      batchCol.onclick = () => openBatchCollectModal(arrangeSongs(items, tools), view.title || sectionTitle(view.section));
      bar.node.prepend(play, sort, batchCol);
      const host = h('div', 'list-tools-host');
      root.append(bar.node, host);
      refreshList = () => {
        const list = arrangeSongs(items, tools);
        bar.setCount(list.length);
        host.replaceChildren();
        if (list.length) host.appendChild(songListCard(list, items, { preserveQueue: true }));
        else if (view.loading) host.appendChild(loadingRow());
        else host.appendChild(h('div', 'empty-hint', items.length ? '没有匹配的歌曲' : '暂时没有内容'));
      };
      refreshList();
      return;
    }
    if (view.section === 'recent') {
      const grid = h('div', 'grid-cards');
      items.forEach(item => {
        if (item.__playlist) {
          const copy = Object.assign({}, item); delete copy.__playlist;
          grid.appendChild(localPlaylistCard(copy));
        } else {
          const card = songCard(item);
          grid.appendChild(card);
        }
      });
      if (!items.length) grid.appendChild(h('div', 'empty-hint', '还没有最近常听'));
      root.appendChild(grid);
      return;
    }
    const grid = h('div', 'grid-cards');
    requestAnimationFrame(()=>appendRowsInFrames(grid,items,item=>playlistCard(item)));
    if(view.warning)root.appendChild(h('div','empty-hint',view.warning));
    if (!items.length) root.appendChild(view.loading ? loadingRow() : h('div', 'empty-hint', '这里还没有内容'));
    root.appendChild(grid);
  }

  // 横幅播放键：只播放/暂停该板块队列（留在首页），不进入列表页；图标随播放状态变化。
  const bannerQueues = {};
  function bannerPlaying(item) {
    return !!S.playing && S.playingFeedId === String(item.id);
  }
  async function playBanner(item) {
    const key = String(item.id);
    if (bannerQueues[key] === S.queue && S.queue.length) { togglePlayback(); return; }
    let tracks = [];
    if (item.id === 'daily-30' && S.feed && S.feed.dailySongs && S.feed.dailySongs.length) {
      tracks = S.feed.dailySongs;
    } else {
      tracks = await loadPlaylistTracks({ kind: 'feed', feedItem: item, id: String(item.id), title: item.name });
    }
    if (!tracks.length) { notify('歌单暂时没有可播放歌曲'); return; }
    bannerQueues[key] = tracks;
    S.playingFeedId = key;
    await playSong(tracks[0], tracks);
    refreshBannerPlay();
  }
  function refreshBannerPlay() {
    document.querySelectorAll('.banner-play').forEach(el => {
      const active = bannerPlaying({ id: el.dataset.feed });
      el.innerHTML = '';
      el.appendChild(svgIcon(active ? 'pause' : 'play'));
    });
  }
  function isChartFeedItem(item) {
    if (!item) return false;
    if (item.kind === 'chart' || item.isChart) return true;
    if (Array.isArray(item.parts) && item.parts.length > 0) return true;
    const id = String(item.id || '');
    if (id === 'daily-30') return true;
    if (S.feed && Array.isArray(S.feed.charts) && S.feed.charts.some(c => String(c.id) === id)) return true;
    if (S.feed && Array.isArray(S.feed.bannerCharts) && S.feed.bannerCharts.some(c => String(c.id) === id)) return true;
    if (/榜/.test(String(item.name || ''))) return true;
    return false;
  }
  async function openFeedPlaylist(item, autoplay, extraOpts) {
    if (item.request && !item.source) {
      // 分类入口：进入该分类的歌单列表页（按平台拉取），拉取期间显示加载圈。
      const view={name:'more',section:'category-'+item.id,title:item.name,main:true};
      view.items=[];view.itemKind='playlist';view.loading=true;
      pushView(view);
      window.LxPagination.collectAll((page,limit)=>window.lxMusic.homeSection({...item.request,page,limit}),{limit:item.request.source==='kg'?20:36,cancelled:()=>S.currentView!==view}).then(result=>{if(S.currentView===view){view.items=result.items;view.warning=result.warning;view.loading=false;renderMore(view);}}).catch(error=>{if(S.currentView===view){view.warning=error.message;view.loading=false;renderMore(view);}});
      return;
    }
    pushView({ name: 'playlist', kind: 'feed', feedItem:item, id: String(item.id), title: item.name, cover: item.cover, count: item.count||item.trackCount || 0, main: !(extraOpts && extraOpts.returnToSearch), autoplay: !!autoplay, returnToPlayer: !!(extraOpts && extraOpts.returnToPlayer), returnToSearch: !!(extraOpts && extraOpts.returnToSearch), preserveQueue: isChartFeedItem(item) });
  }
  function openBuiltIn(playlist) {
    pushView({ name: 'playlist', kind: 'builtin', id: playlist.id, title: playlist.name, cover: playlist.cover, count: playlist.trackCount || 0, main: true });
  }
  function openLocal() {
    pushView({ name: 'local', title: '本地音乐', main: true });
  }

  function songRow(song, context, index, options) {
    // 唯一歌曲行：宽窗（>=760px）行内直接显示下载/切换平台/爱心/加号；窄窗收成下载+展开箭头，
    // 展开后再显示操作与时长。搜索、歌单、榜单、板块详情共用这一份 DOM。
    const opts = options || {};
    const songKey = identity(song);
    const isOnline = song && song.source !== 'local' && song.provider !== 'local';
    const item = h('div', 'song-item');
    const row = h('div', 'song-row');
    if (songKey) row.dataset.songKey = songKey;
    const art = h('div', 'row-art');
    applyArtSurface(art, rawCoverOf(song), song.name || song.artist || '', 'music', songKey);
    const badge = srcBadge(song.source);
    if (badge) art.appendChild(badge);
    const main = h('div', 'row-main');
    main.appendChild(h('strong', '', (index != null ? String(index + 1).padStart(2, '0') + '  ' : '') + (song.name || '未知歌曲')));
    main.appendChild(h('small', '', (song.artist || song.singer || '未知歌手') + (song.album ? ' · ' + song.album : '')));
    const album = h('div', 'album', song.album || '');
    const dl = h('button', 'row-act row-download');
    dl.type = 'button'; dl.setAttribute('aria-label', '下载歌曲');
    dl.appendChild(svgIcon('download'));
    dl.onclick = event => { event.stopPropagation(); downloadCurrent(song); };
    const like = h('button', 'row-act row-like');
    like.type = 'button';
    if (songKey) like.dataset.likeKey = songKey;
    renderLikeButton(like, isFavorite(song), false);
    const playNextBtn = h('button', 'row-act row-play-next');
    playNextBtn.type = 'button';
    playNextBtn.setAttribute('aria-label', '下一首播放');
    playNextBtn.title = '下一首播放';
    playNextBtn.appendChild(svgIcon('playNext'));
    playNextBtn.onclick = event => { event.stopPropagation(); playNextSong(song); };
    const add = h('button', 'row-act row-add');
    add.type = 'button'; add.setAttribute('aria-label', '添加到歌单');
    add.appendChild(svgIcon('plus'));
    add.onclick = event => { event.stopPropagation(); openAddMenu(song, opts); };
    const actions = h('div', 'row-actions');
    if (!isOnline) actions.append(like, playNextBtn, add);
    else actions.append(dl, like, playNextBtn, add);
    if (isOnline && typeof opts.onSwitchPlatform === 'function') {
      const switchBtn = h('button', 'row-act row-switch');
      switchBtn.type = 'button';
      switchBtn.setAttribute('aria-label', '切换歌曲平台');
      switchBtn.title = '切换歌曲平台';
      switchBtn.appendChild(svgIcon('switchPlatform'));
      switchBtn.onclick = event => { event.stopPropagation(); opts.onSwitchPlatform(song, index); };
      actions.insertBefore(switchBtn, like);
    }
    if (typeof opts.onRemove === 'function') {
      const removeBtn = h('button', 'row-act row-remove');
      removeBtn.type = 'button'; removeBtn.setAttribute('aria-label', opts.removeLabel || '从歌单移除');
      removeBtn.title = opts.removeLabel || '从歌单移除';
      removeBtn.appendChild(svgIcon('trash'));
      removeBtn.onclick = event => { event.stopPropagation(); opts.onRemove(song, index); };
      actions.appendChild(removeBtn);
    }
    // 展开面板按需创建：宽窗永远不展开，窄窗主行直接露出收藏与下一首播放，展开显示其余操作与时长。
    const panel = h('div', 'song-expand');
    let panelBuilt = false;
    const toggleLike = event => {
      event.stopPropagation();
      toggleFavorite(song);
      const nowLiked = isFavorite(song);
      renderLikeButton(like, nowLiked, true);
      if (typeof opts.onLikeChanged === 'function') opts.onLikeChanged(song, nowLiked);
    };
    like.onclick = toggleLike;
    const buildPanel = () => {
      if (panelBuilt) return;
      panelBuilt = true;
      if (isOnline && typeof opts.onSwitchPlatform === 'function') {
        const panelSwitch = h('button', 'row-act row-switch');
        panelSwitch.type = 'button';
        panelSwitch.setAttribute('aria-label', '切换歌曲平台');
        panelSwitch.title = '切换歌曲平台';
        panelSwitch.appendChild(svgIcon('switchPlatform'));
        panelSwitch.onclick = event => { event.stopPropagation(); opts.onSwitchPlatform(song, index); };
        panel.appendChild(panelSwitch);
      }
      const panelAdd = h('button', 'row-act row-add');
      panelAdd.type = 'button'; panelAdd.setAttribute('aria-label', '添加到歌单');
      panelAdd.appendChild(svgIcon('plus'));
      panelAdd.onclick = event => { event.stopPropagation(); openAddMenu(song, opts); };
      panel.append(panelAdd);
      if (typeof opts.onRemove === 'function') {
        const panelRemove = h('button', 'row-act row-remove');
        panelRemove.type = 'button'; panelRemove.setAttribute('aria-label', opts.removeLabel || '从歌单移除');
        panelRemove.appendChild(svgIcon('trash'));
        panelRemove.onclick = event => { event.stopPropagation(); opts.onRemove(song, index); };
        panel.appendChild(panelRemove);
      }
      const time = h('span', 'song-duration', fmtTime(song.durationMs || 0));
      panel.appendChild(time);
    };
    const expand = h('button', 'row-act row-expand');
    expand.type = 'button'; expand.setAttribute('aria-label', '展开歌曲操作');
    expand.appendChild(svgIcon('down'));
    expand.onclick = event => { event.stopPropagation(); buildPanel(); item.classList.toggle('open'); };
    row.append(art, main, album, actions, expand);
    row.onclick = () => { playSong(song, context || [song], { fromSearch: !!opts.fromSearch, preserveQueue: !!opts.preserveQueue }); if (opts.openDetail) openDetail(); };
    row.oncontextmenu = event => { event.preventDefault(); openSongContextMenu(event, song, opts); };
    if (S.current && identity(S.current) === songKey) row.classList.add('playing');
    item.append(row, panel);
    return item;
  }
  function songListCard(songs, context, rowOptions) {
    const card = h('div', 'song-list');
    requestAnimationFrame(() => appendRowsInFrames(card, songs, (song, index) => songRow(song, context, index, rowOptions)));
    return card;
  }

  /* ---------------- library ---------------- */
  const MOSAIC_VARIANTS = [
    [[2, 2], [1, 1], [1, 2], [2, 1], [1, 1], [2, 1], [1, 2], [1, 1], [2, 2], [1, 2], [2, 1], [1, 1]],
    [[2, 1], [2, 2], [2, 1], [1, 2], [1, 1], [2, 1], [1, 1], [2, 2], [1, 1], [1, 2], [2, 1], [1, 1]],
    [[1, 2], [2, 1], [1, 1], [2, 2], [2, 1], [1, 1], [2, 2], [1, 1], [2, 1], [1, 2], [1, 1], [2, 1]],
    [[2, 2], [2, 1], [2, 1], [1, 1], [1, 2], [2, 2], [1, 1], [2, 1], [1, 2], [1, 1], [2, 1], [1, 1]],
    [[1, 1], [2, 2], [1, 2], [2, 1], [2, 1], [1, 1], [2, 1], [1, 2], [2, 2], [1, 1], [1, 1], [2, 1]]
  ];
  const MOSAIC_4_VARIANTS = [
    [[2, 2], [2, 1], [1, 1], [1, 1]],
    [[2, 1], [2, 2], [1, 1], [1, 1]],
    [[1, 2], [2, 2], [1, 1], [1, 1]],
    [[2, 1], [2, 1], [2, 2], [2, 1]]
  ];
  const MOSAIC_5_VARIANTS = [
    [[2, 2], [2, 2], [2, 1], [1, 1], [1, 1]],
    [[2, 1], [2, 2], [1, 2], [1, 1], [2, 1]],
    [[2, 2], [1, 2], [2, 1], [1, 1], [2, 1]],
    [[1, 2], [2, 2], [2, 1], [1, 1], [2, 1]]
  ];
  const MOSAIC_GRADS = [
    ['#1E3A8A', '#38BDF8'], ['#0F5257', '#2DD4BF'], ['#312E81', '#8B5CF6'],
    ['#164E63', '#64D2FF'], ['#1E293B', '#60A5FA'], ['#3B0764', '#A78BFA']
  ];
  function mosaicGrad(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return MOSAIC_GRADS[hash % MOSAIC_GRADS.length];
  }
  function mosaicSpan(index, total) {
    const seed = (Number(S.mosaicSeed) >>> 0) || 1;
    if (total === 4) {
      const seq = MOSAIC_4_VARIANTS[seed % MOSAIC_4_VARIANTS.length];
      return seq[index % seq.length];
    }
    if (total === 5) {
      const seq = MOSAIC_5_VARIANTS[seed % MOSAIC_5_VARIANTS.length];
      return seq[index % seq.length];
    }
    const base = MOSAIC_VARIANTS[seed % MOSAIC_VARIANTS.length];
    const rotatedOffset = (seed >>> 4) % base.length;
    return base[(index + rotatedOffset) % base.length];
  }
  // 用持久化的 mosaicSeed 洗牌一次：首次随机，之后每次启动复用同一顺序；
  // span 序列保持不变，所以常见数量下仍然填满，只是哪张卡进大/小格由种子决定。
  function seededShuffle(items, seed) {
    const out = items.slice();
    let state = (Number(seed) >>> 0) || 0x9E3779B9;
    const rand = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    };
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }
  // 时刻/相册式拼贴：固定 14px 间距和窗口边距，卡片尺寸/比例由 span 随机决定。
  function libraryCard(opts, index, total) {
    const node = h('div', 'mosaic-tile');
    if (opts.tileKind) node.dataset.tileKind = opts.tileKind;
    if (opts.playlistId) node.dataset.playlistId = opts.playlistId;
    const span = mosaicSpan(index, total);
    node.style.gridColumn = 'span ' + span[0];
    node.style.gridRow = 'span ' + span[1];
    const art = h('div', 'art');
    const grad = mosaicGrad(opts.name || '');
    if (opts.cover) {
      art.style.backgroundImage = 'url("' + coverUrl(opts.cover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
    } else {
      art.style.backgroundImage = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
      art.appendChild(iconGlyph(opts.icon || 'music'));
    }
    const shade = h('div', 'shade');
    const count = h('div', 'count', opts.countText);
    const copy = h('div', 'copy');
    copy.append(h('h3', '', opts.name), h('p', '', opts.detail));
    node.append(art, shade, count, copy);
    node.onclick = opts.onClick;
    return node;
  }
  const repairedPlaylistIds = new Set();
  async function repairLibraryMosaicCovers(libraryItems, grid) {
    const updateTileArt = (selector, nextCover, seedName) => {
      if (!grid || !grid.isConnected || !nextCover) return;
      const tileArt = grid.querySelector(selector + ' .art');
      if (!tileArt) return;
      const grad = mosaicGrad(seedName || '');
      tileArt.replaceChildren();
      tileArt.style.backgroundImage = 'url("' + coverUrl(nextCover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
    };
    if (S.favorites.length && !S.favorites.some(s => rawCoverOf(s))) {
      await hydrateCovers(S.favorites.slice(0, 6), () => {
        const covered = S.favorites.find(s => rawCoverOf(s));
        if (covered) updateTileArt('.mosaic-tile[data-tile-kind="favorites"]', rawCoverOf(covered), '我的收藏');
      });
    }
    if (S.recentlyPlayed.length && !S.recentlyPlayed.some(s => rawCoverOf(s))) {
      await hydrateCovers(S.recentlyPlayed.slice(0, 6), () => {
        const covered = S.recentlyPlayed.find(s => rawCoverOf(s));
        if (covered) updateTileArt('.mosaic-tile[data-tile-kind="recent"]', rawCoverOf(covered), '最近播放');
      });
    }
    if (!window.desktopWindow || typeof window.desktopWindow.readBuiltInPlaylist !== 'function') return;
    for (const pl of Array.isArray(libraryItems) ? libraryItems : []) {
      if (!pl || pl.cover || !(pl.trackCount > 0) || repairedPlaylistIds.has(pl.id)) continue;
      repairedPlaylistIds.add(pl.id);
      try {
        const page = await window.desktopWindow.readBuiltInPlaylist(pl.id, { offset: 0, limit: 24 });
        const tracks = (page && Array.isArray(page.tracks)) ? page.tracks : [];
        if (!tracks.length) continue;
        let found = rawCoverOf(tracks.find(t => rawCoverOf(t)));
        if (!found && window.lxMusic && typeof window.lxMusic.songCovers === 'function') {
          const urls = await window.lxMusic.songCovers(tracks.slice(0, 6));
          const hitIdx = Array.isArray(urls) ? urls.findIndex(u => String(u || '').trim()) : -1;
          if (hitIdx >= 0) {
            found = String(urls[hitIdx]).trim();
            const updatedTrack = Object.assign({}, tracks[hitIdx], { cover: found, coverUrl: found });
            if (typeof window.lxMusic.replacePlaylistTrack === 'function') {
              await window.lxMusic.replacePlaylistTrack({ playlistId: pl.id, index: hitIdx, track: updatedTrack }).catch(() => {});
            }
          }
        }
        if (found) {
          pl.cover = found;
          updateTileArt('.mosaic-tile[data-playlist-id="' + pl.id + '"]', found, pl.name);
        }
      } catch (_) {}
    }
  }
  function layoutMosaic(grid) {
    const width = grid.clientWidth;
    if (!width) return;
    const cols = width >= 1500 ? 6 : width >= 1100 ? 5 : width >= 760 ? 4 : width >= 560 ? 3 : 2;
    const gap = 14;
    const cell = (width - (cols - 1) * gap) / cols;
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0,1fr))';
    grid.style.gridAutoRows = Math.max(120, Math.round(cell * 0.72)) + 'px';
  }
  function refreshMosaic() {
    S.mosaicSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
    saveStore();
    renderLibrary();
    notify('曲库排列已刷新');
  }
  function renderLibrary() {
    if (deferPageRefresh()) return;
    S.tab = 'library';
    setBodyMode('tab');
    // 内置收藏夹（isFavorite=true）已由顶部收藏卡代表，这里仅过滤内置收藏，保留所有导入/自建的同名歌单（方案 B）。
    const libraryItems = (S.library || []).filter(playlist => playlist.isFavorite !== true);
    setHeader('曲库', (libraryItems.length + ' 个歌单'), {
      actions: [
        { icon: 'refresh', label: '随机排列', onClick: refreshMosaic },
        { icon: 'download', label: '下载管理', onClick: () => pushView({ name: 'downloads', title: '下载', main: true }) },
        { icon: 'import', label: '导入歌单', onClick: openImportPlaylist },
        { icon: 'plus', label: '新建歌单', onClick: openCreatePlaylist }
      ]
    });
    const root = mainRoot();
    const grid = h('div', 'playlist-mosaic');
    const favBuiltIn = (S.library || []).find(p => p && p.isFavorite === true);
    const favCover = (favBuiltIn && (favBuiltIn.customCover || favBuiltIn.cover)) || S.favoriteCustomCover || rawCoverOf(S.favorites.find(s => rawCoverOf(s)));
    const recentCover = rawCoverOf(S.recentlyPlayed.find(s => rawCoverOf(s)));
    const localCover = rawCoverOf(S.localTracks.find(s => rawCoverOf(s)));
    const tiles = [];
    tiles.push({ tileKind: 'favorites', cover: favCover, icon: 'heartFill', countText: S.favorites.length + ' 首歌曲',
      name: '我的收藏', detail: '你收藏的歌曲',
      onClick: () => pushView({ name: 'playlist', kind: 'favorites', id: 'favorites', title: '我的收藏', count: S.favorites.length, main: true }) });
    tiles.push({ tileKind: 'recent', cover: recentCover, icon: 'clock', countText: S.recentlyPlayed.length + ' 首歌曲',
      name: '最近播放', detail: '按最近播放时间排列',
      onClick: () => pushView({ name: 'playlist', kind: 'recent', id: 'recent', title: '最近播放', count: S.recentlyPlayed.length, main: true }) });
    libraryItems.forEach(playlist => tiles.push({
      playlistId: playlist.id, cover: playlist.cover, icon: 'music', countText: (playlist.trackCount || 0) + ' 首歌曲',
      name: playlist.name || '歌单', detail: '歌单', onClick: () => openBuiltIn(playlist) }));
    tiles.push({ tileKind: 'local', cover: localCover, icon: 'music', countText: S.localTracks.length + ' 首本地歌曲',
      name: '本地音乐', detail: '导入电脑里的音频', onClick: openLocal });
    const ordered = seededShuffle(tiles, S.mosaicSeed);
    const total = ordered.length;
    ordered.forEach((opts, index) => grid.appendChild(libraryCard(opts, index, total)));
    root.appendChild(grid);
    requestAnimationFrame(() => layoutMosaic(grid));
    void repairLibraryMosaicCovers(libraryItems, grid);
    if (!libraryItems.length) {
      const hint = h('div', 'empty-hint', '还没有歌单。点击右上角导入歌单或新建歌单。');
      hint.style.marginTop = '18px';
      root.appendChild(hint);
    }
  }
  function iconGlyph(name) {
    const box = h('div', '');
    box.style.width = '54px'; box.style.height = '54px'; box.style.color = 'var(--accent)';
    const svg = svgIcon(name); svg.style.width = '54px'; svg.style.height = '54px';
    box.appendChild(svg); return box;
  }

  async function openImportPlaylist() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '导入歌单'));
    box.appendChild(h('p', 'muted', '支持网易云、QQ、酷我、酷狗、汽水的分享内容和 LX 的 .lxmc / JSON 文件。汽水歌曲播放时匹配同名同歌手版本。'));
    const input = h('textarea');
    input.placeholder = 'https://music.163.com/playlist?id=... 或 LX JSON';
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'pill-btn', '取消'); cancel.onclick = () => closeModal(backdrop);
    const confirm = h('button', 'pill-btn accent', '导入');
    const chooseFile = h('button', 'pill-btn', '选择歌单文件');
    chooseFile.onclick = async () => {
      chooseFile.disabled = true;
      try {
        const result = await window.lxMusic.importPlaylistFile();
        if (!result) return;
        notify(['已导入 ' + result.importedLists + ' 个歌单，共 ' + result.imported + ' 首', ...(result.warnings || [])].join('\n'));
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        closeModal(backdrop);
        await loadHome(true);
        if (S.tab === 'library') renderLibrary();
      } catch (error) { notify('导入失败：' + error.message); }
      finally { chooseFile.disabled = false; }
    };
    confirm.onclick = async () => {
      const value = input.value.trim();
      if (!value) return notify('请先粘贴歌单链接或 JSON');
      confirm.disabled = true; confirm.textContent = '导入中…';
      try {
        const result = await window.lxMusic.importPlaylist(value);
        notify(['已导入 ' + result.importedLists + ' 个歌单，共 ' + result.imported + ' 首', ...(result.warnings || [])].join('\n'));
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        closeModal(backdrop);
        await loadHome(true);
        if (S.tab === 'library') renderLibrary();
      } catch (error) {
        notify('导入失败：' + error.message);
        confirm.disabled = false; confirm.textContent = '导入';
      }
    };
    actions.append(chooseFile, cancel, confirm);
    box.append(input, actions);
    backdrop.appendChild(box);
  }
  async function openCreatePlaylist() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '新建歌单'));
    const input = h('input'); input.type = 'text'; input.placeholder = '歌单名称';
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'pill-btn', '取消'); cancel.onclick = () => closeModal(backdrop);
    const confirm = h('button', 'pill-btn accent', '创建');
    confirm.onclick = async () => {
      const name = input.value.trim();
      if (!name) return notify('请输入歌单名称');
      try {
        await window.desktopWindow.createBuiltInPlaylist(name);
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        closeModal(backdrop);
        await loadHome(true);
        if (S.tab === 'library') renderLibrary();
        notify('已创建「' + name + '」');
      } catch (error) { notify('创建失败：' + error.message); }
    };
    actions.append(cancel, confirm);
    box.append(input, actions);
    backdrop.appendChild(box);
    setTimeout(() => input.focus(), 30);
  }

  /* ---------------- playlist detail ---------------- */
  async function loadPlaylistTracks(view) {
    if (view.kind === 'favorites') return S.favorites.slice();
    if (view.kind === 'recent') return S.recentlyPlayed.slice();
    if (view.kind === 'builtin') {
      const result=await window.LxPagination.collectAll(async(page,limit)=>{
        const data=await window.desktopWindow.readBuiltInPlaylist(view.id,{offset:(page-1)*limit,limit});
        if(!data||data.ok===false)throw new Error(data?.error||'歌单不可用');
        return {...data,items:data.tracks||[]};
      },{limit:500});
      return result.items;
    }
    if (view.kind === 'local') return S.localTracks.slice();
    if (view.id === 'daily-30' && S.feed && S.feed.dailySongs) return S.feed.dailySongs;
    if (view.feedItem && view.feedItem.parts && view.feedItem.parts.length) {
      // 大融合榜单：并行拉取各部分、按标称数量截断后交错，保证与卡片数量一致。
      const parts = view.feedItem.parts;
      const settled = await Promise.all(parts.map(part => window.lxMusic.feedTracks(part).then(r => r.items).catch(() => [])));
      const out = [], seen = new Set();
      for (let i = 0; i < settled.length; i++) {
        const part = parts[i], items = settled[i];
        if (!items.length) continue;
        const cap = part.count > 0 ? part.count : items.length;
        for (const song of items.slice(0, cap)) {
          const k = song.source + ':' + song.id;
          if (!seen.has(k)) { seen.add(k); out.push(song); }
        }
      }
      return out;
    }
    if(view.feedItem?.source){const r=await window.lxMusic.feedTracks(view.feedItem);view.warning=r.warning;return r.items;}
    const result = await getJson('/api/playlist/tracks?id=' + encodeURIComponent(view.id));
    if(result.unavailable)view.warning=result.unavailable+' 首歌曲的平台资料暂不可获取，已显示其余全部歌曲';
    return result.tracks || [];
  }
  /* ---------------- list tools: search / sort / manual order ---------------- */
  // 与移动端同一套列表工具：搜索只作用于当前列表；排序只改变展示顺序，不改原歌单。
  const listCollator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' });
  function arrangeSongs(songs, state) {
    const tools = state || {};
    const query = String(tools.query || '').trim().toLowerCase();
    let list = query
      ? songs.filter(song => ((song.name || '') + ' ' + (song.artist || song.singer || '') + ' ' + (song.album || '')).toLowerCase().includes(query))
      : songs.slice();
    if (tools.mode === 'name') list.sort((a, b) => listCollator.compare(a.name || '', b.name || ''));
    else if (tools.mode === 'artist') list.sort((a, b) => listCollator.compare(a.artist || a.singer || '', b.artist || b.singer || '') || listCollator.compare(a.name || '', b.name || ''));
    else if (tools.mode === 'album') list.sort((a, b) => listCollator.compare(a.album || '', b.album || '') || listCollator.compare(a.name || '', b.name || ''));
    else if (tools.mode === 'manual' && tools.manual && tools.manual.length) {
      const rank = new Map();
      tools.manual.forEach((key, index) => rank.set(key, index));
      list.sort((a, b) => (rank.has(identity(a)) ? rank.get(identity(a)) : 999999) - (rank.has(identity(b)) ? rank.get(identity(b)) : 999999));
    }
    return list;
  }
  function openListSortMenu(anchor, songs, state, refresh, onPersistManual) {
    const choice = (mode, label) => ({
      label, checked: state.mode === mode,
      action: () => { state.mode = mode; refresh(); }
    });
    openAnchoredMenu(anchor, [
      choice('added', '添加顺序'),
      choice('name', '歌名首字母'),
      choice('artist', '歌手名'),
      choice('album', '专辑名首字'),
      { label: '自定义顺序（拖动）', checked: state.mode === 'manual', action: () => {
        showManualOrderDialog(arrangeSongs(songs, { mode: state.mode, manual: state.manual, query: '' }), async (keys, orderedSongs) => {
          if (typeof onPersistManual === 'function') {
            await onPersistManual(orderedSongs, keys);
            return;
          }
          state.manual = keys; state.mode = 'manual'; refresh();
        });
      } }
    ]);
  }
  async function executeBatchDownload(songs) {
    const downloadable = (Array.isArray(songs) ? songs : []).filter(item => item && item.source !== 'local' && item.provider !== 'local');
    if (!downloadable.length) return notify('请至少选择 1 首可下载的在线歌曲');
    if (window.lxMusic?.downloadBatch) {
      notify('请选择批量下载保存文件夹…');
      try {
        const res = await window.lxMusic.downloadBatch(downloadable, S.quality);
        if (!res || res.canceled) return;
        refreshDownloads();
        notify(`已加入下载队列 ${res.started} 首` + (res.skipped ? `，跳过已存在 ${res.skipped} 首` : '') + (res.failed ? `，失败 ${res.failed} 首` : ''));
      } catch (error) { notify('批量下载失败：' + error.message); }
      return;
    }
    downloadable.forEach(song => downloadCurrent(song));
  }
  function downloadBatchSongs(songs, title) {
    const downloadable = (Array.isArray(songs) ? songs : []).filter(item => item && item.source !== 'local' && item.provider !== 'local');
    if (!downloadable.length) return notify('没有可下载的在线歌曲');
    const selected = new Set(downloadable.map((s, idx) => identity(s) || ('idx-' + idx)));
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '选择要下载的歌曲' + (title ? ' · ' + title : '')));
    const bar = h('div', 'batch-dl-bar');
    const allLabel = h('label', '');
    allLabel.style.display = 'inline-flex'; allLabel.style.alignItems = 'center'; allLabel.style.gap = '8px'; allLabel.style.cursor = 'pointer';
    const allCheck = h('input'); allCheck.type = 'checkbox'; allCheck.checked = true;
    const allSpan = h('span', '', `全选（已选 ${selected.size} / ${downloadable.length} 首）`);
    allLabel.append(allCheck, allSpan);
    const invertBtn = h('button', 'pill-btn', '反选'); invertBtn.type = 'button';
    bar.append(allLabel, invertBtn);
    box.appendChild(bar);
    const listWrap = h('div', 'batch-dl-list');
    const checks = [];
    const syncBar = () => {
      allSpan.textContent = `全选（已选 ${selected.size} / ${downloadable.length} 首）`;
      allCheck.checked = selected.size === downloadable.length;
      confirmBtn.textContent = `下载所选 (${selected.size})`;
      confirmBtn.disabled = selected.size === 0;
    };
    downloadable.forEach((song, idx) => {
      const k = identity(song) || ('idx-' + idx);
      const row = h('label', 'batch-dl-row');
      const ck = h('input'); ck.type = 'checkbox'; ck.checked = true;
      ck.onchange = () => { if (ck.checked) selected.add(k); else selected.delete(k); syncBar(); };
      const copy = h('div', 'copy');
      copy.append(h('strong', '', song.name || '未知歌曲'), h('small', '', (song.artist || song.singer || '未知歌手') + (song.album || song.albumName ? ' · ' + (song.album || song.albumName) : '')));
      row.append(ck, copy);
      listWrap.appendChild(row);
      checks.push({ k, ck });
    });
    allCheck.onchange = () => {
      checks.forEach(({ k, ck }) => { ck.checked = allCheck.checked; if (allCheck.checked) selected.add(k); else selected.delete(k); });
      syncBar();
    };
    invertBtn.onclick = () => {
      checks.forEach(({ k, ck }) => { ck.checked = !ck.checked; if (ck.checked) selected.add(k); else selected.delete(k); });
      syncBar();
    };
    box.appendChild(listWrap);
    const actions = h('div', 'modal-actions');
    const cancelBtn = h('button', 'pill-btn', '取消'); cancelBtn.type = 'button'; cancelBtn.onclick = () => closeModal(backdrop);
    const confirmBtn = h('button', 'pill-btn accent', `下载所选 (${selected.size})`); confirmBtn.type = 'button';
    confirmBtn.onclick = () => {
      const chosen = downloadable.filter((song, idx) => selected.has(identity(song) || ('idx-' + idx)));
      closeModal(backdrop);
      if (chosen.length) void executeBatchDownload(chosen);
    };
    actions.append(cancelBtn, confirmBtn);
    box.appendChild(actions);
    backdrop.appendChild(box);
  }
  async function executeBatchCollect(songs, target) {
    const clean = [];
    const seen = new Set();
    for (const s of (Array.isArray(songs) ? songs : [])) {
      if (!s) continue;
      const k = identity(s);
      if (k && seen.has(k)) continue;
      if (k) seen.add(k);
      clean.push(s);
    }
    if (!clean.length) return;
    if (!target || target.type === 'favorites') {
      const existing = new Set((S.favorites || []).map(identity));
      const fresh = clean.filter(s => !existing.has(identity(s)));
      const skipped = clean.length - fresh.length;
      if (fresh.length) {
        S.favorites = [...fresh, ...(S.favorites || [])];
        saveStore();
        syncLikeButtons();
        await persistFavoritesToLibrary(true);
        if (S.currentView && S.currentView.name === 'playlist' && S.currentView.kind === 'favorites') {
          S.currentView.tracks = S.favorites.slice();
          renderPlaylist(S.currentView);
        }
      }
      notify(fresh.length ? (`已收藏 ${fresh.length} 首到「我的收藏」` + (skipped ? `（跳过 ${skipped} 首重复）` : '')) : '所选歌曲均已在「我的收藏」中');
      return;
    }
    try {
      let targetId = target.id;
      let targetName = target.name || '歌单';
      if (target.type === 'new') {
        const cleanName = String(target.name || '').trim();
        if (!cleanName) { notify('请输入新歌单名称'); return; }
        const created = await window.desktopWindow.createBuiltInPlaylist(cleanName);
        if (!created || created.ok === false || !created.playlist?.id) {
          notify('新建歌单失败：' + (created?.error || '请稍后重试'));
          return;
        }
        targetId = created.playlist.id;
        targetName = created.playlist.name || cleanName;
      }
      let added = 0;
      let skipped = 0;
      if (window.desktopWindow?.addBuiltInPlaylistTracks) {
        const res = await window.desktopWindow.addBuiltInPlaylistTracks(targetId, clean);
        if (res && res.ok === false) { notify('收藏失败：' + res.error); return; }
        added = Number(res?.addedCount) || 0;
        skipped = Number(res?.skippedCount) || 0;
      } else {
        for (const s of clean) {
          const r = await window.desktopWindow.addBuiltInPlaylistTrack(targetId, s);
          if (r?.added) added += 1;
          else skipped += 1;
        }
      }
      window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
      await loadHome(true);
      if (S.currentView && S.currentView.name === 'playlist' && S.currentView.id === targetId) {
        const refreshed = await window.desktopWindow.readBuiltInPlaylist(targetId, { offset: 0, limit: 10000 });
        if (refreshed && refreshed.ok !== false && Array.isArray(refreshed.tracks)) {
          S.currentView.tracks = refreshed.tracks;
          renderPlaylist(S.currentView);
        }
      }
      notify(added > 0 ? (`已收藏 ${added} 首到「${targetName}」` + (skipped ? `（跳过 ${skipped} 首重复）` : '')) : `所选歌曲均已在「${targetName}」中`);
    } catch (error) {
      notify('批量收藏失败：' + (error?.message || '请稍后重试'));
    }
  }
  function openBatchCollectModal(songs, title) {
    const items = [];
    const seen = new Set();
    for (const item of (Array.isArray(songs) ? songs : [])) {
      if (!item) continue;
      const k = identity(item);
      if (k && seen.has(k)) continue;
      if (k) seen.add(k);
      items.push(item);
    }
    if (!items.length) return notify('当前列表没有可收藏的歌曲');
    const selected = new Set(items.map((s, idx) => identity(s) || ('idx-' + idx)));
    const favKeys = new Set((S.favorites || []).map(identity));
    const customLists = (S.library || []).filter(item => item && item.isFavorite !== true);
    let targetMode = 'favorites';
    let targetPlaylistId = '';
    let targetPlaylistName = '我的收藏';
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '批量收藏' + (title ? ' · ' + title : '')));
    const targetWrap = h('div', 'batch-collect-targets');
    const newRow = h('div', 'batch-collect-new-row');
    newRow.style.display = 'none';
    const newInput = h('input');
    newInput.type = 'text';
    newInput.placeholder = '输入新歌单名称';
    newInput.maxLength = 40;
    newRow.appendChild(newInput);
    const targetChips = [];
    const syncTargetUi = () => {
      targetChips.forEach(c => c.btn.classList.toggle('accent', c.isActive()));
      newRow.style.display = targetMode === 'new' ? 'flex' : 'none';
      if (targetMode === 'new') setTimeout(() => newInput.focus(), 30);
      syncBar();
    };
    const addChip = (label, isActive, onClick) => {
      const btn = h('button', 'pill-btn' + (isActive() ? ' accent' : ''), label);
      btn.type = 'button';
      btn.onclick = () => { onClick(); syncTargetUi(); };
      targetWrap.appendChild(btn);
      targetChips.push({ btn, isActive });
    };
    addChip('我的收藏', () => targetMode === 'favorites', () => { targetMode = 'favorites'; targetPlaylistId = ''; targetPlaylistName = '我的收藏'; });
    customLists.forEach(pl => {
      addChip(pl.name || '未命名歌单', () => targetMode === 'builtin' && targetPlaylistId === pl.id, () => {
        targetMode = 'builtin'; targetPlaylistId = pl.id; targetPlaylistName = pl.name || '歌单';
      });
    });
    addChip('+ 新建歌单', () => targetMode === 'new', () => { targetMode = 'new'; targetPlaylistId = ''; targetPlaylistName = ''; });
    box.append(targetWrap, newRow);

    const bar = h('div', 'batch-dl-bar');
    const allLabel = h('label', '');
    allLabel.style.display = 'inline-flex'; allLabel.style.alignItems = 'center'; allLabel.style.gap = '8px'; allLabel.style.cursor = 'pointer';
    const allCheck = h('input'); allCheck.type = 'checkbox'; allCheck.checked = true;
    const allSpan = h('span', '', `全选（已选 ${selected.size} / ${items.length} 首）`);
    allLabel.append(allCheck, allSpan);
    const invertBtn = h('button', 'pill-btn', '反选'); invertBtn.type = 'button';
    bar.append(allLabel, invertBtn);
    box.appendChild(bar);

    const listWrap = h('div', 'batch-dl-list');
    const checks = [];
    const actions = h('div', 'modal-actions');
    const cancelBtn = h('button', 'pill-btn', '取消'); cancelBtn.type = 'button'; cancelBtn.onclick = () => closeModal(backdrop);
    const confirmBtn = h('button', 'pill-btn accent', `收藏所选 (${selected.size})`); confirmBtn.type = 'button';
    const syncBar = () => {
      allSpan.textContent = `全选（已选 ${selected.size} / ${items.length} 首）`;
      allCheck.checked = selected.size === items.length;
      const label = targetMode === 'new' ? '新建并收藏' : (targetMode === 'favorites' ? '收藏到我喜欢的' : `收藏到「${targetPlaylistName}」`);
      confirmBtn.textContent = `${label} (${selected.size})`;
      confirmBtn.disabled = selected.size === 0;
    };
    items.forEach((song, idx) => {
      const k = identity(song) || ('idx-' + idx);
      const row = h('label', 'batch-dl-row');
      const ck = h('input'); ck.type = 'checkbox'; ck.checked = true;
      ck.onchange = () => { if (ck.checked) selected.add(k); else selected.delete(k); syncBar(); };
      const copy = h('div', 'copy');
      copy.append(h('strong', '', song.name || '未知歌曲'), h('small', '', (song.artist || song.singer || '未知歌手') + (song.album || song.albumName ? ' · ' + (song.album || song.albumName) : '')));
      row.append(ck, copy);
      if (favKeys.has(k)) row.appendChild(h('span', 'dup-tag', '已收藏'));
      listWrap.appendChild(row);
      checks.push({ k, ck });
    });
    allCheck.onchange = () => {
      checks.forEach(({ k, ck }) => { ck.checked = allCheck.checked; if (allCheck.checked) selected.add(k); else selected.delete(k); });
      syncBar();
    };
    invertBtn.onclick = () => {
      checks.forEach(({ k, ck }) => { ck.checked = !ck.checked; if (ck.checked) selected.add(k); else selected.delete(k); });
      syncBar();
    };
    confirmBtn.onclick = () => {
      const chosen = items.filter((song, idx) => selected.has(identity(song) || ('idx-' + idx)));
      if (!chosen.length) return;
      if (targetMode === 'new' && !String(newInput.value || '').trim()) {
        notify('请输入新歌单名称');
        newInput.focus();
        return;
      }
      const target = targetMode === 'favorites'
        ? { type: 'favorites', name: '我的收藏' }
        : (targetMode === 'new'
          ? { type: 'new', name: String(newInput.value || '').trim() }
          : { type: 'builtin', id: targetPlaylistId, name: targetPlaylistName });
      closeModal(backdrop);
      void executeBatchCollect(chosen, target);
    };
    actions.append(cancelBtn, confirmBtn);
    box.append(listWrap, actions);
    backdrop.appendChild(box);
    syncBar();
  }
  function openPlaylistCoverPicker(view, onUpdated) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '自定义歌单封面'));
    box.appendChild(h('p', 'muted', '可从本歌单歌曲中选取一张封面，或上传本地自定义图片。'));
    const topActs = h('div', 'fx-chip-wrap');
    const localBtn = h('button', 'pill-btn accent', '选择本地图片'); localBtn.type = 'button';
    const resetBtn = h('button', 'pill-btn', '恢复默认封面'); resetBtn.type = 'button';
    const applyCover = async (coverVal, tip) => {
      try {
        let targetId = view.id;
        if (view.kind === 'favorites') {
          S.favoriteCustomCover = coverVal || '';
          saveStore();
          await persistFavoritesToLibrary(false);
          const favBuiltIn = (S.library || []).find(p => p && p.isFavorite === true);
          if (favBuiltIn && favBuiltIn.id) targetId = favBuiltIn.id;
        }
        if (targetId && targetId !== 'favorites' && window.desktopWindow?.setBuiltInPlaylistCover) {
          const res = await window.desktopWindow.setBuiltInPlaylistCover(targetId, coverVal);
          if (res && res.ok === false) throw new Error(res.error || '设置封面失败');
          view.cover = (res && res.playlist && res.playlist.cover) || coverVal || '';
          const inLib = (S.library || []).find(p => p.id === targetId);
          if (inLib) { inLib.cover = view.cover; inLib.customCover = coverVal || ''; }
        } else {
          view.cover = coverVal || '';
        }
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        closeModal(backdrop);
        notify(tip || '已更新歌单封面');
        if (onUpdated) onUpdated(view.cover);
      } catch (err) { notify('设置封面失败：' + err.message); }
    };
    localBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || '');
          const img = new Image();
          img.onload = () => {
            try {
              const size = Math.min(640, Math.max(img.width || 1, img.height || 1));
              const scale = size / Math.max(img.width || 1, img.height || 1);
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
              canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
              canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
              void applyCover(canvas.toDataURL('image/jpeg', 0.86), '已使用本地图片作为歌单封面');
            } catch (_) { void applyCover(raw, '已使用本地图片作为歌单封面'); }
          };
          img.onerror = () => notify('图片读取失败');
          img.src = raw;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };
    resetBtn.onclick = () => void applyCover('', '已恢复默认歌单封面');
    topActs.append(localBtn, resetBtn);
    box.appendChild(topActs);
    const seen = new Set();
    const candidates = (view.tracks || []).filter(t => {
      const c = rawCoverOf(t);
      if (!c || seen.has(c)) return false;
      seen.add(c); return true;
    }).slice(0, 32);
    if (candidates.length) {
      const label = h('small', 'muted', '从歌单歌曲封面中选择');
      label.style.display = 'block'; label.style.marginTop = '12px';
      box.appendChild(label);
      const grid = h('div', 'cover-pick-grid');
      candidates.forEach(t => {
        const c = rawCoverOf(t);
        const btn = h('button', 'cover-pick-item' + (view.cover === c ? ' active' : ''));
        btn.type = 'button';
        const img = document.createElement('img');
        img.src = coverUrl(c); img.alt = t.name || '';
        btn.append(img, h('span', '', t.name || ''));
        btn.onclick = () => void applyCover(c, '已将「' + (t.name || '歌曲') + '」封面设为歌单封面');
        grid.appendChild(btn);
      });
      box.appendChild(grid);
    }
    const actions = h('div', 'modal-actions');
    const closeBtn = h('button', 'pill-btn', '关闭'); closeBtn.type = 'button'; closeBtn.onclick = () => closeModal(backdrop);
    actions.appendChild(closeBtn);
    box.appendChild(actions);
    backdrop.appendChild(box);
  }
  function openRenamePlaylistModal(view, onRenamed) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '重命名歌单'));
    const input = h('input'); input.type = 'text'; input.value = view.title || ''; input.placeholder = '输入新的歌单名称';
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'pill-btn', '取消'); cancel.onclick = () => closeModal(backdrop);
    const confirm = h('button', 'pill-btn accent', '保存');
    const submit = async () => {
      const nextName = input.value.trim();
      if (!nextName) return notify('歌单名称不能为空');
      confirm.disabled = true;
      try {
        const res = await window.desktopWindow.renameBuiltInPlaylist(view.id, nextName);
        if (res && res.ok === false) throw new Error(res.error || '重命名失败');
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        view.title = nextName;
        closeModal(backdrop);
        await loadHome(true);
        if (onRenamed) onRenamed(nextName);
        notify('已重命名为「' + nextName + '」');
      } catch (error) { confirm.disabled = false; notify('重命名失败：' + error.message); }
    };
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    confirm.onclick = submit;
    actions.append(cancel, confirm);
    box.append(input, actions);
    backdrop.appendChild(box);
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  function openEditPlaylistDialog(view, onSaved) {
    const list = (view.tracks || []).slice();
    const selected = new Set();
    const backdrop = h('div', 'manual-order-backdrop');
    const box = h('div', 'manual-order-box glass');
    const head = h('div', 'manual-order-head');
    const copy = h('div', '');
    copy.append(h('strong', '', '编辑歌单'), h('small', '', '可修改歌单名、勾选批量收藏/删除/下载，或拖动 ≡ 调整自定义顺序'));
    const closeBtn = h('button', 'manual-order-close', '关闭');
    head.append(copy, closeBtn);
    const nameInput = h('input', 'playlist-edit-name');
    nameInput.type = 'text'; nameInput.value = view.title || ''; nameInput.placeholder = '歌单名称';
    const allBar = h('label', 'local-scan-all');
    const allCheck = h('input'); allCheck.type = 'checkbox';
    const allLabel = h('span', '', '全选（已选 0 首）');
    allBar.append(allCheck, allLabel);
    const body = h('div', 'manual-order-list');
    const foot = h('div', 'manual-order-foot');
    const collectSelected = h('button', 'pill-btn', '批量收藏');
    const removeSelected = h('button', 'pill-btn', '移除所选');
    const downloadSelected = h('button', 'pill-btn', '下载所选');
    const cancel = h('button', 'pill-btn', '取消');
    const save = h('button', 'pill-btn accent', '保存');
    const countText = h('span', 'manual-order-count', list.length + ' 首');
    if (view.kind === 'favorites') {
      foot.append(countText, removeSelected, downloadSelected, cancel, save);
    } else {
      foot.append(countText, collectSelected, removeSelected, downloadSelected, cancel, save);
    }
    const close = () => backdrop.remove();
    let dragIndex = -1;
    const updateCounts = () => {
      countText.textContent = list.length + ' 首';
      allLabel.textContent = `全选（已选 ${selected.size} 首）`;
      allCheck.checked = list.length > 0 && selected.size === list.length;
      collectSelected.disabled = selected.size === 0;
      removeSelected.disabled = selected.size === 0;
      downloadSelected.disabled = selected.size === 0;
    };
    const clearMarks = () => body.querySelectorAll('.manual-order-row').forEach(node => node.classList.remove('dragging', 'drop-target'));
    const draw = () => {
      body.replaceChildren();
      list.forEach((song, index) => {
        const key = identity(song) || ('idx-' + index);
        const row = h('div', 'manual-order-row');
        row.draggable = true;
        const check = h('input'); check.type = 'checkbox'; check.checked = selected.has(key);
        check.onclick = event => event.stopPropagation();
        check.onchange = () => { if (check.checked) selected.add(key); else selected.delete(key); updateCounts(); };
        row.appendChild(check);
        row.appendChild(h('span', 'manual-order-handle', '≡'));
        row.appendChild(h('span', 'manual-order-index', String(index + 1).padStart(2, '0')));
        const main = h('div', 'manual-order-main');
        main.append(h('strong', '', song.name || '未知歌曲'), h('small', '', song.artist || song.singer || '未知歌手'));
        const singleDel = h('button', 'row-act row-remove');
        singleDel.type = 'button'; singleDel.title = '移除这首歌'; singleDel.appendChild(svgIcon('trash'));
        singleDel.onclick = event => {
          event.stopPropagation();
          selected.delete(key);
          list.splice(index, 1);
          draw();
        };
        row.append(main, singleDel);
        row.onclick = () => { check.checked = !check.checked; check.onchange(); };
        row.ondragstart = event => {
          dragIndex = index; row.classList.add('dragging');
          if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }
        };
        row.ondragover = event => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          body.querySelectorAll('.manual-order-row').forEach(node => node.classList.remove('drop-target'));
          if (index !== dragIndex) row.classList.add('drop-target');
        };
        row.ondragleave = () => row.classList.remove('drop-target');
        row.ondrop = event => {
          event.preventDefault();
          const from = dragIndex >= 0 ? dragIndex : Number(event.dataTransfer?.getData('text/plain'));
          if (!Number.isFinite(from) || from < 0 || from === index) { clearMarks(); return; }
          const moved = list.splice(from, 1)[0];
          list.splice(index, 0, moved);
          dragIndex = -1; clearMarks(); draw();
        };
        row.ondragend = () => { dragIndex = -1; clearMarks(); };
        body.appendChild(row);
      });
      updateCounts();
    };
    allCheck.onchange = () => {
      selected.clear();
      if (allCheck.checked) list.forEach((song, idx) => selected.add(identity(song) || ('idx-' + idx)));
      draw();
    };
    removeSelected.onclick = () => {
      if (!selected.size) return;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const key = identity(list[i]) || ('idx-' + i);
        if (selected.has(key)) list.splice(i, 1);
      }
      selected.clear();
      draw();
    };
    collectSelected.onclick = () => {
      const chosen = list.filter((song, idx) => selected.has(identity(song) || ('idx-' + idx)));
      collectSongsBatch(chosen);
    };
    downloadSelected.onclick = () => {
      const chosen = list.filter((song, idx) => selected.has(identity(song) || ('idx-' + idx)));
      void executeBatchDownload(chosen);
    };
    closeBtn.onclick = close; cancel.onclick = close;
    save.onclick = async () => {
      const nextName = nameInput.value.trim() || view.title || '我的歌单';
      save.disabled = true;
      try {
        if (nextName !== view.title) await window.desktopWindow.renameBuiltInPlaylist(view.id, nextName);
        const res = await window.desktopWindow.replaceBuiltInPlaylistTracks(view.id, list);
        if (res && res.ok === false) throw new Error(res.error || '保存失败');
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        view.title = nextName;
        view.tracks = list.slice();
        view.count = list.length;
        close();
        await loadHome(true);
        if (onSaved) onSaved();
        notify('歌单已保存');
      } catch (error) { save.disabled = false; notify('保存失败：' + error.message); }
    };
    box.append(head, nameInput, allBar, body, foot);
    backdrop.appendChild(box);
    backdrop.onclick = event => { if (event.target === backdrop) close(); };
    document.body.appendChild(backdrop);
    draw();
  }
  function showManualOrderDialog(songs, onDone) {
    const list = songs.slice();
    const backdrop = h('div', 'manual-order-backdrop');
    const box = h('div', 'manual-order-box glass');
    const head = h('div', 'manual-order-head');
    const copy = h('div', '');
    copy.append(h('strong', '', '手动排列'), h('small', '', '按住歌曲拖动到目标位置，松手即可排序'));
    const closeBtn = h('button', 'manual-order-close', '关闭');
    head.append(copy, closeBtn);
    const body = h('div', 'manual-order-list');
    const foot = h('div', 'manual-order-foot');
    const cancel = h('button', 'pill-btn', '取消');
    const done = h('button', 'pill-btn accent', '完成');
    foot.append(h('span', 'manual-order-count', list.length + ' 首'), cancel, done);
    const close = () => { backdrop.remove(); };
    let dragIndex = -1;
    const clearMarks = () => {
      body.querySelectorAll('.manual-order-row').forEach(node => node.classList.remove('dragging', 'drop-target'));
    };
    const draw = () => {
      body.replaceChildren();
      list.forEach((song, index) => {
        const row = h('div', 'manual-order-row');
        row.draggable = true;
        row.dataset.index = String(index);
        row.appendChild(h('span', 'manual-order-handle', '≡'));
        row.appendChild(h('span', 'manual-order-index', String(index + 1).padStart(2, '0')));
        const main = h('div', 'manual-order-main');
        main.append(h('strong', '', song.name || '未知歌曲'), h('small', '', song.artist || song.singer || '未知歌手'));
        row.appendChild(main);
        row.ondragstart = event => {
          dragIndex = index;
          row.classList.add('dragging');
          if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }
        };
        row.ondragover = event => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          body.querySelectorAll('.manual-order-row').forEach(node => node.classList.remove('drop-target'));
          if (index !== dragIndex) row.classList.add('drop-target');
        };
        row.ondragleave = () => row.classList.remove('drop-target');
        row.ondrop = event => {
          event.preventDefault();
          const from = dragIndex >= 0 ? dragIndex : Number(event.dataTransfer && event.dataTransfer.getData('text/plain'));
          if (!Number.isFinite(from) || from < 0 || from === index) { clearMarks(); return; }
          const moved = list.splice(from, 1)[0];
          list.splice(index, 0, moved);
          dragIndex = -1;
          clearMarks();
          draw();
        };
        row.ondragend = () => { dragIndex = -1; clearMarks(); };
        body.appendChild(row);
      });
    };
    closeBtn.onclick = close; cancel.onclick = close;
    done.onclick = () => { close(); onDone(list.map(identity), list.slice()); };
    box.append(head, body, foot);
    backdrop.appendChild(box);
    backdrop.onclick = event => { if (event.target === backdrop) close(); };
    document.body.appendChild(backdrop);
    draw();
  }
  // 歌单/本地/搜索结果共用的列表工具条。返回 { node, setCount, input, toggleSearch, refresh }。
  function createListBar(songs, state, refresh) {
    const node = h('div', 'list-tools');
    const count = h('span', 'list-tools-count', songs.length + ' 首');
    const label = h('span', 'list-tools-label', '本列表');
    const search = h('button', 'list-tools-search-btn');
    search.type = 'button'; search.setAttribute('aria-label', '搜索本列表');
    search.appendChild(svgIcon('search'));
    search.onclick = () => {
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) state.query = '';
      if (input) { input.value = state.query; input.classList.toggle('hidden', !state.searchOpen); }
      search.classList.toggle('active', state.searchOpen);
      if (state.searchOpen && input) input.focus();
      refresh();
    };
    const input = h('input', 'list-tools-input hidden');
    input.type = 'search'; input.placeholder = '搜索本列表'; input.value = state.query || '';
    input.oninput = () => { state.query = input.value; refresh(); };
    node.append(label, count, h('span', 'list-tools-spacer'), input, search);
    return {
      node, input,
      setCount: value => { count.textContent = value + ' 首'; },
      setSearchOpen: value => {
        state.searchOpen = value;
        input.classList.toggle('hidden', !value);
        search.classList.toggle('active', value);
        if (value) input.focus();
      }
    };
  }

  function isCollectionSavedToLibrary(title) {
    const clean = String(title || '').trim();
    if (!clean) return false;
    return (S.library || []).some(item => item && !item.isFavorite && String(item.name || '').trim() === clean);
  }
  async function saveCollectionToLibrary(title, tracks, cover) {
    const clean = String(title || '').trim() || '收藏歌单';
    const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (!list.length) throw new Error('暂无可收藏的歌曲');
    if (isCollectionSavedToLibrary(clean)) return { already: true };
    const created = await window.desktopWindow.createBuiltInPlaylist(clean);
    if (!created || created.ok === false) throw new Error((created && created.error) || '创建歌单失败');
    const newId = (created.playlist && created.playlist.id) || created.id;
    if (!newId) throw new Error('歌单 ID 无效');
    const replaced = await window.desktopWindow.replaceBuiltInPlaylistTracks(newId, list);
    if (replaced && replaced.ok === false) throw new Error(replaced.error || '写入歌曲失败');
    const cleanCover = String(cover || rawCoverOf(list.find(t => rawCoverOf(t))) || '').trim();
    if (cleanCover && window.desktopWindow.setBuiltInPlaylistCover) {
      await window.desktopWindow.setBuiltInPlaylistCover(newId, cleanCover).catch(() => {});
    }
    window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
    await loadHome(true);
    return { ok: true, id: newId, count: list.length };
  }

  async function renderPlaylist(view) {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    const tools = view.tools || (view.tools = { query: '', mode: 'added', manual: null, searchOpen: false });
    let toggleListSearch = null;
    let refreshList = () => {};
    setHeader(view.title || '歌单', '', { back: goBack, actions: [
      { icon: 'search', label: '搜索本列表', onClick: () => { if (toggleListSearch) toggleListSearch(); } }
    ] });
    const root = mainRoot();
    if (!view.tracks) {
      root.appendChild(h('div', 'empty-hint', '正在读取歌单…'));
      try {
        view.tracks = await loadPlaylistTracks(view);
      } catch (error) {
        view.tracks = [];
        view.error = error.message;
      }
      if (S.currentView !== view) return;
      const done = renderPlaylist(view);
      if (view.autoplay && view.tracks.length) playSong(view.tracks[0], view.tracks);
      return done;
    }
    const hero = h('div', 'playlist-hero');
    const favBuiltInHero = view.kind === 'favorites' ? (S.library || []).find(p => p && p.isFavorite === true) : null;
    const heroCover = view.cover || (favBuiltInHero && (favBuiltInHero.customCover || favBuiltInHero.cover)) || (view.kind === 'favorites' ? (S.favoriteCustomCover || '') : '') || rawCoverOf(view.tracks.find(t => rawCoverOf(t))) || '';
    if (heroCover) {
      hero.style.setProperty('--hero-cover', 'url("' + coverUrl(heroCover).replace(/"/g, '%22') + '")');
      hero.classList.add('has-ambient');
    }
    const art = h('div', 'art');
    const heroGrad = mosaicGrad(view.title || '歌单');
    if (heroCover) {
      art.style.backgroundImage = 'url("' + coverUrl(heroCover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + heroGrad[0] + ',' + heroGrad[1] + ')';
    } else {
      art.style.backgroundImage = 'linear-gradient(135deg,' + heroGrad[0] + ',' + heroGrad[1] + ')';
      art.appendChild(iconGlyph(view.kind === 'favorites' ? 'heartFill' : 'music'));
    }
    const copy = h('div', 'hero-copy');
    const heroBadgeLabel = view.id === 'daily-30'
      ? (S.feed && S.feed.personalized ? '专属每日定制' : '每日精选')
      : view.kind === 'builtin' ? '曲库歌单'
      : view.kind === 'favorites' ? '我的收藏'
      : view.kind === 'recent' ? '听歌足迹'
      : '精选歌单';
    const heroBadge = h('span', 'hero-kicker', heroBadgeLabel);
    const titleHeading = h('h2', '', view.title || '歌单');
    const countLine = h('p', '', (view.tracks.length || view.count || 0) + ' 首歌曲 · ' + (view.kind === 'builtin' ? 'LxMine 歌单' : view.kind === 'favorites' ? '我的收藏' : view.kind === 'recent' ? '最近播放' : '网络歌单'));
    copy.append(heroBadge, titleHeading, countLine);
    const actions = h('div', 'hero-actions');
    const play = h('button', 'pill-btn accent', '播放全部');
    play.onclick = () => {
      const fullQueue = arrangeSongs(view.tracks, Object.assign({}, tools, { query: '' }));
      if (fullQueue.length) playSong(fullQueue[0], fullQueue);
    };
    actions.appendChild(play);
    const persistManual = (view.kind === 'builtin' || view.kind === 'favorites') ? async (orderedSongs) => {
      if (view.kind === 'favorites') {
        S.favorites = orderedSongs.slice();
        saveStore();
        await persistFavoritesToLibrary(true);
      } else {
        const res = await window.desktopWindow.replaceBuiltInPlaylistTracks(view.id, orderedSongs);
        if (res && res.ok === false) { notify('保存顺序失败：' + res.error); return; }
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
      }
      view.tracks = orderedSongs.slice();
      tools.mode = 'added';
      tools.manual = null;
      refreshList();
      await loadHome(true);
      notify('已保存自定义歌曲顺序');
    } : null;
    const sortBtn = h('button', 'pill-btn', '排列');
    sortBtn.onclick = () => openListSortMenu(sortBtn, view.tracks, tools, () => refreshList(), persistManual);
    actions.appendChild(sortBtn);
    if (view.tracks.length) {
      const batchCol = h('button', 'pill-btn', '批量收藏');
      batchCol.onclick = () => openBatchCollectModal(arrangeSongs(view.tracks, tools), view.title);
      actions.appendChild(batchCol);
    }
    if (view.kind !== 'local' && view.tracks.some(item => item && item.source !== 'local' && item.provider !== 'local')) {
      const batchDl = h('button', 'pill-btn', '批量下载');
      batchDl.onclick = () => downloadBatchSongs(arrangeSongs(view.tracks, tools), view.title);
      actions.appendChild(batchDl);
    }
    if ((view.kind === 'feed' || view.kind === 'entity' || view.kind === 'similar') && view.tracks.length) {
      const defaultCollectLabel = view.entityKind === 'album' ? '收藏专辑' : '收藏到曲库';
      const savedNow = isCollectionSavedToLibrary(view.title);
      const save = h('button', 'pill-btn' + (savedNow ? ' accent' : ''), savedNow ? '已收藏' : defaultCollectLabel);
      save.disabled = savedNow;
      save.onclick = async () => {
        if (save.disabled) return;
        save.disabled = true;
        save.textContent = '收藏中…';
        try {
          const result = await saveCollectionToLibrary(view.title, view.tracks, heroCover);
          save.textContent = '已收藏';
          save.classList.add('accent');
          notify(result && result.already ? ('「' + view.title + '」已在曲库中') : ('已收藏「' + view.title + '」到曲库'));
        } catch (error) {
          save.disabled = false;
          save.textContent = defaultCollectLabel;
          notify('收藏失败：' + (error && error.message ? error.message : '请稍后重试'));
        }
      };
      actions.appendChild(save);
    }
    if (view.kind === 'recent' && view.tracks.length) {
      const clearBtn = h('button', 'pill-btn', '清空最近播放');
      clearBtn.onclick = () => {
        if (!confirm(`确定清空全部 ${view.tracks.length} 条最近播放记录？`)) return;
        S.recentlyPlayed = [];
        saveStore();
        view.tracks = [];
        view.count = 0;
        renderPlaylist(view);
        notify('已清空最近播放记录');
      };
      actions.appendChild(clearBtn);
    }
    if (view.kind === 'favorites') {
      const coverBtn = h('button', 'pill-btn', '自定义封面');
      coverBtn.onclick = () => openPlaylistCoverPicker(view, () => renderPlaylist(view));
      actions.appendChild(coverBtn);
    }
    if (view.kind === 'builtin' && !view.favorite) {
      const coverBtn = h('button', 'pill-btn', '自定义封面');
      coverBtn.onclick = () => openPlaylistCoverPicker(view, () => renderPlaylist(view));
      actions.appendChild(coverBtn);
      const editBtn = h('button', 'pill-btn', '编辑歌单');
      editBtn.onclick = () => openEditPlaylistDialog(view, () => renderPlaylist(view));
      actions.appendChild(editBtn);
      const renameBtn = h('button', 'pill-btn', '重命名');
      renameBtn.onclick = () => openRenamePlaylistModal(view, nextName => {
        titleHeading.textContent = nextName;
        setHeader(nextName, '', { back: goBack, actions: [{ icon: 'search', label: '搜索本列表', onClick: () => { if (toggleListSearch) toggleListSearch(); } }] });
      });
      actions.appendChild(renameBtn);
      const remove = h('button', 'pill-btn', '删除歌单');
      remove.onclick = async () => {
        if (!confirm('删除「' + view.title + '」？')) return;
        try {
          await window.desktopWindow.deleteBuiltInPlaylist(view.id);
          window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
          await loadHome(true); goBack();
        } catch (error) { notify('删除失败：' + error.message); }
      };
      actions.appendChild(remove);
    }
    copy.appendChild(actions);
    hero.append(art, copy);
    root.appendChild(hero);
    const removeSingleSong = (view.kind === 'builtin' || view.kind === 'favorites' || view.kind === 'recent') ? async (song) => {
      const key = identity(song);
      if (view.kind === 'recent') {
        S.recentlyPlayed = (S.recentlyPlayed || []).filter(item => identity(item) !== key);
        saveStore();
        view.tracks = S.recentlyPlayed.slice();
        view.count = view.tracks.length;
        countLine.textContent = view.tracks.length + ' 首歌曲 · 最近播放';
        refreshList();
        notify('已从「最近播放」移除');
        return;
      }
      if (view.kind === 'favorites') {
        toggleFavorite(song);
        view.tracks = S.favorites.slice();
        view.count = view.tracks.length;
        countLine.textContent = view.tracks.length + ' 首歌曲 · 我的收藏';
        refreshList();
        return;
      }
      const rawIndex = view.tracks.findIndex(item => identity(item) === key);
      if (rawIndex < 0) return;
      try {
        const res = await window.desktopWindow.removeBuiltInPlaylistTrack(view.id, rawIndex);
        if (res && res.ok === false) throw new Error(res.error || '移除失败');
        window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        view.tracks.splice(rawIndex, 1);
        view.count = view.tracks.length;
        countLine.textContent = view.tracks.length + ' 首歌曲 · LxMine 歌单';
        refreshList();
        await loadHome(true);
        notify('已从歌单移除「' + (song.name || '歌曲') + '」');
      } catch (error) { notify('移除失败：' + error.message); }
    } : null;
    if (view.error) root.appendChild(h('div', 'empty-hint', view.error));
    else if (!view.tracks.length) root.appendChild(h('div', 'empty-hint', '这个歌单还没有歌曲'));
    else {
      const listBar = createListBar(view.tracks, tools, () => refreshList());
      toggleListSearch = () => { listBar.setSearchOpen(!tools.searchOpen); refreshList(); };
      const listHost = h('div', 'list-tools-host');
      root.append(listBar.node, listHost);
      const canSwitchInPlaylist = view.kind === 'builtin' || view.kind === 'favorites' || view.kind === 'recent';
      const switchSongInPlaylist = canSwitchInPlaylist ? (song) => {
        openSwitchPlatformModal(song, {
          mode: 'playlist',
          playlistView: view,
          onReplaced: () => {
            countLine.textContent = (view.tracks.length || view.count || 0) + ' 首歌曲 · ' + (view.kind === 'builtin' ? 'LxMine 歌单' : view.kind === 'favorites' ? '我的收藏' : '最近播放');
            const nextHeroCover = view.cover || rawCoverOf(view.tracks.find(t => rawCoverOf(t))) || '';
            if (nextHeroCover && hero.isConnected) {
              hero.style.setProperty('--hero-cover', 'url("' + coverUrl(nextHeroCover).replace(/"/g, '%22') + '")');
              hero.classList.add('has-ambient');
              art.replaceChildren();
              art.style.backgroundImage = 'url("' + coverUrl(nextHeroCover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + heroGrad[0] + ',' + heroGrad[1] + ')';
            }
            refreshList();
          }
        });
      } : null;
      refreshList = () => {
        const list = arrangeSongs(view.tracks, tools);
        // 歌单内搜索点击歌曲时，队列始终保留完整歌单（按当前排序），而非仅限搜索结果
        const fullQueue = arrangeSongs(view.tracks, Object.assign({}, tools, { query: '' }));
        listBar.setCount(list.length);
        listHost.replaceChildren();
        if (list.length) {
          listHost.appendChild(songListCard(list, fullQueue, {
            preserveQueue: !!view.preserveQueue,
            onRemove: removeSingleSong,
            removeLabel: view.kind === 'recent' ? '从最近播放移除' : (view.kind === 'favorites' ? '取消收藏' : '从歌单移除'),
            onSwitchPlatform: switchSongInPlaylist,
            switchContext: canSwitchInPlaylist ? { mode: 'playlist', playlistView: view, onReplaced: () => refreshList() } : null,
            onLikeChanged: view.kind === 'favorites' ? () => {
              view.tracks = S.favorites.slice();
              countLine.textContent = view.tracks.length + ' 首歌曲 · 我的收藏';
              refreshList();
            } : null,
          }));
          if (!view.scrolledToPlaying && S.current && !S.scrollMemory[scrollKey(view)]) {
            const activeIndex = list.findIndex(item => identity(item) === identity(S.current));
            if (activeIndex >= 0) {
              view.scrolledToPlaying = true;
              setTimeout(() => {
                const playingNode = listHost.querySelector('.song-row.playing');
                if (playingNode) playingNode.scrollIntoView({ block: 'center', behavior: 'smooth' });
                else if (activeIndex > 4) {
                  const appEl = $('#app');
                  if (appEl) appEl.scrollTo({ top: Math.max(0, listHost.offsetTop + activeIndex * 68 - appEl.clientHeight * 0.4), behavior: 'smooth' });
                }
              }, 160);
            }
          }
        }
        else listHost.appendChild(h('div', 'empty-hint', '没有匹配的歌曲'));
      };
      refreshList();
      void hydrateCovers(view.tracks, () => {
        if (!heroCover && hero.isConnected) {
          const foundCover = rawCoverOf(view.tracks.find(t => rawCoverOf(t)));
          if (foundCover) {
            view.cover = foundCover;
            hero.style.setProperty('--hero-cover', 'url("' + coverUrl(foundCover).replace(/"/g, '%22') + '")');
            hero.classList.add('has-ambient');
            art.replaceChildren();
            art.style.backgroundImage = 'url("' + coverUrl(foundCover).replace(/"/g, '%22') + '"), linear-gradient(135deg,' + heroGrad[0] + ',' + heroGrad[1] + ')';
          }
        }
        if (view.kind === 'builtin' && window.desktopWindow?.replaceBuiltInPlaylistTracks) {
          clearTimeout(view.persistCoversTimer);
          view.persistCoversTimer = setTimeout(() => {
            window.desktopWindow.replaceBuiltInPlaylistTracks(view.id, view.tracks).then(res => {
              if (res && Array.isArray(res.playlists)) S.library = res.playlists;
            }).catch(() => {});
          }, 900);
        }
      });
    }
    if(view.warning)root.appendChild(h('div','empty-hint',view.warning));
  }

  /* ---------------- settings ---------------- */
  function settingSelect(title, detail, items, value, onChange) {
    const row = h('div', 'setting-row');
    const copy = h('div', 'copy'); copy.appendChild(h('strong', '', title)); if (detail) copy.appendChild(h('small', '', detail));
    let current = value;
    const labelFor = value => (items.find(item => item[0] === value) || [value, value])[1];
    const trigger = h('button', 'setting-select-trigger glass light');
    trigger.type = 'button'; trigger.setAttribute('aria-label', title);
    const valueText = h('span', 'value', labelFor(current));
    trigger.append(valueText);
    trigger.onclick = () => openAnchoredMenu(trigger, items.map(item => ({
      label: item[1], checked: item[0] === current,
      action: () => { current = item[0]; valueText.textContent = labelFor(current); onChange(item[0]); }
    })));
    row.append(copy, trigger); return row;
  }
  function settingSwitch(title, detail, value, onChange) {
    const row = h('div', 'setting-row');
    const copy = h('div', 'copy'); copy.appendChild(h('strong', '', title)); if (detail) copy.appendChild(h('small', '', detail));
    const btn = h('button', 'switch' + (value ? ' on' : ''));
    btn.type = 'button'; btn.setAttribute('aria-label', title);
    btn.onclick = () => { const next = !btn.classList.contains('on'); btn.classList.toggle('on', next); onChange(next); };
    row.append(copy, btn); return row;
  }
  function settingLinkRow(title, detail, trailing, onClick) {
    const row = h('div', 'setting-row setting-link-row');
    const copy = h('div', 'copy');
    copy.appendChild(h('strong', '', title));
    if (detail) copy.appendChild(h('small', '', detail));
    const right = h('span', 'value', trailing || '›');
    row.append(copy, right);
    row.onclick = onClick;
    return row;
  }
  function renderSettings() {
    if (deferPageRefresh()) return;
    S.tab = 'settings';
    setBodyMode('tab');
    setHeader('设置', '', { actions: [] });
    const root = mainRoot();
    const qualityShort = S.quality === 'flac' ? '无损' : S.quality === '320k' ? '高品质' : '标准';
    const themeShort = S.appearance === 'light' ? '浅色' : S.appearance === 'dark' ? '深色' : '跟随系统';
    const styleLabel = (MINE_STYLES.find(item => item[0] === S.styleName) || [])[1] || '默认动效';
    const scalePct = Math.round((Number(S.lyricFontSize) || 1) * 100);
    const spacingPct = Math.round((Number(S.lyricLineSpacing) || 1.2) * 100);
    const limitLabel = S.lyricMaxLines > 0 ? (S.lyricMaxLines + ' 行') : '铺满';

    root.appendChild(h('div', 'setting-title', '音乐源'));
    const sourceCard = h('div', 'settings-card');
    const active = (S.sources || []).find(item => item.id === S.activeSourceId) || S.sources[0];
    sourceCard.appendChild(settingLinkRow(
      active ? active.name : '未添加音源',
      (S.sources.length || 0) + ' 个音源 · 当前使用',
      '›',
      () => pushView({ name: 'sources', title: '音源', main: true })
    ));
    root.appendChild(sourceCard);

    root.appendChild(h('div', 'setting-title', '个性化与播放'));
    const personalCard = h('div', 'settings-card');
    personalCard.appendChild(settingLinkRow(
      '播放与音效',
      `${qualityShort} · ${audioFxSummary()}${S.autoMixEnabled ? ' · 混韵天成' : ''}`,
      '›',
      () => pushView({ name: 'settings-playback', title: '播放与音效', main: false })
    ));
    personalCard.appendChild(settingLinkRow(
      '外观与背景',
      `${themeShort} · ${styleLabel}${S.pageBgImage ? ' · 自定义页面背景' : ''}`,
      '›',
      () => pushView({ name: 'settings-appearance', title: '外观与背景', main: false })
    ));
    personalCard.appendChild(settingLinkRow(
      '歌词设置',
      `字号 ${scalePct}% · 行距 ${spacingPct}% · ${limitLabel}`,
      '›',
      () => pushView({ name: 'lyrics-settings', title: '歌词设置', main: false })
    ));
    root.appendChild(personalCard);

    root.appendChild(h('div', 'setting-title', '系统与互联'));
    const systemCard = h('div', 'settings-card');
    systemCard.appendChild(settingLinkRow(
      '下载管理',
      (S.downloads || []).filter(item => item.state === 'complete').length + ' 首已完成',
      '查看',
      () => pushView({ name: 'downloads', title: '下载', main: true })
    ));
    systemCard.appendChild(settingLinkRow(
      '局域网同步',
      S.lanAutoSync ? '已开启信任圈自动同步 · 手机、平板与电脑双向合并' : '设备信任圈 · 手机、平板与电脑之间双向同步歌单、音源与设置',
      '管理',
      openSyncPanel
    ));
    systemCard.appendChild(settingLinkRow(
      '快捷键',
      S.globalShortcutsEnabled !== false ? '已开启全局快捷键 · 支持自定义按键' : '仅应用内快捷键 · 支持自定义按键',
      '›',
      () => pushView({ name: 'settings-shortcuts', title: '快捷键', main: false })
    ));
    systemCard.appendChild(settingLinkRow(
      '通用与交互',
      '启动行为、托盘、壁纸模式 (Beta) 与不感兴趣管理',
      '›',
      () => pushView({ name: 'settings-general', title: '通用与交互', main: false })
    ));
    root.appendChild(systemCard);

    root.appendChild(h('div', 'setting-title', '关于'));
    const about = h('div', 'settings-card');
    const aboutRow = h('div', 'setting-row');
    const aboutCopy = h('div', 'copy'); aboutCopy.appendChild(h('strong', '', 'LxMine')); aboutCopy.appendChild(h('small', '', 'LX 音源 · MineRadio 视觉 · 全端统一体验'));
    const versionBadge = h('span', 'value', S.appVersion || '1.3.0');
    if (!S.appVersion && typeof window.lxMusic?.version === 'function') {
      window.lxMusic.version().then((ver) => {
        if (ver) { S.appVersion = String(ver); versionBadge.textContent = S.appVersion; }
      }).catch(() => {});
    }
    aboutRow.append(aboutCopy, versionBadge);
    about.appendChild(aboutRow);
    const updateRow = h('div', 'setting-row');
    const updateCopy = h('div', 'copy');
    updateCopy.appendChild(h('strong', '', '检查更新'));
    updateCopy.appendChild(h('small', '', '自动通过国内加速镜像获取 GitHub 最新版本并覆盖升级'));
    const updateBtn = h('button', 'pill-btn accent', '检查');
    updateBtn.onclick = () => checkAppUpdate(false, updateBtn);
    updateRow.append(updateCopy, updateBtn);
    about.appendChild(updateRow);
    root.appendChild(about);
  }

  function buildAudioFxEditor(onChanged) {
    const wrap = h('div', '');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '12px';
    const presets = (window.LxMineAudioFx && window.LxMineAudioFx.PRESETS) || [];
    const bandLabels = (window.LxMineAudioFx && window.LxMineAudioFx.BAND_LABELS) || ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'];

    const renderBody = () => {
      wrap.replaceChildren();
      const norm = window.LxMineAudioFx ? window.LxMineAudioFx.normalizeConfig(S.audioFx) : S.audioFx;
      const chips = h('div', 'fx-chip-wrap');
      presets.forEach(p => {
        const chip = h('button', 'fx-chip' + (norm.preset === p.id ? ' active' : ''), p.label);
        chip.type = 'button';
        chip.onclick = () => {
          applyAudioFx({
            preset: p.id,
            customBands: p.id === 'custom' ? (norm.customBands || [0,0,0,0,0]) : p.bands.slice(),
            spatial: p.spatial,
            reverb: p.reverb
          });
          renderBody();
          if (onChanged) onChanged();
        };
        chips.appendChild(chip);
      });
      wrap.appendChild(chips);

      const spRow = h('div', 'fx-inline-row');
      const spCopy = h('div', 'fx-inline-copy');
      spCopy.append(h('strong', '', '3D 空间环绕'), h('small', '', 'Mid-Side 立体声拓宽 + 双耳 Haas 延迟，声场立体感更明显'));
      const spBtn = h('button', 'switch' + (norm.spatial ? ' on' : ''));
      spBtn.type = 'button';
      spBtn.setAttribute('aria-label', '3D 空间环绕');
      spBtn.onclick = () => {
        applyAudioFx(Object.assign({}, norm, { spatial: !norm.spatial }));
        renderBody();
        if (onChanged) onChanged();
      };
      spRow.append(spCopy, spBtn);
      wrap.appendChild(spRow);

      const spatialAudioRow = h('div', 'fx-inline-row has-chips');
      const saCopy = h('div', 'fx-inline-copy');
      saCopy.append(h('strong', '', '空间音频（Spatial Audio）'), h('small', '', '适配空间音频耳机与 Windows Sonic / Dolby Atmos / DTS'));
      const saChips = h('div', 'fx-chip-wrap');
      const curSpMode = (S.audioFx && S.audioFx.spatialMode) || 'off';
      [['off', '关闭'], ['hrtf', '双耳 HRTF'], ['system', '系统直通']].forEach(([id, label]) => {
        const b = h('button', 'fx-chip' + (curSpMode === id ? ' active' : ''), label);
        b.type = 'button';
        b.onclick = () => {
          applyAudioFx(Object.assign({}, norm, { spatialMode: id }));
          renderBody();
          if (onChanged) onChanged();
        };
        saChips.appendChild(b);
      });
      spatialAudioRow.append(saCopy, saChips);
      wrap.appendChild(spatialAudioRow);

      const revRow = h('div', 'fx-inline-row has-chips');
      revRow.appendChild(h('span', '', '空间混响'));
      const revChips = h('div', 'fx-chip-wrap');
      [['none', '无混响'], ['small', '室内混响'], ['hall', '音乐厅']].forEach(([id, label]) => {
        const b = h('button', 'fx-chip' + (norm.reverb === id ? ' active' : ''), label);
        b.type = 'button';
        b.onclick = () => {
          applyAudioFx(Object.assign({}, norm, { reverb: id }));
          renderBody();
          if (onChanged) onChanged();
        };
        revChips.appendChild(b);
      });
      revRow.appendChild(revChips);
      wrap.appendChild(revRow);

      const eqTitle = h('div', 'fx-inline-row');
      eqTitle.appendChild(h('small', 'muted', '5 段均衡器（-12dB ~ +12dB）'));
      if (norm.preset === 'custom') {
        const tag = h('small', '', '已自定义');
        tag.style.color = 'var(--accent)';
        eqTitle.appendChild(tag);
      }
      wrap.appendChild(eqTitle);

      const bands = (norm.bands || [0,0,0,0,0]).slice(0, 5);
      bandLabels.forEach((label, idx) => {
        const row = h('div', 'fx-eq-row');
        row.appendChild(h('span', 'fx-eq-label', label));
        const slider = h('input');
        slider.type = 'range'; slider.min = '-12'; slider.max = '12'; slider.step = '1';
        slider.value = String(bands[idx] || 0);
        const val = h('span', 'fx-eq-val', (bands[idx] > 0 ? '+' : '') + (bands[idx] || 0) + 'dB');
        const eqReset = makeSliderResetBtn(label + ' 增益', () => {
          const next = bands.slice();
          next[idx] = 0;
          bands[idx] = 0;
          slider.value = '0';
          val.textContent = '0dB';
          eqReset.classList.remove('modified');
          const allZero = next.every(v => !v);
          applyAudioFx(Object.assign({}, norm, { preset: allZero && norm.preset === 'custom' ? 'off' : 'custom', customBands: next }), true);
          if (onChanged) onChanged();
          renderBody();
        }, (bands[idx] || 0) !== 0);
        slider.oninput = () => {
          const next = bands.slice();
          next[idx] = Math.max(-12, Math.min(12, Math.round(Number(slider.value) || 0)));
          bands[idx] = next[idx];
          val.textContent = (next[idx] > 0 ? '+' : '') + next[idx] + 'dB';
          eqReset.classList.toggle('modified', next[idx] !== 0);
          applyAudioFx(Object.assign({}, norm, { preset: 'custom', customBands: next }), false);
          if (onChanged) onChanged();
        };
        slider.onchange = () => { saveStore(); renderBody(); };
        row.append(slider, val, eqReset);
        wrap.appendChild(row);
      });
    };
    renderBody();
    return wrap;
  }

  function renderPlaybackSettings() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    setHeader('播放与音效', '音质、混韵天成、音量与均衡器', { back: goBack });
    const root = mainRoot();
    root.appendChild(h('div', 'setting-title', '播放选项'));
    const card = h('div', 'settings-card');
    card.appendChild(settingSelect('音质', '播放和下载优先使用该档位', [['128k', '标准 128k'], ['320k', '高品质 320k'], ['flac', '无损 FLAC']], S.quality, value => {
      S.quality = value; saveStore();
      const qLabel = value === 'flac' ? '无损 FLAC' : value === '320k' ? '高品质 320k' : '标准 128k';
      notify('已切换音质为 ' + qLabel);
      if (S.current) playSong(S.current, S.queue, { startMs: S.position });
    }));
    card.appendChild(settingSelect('播放顺序', '列表循环 / 单曲 / 随机 / 顺序', [['列表循环', '列表循环'], ['单曲循环', '单曲循环'], ['随机播放', '随机播放'], ['顺序播放', '顺序播放']], S.mode, value => { S.mode = value; saveStore(); updateDock(); }));
    const volRow = h('div', 'setting-row');
    const volCopy = h('div', 'copy');
    volCopy.append(h('strong', '', '播放音量'), h('small', '', '全局音频输出音量（0%–100%）'));
    const volCtrl = h('div', 'bg-opacity-ctrl');
    const volSlider = h('input', 'bg-opacity-slider');
    volSlider.type = 'range'; volSlider.min = '0'; volSlider.max = '100'; volSlider.step = '1';
    volSlider.value = String(Math.round(S.volume * 100));
    const volVal = h('span', 'bg-opacity-val', Math.round(S.volume * 100) + '%');
    const volReset = makeSliderResetBtn('播放音量', () => {
      setVolume(defaults.volume, true);
      volSlider.value = String(Math.round(defaults.volume * 100));
      volVal.textContent = Math.round(defaults.volume * 100) + '%';
      volReset.classList.remove('modified');
    }, Math.abs(S.volume - defaults.volume) > 0.005);
    volSlider.oninput = () => {
      const pct = Math.round(Number(volSlider.value) || 0);
      setVolume(pct / 100, false);
      volVal.textContent = pct + '%';
      volReset.classList.toggle('modified', Math.abs(S.volume - defaults.volume) > 0.005);
    };
    volSlider.onchange = () => saveStore();
    volCtrl.append(volSlider, volVal, volReset);
    volRow.append(volCopy, volCtrl);
    card.appendChild(volRow);

    const transRow = h('div', 'setting-row');
    const transCopy = h('div', 'copy');
    const transTitleWrap = h('div', 'setting-row-title-wrap');
    transTitleWrap.appendChild(h('strong', '', '混韵天成'));
    const transTipBtn = h('button', 'smart-info-btn', '!');
    transTipBtn.type = 'button';
    transTipBtn.setAttribute('aria-label', '混韵天成说明');
    transTipBtn.onclick = e => { e.stopPropagation(); openPlayTransitionInfoModal(); };
    transTitleWrap.appendChild(transTipBtn);
    transCopy.append(transTitleWrap, h('small', '', '自动分析队列相邻歌曲节奏与尾奏/前奏，平滑淡出淡入衔接'));
    const transSw = h('button', 'switch' + (S.autoMixEnabled === true ? ' on' : ''));
    transSw.type = 'button';
    transSw.setAttribute('aria-label', '混韵天成');
    transSw.onclick = () => {
      const next = !transSw.classList.contains('on');
      transSw.classList.toggle('on', next);
      S.autoMixEnabled = next;
      if (!next) cancelAutoMix();
      else refreshAutoMixPlan();
      saveStore();
      notify(next ? '已开启混韵天成' : '已关闭混韵天成');
    };
    transRow.append(transCopy, transSw);
    card.appendChild(transRow);

    card.appendChild(settingSwitch('播放/暂停淡入淡出', '开始播放与暂停时声音平滑渐强、渐弱过渡，避免戛然而止', S.playPauseFadeEnabled !== false, value => {
      S.playPauseFadeEnabled = value;
      saveStore();
      notify(value ? '已开启播放/暂停淡入淡出' : '已关闭播放/暂停淡入淡出');
    }));
    card.appendChild(settingSwitch('切歌自动归位舞台视角', '开启后每次切歌将 360° 舞台视角平滑回正；关闭则保持上一首的旋转角度', S.stageResetCameraOnSong !== false, value => {
      S.stageResetCameraOnSong = value;
      saveStore();
      pushStageMetadata();
      notify(value ? '已开启切歌自动归位舞台视角' : '已关闭切歌自动归位舞台视角');
    }));
    root.appendChild(card);

    root.appendChild(h('div', 'setting-title', '音效与均衡器'));
    const fxCard = h('div', 'settings-card');
    const fxPad = h('div', '');
    fxPad.style.padding = '16px 18px';
    const fxHead = h('div', 'fx-inline-row');
    fxHead.style.marginBottom = '12px';
    const fxHeadCopy = h('div', 'fx-inline-copy');
    fxHeadCopy.append(h('strong', '', '当前音效'), h('small', '', '可在播控栏「更多」中随时快速切换'));
    const fxHeadVal = h('span', '', audioFxSummary());
    fxHeadVal.style.color = 'var(--accent)';
    fxHeadVal.style.fontSize = '13px';
    fxHead.append(fxHeadCopy, fxHeadVal);
    fxPad.append(fxHead, buildAudioFxEditor(() => { fxHeadVal.textContent = audioFxSummary(); }));
    fxCard.appendChild(fxPad);
    root.appendChild(fxCard);
  }

  function renderAppearanceSettings() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    setHeader('外观与背景', '深浅色主题、MineRadio 动效与自定义背景', { back: goBack });
    const root = mainRoot();
    root.appendChild(h('div', 'setting-title', '主题与动效'));
    const themeCard = h('div', 'settings-card');
    themeCard.appendChild(settingSelect('外观', '全局深浅色配色，页面自定义背景蒙层自动适配可读性', [['dark', '深色'], ['light', '浅色'], ['system', '跟随系统']], S.appearance, value => {
      S.appearance = value; saveStore(); applyAppearance();
    }));

    const styleRow = h('div', 'setting-row');
    const styleCopy = h('div', 'copy');
    const titleWrap = h('div', 'setting-row-title-wrap');
    titleWrap.appendChild(h('strong', '', 'MineRadio 动效'));
    const styleSub = h('small', '', S.styleName === SMART_MODE_ID && resolvedStyleLabel()
      ? ('随声绘色已开启 · 当前匹配：' + resolvedStyleLabel())
      : '仅播放页生效；选「随声绘色」由 AI 按歌曲内容与封面自动匹配');
    styleCopy.append(titleWrap, styleSub);
    const styleTrigger = h('button', 'setting-select-trigger glass light');
    styleTrigger.type = 'button'; styleTrigger.setAttribute('aria-label', 'MineRadio 动效');
    const styleVal = h('span', 'value', (MINE_STYLES.find(item => item[0] === S.styleName) || [])[1] || '音域回响 · 地形');
    styleTrigger.appendChild(styleVal);
    styleTrigger.onclick = () => openAnchoredMenu(styleTrigger, MINE_STYLES.map(([value, label]) => {
      const entry = {
        label,
        checked: S.styleName === value,
        action: () => {
          S.styleName = value;
          if (value === SMART_MODE_ID) updateSmartStage(false);
          saveStore(); pushStageMetadata();
          styleVal.textContent = label;
          styleSub.textContent = value === SMART_MODE_ID && resolvedStyleLabel()
            ? ('随声绘色已开启 · 当前匹配：' + resolvedStyleLabel())
            : '仅播放页生效；选「随声绘色」由 AI 按歌曲内容与封面自动匹配';
          notify('动效：' + label);
        }
      };
      if (value === SMART_MODE_ID) {
        const infoBtn = h('button', 'smart-info-btn', '!');
        infoBtn.type = 'button'; infoBtn.setAttribute('aria-label', '什么是随声绘色');
        infoBtn.onclick = ev => { ev.stopPropagation(); openSmartStageInfoModal(); };
        entry.trailingNode = infoBtn;
      }
      return entry;
    }));
    styleRow.append(styleCopy, styleTrigger);
    themeCard.appendChild(styleRow);
    root.appendChild(themeCard);

    root.appendChild(h('div', 'setting-title', '播放页背景'));
    const stageBgCard = h('div', 'settings-card');
    const bgImgRow = h('div', 'setting-row');
    const bgImgCopy = h('div', 'copy');
    bgImgCopy.appendChild(h('strong', '', '播放页自定义背景图'));
    const bgImgSub = h('small', '', S.stageBgImage ? '已启用自定义背景图（所有播放页模式生效）' : '默认跟随当前歌曲专辑封面');
    bgImgCopy.appendChild(bgImgSub);
    const bgImgActs = h('div', 'bg-img-actions');
    const bgPickBtn = h('button', 'pill-btn accent', '选择图片');
    bgPickBtn.type = 'button';
    const bgResetBtn = h('button', 'pill-btn', '恢复默认');
    bgResetBtn.type = 'button';
    bgResetBtn.style.display = S.stageBgImage ? '' : 'none';
    bgPickBtn.onclick = () => pickStageBgImage(() => {
      bgImgSub.textContent = '已启用自定义背景图（所有播放页模式生效）';
      bgResetBtn.style.display = '';
    });
    bgResetBtn.onclick = () => {
      saveStageBgImage('');
      bgImgSub.textContent = '默认跟随当前歌曲专辑封面';
      bgResetBtn.style.display = 'none';
      notify('已恢复默认专辑封面背景');
    };
    bgImgActs.append(bgPickBtn, bgResetBtn);
    bgImgRow.append(bgImgCopy, bgImgActs);
    stageBgCard.appendChild(bgImgRow);

    const bgOpRow = h('div', 'setting-row');
    const bgOpCopy = h('div', 'copy');
    bgOpCopy.appendChild(h('strong', '', '播放页背景透明度'));
    bgOpCopy.appendChild(h('small', '', '实时调节封面或自定义背景图的透明程度，所有动效模式生效'));
    const bgOpCtrl = h('div', 'bg-opacity-ctrl');
    const bgOpVal = h('span', 'bg-opacity-val', Math.round(S.stageBgOpacity * 100) + '%');
    const bgOpSlider = h('input', 'bg-opacity-slider');
    bgOpSlider.type = 'range'; bgOpSlider.min = '0'; bgOpSlider.max = '100'; bgOpSlider.step = '1';
    bgOpSlider.value = String(Math.round(S.stageBgOpacity * 100));
    const bgOpResetBtn = makeSliderResetBtn('播放页背景透明度', () => {
      S.stageBgOpacity = defaults.stageBgOpacity;
      bgOpSlider.value = String(Math.round(S.stageBgOpacity * 100));
      bgOpVal.textContent = Math.round(S.stageBgOpacity * 100) + '%';
      bgOpResetBtn.classList.remove('modified');
      saveStore();
      pushStageBackground();
      notify('已恢复默认背景透明度');
    }, Math.abs(S.stageBgOpacity - defaults.stageBgOpacity) > 0.005);
    bgOpSlider.oninput = () => {
      S.stageBgOpacity = Math.max(0, Math.min(1, Number(bgOpSlider.value) / 100));
      bgOpVal.textContent = Math.round(S.stageBgOpacity * 100) + '%';
      bgOpResetBtn.classList.toggle('modified', Math.abs(S.stageBgOpacity - defaults.stageBgOpacity) > 0.005);
      pushStageBackground();
    };
    bgOpSlider.onchange = () => saveStore();
    bgOpCtrl.append(bgOpSlider, bgOpVal, bgOpResetBtn);
    bgOpRow.append(bgOpCopy, bgOpCtrl);
    stageBgCard.appendChild(bgOpRow);
    root.appendChild(stageBgCard);

    root.appendChild(h('div', 'setting-title', '非播放页背景（首页 / 曲库 / 设置）'));
    const pageBgCard = h('div', 'settings-card');
    const pImgRow = h('div', 'setting-row');
    const pImgCopy = h('div', 'copy');
    pImgCopy.appendChild(h('strong', '', '页面自定义背景图'));
    const pImgSub = h('small', '', S.pageBgImage ? '已启用自定义背景，自动适配深浅色可读蒙层' : '默认使用纯净深浅主题底色');
    pImgCopy.appendChild(pImgSub);
    const pImgActs = h('div', 'bg-img-actions');
    const pPickBtn = h('button', 'pill-btn accent', '选择图片');
    pPickBtn.type = 'button';
    const pResetBtn = h('button', 'pill-btn', '恢复默认');
    pResetBtn.type = 'button';
    pResetBtn.style.display = S.pageBgImage ? '' : 'none';
    pPickBtn.onclick = () => pickPageBgImage(() => renderAppearanceSettings());
    pResetBtn.onclick = () => {
      savePageBgImage('');
      notify('已恢复默认页面背景');
      renderAppearanceSettings();
    };
    pImgActs.append(pPickBtn, pResetBtn);
    pImgRow.append(pImgCopy, pImgActs);
    pageBgCard.appendChild(pImgRow);

    if (S.pageBgImage) {
      const pOpRow = h('div', 'setting-row');
      const pOpCopy = h('div', 'copy');
      pOpCopy.append(h('strong', '', '背景显示强度'), h('small', '', '深浅模式下自动叠加文字可读保护蒙层（10%–85%）'));
      const pOpCtrl = h('div', 'bg-opacity-ctrl');
      const pOpVal = h('span', 'bg-opacity-val', Math.round(S.pageBgOpacity * 100) + '%');
      const pOpSlider = h('input', 'bg-opacity-slider');
      pOpSlider.type = 'range'; pOpSlider.min = '10'; pOpSlider.max = '85'; pOpSlider.step = '1';
      pOpSlider.value = String(Math.round(S.pageBgOpacity * 100));
      const pOpResetBtn = makeSliderResetBtn('背景显示强度', () => {
        S.pageBgOpacity = defaults.pageBgOpacity;
        pOpSlider.value = String(Math.round(S.pageBgOpacity * 100));
        pOpVal.textContent = Math.round(S.pageBgOpacity * 100) + '%';
        pOpResetBtn.classList.remove('modified');
        saveStore();
        applyPageCustomBg();
      }, Math.abs(S.pageBgOpacity - defaults.pageBgOpacity) > 0.005);
      pOpSlider.oninput = () => {
        S.pageBgOpacity = Math.max(0.10, Math.min(0.85, Number(pOpSlider.value) / 100));
        pOpVal.textContent = Math.round(S.pageBgOpacity * 100) + '%';
        pOpResetBtn.classList.toggle('modified', Math.abs(S.pageBgOpacity - defaults.pageBgOpacity) > 0.005);
        applyPageCustomBg();
      };
      pOpSlider.onchange = () => saveStore();
      pOpCtrl.append(pOpSlider, pOpVal, pOpResetBtn);
      pOpRow.append(pOpCopy, pOpCtrl);
      pageBgCard.appendChild(pOpRow);
    }
    root.appendChild(pageBgCard);
  }

  function renderGeneralSettings() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    setHeader('通用与交互', '启动行为、窗口与推荐管理', { back: goBack });
    const root = mainRoot();
    root.appendChild(h('div', 'setting-title', '行为与交互'));
    const card = h('div', 'settings-card');
    card.appendChild(settingSwitch('启动时继续播放上次内容', '默认关闭，保留上次歌曲和进度，打开软件保持暂停', S.resumeOnStartup === true, value => { S.resumeOnStartup = value; saveStore(); }));
    card.appendChild(settingSwitch('双击刷新同步重算推荐', '双击首页左上角标题刷新时，同时重洗猜你喜欢与每日推荐算法内容', S.refreshAlgoOnDoubleTap !== false, value => {
      S.refreshAlgoOnDoubleTap = value; saveStore();
      notify(value ? '已开启双击刷新同步重算推荐' : '双击刷新将仅更新常规首页板块');
    }));
    card.appendChild(settingSwitch('关闭窗口后留在托盘', '关闭主窗口时继续在后台播放', S.closeToTray, value => {
      S.closeToTray = value; saveStore();
      if (window.desktopWindow && window.desktopWindow.setCloseBehavior) window.desktopWindow.setCloseBehavior(value ? 'tray' : 'exit').catch(() => {});
      notify(value ? '关闭窗口后将继续在托盘运行' : '关闭窗口将退出应用');
    }));
    card.appendChild(settingSwitch('开机自动启动', '登录 Windows 后自动启动 LxMine', S.launchAtStartup, value => {
      S.launchAtStartup = value; saveStore();
      if (window.desktopWindow && window.desktopWindow.setLaunchAtStartup) window.desktopWindow.setLaunchAtStartup(value).then(result => { if (result && result.ok === false) notify('设置失败：' + (result.error || '系统不允许')); }).catch(error => notify('设置失败：' + error.message));
    }));
    const wpRow = h('div', 'setting-row');
    const wpCopy = h('div', 'copy');
    const wpTitleWrap = h('div', 'setting-row-title-wrap');
    wpTitleWrap.append(h('strong', '', '壁纸模式'), h('span', 'beta-pill', 'Beta'));
    wpCopy.append(wpTitleWrap, h('small', '', '半透明叠加铺满桌面（支持与 Wallpaper Engine 共存、无动效与随声绘色）；在此或托盘菜单关闭'));
    const wpSw = h('button', 'switch' + (S.wallpaperMode ? ' on' : ''));
    wpSw.type = 'button';
    wpSw.setAttribute('aria-label', '壁纸模式');
    wpSw.dataset.settingId = 'wallpaper-mode';
    wpSw.onclick = () => {
      const next = !wpSw.classList.contains('on');
      wpSw.classList.toggle('on', next);
      applyWallpaperMode(next);
    };
    wpRow.append(wpCopy, wpSw);
    card.appendChild(wpRow);
    const wpBgOpRow = h('div', 'setting-row');
    const wpBgCopy = h('div', 'copy');
    const wpBgPct = Math.round(S.wallpaperBgOpacity * 100);
    const wpBgTitle = h('strong', '', '壁纸背景不透明度 · ' + wpBgPct + '%');
    wpBgCopy.append(wpBgTitle, h('small', '', '0% 为完全透明（直接透出桌面/Wallpaper Engine，仅浮现动效与歌词），调高则增加封面雾化底色'));
    const wpBgCtrl = h('div', 'bg-opacity-ctrl');
    const wpBgSlider = h('input', 'bg-opacity-slider'); wpBgSlider.type = 'range'; wpBgSlider.min = '0'; wpBgSlider.max = '100'; wpBgSlider.step = '1'; wpBgSlider.value = String(wpBgPct);
    const wpBgReset = makeSliderResetBtn('壁纸背景不透明度', () => {
      S.wallpaperBgOpacity = defaults.wallpaperBgOpacity;
      const pct = Math.round(S.wallpaperBgOpacity * 100);
      wpBgSlider.value = String(pct);
      wpBgTitle.textContent = '壁纸背景不透明度 · ' + pct + '%';
      wpBgReset.classList.remove('modified');
      saveStore();
      pushStageMetadata();
    }, Math.abs(S.wallpaperBgOpacity - defaults.wallpaperBgOpacity) > 0.005);
    wpBgSlider.oninput = () => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(wpBgSlider.value) || 0)));
      S.wallpaperBgOpacity = pct / 100;
      wpBgTitle.textContent = '壁纸背景不透明度 · ' + pct + '%';
      wpBgReset.classList.toggle('modified', Math.abs(S.wallpaperBgOpacity - defaults.wallpaperBgOpacity) > 0.005);
      scheduleSaveStore();
      scheduleStageMetadataPush();
    };
    wpBgSlider.onchange = () => { saveStore(); pushStageMetadata(); };
    wpBgCtrl.append(wpBgSlider, wpBgReset);
    wpBgOpRow.append(wpBgCopy, wpBgCtrl);
    card.appendChild(wpBgOpRow);

    const wpAllOpRow = h('div', 'setting-row');
    const wpAllCopy = h('div', 'copy');
    const wpAllPct = Math.round(S.wallpaperOverallOpacity * 100);
    const wpAllTitle = h('strong', '', '壁纸前景不透明度 · ' + wpAllPct + '%');
    wpAllCopy.append(wpAllTitle, h('small', '', '调整桌面壁纸层中 3D 动效与歌词的整体可见度'));
    const wpAllCtrl = h('div', 'bg-opacity-ctrl');
    const wpAllSlider = h('input', 'bg-opacity-slider'); wpAllSlider.type = 'range'; wpAllSlider.min = '25'; wpAllSlider.max = '100'; wpAllSlider.step = '1'; wpAllSlider.value = String(wpAllPct);
    const wpAllReset = makeSliderResetBtn('壁纸前景不透明度', () => {
      S.wallpaperOverallOpacity = defaults.wallpaperOverallOpacity;
      const pct = Math.round(S.wallpaperOverallOpacity * 100);
      wpAllSlider.value = String(pct);
      wpAllTitle.textContent = '壁纸前景不透明度 · ' + pct + '%';
      wpAllReset.classList.remove('modified');
      saveStore();
      pushStageMetadata();
    }, Math.abs(S.wallpaperOverallOpacity - defaults.wallpaperOverallOpacity) > 0.005);
    wpAllSlider.oninput = () => {
      const pct = Math.max(25, Math.min(100, Math.round(Number(wpAllSlider.value) || 25)));
      S.wallpaperOverallOpacity = pct / 100;
      wpAllTitle.textContent = '壁纸前景不透明度 · ' + pct + '%';
      wpAllReset.classList.toggle('modified', Math.abs(S.wallpaperOverallOpacity - defaults.wallpaperOverallOpacity) > 0.005);
      scheduleSaveStore();
      scheduleStageMetadataPush();
    };
    wpAllSlider.onchange = () => { saveStore(); pushStageMetadata(); };
    wpAllCtrl.append(wpAllSlider, wpAllReset);
    wpAllOpRow.append(wpAllCopy, wpAllCtrl);
    card.appendChild(wpAllOpRow);

    card.appendChild(settingSwitch('同局域网自动同步歌单', '仅与已加入「设备信任圈」且开启自动同步的设备双向合并歌单与收藏', S.lanAutoSync === true, async value => {
      S.lanAutoSync = value; saveStore();
      if (value) await persistFavoritesToLibrary(false);
      window.lxMusic?.syncSetAuto?.(value).catch?.(() => {});
      notify(value ? '已开启同局域网歌单自动同步（仅限信任圈）' : '已关闭同局域网歌单自动同步');
    }));
    const disCount = (S.dislikedKeys || []).length;
    card.appendChild(settingLinkRow(
      '清空「不感兴趣」屏蔽列表',
      disCount ? `已屏蔽 ${disCount} 首歌曲，点击恢复推荐` : '暂无屏蔽歌曲',
      disCount ? '清空' : '无',
      () => { if (disCount) { clearDislikedSongs(); renderGeneralSettings(); } }
    ));
    root.appendChild(card);
  }

  /* ---------------- PC Keyboard Shortcuts Management (#4) ---------------- */
  function normalizeShortcutString(raw) {
    return String(raw || '').trim().replace(/\s+/g, '');
  }
  function shortcutEventToCombo(event) {
    const key = String(event.key || '');
    if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(key)) return '';
    const parts = [];
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    let main = key;
    if (key === ' ') main = 'Space';
    else if (key === 'ArrowUp') main = 'Up';
    else if (key === 'ArrowDown') main = 'Down';
    else if (key === 'ArrowLeft') main = 'Left';
    else if (key === 'ArrowRight') main = 'Right';
    else if (key.length === 1) main = key.toUpperCase();
    parts.push(main);
    return parts.join('+');
  }
  function toElectronAccelerator(combo) {
    const s = normalizeShortcutString(combo);
    if (!s || s === 'Space' || s === 'F11') return '';
    if (!/(Ctrl|Alt|Shift|CommandOrControl)\+/i.test(s)) return '';
    return s.replace(/^Ctrl\+/i, 'CommandOrControl+').replace(/\+Ctrl\+/i, '+CommandOrControl+');
  }
  function syncGlobalShortcuts() {
    if (!window.desktopWindow || !window.desktopWindow.configureGlobalHotkeys) return;
    if (S.globalShortcutsEnabled === false) {
      window.desktopWindow.configureGlobalHotkeys([]).catch(() => {});
      return;
    }
    const map = Object.assign({}, DEFAULT_SHORTCUTS, S.shortcuts || {});
    const bindings = [];
    SHORTCUT_META.forEach(([action, , , allowGlobal]) => {
      if (!allowGlobal) return;
      const acc = toElectronAccelerator(map[action]);
      if (acc) bindings.push({ action, accelerator: acc });
    });
    window.desktopWindow.configureGlobalHotkeys(bindings).catch(() => {});
  }
  let mutedPrevVolume = 0.8;
  function dispatchShortcutAction(action) {
    if (action === 'toggle') togglePlayback();
    else if (action === 'prev') nextSong(-1);
    else if (action === 'next') nextSong(1);
    else if (action === 'volUp') { setVolume(Math.min(1, S.volume + 0.05), true); notify('音量 ' + Math.round(S.volume * 100) + '%'); }
    else if (action === 'volDown') { setVolume(Math.max(0, S.volume - 0.05), true); notify('音量 ' + Math.round(S.volume * 100) + '%'); }
    else if (action === 'mute') {
      if (S.volume > 0.001) { mutedPrevVolume = S.volume; setVolume(0, true); notify('已静音'); }
      else { setVolume(Math.max(0.1, mutedPrevVolume || 0.8), true); notify('已取消静音'); }
    }
    else if (action === 'like') { if (S.current) toggleFavorite(S.current); }
    else if (action === 'detail') { if (S.detailOpen) closeDetail(); else openDetail(); }
    else if (action === 'immersive') { if (S.detailOpen) setDetailImmersive(!document.body.classList.contains('detail-immersive')); }
    else if (action === 'search') openSearch();
    else if (action === 'desktopLyrics') applyDesktopLyrics(!S.desktopLyrics);
    else if (action === 'lockLyrics') {
      S.desktopLyricsLocked = !S.desktopLyricsLocked; saveStore();
      window.desktopWindow?.setDesktopLyricsLocked?.(S.desktopLyricsLocked);
      notify(S.desktopLyricsLocked ? '已锁定桌面歌词' : '已解锁桌面歌词');
    }
    else if (action === 'cycleMode') cycleMode();
  }
  let shortcutRecorderCleanup = null;
  function renderShortcutSettings() {
    if (deferPageRefresh()) return;
    if (shortcutRecorderCleanup) { shortcutRecorderCleanup(); shortcutRecorderCleanup = null; }
    setBodyMode('secondary');
    setHeader('快捷键', '自定义应用内与 Windows 全局快捷键', { back: goBack });
    const root = mainRoot();
    const map = Object.assign({}, DEFAULT_SHORTCUTS, S.shortcuts || {});
    S.shortcuts = map;

    root.appendChild(h('div', 'setting-title', '全局快捷键'));
    const topCard = h('div', 'settings-card');
    topCard.appendChild(settingSwitch(
      '启用 Windows 全局快捷键',
      '带 Ctrl / Alt / Shift 组合的播放控制键在软件后台或最小化时也可响应',
      S.globalShortcutsEnabled !== false,
      value => {
        S.globalShortcutsEnabled = value;
        saveStore();
        syncGlobalShortcuts();
        notify(value ? '已开启全局快捷键' : '已关闭全局快捷键（仅应用内生效）');
      }
    ));
    const resetAllRow = settingLinkRow('恢复全部默认快捷键', '重置所有快捷键为初始方案', '全部重置', () => {
      S.shortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
      saveStore();
      syncGlobalShortcuts();
      renderShortcutSettings();
      notify('已恢复全部默认快捷键');
    });
    topCard.appendChild(resetAllRow);
    root.appendChild(topCard);

    root.appendChild(h('div', 'setting-title', '按键列表（点击按键录制，按 Esc 取消，Backspace 清除）'));
    const listCard = h('div', 'settings-card');
    let recordingAction = '';
    SHORTCUT_META.forEach(([action, label, desc]) => {
      const row = h('div', 'setting-row');
      const copy = h('div', 'copy');
      copy.append(h('strong', '', label), h('small', '', desc));
      const acts = h('div', 'shortcut-actions');
      const cap = h('button', 'shortcut-cap', map[action] || '未绑定');
      cap.type = 'button';
      const resetOne = h('button', 'pill-btn', '恢复');
      resetOne.type = 'button';
      resetOne.onclick = () => {
        S.shortcuts[action] = DEFAULT_SHORTCUTS[action];
        saveStore(); syncGlobalShortcuts(); renderShortcutSettings();
      };
      cap.onclick = () => {
        if (shortcutRecorderCleanup) { shortcutRecorderCleanup(); shortcutRecorderCleanup = null; }
        if (recordingAction === action) { recordingAction = ''; cap.classList.remove('recording'); cap.textContent = S.shortcuts[action] || '未绑定'; return; }
        recordingAction = action;
        cap.classList.add('recording');
        cap.textContent = '请按下按键…';
        const onKey = ev => {
          ev.preventDefault(); ev.stopPropagation();
          if (ev.key === 'Escape') { cleanup(); cap.textContent = S.shortcuts[action] || '未绑定'; return; }
          if (ev.key === 'Backspace' && !ev.ctrlKey && !ev.altKey && !ev.shiftKey) {
            S.shortcuts[action] = ''; saveStore(); syncGlobalShortcuts(); cleanup(); renderShortcutSettings(); return;
          }
          const combo = shortcutEventToCombo(ev);
          if (!combo) return;
          const dup = Object.keys(S.shortcuts).find(k => k !== action && S.shortcuts[k] === combo);
          if (dup) {
            const dupName = (SHORTCUT_META.find(m => m[0] === dup) || [])[1] || dup;
            notify(`快捷键 ${combo} 已被「${dupName}」占用`);
            return;
          }
          S.shortcuts[action] = combo;
          saveStore(); syncGlobalShortcuts(); cleanup(); renderShortcutSettings();
          notify(`已将「${label}」设为 ${combo}`);
        };
        const cleanup = () => {
          document.removeEventListener('keydown', onKey, true);
          recordingAction = '';
          cap.classList.remove('recording');
          shortcutRecorderCleanup = null;
        };
        shortcutRecorderCleanup = cleanup;
        document.addEventListener('keydown', onKey, true);
      };
      acts.append(cap, resetOne);
      row.append(copy, acts);
      listCard.appendChild(row);
    });
    root.appendChild(listCard);
  }

  let updateModalEl = null;
  let updateChecking = false;
  function closeUpdateModal() {
    if (updateModalEl) {
      const target = updateModalEl;
      updateModalEl = null;
      closeModal(target);
    }
  }
  function formatUpdateMb(bytes) {
    const n = Number(bytes) || 0;
    return n > 0 ? (n / 1048576).toFixed(1) + ' MB' : '';
  }
  function showUpdateModal(options) {
    closeUpdateModal();
    const backdrop = modal(null);
    const box = h('div', 'modal glass update-modal');
    const title = h('h2', '', options.title || '版本更新');
    const sub = h('p', 'muted update-modal-sub', options.subtitle || '');
    box.append(title);
    if (options.subtitle) box.append(sub);
    if (options.body) {
      const notes = h('div', 'update-modal-notes', options.body);
      box.append(notes);
    }
    const progressWrap = h('div', 'update-modal-progress hidden');
    const progressBar = h('div', 'update-modal-bar');
    const progressFill = h('div', 'update-modal-fill');
    progressBar.appendChild(progressFill);
    const progressText = h('div', 'update-modal-progress-text', '');
    progressWrap.append(progressBar, progressText);
    box.append(progressWrap);

    const actions = h('div', 'modal-actions');
    const secondaryBtn = h('button', 'pill-btn', options.secondaryLabel || '关闭');
    secondaryBtn.type = 'button';
    secondaryBtn.onclick = () => {
      if (options.onSecondary) options.onSecondary();
      else closeUpdateModal();
    };
    actions.appendChild(secondaryBtn);

    let primaryBtn = null;
    if (options.primaryLabel) {
      primaryBtn = h('button', 'pill-btn accent', options.primaryLabel);
      primaryBtn.type = 'button';
      primaryBtn.onclick = () => {
        if (options.onPrimary) {
          options.onPrimary({ primaryBtn, secondaryBtn, progressWrap, progressFill, progressText });
        }
      };
      actions.appendChild(primaryBtn);
    }
    box.append(actions);
    backdrop.appendChild(box);
    updateModalEl = backdrop;
    return { backdrop, primaryBtn, secondaryBtn, progressWrap, progressFill, progressText };
  }

  async function checkAppUpdate(silent = false, triggerBtn = null) {
    if (updateChecking || !window.lxMusic || typeof window.lxMusic.checkUpdate !== 'function') return;
    updateChecking = true;
    const origText = triggerBtn ? triggerBtn.textContent : '';
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = '检测中…'; }
    try {
      const info = await window.lxMusic.checkUpdate();
      if (!info || !info.ok) throw new Error('更新接口返回异常');
      if (!info.hasUpdate) {
        if (!silent) {
          showUpdateModal({
            title: '已是最新版本',
            subtitle: `当前版本 v${info.currentVersion} 已是最新，无需更新。`,
            secondaryLabel: '知道了',
          });
        }
        return;
      }
      const sizeStr = info.asset && info.asset.size ? ` · ${formatUpdateMb(info.asset.size)}` : '';
      const dateStr = info.publishedAt ? ` · ${String(info.publishedAt).slice(0, 10)}` : '';
      showUpdateModal({
        title: `发现新版本 v${info.latestVersion}`,
        subtitle: `v${info.currentVersion} → v${info.latestVersion}${sizeStr}${dateStr}`,
        body: info.notes || '包含最新功能优化与问题修复，支持在线下载并直接覆盖安装升级。',
        secondaryLabel: '稍后再说',
        primaryLabel: info.asset ? '立即更新并覆盖安装' : '前往发布页',
        onPrimary: async (ui) => {
          if (!info.asset) {
            if (window.desktopWindow && window.desktopWindow.openUpdatePage) window.desktopWindow.openUpdatePage(info.releaseUrl);
            closeUpdateModal();
            return;
          }
          let unsub = null;
          if (updateModalEl) updateModalEl.dataset.busy = '1';
          ui.primaryBtn.disabled = true;
          ui.primaryBtn.textContent = '正在下载…';
          ui.secondaryBtn.textContent = '取消下载';
          ui.secondaryBtn.onclick = async () => {
            try { await window.lxMusic.cancelUpdate(); } catch (_) {}
            if (unsub) unsub();
            closeUpdateModal();
          };
          ui.progressWrap.classList.remove('hidden');
          ui.progressFill.style.width = '4%';
          ui.progressText.textContent = '正在连接高速镜像通道…';
          unsub = window.lxMusic.onUpdateProgress((p) => {
            const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
            ui.progressFill.style.width = `${pct}%`;
            if (p.stage === 'installing') {
              ui.progressText.textContent = '下载完成，正在覆盖安装并自动重启…';
              ui.primaryBtn.textContent = '正在安装…';
              ui.secondaryBtn.disabled = true;
            } else {
              const recv = formatUpdateMb(p.received);
              const tot = formatUpdateMb(p.total);
              const mirrorTag = p.mirror ? `[${p.mirror}] ` : '';
              ui.progressText.textContent = `${mirrorTag}已下载 ${pct}%${tot ? `（${recv} / ${tot}）` : ''}`;
            }
          });
          try {
            await window.lxMusic.startUpdate(info.asset);
          } catch (err) {
            if (unsub) unsub();
            if (updateModalEl) delete updateModalEl.dataset.busy;
            ui.primaryBtn.disabled = false;
            ui.primaryBtn.textContent = '重试更新';
            ui.secondaryBtn.textContent = '关闭';
            ui.secondaryBtn.onclick = closeUpdateModal;
            ui.progressText.textContent = (err && err.message) ? err.message : '更新下载失败，请稍后重试';
          }
        },
      });
    } catch (err) {
      if (!silent) {
        showUpdateModal({
          title: '检查更新失败',
          subtitle: (err && err.message) ? `无法获取最新版本信息（${err.message}）` : '无法连接更新服务器，请检查网络后重试。',
          secondaryLabel: '关闭',
          primaryLabel: '重试',
          onPrimary: () => { closeUpdateModal(); checkAppUpdate(false, triggerBtn); },
        });
      }
    } finally {
      updateChecking = false;
      if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = origText || '检查'; }
    }
  }
  setTimeout(() => { checkAppUpdate(true).catch(() => {}); }, 5500);

  function hsvToHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = n => Math.max(0, Math.min(255, Math.round((n + m) * 255))).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }
  function hexToHsvColor(hex) {
    const clean = normalizeHexColor(hex, '#7dd3fc').slice(1);
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 1e-6) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * (((b - r) / d) + 2);
      else h = 60 * (((r - g) / d) + 4);
      if (h < 0) h += 360;
    }
    return { h, s: max > 1e-6 ? d / max : 0, v: max };
  }
  const GLASS_COLOR_SWATCHES = ['#7dd3fc', '#38bdf8', '#a5b4fc', '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#ffffff', '#1e293b'];
  function openGlassColorPicker(title, initialHex, onSelect) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', title || '选择颜色'));
    let hsv = hexToHsvColor(initialHex);
    const svWrap = h('div', 'cp-sv-wrap');
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 188;
    const cursor = h('div', 'cp-cursor');
    svWrap.append(canvas, cursor);
    const hueWrap = h('div', 'cp-hue-wrap');
    const hueInput = h('input', 'cp-hue');
    hueInput.type = 'range'; hueInput.min = '0'; hueInput.max = '359'; hueInput.step = '1';
    hueInput.value = String(Math.round(hsv.h));
    hueWrap.appendChild(hueInput);
    const swatches = h('div', 'cp-swatches');
    const hexRow = h('div', 'cp-hex-row');
    const preview = h('div', 'cp-preview');
    const hexInput = h('input'); hexInput.type = 'text'; hexInput.maxLength = 7; hexInput.spellcheck = false;
    hexRow.append(preview, hexInput);

    const drawSv = () => {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, ht = canvas.height;
      ctx.fillStyle = hsvToHex(hsv.h, 1, 1);
      ctx.fillRect(0, 0, w, ht);
      const wg = ctx.createLinearGradient(0, 0, w, 0);
      wg.addColorStop(0, '#ffffff'); wg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = wg; ctx.fillRect(0, 0, w, ht);
      const bg = ctx.createLinearGradient(0, 0, 0, ht);
      bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, '#000000');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, ht);
    };
    const syncUi = (emit) => {
      const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
      drawSv();
      cursor.style.left = (hsv.s * 100).toFixed(2) + '%';
      cursor.style.top = ((1 - hsv.v) * 100).toFixed(2) + '%';
      preview.style.background = hex;
      hexInput.value = hex.toUpperCase();
      hueInput.value = String(Math.round(hsv.h));
      swatches.querySelectorAll('.cp-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.hex === hex.toLowerCase()));
      if (emit && onSelect) onSelect(hex);
    };
    const pickFromPointer = ev => {
      const r = svWrap.getBoundingClientRect();
      hsv.s = Math.max(0, Math.min(1, (ev.clientX - r.left) / Math.max(1, r.width)));
      hsv.v = Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / Math.max(1, r.height)));
      syncUi(true);
    };
    svWrap.onpointerdown = ev => {
      svWrap.setPointerCapture?.(ev.pointerId);
      pickFromPointer(ev);
      const onMove = e => pickFromPointer(e);
      const onUp = () => { svWrap.removeEventListener('pointermove', onMove); svWrap.removeEventListener('pointerup', onUp); };
      svWrap.addEventListener('pointermove', onMove);
      svWrap.addEventListener('pointerup', onUp);
    };
    hueInput.oninput = () => { hsv.h = Number(hueInput.value) || 0; syncUi(true); };
    hexInput.onchange = () => {
      const clean = hexInput.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(clean)) {
        hsv = hexToHsvColor(clean.startsWith('#') ? clean : '#' + clean);
        syncUi(true);
      } else {
        syncUi(false);
      }
    };
    GLASS_COLOR_SWATCHES.forEach(hex => {
      const btn = h('button', 'cp-swatch');
      btn.type = 'button'; btn.dataset.hex = hex; btn.style.background = hex;
      btn.setAttribute('aria-label', hex);
      btn.onclick = () => { hsv = hexToHsvColor(hex); syncUi(true); };
      swatches.appendChild(btn);
    });
    const actions = h('div', 'modal-actions');
    const done = h('button', 'pill-btn accent', '完成'); done.type = 'button';
    done.onclick = () => { saveStore(); closeModal(backdrop); };
    actions.appendChild(done);
    box.append(svWrap, hueWrap, swatches, hexRow, actions);
    backdrop.appendChild(box);
    syncUi(false);
  }
  function lyricColorRow(title, detail, kind, modeKey, colorKey, color2Key) {
    const row = h('div', 'setting-row lyric-color-row');
    const copy = h('div', 'copy');
    copy.appendChild(h('strong', '', title));
    if (detail) copy.appendChild(h('small', '', detail));
    const controls = h('div', 'lyric-color-controls');
    const swatch = h('span', 'lyric-color-swatch');
    swatch.dataset.preview = kind;
    controls.appendChild(swatch);
    const mode = S[modeKey];
    if (mode === 'custom-solid' || mode === 'custom-gradient') {
      const makeChip = (label, key, fallback) => {
        const cur = normalizeHexColor(S[key], fallback);
        const btn = h('button', 'color-chip-btn');
        btn.type = 'button';
        const dot = h('span', 'color-chip-dot'); dot.style.background = cur;
        const txt = h('span', '', cur.toUpperCase());
        btn.append(dot, txt);
        btn.onclick = () => openGlassColorPicker(title + ' · ' + label, S[key] || fallback, nextHex => {
          S[key] = nextHex;
          dot.style.background = nextHex;
          txt.textContent = nextHex.toUpperCase();
          applyLyricTheme();
        });
        return btn;
      };
      controls.appendChild(makeChip('主色', colorKey, '#7dd3fc'));
      if (mode === 'custom-gradient') {
        controls.appendChild(makeChip('辅色', color2Key, '#a5b4fc'));
      }
    } else {
      const second = h('span', 'lyric-color-swatch secondary');
      second.dataset.preview = kind;
      controls.appendChild(second);
    }
    row.append(copy, controls);
    return row;
  }
  function lyricOffsetRow() {
    const row = h('div', 'setting-row');
    const copy = h('div', 'copy');
    copy.appendChild(h('strong', '', '歌词时间偏移'));
    copy.appendChild(h('small', '', '正值提前显示，负值延后显示'));
    const controls = h('div', 'offset-row');
    const input = h('input'); input.type = 'number'; input.min = '-10000'; input.max = '10000'; input.step = '50'; input.value = String(S.lyricOffset);
    const range = h('input'); range.type = 'range'; range.min = '-10000'; range.max = '10000'; range.step = '50'; range.value = String(S.lyricOffset);
    let reset = null;
    const apply = (value, commit) => {
      const snapped = Math.round((Number(value) || 0) / 50) * 50;
      S.lyricOffset = Math.max(-10000, Math.min(10000, snapped));
      input.value = String(S.lyricOffset);
      if (commit) range.value = String(S.lyricOffset);
      if (reset) reset.classList.toggle('modified', S.lyricOffset !== 0);
      if (commit) saveStore(); else scheduleSaveStore();
      syncLyric(true); pushDesktopLyrics(true); pushStageMetadata();
    };
    reset = makeSliderResetBtn('歌词时间偏移', () => apply(0, true), S.lyricOffset !== 0);
    input.onchange = () => apply(input.value, true);
    range.oninput = () => apply(range.value, false);
    range.onchange = () => apply(range.value, true);
    controls.append(input, range, reset);
    row.append(copy, controls);
    return row;
  }
  function lyricPreviewCard() {
    const card = h('div', 'lyric-settings-preview glass');
    const head = h('div', 'preview-head');
    head.appendChild(h('span', '', '实时预览'));
    head.appendChild(h('span', 'preview-note', '颜色会同步到详情页光效与桌面歌词'));
    card.appendChild(head);
    const detail = h('div', 'preview-row');
    detail.appendChild(h('span', 'preview-label', '详情页'));
    const detailLine = h('div', 'preview-line preview-detail-line');
    detailLine.appendChild(h('span', 'preview-main', '走进一层更深的蓝'));
    detailLine.appendChild(h('span', 'preview-sub', 'Into a deeper blue'));
    detail.appendChild(detailLine);
    const desktop = h('div', 'preview-row');
    desktop.appendChild(h('span', 'preview-label', '桌面歌词'));
    const desktopLine = h('div', 'preview-line preview-desktop-line');
    desktopLine.appendChild(h('span', 'preview-main', '沿着城市边缘的灯带'));
    desktopLine.appendChild(h('span', 'preview-sub', 'Along the lights at the city edge'));
    desktop.appendChild(desktopLine);
    card.append(detail, desktop);
    updateLyricPreview(card);
    return card;
  }
  function renderLyricsSettings() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    setHeader('歌词设置', '详情页歌词与桌面歌词', { back: goBack });
    const root = mainRoot();
    root.appendChild(lyricPreviewCard());

    root.appendChild(h('div', 'setting-title', '播放详情页歌词'));
    const detailCard = h('div', 'settings-card');
    detailCard.appendChild(settingSelect('颜色来源', '封面取色或自定义；渐变会作用于详情页光效', LYRIC_COLOR_MODES, S.lyricColorMode, value => {
      S.lyricColorMode = value; saveStore(); applyLyricTheme(); renderLyricsSettings();
    }));
    detailCard.appendChild(lyricColorRow('详情页颜色', '封面主色 / 辅色或自定义颜色', 'detail', 'lyricColorMode', 'lyricColor', 'lyricColor2'));
    const detailSizeRow = h('div', 'setting-row');
    const detailSizeCopy = h('div', 'copy');
    detailSizeCopy.appendChild(h('strong', '', '歌词字体大小'));
    detailSizeCopy.appendChild(h('small', '', '播放页歌词字号，支持调小至 55%–150%'));
    const detailSizeControls = h('div', 'lyric-size-controls');
    const detailSizeRange = h('input'); detailSizeRange.type = 'range'; detailSizeRange.min = '55'; detailSizeRange.max = '150'; detailSizeRange.step = '1'; detailSizeRange.value = String(Math.round((Number(S.lyricFontSize) || 1) * 100));
    const detailSizeValue = h('span', 'value', Math.round((Number(S.lyricFontSize) || 1) * 100) + '%');
    const detailSizeReset = makeSliderResetBtn('歌词字体大小', () => {
      S.lyricFontSize = defaults.lyricFontSize;
      const pct = Math.round(defaults.lyricFontSize * 100);
      detailSizeRange.value = String(pct);
      detailSizeValue.textContent = pct + '%';
      detailSizeReset.classList.remove('modified');
      saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
    }, Math.abs((Number(S.lyricFontSize) || 1) - defaults.lyricFontSize) > 0.005);
    detailSizeRange.oninput = () => {
      const pct = Math.max(55, Math.min(150, Math.round(Number(detailSizeRange.value) || 100)));
      S.lyricFontSize = pct / 100;
      detailSizeValue.textContent = pct + '%';
      detailSizeReset.classList.toggle('modified', Math.abs(S.lyricFontSize - defaults.lyricFontSize) > 0.005);
      scheduleSaveStore(); renderDetailLyrics(); syncLyric(true); scheduleStageMetadataPush();
    };
    detailSizeRange.onchange = () => { saveStore(); pushStageMetadata(); };
    detailSizeControls.append(detailSizeRange, detailSizeValue, detailSizeReset);
    detailSizeRow.append(detailSizeCopy, detailSizeControls);
    detailCard.appendChild(detailSizeRow);

    const spacingRow = h('div', 'setting-row');
    const spacingCopy = h('div', 'copy');
    spacingCopy.append(h('strong', '', '歌词行间距'), h('small', '', '英文与大字号下加大行距更舒展（85%–180%，默认 120%）'));
    const spacingControls = h('div', 'lyric-size-controls');
    const spacingRange = h('input'); spacingRange.type = 'range'; spacingRange.min = '85'; spacingRange.max = '180'; spacingRange.step = '1'; spacingRange.value = String(Math.round((Number(S.lyricLineSpacing) || 1.2) * 100));
    const spacingValue = h('span', 'value', Math.round((Number(S.lyricLineSpacing) || 1.2) * 100) + '%');
    const spacingReset = makeSliderResetBtn('歌词行间距', () => {
      S.lyricLineSpacing = defaults.lyricLineSpacing;
      const pct = Math.round(defaults.lyricLineSpacing * 100);
      spacingRange.value = String(pct);
      spacingValue.textContent = pct + '%';
      spacingReset.classList.remove('modified');
      saveStore(); pushStageMetadata();
    }, Math.abs((Number(S.lyricLineSpacing) || 1.2) - defaults.lyricLineSpacing) > 0.005);
    spacingRange.oninput = () => {
      const pct = Math.max(85, Math.min(180, Math.round(Number(spacingRange.value) || 120)));
      S.lyricLineSpacing = pct / 100;
      spacingValue.textContent = pct + '%';
      spacingReset.classList.toggle('modified', Math.abs(S.lyricLineSpacing - defaults.lyricLineSpacing) > 0.005);
      scheduleSaveStore(); scheduleStageMetadataPush();
    };
    spacingRange.onchange = () => { saveStore(); pushStageMetadata(); };
    spacingControls.append(spacingRange, spacingValue, spacingReset);
    spacingRow.append(spacingCopy, spacingControls);
    detailCard.appendChild(spacingRow);

    const maxLinesRow = h('div', 'setting-row');
    maxLinesRow.style.flexWrap = 'wrap';
    const maxLinesCopy = h('div', 'copy');
    maxLinesCopy.append(h('strong', '', '同时显示行数'), h('small', '', '默认铺满屏幕，也可固定单行或 3 / 5 / 7 / 9 行聚焦显示'));
    const maxLinesChips = h('div', 'lyric-lines-wrap');
    [[0, '铺满屏幕'], [1, '1 行'], [3, '3 行'], [5, '5 行'], [7, '7 行'], [9, '9 行']].forEach(([cnt, label]) => {
      const chip = h('button', 'lyric-line-chip' + (S.lyricMaxLines === cnt ? ' active' : ''), label);
      chip.type = 'button';
      chip.onclick = () => {
        S.lyricMaxLines = cnt;
        saveStore(); pushStageMetadata();
        maxLinesChips.querySelectorAll('.lyric-line-chip').forEach((n, i) => n.classList.toggle('active', [0,1,3,5,7,9][i] === cnt));
      };
      maxLinesChips.appendChild(chip);
    });
    maxLinesRow.append(maxLinesCopy, maxLinesChips);
    detailCard.appendChild(maxLinesRow);

    detailCard.appendChild(settingSwitch('显示翻译', '自动跨平台补齐外语歌曲中文翻译歌词', S.lyricShowTranslation, value => {
      S.lyricShowTranslation = value; saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
      if (value && S.current && !S.lyrics.some(l => l.translation)) loadLyrics(S.current, S.resolveToken, true);
    }));
    detailCard.appendChild(settingSwitch('显示音译 / 罗马音', '日韩外语歌词显示罗马音（无官源时自动智能转写）', S.lyricShowRomaji, value => {
      S.lyricShowRomaji = value; saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
      if (value && S.current && !S.lyrics.some(l => l.romaji)) loadLyrics(S.current, S.resolveToken, true);
    }));
    root.appendChild(detailCard);

    root.appendChild(h('div', 'setting-title', '桌面歌词'));
    const desktopCard = h('div', 'settings-card');
    desktopCard.appendChild(settingSwitch('显示桌面歌词', '在 Windows 桌面显示当前歌词', S.desktopLyrics, value => applyDesktopLyrics(value)));
    desktopCard.appendChild(settingSelect('歌词行数', '当前行 + 上下文行', [[1, '1 行'], [2, '2 行'], [3, '3 行'], [5, '5 行']], S.desktopLyricLines, value => {
      S.desktopLyricLines = Number(value); saveStore(); pushDesktopLyrics(true);
    }));
    const sizeRow = h('div', 'setting-row');
    const sizeCopy = h('div', 'copy');
    sizeCopy.appendChild(h('strong', '', '字体大小'));
    sizeCopy.appendChild(h('small', '', '桌面歌词字号，72%–155%'));
    const sizeControls = h('div', 'lyric-size-controls');
    const sizeRange = h('input'); sizeRange.type = 'range'; sizeRange.min = '72'; sizeRange.max = '155'; sizeRange.step = '1'; sizeRange.value = String(Math.round(S.desktopLyricSize * 100));
    const sizeValue = h('span', 'value', Math.round(S.desktopLyricSize * 100) + '%');
    const sizeReset = makeSliderResetBtn('桌面歌词字号', () => {
      S.desktopLyricSize = defaults.desktopLyricSize;
      const pct = Math.round(defaults.desktopLyricSize * 100);
      sizeRange.value = String(pct);
      sizeValue.textContent = pct + '%';
      sizeReset.classList.remove('modified');
      saveStore(); pushDesktopLyrics(true);
    }, Math.abs(S.desktopLyricSize - defaults.desktopLyricSize) > 0.005);
    sizeRange.oninput = () => {
      const pct = Math.max(72, Math.min(155, Math.round(Number(sizeRange.value) || 100)));
      S.desktopLyricSize = pct / 100;
      sizeValue.textContent = pct + '%';
      sizeReset.classList.toggle('modified', Math.abs(S.desktopLyricSize - defaults.desktopLyricSize) > 0.005);
      scheduleSaveStore(); pushDesktopLyrics(true);
    };
    sizeRange.onchange = () => { saveStore(); pushDesktopLyrics(true); };
    sizeControls.append(sizeRange, sizeValue, sizeReset);
    sizeRow.append(sizeCopy, sizeControls);
    desktopCard.appendChild(sizeRow);
    desktopCard.appendChild(settingSelect('颜色来源', '封面取色或自定义；纯色/渐变', LYRIC_COLOR_MODES, S.desktopLyricColorMode, value => {
      S.desktopLyricColorMode = value; saveStore(); applyLyricTheme(); renderLyricsSettings();
    }));
    desktopCard.appendChild(lyricColorRow('桌面歌词颜色', '封面主色 / 辅色或自定义颜色', 'desktop', 'desktopLyricColorMode', 'desktopLyricColor', 'desktopLyricColor2'));
    root.appendChild(desktopCard);

    root.appendChild(h('div', 'setting-title', '时间'));
    const offsetCard = h('div', 'settings-card');
    offsetCard.appendChild(lyricOffsetRow());
    root.appendChild(offsetCard);
  }

  /* ---------------- sources / downloads / local ---------------- */
  function renderSources() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    setHeader('音源', (S.sources.length + ' 个音源'), { back: goBack });
    const root = mainRoot();
    const actions = h('div', 'page-head-actions');
    const fileBtn = h('button', 'pill-btn accent', '批量导入音源');
    fileBtn.onclick = async () => {
      try {
        fileBtn.disabled = true;
        const result = await window.lxMusic.importSourceFile();
        if (!result) return;
        await refreshSources();
        const summary = `已导入 ${result.imported} 个音源，跳过 ${result.skipped} 个重复，${result.failed.length} 个失败`;
        notify(summary, 5000);
        if (result.failed.length) {
          const backdrop = modal(null), box = h('div', 'modal glass');
          const details = h('p', '', result.failed.map(item => item.file + '：' + item.message).join('\n'));
          details.style.cssText = 'white-space:pre-wrap;max-height:45vh;overflow:auto;overflow-wrap:anywhere';
          const done = h('button', 'pill-btn accent', '完成'); done.onclick = () => closeModal(backdrop);
          box.append(h('h2', '', '音源导入结果'), h('p', 'muted', summary), details, done);
          backdrop.appendChild(box);
        }
      }
      catch (error) { notify('导入失败：' + error.message); }
      finally { fileBtn.disabled = false; }
    };
    const pasteBtn = h('button', 'pill-btn', '粘贴脚本');
    pasteBtn.onclick = openSourcePaste;
    actions.append(fileBtn, pasteBtn, h('div', 'spacer'));
    root.appendChild(actions);
    const card = h('div', 'settings-card');
    (S.sources || []).forEach(source => {
      const row = h('div', 'setting-row');
      const radio = h('input'); radio.type = 'radio'; radio.name = 'lxsource'; radio.checked = source.id === S.activeSourceId;
      radio.onchange = async () => {
        try { await window.lxMusic.activateSource(source.id); S.activeSourceId = source.id; notify('已启用「' + source.name + '」'); }
        catch (error) { notify('启用失败：' + error.message); }
        refreshSources();
      };
      const copy = h('div', 'copy'); copy.appendChild(h('strong', '', source.name)); copy.appendChild(h('small', '', source.version || source.author || (source.id === S.activeSourceId ? '当前使用' : '自定义音源')));
      const del = h('button', 'plain-btn', '删除');
      del.onclick = async () => {
        if (!confirm('移除音源「' + source.name + '」？')) return;
        try { await window.lxMusic.removeSource(source.id); await refreshSources(); }
        catch (error) { notify('移除失败：' + error.message); }
      };
      row.append(radio, copy, del);
      card.appendChild(row);
    });
    if (!S.sources.length) card.appendChild(h('div', 'empty-hint', S.sourcesLoading ? '正在载入…' : '还没有音源'));
    root.appendChild(card);
    root.appendChild(h('div', 'empty-hint', '播放使用你启用的音源；某个音源失败会自动尝试后续可用源。'));
  }
  function openSourcePaste() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '粘贴 LX 音源脚本'));
    box.appendChild(h('p', 'muted', '粘贴完整 JS 脚本，保存后会出现在音源列表。'));
    const input = h('textarea'); input.placeholder = '/* LX 音源脚本 */';
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'pill-btn', '取消'); cancel.onclick = () => closeModal(backdrop);
    const confirm = h('button', 'pill-btn accent', '保存');
    confirm.onclick = async () => {
      if (!input.value.trim()) return notify('请粘贴脚本');
      try { await window.lxMusic.importSource(input.value); closeModal(backdrop); await refreshSources(); notify('音源已添加'); }
      catch (error) { notify('添加失败：' + error.message); }
    };
    actions.append(cancel, confirm); box.append(input, actions); backdrop.appendChild(box);
  }
  function formatDownloadStatusText(job) {
    const percent = job.total ? Math.round(job.received / job.total * 100) : 0;
    return (job.artist || '') + ' · ' + (job.state === 'complete' ? '已完成' : job.state === 'failed' ? (job.error || '下载失败') : job.state === 'cancelled' ? '已取消' : ('下载中 ' + percent + '%'));
  }
  function openDeleteDownloadsModal(targetJobs) {
    const list = Array.isArray(targetJobs) ? targetJobs.filter(Boolean) : [];
    if (!list.length) return;
    let deleteFile = false;
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', list.length > 1 ? '批量删除下载' : '删除下载任务'));
    box.appendChild(h('p', 'muted', list.length > 1
      ? `确认删除已选的 ${list.length} 项下载任务吗？`
      : `确认删除「${list[0].name || '未知歌曲'}」吗？`));
    const optRow = h('div', 'dl-delete-opt');
    const chk = h('span', 'box', '✓');
    const copy = h('div', 'copy');
    copy.appendChild(h('strong', '', '同时删除本地音频源文件'));
    copy.appendChild(h('small', '', '勾选后一并清理本地音频文件；不勾选仅移除下载记录'));
    optRow.append(chk, copy);
    const actions = h('div', 'modal-actions');
    const cancelBtn = h('button', 'pill-btn', '取消');
    cancelBtn.type = 'button';
    cancelBtn.onclick = () => closeModal(backdrop);
    const confirmBtn = h('button', 'pill-btn', '仅移除记录');
    confirmBtn.type = 'button';
    confirmBtn.style.background = 'rgba(255, 92, 108, 0.88)';
    confirmBtn.style.color = '#ffffff';
    optRow.onclick = () => {
      deleteFile = !deleteFile;
      chk.classList.toggle('checked', deleteFile);
      confirmBtn.textContent = deleteFile ? '删除记录与源文件' : '仅移除记录';
    };
    confirmBtn.onclick = async () => {
      const ids = list.map(j => String(j.id));
      closeModal(backdrop);
      try {
        // 若正在播放待删除的本地源文件，先释放 <audio> 文件句柄，避免 Windows 文件锁导致删不掉
        if (deleteFile) {
          const targetPaths = new Set(list.map(j => String(j?.filePath || '').toLowerCase()).filter(Boolean));
          const curPath = String(S.current?.filePath || S.current?.path || '').toLowerCase();
          const playingSrc = String(audio?.currentSrc || audio?.src || '').toLowerCase();
          const playingTarget = (curPath && targetPaths.has(curPath))
            || list.some(j => j?.filePath && playingSrc.includes(encodeURIComponent(String(j.filePath).split(/[\\/]/).pop() || '').toLowerCase()));
          if (playingTarget || (S.current?.provider === 'local' && targetPaths.size > 0)) {
            try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) {}
            try { if (audioB) { audioB.pause(); audioB.removeAttribute('src'); audioB.load(); } } catch (_) {}
            S.playing = false;
            await new Promise(resolve => setTimeout(resolve, 140));
          }
        }
        const res = window.lxMusic.removeDownloadsBatch
          ? await window.lxMusic.removeDownloadsBatch(ids, { deleteFile })
          : await Promise.all(ids.map(id => window.lxMusic.removeDownload(id, { deleteFile })));
        const failedPaths = Array.isArray(res?.failedPaths) ? res.failedPaths : [];
        const deletedPaths = Array.isArray(res?.deletedPaths) ? res.deletedPaths : [];
        if (S.downloadSelectedIds instanceof Set) {
          ids.forEach(id => S.downloadSelectedIds.delete(id));
          if (!S.downloadSelectedIds.size && ids.length >= (S.downloads || []).length) {
            S.downloadBatchMode = false;
          }
        }
        if (deleteFile && deletedPaths.length && Array.isArray(S.localTracks)) {
          const normSet = new Set(deletedPaths.map(p => String(p || '').toLowerCase()));
          S.localTracks = S.localTracks.filter(t => !normSet.has(String(t?.filePath || t?.path || '').toLowerCase()));
        }
        const label = ids.length > 1 ? `${ids.length} 项下载` : '下载任务';
        if (!deleteFile) {
          notify(`已移除${label}记录`);
        } else if (failedPaths.length > 0) {
          const names = failedPaths.slice(0, 2).map(f => f?.name || f?.path || '文件').join('、');
          notify(`部分源文件未能删除（正被占用或无权限）：${names}`, 3600);
        } else {
          notify(`已删除${label}及本地源文件`);
        }
        renderDownloads();
      } catch (error) {
        notify('删除失败：' + (error?.message || error));
      }
    };
    actions.append(cancelBtn, confirmBtn);
    box.append(optRow, actions);
    backdrop.appendChild(box);
  }
  function renderDownloads(isLiveUpdate = false) {
    if (deferPageRefresh()) return;
    const jobs = Array.isArray(S.downloads) ? S.downloads : [];
    if (!(S.downloadSelectedIds instanceof Set)) S.downloadSelectedIds = new Set();
    if (!jobs.length) {
      S.downloadBatchMode = false;
      S.downloadSelectedIds.clear();
    } else {
      const validIds = new Set(jobs.map(j => String(j.id)));
      for (const id of Array.from(S.downloadSelectedIds)) {
        if (!validIds.has(id)) S.downloadSelectedIds.delete(id);
      }
    }
    const batchMode = !!S.downloadBatchMode;
    const existingList = isLiveUpdate ? document.querySelector('#view .downloads-list-host') : null;
    if (existingList) {
      const existingSig = existingList.dataset.jobSig || '';
      const nextSig = `${batchMode ? 1 : 0}|` + jobs.map(j => `${j.id}:${j.state}:${S.downloadSelectedIds.has(String(j.id)) ? 1 : 0}`).join('|');
      if (existingSig === nextSig && jobs.length) {
        // 原地更新进度文案，绝不重建 DOM 或重放入场淡入动画，彻底杜绝闪烁！
        jobs.forEach(job => {
          const el = existingList.querySelector(`[data-dl-status="${CSS.escape(String(job.id))}"]`);
          if (el) el.textContent = formatDownloadStatusText(job);
        });
        return;
      }
    }
    setBodyMode('secondary');
    setHeader('下载', jobs.length ? (jobs.length + ' 项任务') : '', { back: goBack });
    const root = mainRoot('', isLiveUpdate);
    if (jobs.length) {
      const bar = h('div', 'batch-dl-bar');
      if (batchMode) {
        const left = h('div', 'download-actions');
        const allSelected = S.downloadSelectedIds.size === jobs.length;
        const selAllBtn = h('button', 'pill-btn', allSelected ? '取消全选' : '全选');
        selAllBtn.type = 'button';
        selAllBtn.onclick = () => {
          if (allSelected) S.downloadSelectedIds.clear();
          else jobs.forEach(j => S.downloadSelectedIds.add(String(j.id)));
          renderDownloads();
        };
        const countSpan = h('span', 'muted', `已选 ${S.downloadSelectedIds.size} 项`);
        countSpan.style.fontSize = '13px';
        left.append(selAllBtn, countSpan);

        const right = h('div', 'download-actions');
        const completedSelectedIds = jobs.filter(j => S.downloadSelectedIds.has(String(j.id)) && j.state === 'complete').map(j => String(j.id));
        const saveBatchBtn = h('button', 'pill-btn accent', '另存为');
        saveBatchBtn.type = 'button';
        saveBatchBtn.disabled = completedSelectedIds.length === 0;
        if (!completedSelectedIds.length) saveBatchBtn.style.opacity = '0.42';
        saveBatchBtn.onclick = async () => {
          if (!completedSelectedIds.length || !window.lxMusic?.saveDownloadsBatchAs) return;
          try {
            const res = await window.lxMusic.saveDownloadsBatchAs(completedSelectedIds);
            if (res && !res.canceled) {
              notify(res.saved > 1 ? `已批量另存 ${res.saved} 首歌曲到所选目录` : '已保存到系统所选位置');
            }
          } catch (error) {
            notify('另存为失败：' + (error?.message || error));
          }
        };

        const delBatchBtn = h('button', 'pill-btn', '删除');
        delBatchBtn.type = 'button';
        delBatchBtn.style.color = '#ff6b76';
        delBatchBtn.disabled = S.downloadSelectedIds.size === 0;
        if (!S.downloadSelectedIds.size) delBatchBtn.style.opacity = '0.42';
        delBatchBtn.onclick = () => {
          const chosen = jobs.filter(j => S.downloadSelectedIds.has(String(j.id)));
          openDeleteDownloadsModal(chosen);
        };

        const doneBtn = h('button', 'pill-btn', '完成');
        doneBtn.type = 'button';
        doneBtn.onclick = () => {
          S.downloadBatchMode = false;
          S.downloadSelectedIds.clear();
          renderDownloads();
        };
        right.append(saveBatchBtn, delBatchBtn, doneBtn);
        bar.append(left, right);
      } else {
        bar.appendChild(h('span', '', ''));
        const enterBatchBtn = h('button', 'pill-btn', '批量管理');
        enterBatchBtn.type = 'button';
        enterBatchBtn.style.color = 'var(--accent)';
        enterBatchBtn.onclick = () => {
          S.downloadBatchMode = true;
          S.downloadSelectedIds.clear();
          renderDownloads();
        };
        bar.appendChild(enterBatchBtn);
      }
      root.appendChild(bar);
    }
    const card = h('div', 'song-list downloads-list-host');
    card.dataset.jobSig = `${batchMode ? 1 : 0}|` + jobs.map(j => `${j.id}:${j.state}:${S.downloadSelectedIds.has(String(j.id)) ? 1 : 0}`).join('|');
    const lookupDownloadCover = (job) => {
      const direct = rawCoverOf(job) || rawCoverOf(job.song);
      if (direct) return direct;
      const pools = [S.favorites, S.recentlyPlayed, S.queue, S.localTracks, S.feed?.newSongs, S.feed?.forYou, S.feed?.dailySongs];
      const targetId = String(job.songId || '');
      const targetName = String(job.name || '').trim().toLowerCase();
      for (const pool of pools) {
        if (!Array.isArray(pool)) continue;
        for (const s of pool) {
          if (!s) continue;
          const cov = rawCoverOf(s);
          if (!cov) continue;
          if ((targetId && String(s.id || s.mid || s.hash || '') === targetId) ||
              (targetName && String(s.name || '').trim().toLowerCase() === targetName)) {
            return cov;
          }
        }
      }
      return '';
    };
    const missingCoverJobs = [];
    jobs.forEach(job => {
      const jobId = String(job.id);
      const selected = batchMode && S.downloadSelectedIds.has(jobId);
      const row = h('div', 'song-row download-row' + (batchMode ? ' selectable' : '') + (selected ? ' selected' : ''));
      const art = h('div', 'row-art');
      art.dataset.dlCoverId = jobId;
      const foundCover = lookupDownloadCover(job);
      if (foundCover && !rawCoverOf(job)) {
        job.cover = foundCover; job.coverUrl = foundCover;
        window.lxMusic?.updateDownloadCover?.(job.id, foundCover).catch?.(() => {});
      } else if (!foundCover && job.name) {
        missingCoverJobs.push({ job, art });
      }
      applyArtSurface(art, foundCover, job.name || job.artist || '', 'download');
      const main = h('div', 'row-main');
      main.appendChild(h('strong', '', job.name || '未知歌曲'));
      const statusEl = h('small', '', formatDownloadStatusText(job));
      statusEl.dataset.dlStatus = jobId;
      main.appendChild(statusEl);
      if (job.state === 'complete' && job.filePath) {
        main.appendChild(h('small', 'muted', job.filePath));
      }
      const album = h('div', 'album', job.quality || '');
      if (batchMode) {
        const check = h('span', 'dl-check-circle' + (selected ? ' checked' : ''), '✓');
        row.onclick = () => {
          if (S.downloadSelectedIds.has(jobId)) S.downloadSelectedIds.delete(jobId);
          else S.downloadSelectedIds.add(jobId);
          renderDownloads();
        };
        row.append(check, art, main, album);
      } else {
        const actions = h('div', 'download-actions');
        if (job.state === 'downloading') {
          const cancel = h('button', 'pill-btn', '取消');
          cancel.type = 'button';
          cancel.onclick = e => { e.stopPropagation(); window.lxMusic.cancelDownload(job.id); };
          actions.appendChild(cancel);
        }
        if (job.state === 'complete') {
          if (window.lxMusic?.saveDownloadAs) {
            const saveAs = h('button', 'pill-btn accent', '另存为');
            saveAs.type = 'button';
            saveAs.onclick = e => {
              e.stopPropagation();
              window.lxMusic.saveDownloadAs(job.id)
                .then(res => { if (res && !res.canceled) notify('已保存到系统所选位置'); })
                .catch(error => notify(error.message));
            };
            actions.appendChild(saveAs);
          }
          const reveal = h('button', 'pill-btn', '打开位置');
          reveal.type = 'button';
          reveal.onclick = e => { e.stopPropagation(); window.lxMusic.revealDownload(job.id).catch(error => notify(error.message)); };
          actions.appendChild(reveal);
        }
        if (job.state !== 'downloading') {
          const del = h('button', 'pill-btn', '删除');
          del.type = 'button';
          del.style.color = '#ff6b76';
          del.onclick = e => { e.stopPropagation(); openDeleteDownloadsModal([job]); };
          actions.appendChild(del);
        }
        row.append(art, main, album, actions);
        if (job.state === 'complete') {
          row.style.cursor = 'pointer';
          row.onclick = () => {
            const track = {
              id: job.songId || job.id,
              name: job.name || '未知歌曲',
              artist: job.artist || '',
              singer: job.artist || '',
              album: job.album || '',
              albumName: job.album || '',
              cover: rawCoverOf(job) || foundCover || '',
              coverUrl: rawCoverOf(job) || foundCover || '',
              source: job.source || 'kw',
              lxSource: job.source || 'kw',
              filePath: job.filePath || ''
            };
            playSong(track, [track]);
          };
        }
      }
      card.appendChild(row);
    });
    if (!jobs.length) card.appendChild(h('div', 'empty-hint', '还没有下载任务'));
    root.appendChild(card);
    if (missingCoverJobs.length && window.lxMusic && typeof window.lxMusic.songCovers === 'function') {
      const queries = missingCoverJobs.slice(0, 30).map(({ job }) => ({
        id: job.songId || job.id,
        source: job.source || 'wy',
        name: job.name || '',
        singer: job.artist || '',
      }));
      window.lxMusic.songCovers(queries).then(urls => {
        if (!Array.isArray(urls)) return;
        urls.forEach((u, idx) => {
          const clean = String(u || '').trim();
          if (!clean) return;
          const entry = missingCoverJobs[idx];
          if (!entry) return;
          entry.job.cover = clean;
          entry.job.coverUrl = clean;
          if (entry.art && entry.art.isConnected) {
            applyArtSurface(entry.art, clean, entry.job.name || entry.job.artist || '', 'download');
          }
          window.lxMusic?.updateDownloadCover?.(entry.job.id, clean).catch?.(() => {});
        });
      }).catch(() => {});
    }
  }
  function normalizeLocalTracks(tracks) {
    return (tracks || []).map(track => Object.assign({}, track, {
      source: 'local', singer: track.artist || track.singer || '本地文件',
      durationMs: Number(track.durationMs != null ? track.durationMs : track.duration) || 0,
      coverUrl: track.coverUrl || track.cover || ''
    }));
  }
  async function refreshLocalTracks() {
    if (!window.desktopWindow || !window.desktopWindow.listLocalMusicLibrary) return;
    const local = await window.desktopWindow.listLocalMusicLibrary();
    if (local && local.ok !== false) S.localTracks = normalizeLocalTracks(local.tracks);
  }
  function renderLocal() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    const tools = S.localTools || (S.localTools = { query: '', mode: 'added', manual: null, searchOpen: false });
    let toggleListSearch = null;
    let refreshList = () => {};
    setHeader('本地音乐', (S.localTracks.length + ' 首'), { back: goBack, actions: [
      { icon: 'sparkle', label: '智能识别电脑里的音频', onClick: scanLocalAudio },
      { icon: 'import', label: '导入本地音频', onClick: importLocalFiles },
      { icon: 'search', label: '搜索本列表', onClick: () => { if (toggleListSearch) toggleListSearch(); } }
    ] });
    const root = mainRoot();
    const bar = createListBar(S.localTracks, tools, () => refreshList());
    toggleListSearch = () => { bar.setSearchOpen(!tools.searchOpen); refreshList(); };
    const play = h('button', 'list-tools-play', '播放全部');
    play.onclick = () => {
      const fullSorted = arrangeSongs(S.localTracks, Object.assign({}, tools, { query: '' }));
      if (fullSorted.length) playSong(fullSorted[0], fullSorted);
    };
    const sort = h('button', 'list-tools-sort', '排列');
    sort.onclick = () => openListSortMenu(sort, S.localTracks, tools, () => refreshList());
    const batchCol = h('button', 'list-tools-sort', '批量收藏');
    batchCol.onclick = () => openBatchCollectModal(arrangeSongs(S.localTracks, tools), '本地音乐');
    bar.node.prepend(play, sort, batchCol);
    const host = h('div', 'list-tools-host');
    root.append(bar.node, host);
    refreshList = () => {
      const list = arrangeSongs(S.localTracks, tools);
      const fullQueue = arrangeSongs(S.localTracks, Object.assign({}, tools, { query: '' }));
      bar.setCount(list.length);
      host.replaceChildren();
      if (list.length) host.appendChild(songListCard(list, fullQueue));
      else if (S.localTracks.length) host.appendChild(h('div', 'empty-hint', '没有匹配的歌曲'));
      else host.appendChild(h('div', 'empty-hint', '还没有本地歌曲。点击右上角“智能识别”或“导入”添加电脑里的音频。'));
    };
    refreshList();
  }
  async function handleLocalImport(result) {
    if (!result || result.ok !== true) throw new Error((result && result.error) || '导入失败');
    await refreshLocalTracks();
    if (S.currentView && S.currentView.name === 'local') renderLocal();
    notify(`已添加 ${result.count || 0} 首本地音乐`);
  }
  function importLocalFiles() {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.accept = 'audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus';
    input.style.display = 'none';
    input.onchange = async () => {
      try {
        if (!input.files || !input.files.length) return;
        notify('正在导入本地音频…');
        const result = await window.desktopWindow.importLocalMusicFiles(input.files);
        await handleLocalImport(result);
      } catch (error) { notify('导入失败：' + error.message); }
      finally { input.remove(); }
    };
    document.body.appendChild(input);
    input.click();
  }
  async function importLocalMusicPaths(paths) {
    try {
      notify('正在添加本地音频…');
      const result = await window.desktopWindow.importLocalMusicPaths(paths);
      await handleLocalImport(result);
    } catch (error) { notify('添加失败：' + error.message); }
  }
  async function scanLocalAudio() {
    try {
      notify('正在识别电脑里的音频…');
      const result = await window.desktopWindow.scanLocalMusic();
      if (!result || result.ok !== true) throw new Error((result && result.error) || '识别失败');
      const files = result.files || [];
      if (!files.length) { notify('音乐/下载目录里没有找到音频，请用右上角“导入”手动选择'); return; }
      showLocalScanDialog(files);
    } catch (error) { notify('识别失败：' + error.message); }
  }
  function showLocalScanDialog(files) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass local-scan-modal');
    box.appendChild(h('h2', '', `识别到 ${files.length} 个本地音频`));
    box.appendChild(h('p', 'muted', '勾选要添加的音频；可一键全选。'));
    const allRow = h('label', 'local-scan-all');
    const all = document.createElement('input'); all.type = 'checkbox'; all.checked = true;
    allRow.append(all, h('span', '', '全选'));
    const list = h('div', 'local-scan-list');
    const selected = new Set(files.map(file => file.path));
    files.forEach(file => {
      const row = h('label', 'local-scan-row');
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true;
      const copy = h('div', 'copy');
      copy.append(h('strong', '', file.name || '未知音频'), h('small', '', file.path || ''));
      row.append(check, copy);
      check.onchange = () => {
        if (check.checked) selected.add(file.path); else selected.delete(file.path);
        all.checked = selected.size === files.length;
        updateAdd();
      };
      list.appendChild(row);
    });
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'pill-btn', '取消'); cancel.onclick = () => closeModal(backdrop);
    const add = h('button', 'pill-btn accent', `添加选中（${selected.size}）`);
    const updateAdd = () => {
      add.textContent = `添加选中（${selected.size}）`;
      add.disabled = selected.size === 0;
    };
    add.onclick = () => {
      if (!selected.size) return;
      const paths = Array.from(selected);
      closeModal(backdrop);
      importLocalMusicPaths(paths);
    };
    all.onchange = () => {
      const on = all.checked;
      selected.clear();
      if (on) files.forEach(file => selected.add(file.path));
      list.querySelectorAll('input[type=checkbox]').forEach(input => { input.checked = on; });
      updateAdd();
    };
    actions.append(cancel, add);
    box.append(allRow, list, actions);
    backdrop.appendChild(box);
    updateAdd();
  }
  /* ---------------- search ---------------- */
  function updateSearchInsets() {
    if (!S.searchOpen) return;
    const chips = $('#search-chips');
    $('#search-overlay').style.setProperty('--search-content-top', (chips.offsetTop + chips.offsetHeight + 18) + 'px');
  }
  function openSearch(opts) {
    const entry = document.querySelector('.search-entry');
    S.searchOriginRect = entry ? entry.getBoundingClientRect() : null;
    S.searchReturnToPlayer = Boolean(opts && opts.returnToPlayer);
    S.searchOpen = true;
    S.search = Object.assign(S.search, { open: true, query: '', results: [], entities: [], page: 1, hasMore: false, loading: false, historyOnly: true });
    $('#search-input').value = '';
    $('#search-overlay').classList.remove('hidden');
    setBodyMode('search');
    renderSearchChips();
    renderSearchLanding();
    setTimeout(() => $('#search-input').focus(), 40);
    requestAnimationFrame(() => requestAnimationFrame(() => morphSearchOpen()));
  }
  function morphSearchOpen() {
    const from = S.searchOriginRect; const box = $('#search-box');
    if (!from || !box) return;
    const to = box.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const dx = from.left - to.left, dy = from.top - to.top;
    const sx = Math.max(.05, from.width / to.width), sy = Math.max(.05, from.height / to.height);
    try {
      box.animate([
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '22px', opacity: .55 },
        { transformOrigin: 'top left', transform: 'none', borderRadius: '29px', opacity: 1 }
      ], { duration: 460, easing: 'cubic-bezier(.22,1.08,.32,1)' });
      $('#search-head').animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 60, easing: 'ease-out', fill: 'both' });
    } catch (_) {}
  }
  function morphSearchClose() {
    const from = S.searchOriginRect; const box = $('#search-box');
    if (!from || !box) return null;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dx = from.left - rect.left, dy = from.top - rect.top;
    const sx = Math.max(.05, from.width / rect.width), sy = Math.max(.05, from.height / rect.height);
    try {
      return box.animate([
        { transformOrigin: 'top left', transform: 'none', borderRadius: '29px', opacity: 1 },
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '22px', opacity: .4 }
      ], { duration: 460, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    } catch (_) { return null; }
  }
  function closeSearch(opts) {
    const returnToPlayer = !(opts && opts.suppressReturnToPlayer) && !!S.searchReturnToPlayer;
    S.searchReturnToPlayer = false;
    searchRun++;
    S.search.loading = false;
    S.searchOpen = false;
    S.search.open = false;
    const overlay = $('#search-overlay');
    const animation = morphSearchClose();
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.classList.add('hidden'); overlay.classList.remove('closing');
      try { if (animation) animation.cancel(); } catch (_) {}
      flushPageRefresh();
    }, 460);
    setBodyMode(S.currentView && S.currentView.main && (S.currentView.name === 'home' || S.currentView.name === 'library' || S.currentView.name === 'settings') ? 'tab' : 'secondary');
    if (returnToPlayer && S.current) {
      openDetail();
    }
  }
  function renderSearchChips() {
    const root = $('#search-chips');
    root.replaceChildren();
    const platforms = h('div', ''); platforms.style.display = 'flex'; platforms.style.gap = '8px'; platforms.style.flexWrap = 'wrap';
    PLATFORMS.forEach(([id, label]) => {
      const chip = h('button', 'chip' + (S.search.platform === id ? ' active' : ''), label);
      chip.onclick = () => { S.search.platform = id; S.search.page = 1; renderSearchChips(); if (S.search.query) performSearch(false); else renderSearchLanding(); };
      platforms.appendChild(chip);
    });
    const kinds = h('div', ''); kinds.style.display = 'flex'; kinds.style.gap = '8px'; kinds.style.flexWrap = 'wrap'; kinds.style.marginLeft = 'auto';
    KIND_TABS.forEach(([id, label]) => {
      const chip = h('button', 'chip' + (S.search.kind === id ? ' active' : ''), label);
      chip.onclick = () => { S.search.kind = id; S.search.page = 1; renderSearchChips(); if (S.search.query) performSearch(false); else renderSearchLanding(); };
      kinds.appendChild(chip);
    });
    root.append(platforms, kinds);
    updateSearchInsets();
  }
  function renderSearchLanding() {
    const results = $('#search-results');
    results.replaceChildren();
    const block = h('div', 'history-block');
    block.appendChild(h('h3', '', '最近搜索'));
    const chips = h('div', 'history-chips');
    if (S.searchHistory.length) {
      S.searchHistory.forEach(value => {
        const chip = h('button', 'chip', value);
        chip.onclick = () => { $('#search-input').value = value; performSearch(false); };
        chips.appendChild(chip);
      });
    } else chips.appendChild(h('span', 'search-status', '搜索历史会出现在这里'));
    block.appendChild(chips);
    const rec = h('div', 'history-block');
    rec.appendChild(h('h3', '', '推荐搜索'));
    const recChips = h('div', 'history-chips');
    ['华语流行', '周杰伦', '林俊杰', '邓紫棋', '陈奕迅', '薛之谦', '经典老歌', '纯音乐', '粤语', '轻音乐'].forEach(value => {
      const chip = h('button', 'chip', value);
      chip.onclick = () => { $('#search-input').value = value; performSearch(false); };
      recChips.appendChild(chip);
    });
    rec.appendChild(recChips);
    results.append(block, rec);
  }
  function searchStatus(text) {
    const results = $('#search-results');
    let status = results.querySelector('.search-status.live');
    if (!status) { status = h('div', 'search-status live'); results.appendChild(status); }
    status.textContent = text;
  }
  let searchRun = 0;
  async function appendRowsInFrames(root, items, render, current = () => root.isConnected) {
    let index=0;
    while(index<items.length&&current()) {
      const fragment=document.createDocumentFragment(),start=performance.now();
      do {fragment.appendChild(render(items[index],index));index++;}while(index<items.length&&performance.now()-start<4);
      root.appendChild(fragment);
      if(index<items.length)await new Promise(requestAnimationFrame);
    }
  }
  async function performSearch() {
    const query = $('#search-input').value.trim();
    const resultsRoot = $('#search-results');
    if (!query) { ++searchRun; S.search.query = ''; S.search.loading=false; renderSearchLanding(); return; }
    const run=++searchRun,kind=S.search.kind,platform=S.search.platform;
    const current=()=>run===searchRun&&S.searchOpen&&S.search.kind===kind&&S.search.platform===platform&&S.search.query===query;
    S.search.query=query;S.search.results=[];S.search.entities=[];S.search.page=1;S.search.hasMore=false;
    S.searchTools = { query: '', mode: 'added', manual: null, searchOpen: false };
    S.search.loading = true;
    {
      S.searchHistory = [query, ...S.searchHistory.filter(item => item !== query)].slice(0, 10);
      saveStore();
      resultsRoot.replaceChildren();
      searchStatus('正在搜索…');
    }
    const sourceIds = platform === 'all' ? (['music','songlist'].includes(kind)?SEARCH_SOURCES.slice():['wy']) : [platform];
    const type = S.search.kind === 'music' ? 'music' : S.search.kind;
    const all = type === 'music' ? S.search.results : S.search.entities;
    const seen=new Set();
    const tools = S.searchTools;
    const displayed = [];
    const rows = new Map();
    const musicList = type === 'music' ? h('div', 'song-list search-song-host') : null;
    let renderVersion = 0;
    let bar = null;
    async function refreshMusicRows() {
      const version = ++renderVersion;
      const list = arrangeSongs(all, tools);
      displayed.length = 0;
      for (const song of list) displayed.push(song);
      bar.setCount(list.length);
      const keys = new Set(list.map(identity));
      for (const [key, row] of rows) {
        if (!keys.has(key)) { row.remove(); rows.delete(key); }
      }
      musicList.querySelector('.empty-hint')?.remove();
      let started = performance.now();
      for (let index = 0; index < list.length; index++) {
        if (!current() || version !== renderVersion) return;
        const song = list[index], key = identity(song);
        let row = rows.get(key);
        if (!row) {
          row = songRow(song, displayed, index, { openDetail: true, fromSearch: true });
          rows.set(key, row);
        }
        if (row.dataset.searchIndex !== String(index)) {
          row.querySelector('.row-main strong').textContent = String(index + 1).padStart(2, '0') + '  ' + (song.name || '未知歌曲');
          row.dataset.searchIndex = String(index);
        }
        if (musicList.children[index] !== row) musicList.insertBefore(row, musicList.children[index] || null);
        if (performance.now() - started >= 4) {
          await new Promise(requestAnimationFrame);
          started = performance.now();
        }
      }
      if (!list.length) musicList.appendChild(h('div', 'empty-hint', '没有匹配的歌曲'));
    }
    if (musicList) {
      bar = createListBar(all, tools, refreshMusicRows);
      const play = h('button', 'list-tools-play', '播放全部');
      play.onclick = () => { if (displayed.length) playSong(displayed[0], displayed, { fromSearch: true, playAllSearch: true }); };
      const sort = h('button', 'list-tools-sort', '排列');
      sort.onclick = () => openListSortMenu(sort, all, tools, refreshMusicRows);
      const batchCol = h('button', 'list-tools-sort', '批量收藏');
      batchCol.onclick = () => openBatchCollectModal(arrangeSongs(all, tools), '搜索结果');
      bar.node.prepend(play, sort, batchCol);
      resultsRoot.append(bar.node, musicList);
    }
    const settled=await Promise.allSettled(sourceIds.map(source=>window.LxPagination.collectAll(
      (page,limit)=>window.lxMusic.search({query,source,type,page,limit}),{
        limit:type==='music'?50:30,cancelled:()=>!current(),
        onPage:async ({added})=>{
          if(!current())return;
          const fresh=added.filter(item=>{const key=[item.source||item.provider||source,item.kind||type,item.id||item.name].join(':');if(seen.has(key))return false;seen.add(key);return true;});
          if(!fresh.length)return;
          all.push(...fresh);
          if (musicList) void hydrateCovers(fresh);
          searchStatus('已获取 '+all.length+' 条，正在自动获取其余结果…');
          if (musicList) await refreshMusicRows();
          else await appendRowsInFrames(resultsRoot, fresh, searchEntityRow, current);
        }
      })));
    if(!current())return;
    S.search.loading=false;S.search.hasMore=false;
    const warnings=settled.flatMap(result=>result.status==='rejected'?['部分平台暂时不可用']:result.value.warning?[result.value.warning]:[]);
    searchStatus('共 '+all.length+' 条结果'+(warnings.length?' · '+[...new Set(warnings)].join('；'):''));
    if (!all.length) {
      searchStatus(warnings.length?'搜索源暂时不可用，请稍后重试':'没有找到相关结果');
      return;
    }
    if (musicList) await refreshMusicRows();
  }

  function searchEntityRow(item) {
    const row = h('div', 'search-row');
    const art = h('div', 'art');
    applyArtSurface(art, rawCoverOf(item), item.name || item.artist || '', item.kind === 'songlist' ? 'library' : 'music');
    const badge = srcBadge(item.source || SOURCE_OF_PROVIDER[item.provider]);
    if (badge) art.appendChild(badge);
    const main = h('div', 'main');
    main.appendChild(h('strong', '', item.name || '未命名'));
    main.appendChild(h('small', '', [item.artist, item.count ? item.count + ' 首歌曲' : '', item.kind === 'songlist' ? '歌单' : item.kind || ''].filter(Boolean).join(' · ')));
    row.append(art, main, h('div', 'go', item.kind === 'songlist' ? '打开 ›' : '查看 ›'));
    row.onclick = async () => {
      const returnToPlayer = !!S.searchReturnToPlayer;
      if (item.kind === 'songlist') {
        const source = item.source || SOURCE_OF_PROVIDER[item.provider] || 'wy';
        $('#search-overlay').classList.add('hidden');
        await openFeedPlaylist({ id: item.id, name: item.name, cover: item.cover, count: item.count, trackCount: item.count, source }, false, { returnToPlayer, returnToSearch: true });
        return;
      }
      if(item.song){const song=Object.assign({},item.song,{provider:item.source,artist:item.song.singer,cover:item.song.coverUrl});playSong(song,[song],{fromSearch:true});openDetail();return;}
      try {
        notify('正在获取全部歌曲…');
        const result=await window.lxMusic.entityTracks({id:item.id,source:item.source||'wy',kind:item.kind});
        $('#search-overlay').classList.add('hidden');
        pushView({name:'playlist',kind:'entity',entityKind:item.kind,id:item.id,title:item.name,cover:item.cover,tracks:result.items,warning:result.warning,main:false,returnToPlayer,returnToSearch:true});
      }catch(error){notify('读取失败：'+error.message);}
    };
    return row;
  }

  /* ---------------- detail / comments ---------------- */
  let detailRevealTimer = 0, detailCloseHoldTimer = 0, detailCloseTimer = 0;
  function openDetail() {
    if (!S.current) return;
    clearTimeout(detailRevealTimer); clearTimeout(detailCloseHoldTimer); clearTimeout(detailCloseTimer);
    S.detailOpen = true;
    pushStagePresentation();
    S.detailFromSearch = isSearchVisible();
    document.body.classList.remove('detail-leaving');
    setDetailImmersive(false);
    document.body.classList.add('detail-entering');
    $('#search-overlay').classList.add('hidden');
    $('#detail-overlay').classList.remove('hidden', 'closing');
    setBodyMode('detail');
    updateHomeCompact();
    $('#timeline').classList.remove('hidden');
    renderDetailLyrics();
    syncLyric(true);
    pushDesktopLyrics(true);
    setStageSong(S.current, true);
    // The capsule reaches the centre first; hold a beat, then let the blurred
    // stage underneath resolve into the playback background.
    detailRevealTimer = setTimeout(() => document.body.classList.remove('detail-entering'), 620);
  }
  function closeDetail(opts) {
    const restoreSearch = !(opts && opts.suppressRestoreSearch) && !!S.detailFromSearch && !!S.searchOpen;
    S.detailOpen = false;
    pushStagePresentation();
    clearTimeout(detailRevealTimer); clearTimeout(detailCloseHoldTimer); clearTimeout(detailCloseTimer);
    document.body.classList.remove('detail-entering');
    setDetailImmersive(false);
    const overlay = $('#detail-overlay');
    overlay.classList.add('closing');
    // Hold first, restore Search underneath before the stage fades so Home/Library never flashes through.
    detailCloseHoldTimer = setTimeout(() => {
      if (restoreSearch && S.searchOpen && !S.detailOpen) {
        $('#search-overlay').classList.remove('hidden');
        setBodyMode('search');
      }
      document.body.classList.add('detail-leaving');
    }, 140);
    detailCloseTimer = setTimeout(() => {
      overlay.classList.add('hidden'); overlay.classList.remove('closing');
      document.body.classList.remove('detail-leaving');
      $('#timeline').classList.add('hidden');
      if (restoreSearch && S.searchOpen) { $('#search-overlay').classList.remove('hidden'); setBodyMode('search'); }
      else setBodyMode(S.currentView && S.currentView.main && ['home','library','settings'].includes(S.currentView.name) ? 'tab' : 'secondary');
      updateHomeCompact();
      flushPageRefresh();
    }, 620);
    pushDesktopLyrics(true);
  }
  function openAnchoredMenu(anchor, items) {
    const rect = anchor ? anchor.getBoundingClientRect() : null;
    const backdrop = h('div', 'menu-backdrop');
    const menu = h('div', 'popover anchored-menu glass');
    if (anchor && anchor.closest && anchor.closest('.modal-backdrop')) {
      backdrop.style.zIndex = '180';
      menu.style.zIndex = '181';
    }
    menu.style.visibility='hidden';
    let escapeHandler = null;
    const close = () => {
      if (!menu.isConnected || menu.classList.contains('closing')) return Promise.resolve();
      menu.classList.add('closing');
      if (backdrop) backdrop.remove();
      if (escapeHandler) document.removeEventListener('keydown', escapeHandler, true);
      return Promise.resolve(window.LxPopupMotion.close(menu)).finally(()=>{lastUiPopupClosedAt=performance.now();menu.remove();});
    };
    items.forEach(item => {
      const row = h('div', 'menu-row' + (item.checked ? ' checked' : ''));
      row.appendChild(h('span', 'menu-label', item.label));
      if (item.trailingNode) row.appendChild(item.trailingNode);
      row.onclick = () => { close().then(() => item.action()); };
      menu.appendChild(row);
    });
    document.body.append(backdrop, menu);
    // Chromium rounds fractional borders to physical pixels. Keep each edge's
    // total border + padding at 4px so the three 48px rows remain 152px tall.
    menu.style.paddingBlock=`calc(4px - ${getComputedStyle(menu).borderTopWidth})`;
    if (rect) {
      const size = {width:menu.offsetWidth,height:menu.offsetHeight};
      const gap = 8;
      let top = rect.bottom + gap;
      let above = false;
      if (top + size.height > window.innerHeight - 12) {
        top = Math.max(12, rect.top - gap - size.height);
        above = true;
      }
      const left = Math.max(16,Math.min(rect.left,window.innerWidth-16-size.width));
      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
      menu.style.right = 'auto';
      menu.classList.toggle('above', above);
      const originX=rect.left+rect.width/2-left,originY=rect.top+rect.height/2-top;
      menu.style.transformOrigin=`${originX}px ${originY}px`;
      menu.dataset.popupOriginX=String(originX/size.width);
    } else {
      menu.style.top = '110px'; menu.style.right = '40px';
    }
    window.LxGlass.prepare(menu);
    menu.style.visibility='';
    window.LxPopupMotion.open(menu);
    backdrop.onclick = close;
    escapeHandler = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
    document.addEventListener('keydown', escapeHandler, true);
  }
  function openQualityMenu() {
    openAnchoredMenu($('#quality-btn'), [['128k', '标准 128k'], ['320k', '高品质 320k'], ['flac', '无损 flac']].map(([value, label]) => ({
      label,
      checked: S.quality === value,
      action: () => { S.quality = value; saveStore(); notify('音质：' + value); if (S.current) playSong(S.current, S.queue, { startMs: S.position }); }
    })));
  }
  function openStyleMenu() {
    openAnchoredMenu($('#style-btn'), MINE_STYLES.map(([value, label]) => {
      const entry = {
        label,
        checked: S.styleName === value,
        action: () => {
          S.styleName = value;
          if (value === SMART_MODE_ID) updateSmartStage(false);
          saveStore(); pushStageMetadata();
          notify('动效：' + label + (value === SMART_MODE_ID && resolvedStyleLabel() ? ('（' + resolvedStyleLabel() + '）') : ''));
        }
      };
      if (value === SMART_MODE_ID) {
        const infoBtn = h('button', 'smart-info-btn', '!');
        infoBtn.type = 'button';
        infoBtn.setAttribute('aria-label', '什么是随声绘色');
        infoBtn.onclick = ev => { ev.stopPropagation(); openSmartStageInfoModal(); };
        entry.trailingNode = infoBtn;
      }
      return entry;
    }));
  }
  async function openComments() {
    if (!S.current) return;
    S.commentsOpen = true;
    pushStagePresentation();
    $('#comments-overlay').classList.remove('hidden');
    setBodyMode('comments');
    $('#comments-title').textContent = S.current.name || '评论';
    $('#comments-subtitle').textContent = (S.current.artist || S.current.singer || '') + ' · 正在读取…';
    const body = $('#comments-body');
    body.replaceChildren(h('div', 'search-status', '正在读取评论…'));
    const token = ++S.commentToken;
    try {
      const data = await getJson('/api/comments?source=' + encodeURIComponent(songSource(S.current) || '') +
        '&id=' + encodeURIComponent(S.current.id || '') + '&name=' + encodeURIComponent(S.current.name || '') +
        '&singer=' + encodeURIComponent(S.current.artist || S.current.singer || ''));
      if (token !== S.commentToken) return;
      $('#comments-subtitle').textContent = (S.current.artist || S.current.singer || '') + ' · ' + (data.platform || '网络平台');
      body.replaceChildren();
      body.appendChild(h('div', 'comment-notice', '评论来自' + (data.platform || '网络平台') + '，仅供浏览；发表评论请前往原平台。'));
      const total = Number(data.total || 0);
      if (data.hot && data.hot.length) {
        body.appendChild(h('div', 'comment-section-title', '热门评论'));
        data.hot.forEach(comment => body.appendChild(commentRow(comment)));
      }
      body.appendChild(h('div', 'comment-section-title', '最新评论'));
      if (!data.latest || !data.latest.length) body.appendChild(h('div', 'search-status', '还没有评论'));
      else data.latest.forEach(comment => body.appendChild(commentRow(comment)));
      body.appendChild(h('div', 'search-status', '共 ' + total + ' 条公开评论'));
    } catch (error) {
      if (token !== S.commentToken) return;
      const errWrap = h('div', 'search-status');
      errWrap.append(h('div', '', '评论读取失败：' + error.message));
      const retry = h('button', 'pill-btn accent', '重试');
      retry.type = 'button';
      retry.style.marginTop = '12px';
      retry.onclick = () => openComments();
      errWrap.appendChild(retry);
      body.replaceChildren(errWrap);
    }
  }
  function closeComments() {
    S.commentsOpen = false;
    pushStagePresentation();
    const overlay = $('#comments-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.classList.add('hidden'); overlay.classList.remove('closing');
      setBodyMode(S.detailOpen ? 'detail' : 'tab');
      flushPageRefresh();
    }, 300);
  }
  function relativeTime(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const diff = Date.now() - ms;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    const date = new Date(ms);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function commentRow(comment) {
    const row = h('div', 'comment-row');
    const avatar = h('div', 'comment-avatar');
    if (comment.avatar) avatar.style.backgroundImage = 'url("' + coverUrl(comment.avatar).replace(/"/g, '%22') + '")';
    else avatar.textContent = (comment.nick || '评')[0];
    const main = h('div', 'comment-main');
    const top = h('div', 'comment-top');
    top.appendChild(h('strong', '', comment.nick || '用户'));
    top.appendChild(h('time', '', relativeTime(comment.time)));
    main.append(top, h('p', '', (comment.content || '').trim() || '（图片评论）'));
    const meta = h('div', 'comment-meta');
    meta.appendChild(h('span', '', comment.location || ''));
    meta.appendChild(h('span', 'likes', Number(comment.liked) > 0 ? ('♥ ' + Number(comment.liked)) : '赞'));
    main.appendChild(meta);
    row.append(avatar, main);
    return row;
  }

  /* ---------------- modal / queue / sync ---------------- */
  function modal(content) {
    const backdrop = h('div', 'modal-backdrop');
    if (content) backdrop.appendChild(content);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop && !backdrop.dataset.busy) closeModal(backdrop);
    });
    $('#modal-root').appendChild(backdrop);
    return backdrop;
  }
  function closeModal(backdrop) {
    if (!backdrop || !backdrop.parentNode || backdrop.classList.contains('closing')) return;
    backdrop.style.pointerEvents = 'none';
    backdrop.classList.add('closing');
    setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 250);
  }
  async function applySwitchedPlatformSong(oldSong, candidate, contextOpts) {
    if (!oldSong || !candidate) return;
    const opts = contextOpts || {};
    const oldKey = identity(oldSong);
    const nextSongObj = Object.assign({}, candidate);
    if (!rawCoverOf(nextSongObj) && rawCoverOf(oldSong)) {
      nextSongObj.cover = rawCoverOf(oldSong);
      nextSongObj.coverUrl = rawCoverOf(oldSong);
    }
    if (oldSong.recommendReason && !nextSongObj.recommendReason) {
      nextSongObj.recommendReason = oldSong.recommendReason;
    }
    const wasCurrent = Boolean(S.current && identity(S.current) === oldKey);
    const wasPlayingOrRequested = Boolean(S.playing || S.playRequested);
    const resumePos = Math.max(0, Number(S.position) || 0);

    // 1) 若来自曲库歌单（内置/导入歌单、我喜欢的、最近播放），原地替换并立即持久化
    if (opts.mode === 'playlist' && opts.playlistView && Array.isArray(opts.playlistView.tracks)) {
      const view = opts.playlistView;
      const targetIdx = Number.isInteger(opts.index) && opts.index >= 0 && opts.index < view.tracks.length && identity(view.tracks[opts.index]) === oldKey
        ? opts.index
        : view.tracks.findIndex(item => identity(item) === oldKey);
      if (targetIdx >= 0) {
        view.tracks[targetIdx] = nextSongObj;
        view.tracks = view.tracks.filter((item, idx) => idx === targetIdx || identity(item) !== identity(nextSongObj));
        view.count = view.tracks.length;
        if (targetIdx === 0 && rawCoverOf(nextSongObj)) view.cover = rawCoverOf(nextSongObj);
        if (view.kind === 'favorites') {
          S.favorites = view.tracks.slice();
          saveStore();
          syncAllLikeStates();
          await persistFavoritesToLibrary(true);
        } else if (view.kind === 'recent') {
          S.recentlyPlayed = view.tracks.slice();
          saveStore();
        } else if (view.kind === 'builtin') {
          if (window.lxMusic && typeof window.lxMusic.replacePlaylistTrack === 'function') {
            const res = await window.lxMusic.replacePlaylistTrack({ playlistId: view.id, index: targetIdx, track: nextSongObj });
            if (res && res.ok === false && window.desktopWindow?.replaceBuiltInPlaylistTracks) {
              await window.desktopWindow.replaceBuiltInPlaylistTracks(view.id, view.tracks);
            } else if (res && Array.isArray(res.playlists)) {
              S.library = res.playlists;
            }
          } else if (window.desktopWindow?.replaceBuiltInPlaylistTracks) {
            const res = await window.desktopWindow.replaceBuiltInPlaylistTracks(view.id, view.tracks);
            if (res && Array.isArray(res.playlists)) S.library = res.playlists;
          }
          window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
        }
      }
    }

    // 2) 同步替换播放队列中的对应项（无论是从播放队列打开还是从歌单打开）
    let queueTouched = false;
    if (Array.isArray(S.queue) && S.queue.length) {
      if (opts.mode === 'queue' && Number.isInteger(opts.index) && opts.index >= 0 && opts.index < S.queue.length) {
        S.queue[opts.index] = nextSongObj;
        queueTouched = true;
      } else {
        S.queue.forEach((item, idx) => {
          if (identity(item) === oldKey) {
            S.queue[idx] = nextSongObj;
            queueTouched = true;
          }
        });
      }
    }
    if (queueTouched) savePlayback();

    // 3) 若正是当前选中/播放曲目，无缝切换到新平台版本并刷新歌词与封面
    if (wasCurrent) {
      const nextQueue = S.queue.length ? S.queue : [nextSongObj];
      void playSong(nextSongObj, nextQueue, { autoPlay: wasPlayingOrRequested, startMs: resumePos });
    } else if (opts.mode === 'standalone') {
      void playSong(nextSongObj, [nextSongObj], { autoPlay: true });
    }

    if (typeof opts.onReplaced === 'function') {
      try { opts.onReplaced(nextSongObj); } catch (_) {}
    }
    updateDock();
    notify('已切换为 ' + platformName(nextSongObj) + ' 版本「' + (nextSongObj.name || '') + '」');
  }

  function bestQualityLabel(song) {
    const qs = Array.isArray(song && song.qualitys) ? song.qualitys : [];
    const types = (song && song._types) || {};
    if (qs.includes('flac24bit') || types.flac24bit) return 'Hi-Res';
    if (qs.includes('flac') || types.flac || song?.sqHash) return 'FLAC';
    if (qs.includes('320k') || types['320k'] || song?.hqHash) return '320K';
    return '128K';
  }

  function openSwitchPlatformModal(song, contextOpts) {
    if (!song || song.source === 'local' || song.provider === 'local') {
      notify('本地音频不支持切换在线平台');
      return;
    }
    const backdrop = modal(null);
    const box = h('div', 'modal glass switch-platform-modal');
    box.appendChild(h('h2', '', '切换歌曲平台'));

    const curCard = h('div', 'sp-current-card');
    const curArt = h('div', 'sp-current-art');
    applyArtSurface(curArt, rawCoverOf(song), song.name || song.artist || '', 'music', identity(song));
    const curCopy = h('div', 'sp-current-copy');
    curCopy.append(
      h('strong', '', song.name || '未知歌曲'),
      h('small', '', (song.artist || song.singer || '未知歌手') + (song.album ? ' · ' + song.album : ''))
    );
    const curBadge = h('span', 'sp-source-tag', '当前 · ' + platformName(song));
    curCard.append(curArt, curCopy, curBadge);
    box.appendChild(curCard);

    const filterBar = h('div', 'sp-filter-bar');
    const filterItems = [
      ['all', '全部推荐'],
      ['wy', '网易云'],
      ['tx', 'QQ 音乐'],
      ['kg', '酷狗'],
      ['kw', '酷我']
    ];
    let activeFilter = 'all';
    let candidates = [];
    let loading = true;
    let loadErr = '';
    const listHost = h('div', 'sp-cand-list');

    const renderCandidates = () => {
      listHost.replaceChildren();
      if (loading) {
        const spinRow = h('div', 'loading-row');
        spinRow.append(h('span', 'loading-spin'), h('span', '', '正在并发检索四大平台同名版本…'));
        listHost.appendChild(spinRow);
        return;
      }
      if (loadErr) {
        listHost.appendChild(h('div', 'empty-hint', '检索失败：' + loadErr));
        return;
      }
      const filtered = activeFilter === 'all'
        ? candidates
        : candidates.filter(cand => songSource(cand) === activeFilter);
      if (!filtered.length) {
        listHost.appendChild(h('div', 'empty-hint', activeFilter === 'all' ? '暂未检索到其他平台的同名可播版本' : '该平台暂未找到匹配版本，可切换「全部推荐」查看'));
        return;
      }
      const curKey = identity(song);
      filtered.forEach(cand => {
        const isCurrent = identity(cand) === curKey;
        const row = h('div', 'sp-cand-row' + (isCurrent ? ' is-current' : ''));
        const art = h('div', 'sp-cand-art');
        applyArtSurface(art, rawCoverOf(cand), cand.name || cand.artist || '', 'music', identity(cand));
        const badge = srcBadge(songSource(cand) || cand.source);
        if (badge) art.appendChild(badge);
        const copy = h('div', 'sp-cand-copy');
        copy.append(
          h('strong', '', cand.name || '未知歌曲'),
          h('small', '', (cand.artist || cand.singer || '未知歌手') + (cand.album ? ' · ' + cand.album : ''))
        );
        const meta = h('div', 'sp-cand-meta');
        const dur = durationOf(cand);
        if (dur > 0) meta.appendChild(h('span', 'sp-cand-dur', fmtTime(dur)));
        meta.appendChild(h('span', 'sp-quality-tag', bestQualityLabel(cand)));
        meta.appendChild(h('span', 'sp-source-tag', isCurrent ? ('当前 · ' + platformName(cand)) : platformName(cand)));
        row.append(art, copy, meta);
        row.onclick = async () => {
          closeModal(backdrop);
          await applySwitchedPlatformSong(song, cand, contextOpts);
        };
        listHost.appendChild(row);
      });
    };

    let fetchToken = 0;
    const fetchCandidates = async (targetFilter) => {
      const myToken = ++fetchToken;
      loading = true;
      loadErr = '';
      renderCandidates();
      try {
        if (!window.lxMusic || typeof window.lxMusic.platformCandidates !== 'function') {
          throw new Error('当前环境不支持跨平台检索');
        }
        const sources = targetFilter && targetFilter !== 'all' ? [targetFilter] : ['wy', 'tx', 'kg', 'kw'];
        const list = await window.lxMusic.platformCandidates(song, sources);
        if (myToken !== fetchToken || !backdrop.isConnected) return;
        candidates = Array.isArray(list) ? list : [];
        loading = false;
        renderCandidates();
        void hydrateCovers(candidates, () => {
          if (myToken === fetchToken && backdrop.isConnected) renderCandidates();
        });
      } catch (error) {
        if (myToken !== fetchToken || !backdrop.isConnected) return;
        loading = false;
        loadErr = error && error.message ? error.message : String(error);
        renderCandidates();
      }
    };

    filterItems.forEach(([id, label]) => {
      const pill = h('button', 'sp-filter-pill' + (id === activeFilter ? ' active' : ''), label);
      pill.type = 'button';
      pill.onclick = () => {
        if (activeFilter === id && !loadErr) return;
        activeFilter = id;
        filterBar.querySelectorAll('.sp-filter-pill').forEach(node => node.classList.toggle('active', node.dataset.filterId === id));
        void fetchCandidates(id);
      };
      pill.dataset.filterId = id;
      filterBar.appendChild(pill);
    });

    const actions = h('div', 'modal-actions');
    const closeBtn = h('button', 'pill-btn', '关闭');
    closeBtn.type = 'button';
    closeBtn.onclick = () => closeModal(backdrop);
    actions.appendChild(closeBtn);

    box.append(filterBar, listHost, actions);
    backdrop.appendChild(box);
    renderCandidates();

    void fetchCandidates('all');
  }

  function openQueue() {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    let sortMode = false;
    let dragFromIndex = -1;

    const headRow = h('div', 'sheet-sticky-head');
    const heading = h('h2', '', '播放队列');
    heading.style.margin = '0';
    const headActs = h('div', 'queue-actions');
    const sortToggleBtn = h('button', 'pill-btn', '排序');
    sortToggleBtn.type = 'button';
    const doneBtn = h('button', 'pill-btn', '完成');
    doneBtn.type = 'button';
    doneBtn.onclick = () => closeModal(backdrop);
    headActs.append(sortToggleBtn, doneBtn);
    headRow.append(heading, headActs);

    const hintEl = h('p', 'muted', '拖动歌曲行或点击上下箭头即可调整播放队列顺序');
    hintEl.style.margin = '0 0 10px';
    hintEl.style.fontSize = '12px';
    hintEl.style.display = 'none';

    const scrollBody = h('div', 'sheet-scroll-body');
    const listWrap = h('div', '');
    scrollBody.append(hintEl, listWrap);
    box.append(headRow, scrollBody);

    const syncQueueIndexToCurrent = () => {
      const curKey = S.current ? identity(S.current) : '';
      if (!curKey) { S.queueIndex = 0; return; }
      const idx = S.queue.findIndex(item => identity(item) === curKey);
      S.queueIndex = idx >= 0 ? idx : Math.max(0, Math.min(S.queueIndex, S.queue.length - 1));
    };

    const moveQueueItem = (fromIdx, toIdx) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= S.queue.length || toIdx >= S.queue.length) return;
      const moved = S.queue.splice(fromIdx, 1)[0];
      S.queue.splice(toIdx, 0, moved);
      nextShuffleKey = '';
      syncQueueIndexToCurrent();
      if (typeof cancelAutoMix === 'function') cancelAutoMix();
      if (typeof refreshAutoMixPlan === 'function') refreshAutoMixPlan();
      savePlayback();
      renderQueueList();
    };

    const removeQueueItem = (index) => {
      if (index < 0 || index >= S.queue.length) return;
      const target = S.queue[index];
      const wasCurrent = S.current && identity(target) === identity(S.current) && index === S.queueIndex;
      S.queue.splice(index, 1);
      nextShuffleKey = '';
      if (typeof cancelAutoMix === 'function') cancelAutoMix();
      if (!S.queue.length) {
        S.queueIndex = 0;
        S.current = null;
        try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) {}
        setPlaying(false);
        updateDock();
      } else if (wasCurrent) {
        const nextIdx = Math.min(index, S.queue.length - 1);
        S.queueIndex = nextIdx;
        playSong(S.queue[nextIdx], S.queue, { autoPlay: S.playing });
      } else {
        syncQueueIndexToCurrent();
        if (typeof refreshAutoMixPlan === 'function') refreshAutoMixPlan();
        savePlayback();
      }
      notify('已从播放队列移除「' + (target?.name || '歌曲') + '」');
      renderQueueList();
    };

    sortToggleBtn.onclick = () => {
      sortMode = !sortMode;
      sortToggleBtn.textContent = sortMode ? '完成排序' : '排序';
      sortToggleBtn.classList.toggle('accent', sortMode);
      hintEl.style.display = sortMode ? 'block' : 'none';
      renderQueueList();
    };

    const renderQueueList = () => {
      listWrap.replaceChildren();
      sortToggleBtn.style.display = S.queue.length > 1 ? '' : 'none';
      if (!S.queue.length) {
        hintEl.style.display = 'none';
        listWrap.appendChild(h('p', 'muted', '队列还是空的，先播放一首歌。'));
        return;
      }
      S.queue.forEach((song, index) => {
        const songKey = identity(song);
        const isOnline = song && song.source !== 'local' && song.provider !== 'local';
        const row = h('div', 'queue-row' + (index === S.queueIndex ? ' playing' : ''));
        if (songKey) row.dataset.songKey = songKey;
        row.draggable = S.queue.length > 1;
        row.ondragstart = event => {
          dragFromIndex = index;
          row.style.opacity = '0.5';
          try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
        };
        row.ondragend = () => {
          dragFromIndex = -1;
          row.style.opacity = '';
          listWrap.querySelectorAll('.queue-row').forEach(el => { el.style.boxShadow = ''; });
        };
        row.ondragover = event => {
          if (dragFromIndex < 0 || dragFromIndex === index) return;
          event.preventDefault();
          row.style.boxShadow = 'inset 0 2px 0 var(--accent, #64d2ff)';
        };
        row.ondragleave = () => { row.style.boxShadow = ''; };
        row.ondrop = event => {
          event.preventDefault();
          row.style.boxShadow = '';
          if (dragFromIndex >= 0 && dragFromIndex !== index) {
            const from = dragFromIndex;
            dragFromIndex = -1;
            moveQueueItem(from, index);
          }
        };
        const art = h('div', 'art');
        applyArtSurface(art, rawCoverOf(song), song.name || song.artist || '', 'music', songKey);
        const badge = srcBadge(songSource(song) || song.source);
        if (badge) art.appendChild(badge);
        const copy = h('div', 'copy');
        copy.appendChild(h('strong', '', song.name || '未知歌曲'));
        copy.appendChild(h('small', '', (song.artist || song.singer || '未知歌手') + (isOnline ? ' · ' + platformName(song) : '')));
        const rowActs = h('div', 'queue-actions');
        if (sortMode) {
          const upBtn = h('button', 'row-act', '↑');
          upBtn.type = 'button';
          upBtn.title = '上移一位';
          upBtn.disabled = index === 0;
          upBtn.onclick = event => { event.stopPropagation(); moveQueueItem(index, index - 1); };
          const downBtn = h('button', 'row-act', '↓');
          downBtn.type = 'button';
          downBtn.title = '下移一位';
          downBtn.disabled = index >= S.queue.length - 1;
          downBtn.onclick = event => { event.stopPropagation(); moveQueueItem(index, index + 1); };
          rowActs.append(upBtn, downBtn);
        } else {
          if (isOnline) {
            const switchBtn = h('button', 'row-act row-switch');
            switchBtn.type = 'button';
            switchBtn.setAttribute('aria-label', '切换歌曲平台');
            switchBtn.title = '切换歌曲平台';
            switchBtn.appendChild(svgIcon('switchPlatform'));
            switchBtn.onclick = event => {
              event.stopPropagation();
              openSwitchPlatformModal(song, {
                mode: 'queue',
                index,
                onReplaced: () => { if (backdrop.isConnected) renderQueueList(); }
              });
            };
            rowActs.appendChild(switchBtn);
          }
          const likeBtn = h('button', 'row-act row-like');
          likeBtn.type = 'button';
          if (songKey) likeBtn.dataset.likeKey = songKey;
          renderLikeButton(likeBtn, isFavorite(song), false);
          likeBtn.onclick = event => {
            event.stopPropagation();
            toggleFavorite(song);
            renderLikeButton(likeBtn, isFavorite(song), true);
          };
          rowActs.appendChild(likeBtn);
          if (index !== S.queueIndex) {
            const nextBtn = h('button', 'row-act row-play-next');
            nextBtn.type = 'button';
            nextBtn.setAttribute('aria-label', '下一首播放');
            nextBtn.title = '下一首播放';
            nextBtn.appendChild(svgIcon('playNext'));
            nextBtn.onclick = event => {
              event.stopPropagation();
              playNextSong(song);
              if (backdrop.isConnected) renderQueueList();
            };
            rowActs.appendChild(nextBtn);
          }
        }
        const delBtn = h('button', 'row-act');
        delBtn.type = 'button';
        delBtn.setAttribute('aria-label', '从队列移除');
        delBtn.title = '从队列移除';
        delBtn.appendChild(svgIcon('trash'));
        delBtn.onclick = event => {
          event.stopPropagation();
          removeQueueItem(index);
        };
        rowActs.appendChild(delBtn);
        row.append(art, copy, rowActs);
        row.onclick = () => { if (sortMode) return; S.queueIndex = index; playSong(song, S.queue); closeModal(backdrop); };
        row.oncontextmenu = event => {
          event.preventDefault();
          openSongContextMenu(event, song, {
            hidePlayNext: index === S.queueIndex,
            removeLabel: '从队列移除',
            onRemove: () => removeQueueItem(index),
            onPlay: () => { S.queueIndex = index; playSong(song, S.queue); closeModal(backdrop); }
          });
        };
        listWrap.appendChild(row);
      });
    };
    renderQueueList();
    backdrop.appendChild(box);
    void hydrateCovers(S.queue);
    requestAnimationFrame(() => {
      const currentRow = box.querySelector('.queue-row.playing');
      if (currentRow) currentRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
  let activeSongCtxCleanup = null;
  function closeSongContextMenu() {
    if (typeof activeSongCtxCleanup === 'function') {
      const fn = activeSongCtxCleanup;
      activeSongCtxCleanup = null;
      fn();
    }
  }
  function openSongContextMenu(event, song, opts) {
    closeSongContextMenu();
    if (!song) return;
    const isOnline = song.source !== 'local' && song.provider !== 'local';
    const menu = h('div', 'song-ctx-menu glass popover');
    const addItem = (label, fn, extraClass) => {
      const btn = h('button', 'song-ctx-item' + (extraClass ? ' ' + extraClass : ''), label);
      btn.type = 'button';
      btn.onclick = e => { e.stopPropagation(); closeSongContextMenu(); fn(); };
      menu.appendChild(btn);
    };
    if (typeof opts?.onPlay === 'function') addItem('立即播放', opts.onPlay);
    if (!opts?.hidePlayNext) addItem('下一首播放', () => playNextSong(song));
    addItem(isFavorite(song) ? '取消收藏' : '收藏到我喜欢的', () => {
      toggleFavorite(song);
      if (typeof opts?.onLikeChanged === 'function') opts.onLikeChanged(song, isFavorite(song));
    });
    addItem('添加到歌单…', () => openAddMenu(song, opts));
    if (isOnline) addItem('下载歌曲', () => downloadCurrent(song));
    if (typeof opts?.onRemove === 'function') addItem(opts.removeLabel || '从歌单移除', () => opts.onRemove(song), 'danger');
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - rect.width - 8, (event?.clientX || 120)));
    const y = Math.max(8, Math.min(window.innerHeight - rect.height - 8, (event?.clientY || 120)));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    const onPointerDown = e => { if (!menu.contains(e.target)) closeSongContextMenu(); };
    const onKeyDown = e => { if (e.key === 'Escape') closeSongContextMenu(); };
    setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
    }, 0);
    activeSongCtxCleanup = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      menu.remove();
    };
  }
  function openAddMenu(song, opts) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '添加至歌单'));
    const lists = (S.library || []).filter(item => item && item.isFavorite !== true);
    if (!opts?.hidePlayNext) {
      const nextRow = h('div', 'queue-row');
      const nextCopy = h('div', 'copy'); nextCopy.appendChild(h('strong', '', '下一首播放'));
      nextRow.appendChild(nextCopy);
      nextRow.onclick = () => { closeModal(backdrop); playNextSong(song); };
      box.appendChild(nextRow);
    }
    if (typeof opts?.onRemove === 'function') {
      const rem = h('div', 'queue-row');
      const remCopy = h('div', 'copy'); remCopy.appendChild(h('strong', '', opts.removeLabel || '从当前歌单移除'));
      rem.appendChild(remCopy);
      rem.onclick = () => { closeModal(backdrop); opts.onRemove(song); };
      box.appendChild(rem);
    }
    const favRow = h('div', 'queue-row');
    const favCopy = h('div', 'copy'); favCopy.appendChild(h('strong', '', isFavorite(song) ? '取消收藏' : '添加到「我的收藏」'));
    favRow.appendChild(favCopy);
    favRow.onclick = () => { closeModal(backdrop); toggleFavorite(song); if (typeof opts?.onLikeChanged === 'function') opts.onLikeChanged(song, isFavorite(song)); };
    box.appendChild(favRow);
    if (!lists.length) box.appendChild(h('p', 'muted', '还没有自建歌单，可在曲库新建一个。'));
    lists.forEach(playlist => {
      const row = h('div', 'queue-row');
      const copy = h('div', 'copy'); copy.appendChild(h('strong', '', playlist.name)); copy.appendChild(h('small', '', (playlist.trackCount || 0) + ' 首'));
      row.append(copy);
      row.onclick = async () => {
        try {
          await window.desktopWindow.addBuiltInPlaylistTrack(playlist.id, song);
          window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
          const key = identity(song);
          const fromSearch = !!S.searchOpen || (S.current && identity(S.current) === key && S.playingFromSearch);
          if (key && fromSearch) {
            const target = { type: 'builtin', id: playlist.id, name: playlist.name };
            S.searchAddedPlaylistMap[key] = target;
            if (S.current && identity(S.current) === key && S.playingFromSearch) {
              void switchSearchQueueToTarget(key, target);
            }
          }
          closeModal(backdrop); notify('已添加到「' + playlist.name + '」'); await loadHome(true);
        } catch (error) { notify('添加失败：' + error.message); }
      };
      box.appendChild(row);
    });
    backdrop.appendChild(box);
  }
  function openAudioFxSheet(onChanged) {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    const head = h('div', 'sheet-sticky-head');
    const titleCol = h('div', '');
    const title = h('h2', '', '音效');
    title.style.margin = '0';
    const summaryEl = h('small', '', audioFxSummary());
    summaryEl.style.color = 'var(--accent)';
    summaryEl.style.fontSize = '12px';
    titleCol.append(title, summaryEl);
    const doneBtn = h('button', 'pill-btn', '完成');
    doneBtn.type = 'button';
    doneBtn.onclick = () => closeModal(backdrop);
    head.append(titleCol, doneBtn);
    const editorWrap = h('div', 'sheet-scroll-body');
    editorWrap.appendChild(buildAudioFxEditor(() => {
      summaryEl.textContent = audioFxSummary();
      if (typeof onChanged === 'function') onChanged();
    }));
    box.append(head, editorWrap);
    backdrop.appendChild(box);
  }
  function openSleepTimerSheet(onChanged) {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    const head = h('div', 'sheet-sticky-head');
    const titleCol = h('div', '');
    const title = h('h2', '', '定时关闭');
    title.style.margin = '0';
    const statusEl = h('small', '', '');
    statusEl.style.fontSize = '12px';
    titleCol.append(title, statusEl);
    const doneBtn = h('button', 'pill-btn', '完成');
    doneBtn.type = 'button';
    doneBtn.onclick = () => closeModal(backdrop);
    head.append(titleCol, doneBtn);
    const body = h('div', 'sheet-scroll-body');
    box.append(head, body);

    const renderSleep = () => {
      body.replaceChildren();
      if (S.sleepMode === 'off') {
        statusEl.textContent = '当前未开启定时关闭';
        statusEl.style.color = 'var(--muted)';
        delete statusEl.dataset.sleepLive;
      } else if (S.sleepMode === 'song') {
        statusEl.textContent = '将在本首歌曲播放完成后自动暂停';
        statusEl.style.color = 'var(--accent)';
        delete statusEl.dataset.sleepLive;
      } else {
        statusEl.textContent = S.sleepRemainingText || '已开启';
        statusEl.style.color = 'var(--accent)';
        statusEl.dataset.sleepLive = '1';
      }
      const panel = h('div', 'more-sheet-panel');
      const chips = h('div', 'sleep-chip-wrap');
      [['off', '关闭', 0], ['song', '本首播完', -1], ['10', '10 分钟', 10], ['30', '30 分钟', 30], ['45', '45 分钟', 45], ['60', '60 分钟', 60], ['90', '90 分钟', 90]].forEach(([id, label, mins]) => {
        const c = h('button', 'sleep-chip' + (S.sleepMode === id ? ' active' : ''), label);
        c.type = 'button';
        c.onclick = () => {
          setSleepTimer(id, mins);
          renderSleep();
          if (typeof onChanged === 'function') onChanged();
        };
        chips.appendChild(c);
      });
      panel.appendChild(chips);
      const customRow = h('div', 'sleep-custom-row');
      const input = h('input'); input.type = 'number'; input.min = '1'; input.max = '480'; input.placeholder = '自定义分钟（1–480）';
      const setBtn = h('button', 'pill-btn accent', '设定');
      setBtn.type = 'button';
      setBtn.onclick = () => {
        const mins = parseInt(input.value, 10);
        if (mins >= 1 && mins <= 480) {
          setSleepTimer('custom', mins);
          input.value = '';
          renderSleep();
          if (typeof onChanged === 'function') onChanged();
        } else {
          notify('请输入 1–480 之间的分钟数');
        }
      };
      customRow.append(input, setBtn);
      panel.appendChild(customRow);
      const finRow = h('div', 'sleep-inline-row');
      const finCopy = h('div', 'sleep-inline-copy');
      finCopy.append(h('strong', '', '倒计时结束后播完整首'), h('small', '', '开启后等待当前歌曲自然播完再暂停'));
      const finSw = h('button', 'switch' + (S.sleepFinishSong ? ' on' : ''));
      finSw.type = 'button'; finSw.setAttribute('aria-label', '倒计时结束后播完整首');
      finSw.onclick = () => {
        S.sleepFinishSong = !S.sleepFinishSong;
        saveStore();
        renderSleep();
        if (typeof onChanged === 'function') onChanged();
      };
      finRow.append(finCopy, finSw);
      panel.appendChild(finRow);
      body.appendChild(panel);
    };
    renderSleep();
    backdrop.appendChild(box);
  }
  function openPlaybackMoreSheet() {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    const sheetHeadRow = h('div', 'sheet-sticky-head');
    const heading = h('h2', '', '更多');
    heading.style.margin = '0';
    const doneBtn = h('button', 'pill-btn', '完成');
    doneBtn.type = 'button';
    doneBtn.onclick = () => closeModal(backdrop);
    sheetHeadRow.append(heading, doneBtn);
    box.appendChild(sheetHeadRow);

    const bodyHost = h('div', 'sheet-scroll-body');
    box.appendChild(bodyHost);

    const renderSheet = () => {
      bodyHost.replaceChildren();
      const song = S.current;
      const liked = song && isFavorite(song);
      const inLibrary = isSongInUserLibrary(song);
      const qualityLabel = S.quality === 'flac' ? '无损 FLAC' : S.quality === '320k' ? '高品质 320k' : '标准 128k';
      const artistRaw = song && (song.artist || song.singer || '');
      const artistDisplay = (artistRaw && artistRaw !== '未知歌手') ? artistRaw : '未知艺人';
      const albumDisplay = (song && (song.album || song.albumName)) || (song && song.name) || '当前单曲';
      const sleepTrailing = S.sleepMode === 'off' ? '未开启' : S.sleepMode === 'song' ? '播完本首关闭' : (S.sleepRemainingText || '已开启');

      if (song) {
        const songHead = h('div', 'more-sheet-head');
        const art = h('div', 'more-sheet-art');
        applyArtSurface(art, rawCoverOf(song), song.name || artistDisplay, 'music', identity(song));
        const copy = h('div', 'more-sheet-copy');
        copy.append(
          h('strong', '', song.name || '尚未播放'),
          h('small', '', artistDisplay + (song.album || song.albumName ? (' · ' + (song.album || song.albumName)) : ''))
        );
        songHead.append(art, copy);
        bodyHost.appendChild(songHead);
      }

      const group = h('div', 'more-sheet-group');
      const addItem = ({ icon, title, subtitle, trailing, accent, chevron, sleepLive, infoLabel, onInfo, onClick }) => {
        const btn = h('button', 'more-sheet-row' + (accent ? ' is-accent' : ''));
        btn.type = 'button';
        btn.appendChild(svgIcon(icon));
        const copy = h('div', 'more-sheet-row-copy');
        if (typeof onInfo === 'function') {
          const titleWrap = h('div', 'more-sheet-title-wrap');
          titleWrap.appendChild(h('strong', '', title));
          const infoBtn = h('span', 'smart-info-btn', '!');
          infoBtn.setAttribute('role', 'button');
          infoBtn.setAttribute('tabindex', '0');
          infoBtn.setAttribute('aria-label', infoLabel || (title + '说明'));
          infoBtn.onclick = ev => { ev.stopPropagation(); ev.preventDefault(); onInfo(); };
          titleWrap.appendChild(infoBtn);
          copy.appendChild(titleWrap);
        } else {
          copy.appendChild(h('strong', '', title));
        }
        if (subtitle) copy.appendChild(h('small', '', subtitle));
        btn.appendChild(copy);
        if (trailing) {
          const t = h('span', 'more-sheet-trailing', trailing);
          if (sleepLive) t.dataset.sleepLive = '1';
          btn.appendChild(t);
        }
        if (chevron) {
          const chev = h('span', 'more-sheet-trailing', '›');
          chev.style.fontSize = '18px';
          chev.style.lineHeight = '1';
          btn.appendChild(chev);
        }
        btn.onclick = onClick;
        group.appendChild(btn);
        return btn;
      };

      // 1. 添加至歌单
      addItem({
        icon: 'plus', title: '添加至歌单',
        onClick: () => { if (!song) return notify('请先播放歌曲'); closeModal(backdrop); openAddMenu(song); }
      });
      // 2. 切换歌曲平台（三端统一排序）
      if (song && song.source !== 'local' && song.provider !== 'local') {
        addItem({
          icon: 'switchPlatform', title: '切换歌曲平台',
          subtitle: '当前：' + platformName(song) + ' · 搜索网易云 / QQ / 酷狗 / 酷我同名版本',
          trailing: platformName(song),
          onClick: () => {
            closeModal(backdrop);
            openSwitchPlatformModal(song, { mode: 'queue', index: S.queueIndex });
          }
        });
      }
      // 3. 评论
      addItem({
        icon: 'comment', title: '评论',
        onClick: () => { if (!song) return notify('请先播放歌曲'); closeModal(backdrop); openComments(); }
      });
      // 4. 收藏
      addItem({
        icon: liked ? 'heartFill' : 'heart',
        title: liked ? '已收藏' : '收藏',
        accent: !!liked,
        onClick: () => { if (!song) return notify('请先播放歌曲'); toggleFavorite(song); renderSheet(); }
      });
      // 5. 下载歌曲
      addItem({
        icon: 'download', title: '下载歌曲',
        subtitle: song && (song.source === 'local' || song.provider === 'local') ? '当前已是本地音频' : `按当前音质（${qualityLabel}）下载保存`,
        onClick: () => { if (!song) return notify('请先播放歌曲'); closeModal(backdrop); downloadCurrent(song); }
      });
      // 6. 音质（与设置页一致的玻璃选择框弹窗）
      const qualityOptions = [['128k', '标准 128k'], ['320k', '高品质 320k'], ['flac', '无损 FLAC']];
      const qualitySelectLabel = (qualityOptions.find(item => item[0] === S.quality) || qualityOptions[0])[1];
      const qualityItem = h('div', 'more-sheet-row');
      qualityItem.appendChild(svgIcon('music'));
      const qualityCopy = h('div', 'more-sheet-row-copy');
      qualityCopy.appendChild(h('strong', '', '音质'));
      const qualityTrigger = h('button', 'setting-select-trigger glass light');
      qualityTrigger.type = 'button';
      qualityTrigger.setAttribute('aria-label', '音质');
      qualityTrigger.appendChild(h('span', 'value', qualitySelectLabel));
      const openMoreQualityMenu = ev => {
        if (ev) ev.stopPropagation();
        openAnchoredMenu(qualityTrigger, qualityOptions.map(([value, label]) => ({
          label,
          checked: S.quality === value,
          action: () => {
            S.quality = value;
            saveStore();
            notify('音质：' + label);
            if (S.current) playSong(S.current, S.queue, { startMs: S.position });
            renderSheet();
          }
        })));
      };
      qualityTrigger.onclick = openMoreQualityMenu;
      qualityItem.onclick = openMoreQualityMenu;
      qualityItem.append(qualityCopy, qualityTrigger);
      group.appendChild(qualityItem);

      // 6. 音效（独立原生窗口）
      const fxNorm = window.LxMineAudioFx ? window.LxMineAudioFx.normalizeConfig(S.audioFx) : S.audioFx;
      addItem({
        icon: 'sparkle', title: '音效',
        subtitle: '16 种风格预设 · 5 段均衡器 · 空间环绕与混响',
        trailing: audioFxSummary(fxNorm),
        accent: !!(fxNorm && fxNorm.active),
        chevron: true,
        onClick: () => openAudioFxSheet(() => renderSheet())
      });

      // 7. 查看艺人
      addItem({
        icon: 'search', title: '查看艺人：' + artistDisplay,
        onClick: () => { closeModal(backdrop); viewCurrentArtist(); }
      });
      // 8. 查看专辑
      addItem({
        icon: 'library', title: '查看专辑：' + albumDisplay,
        onClick: () => { closeModal(backdrop); viewCurrentAlbum(); }
      });
      // 9. 混韵天成（直控开关）
      const mixOn = !!S.autoMixEnabled;
      const mixItem = h('div', 'more-sheet-row' + (mixOn ? ' is-accent' : ''));
      mixItem.appendChild(svgIcon('styleWand'));
      const mixCopy = h('div', 'more-sheet-row-copy');
      const mixTitleWrap = h('div', 'more-sheet-title-wrap');
      mixTitleWrap.appendChild(h('strong', '', '混韵天成'));
      const mixInfoBtn = h('button', 'smart-info-btn', '!');
      mixInfoBtn.type = 'button';
      mixInfoBtn.setAttribute('aria-label', '混韵天成说明');
      mixInfoBtn.title = '混韵天成说明';
      mixInfoBtn.onclick = ev => { ev.stopPropagation(); openPlayTransitionInfoModal(); };
      mixTitleWrap.appendChild(mixInfoBtn);
      mixCopy.append(
        mixTitleWrap,
        h('small', '', mixOn ? (S.autoMixPreview || '自动分析前后首节奏与尾奏/前奏，平滑衔接下一首') : '自动分析队列相邻歌曲的节奏与尾奏/前奏，平滑衔接下一首')
      );
      const mixSw = h('button', 'switch' + (mixOn ? ' on' : ''));
      mixSw.type = 'button';
      mixSw.setAttribute('aria-label', '混韵天成开关');
      const toggleAutoMix = ev => {
        if (ev) ev.stopPropagation();
        S.autoMixEnabled = !mixOn;
        if (!S.autoMixEnabled) cancelAutoMix();
        else refreshAutoMixPlan();
        saveStore();
        renderSheet();
      };
      mixSw.onclick = toggleAutoMix;
      mixItem.onclick = toggleAutoMix;
      mixItem.append(mixCopy, mixSw);
      group.appendChild(mixItem);

      // 9.5 播放/暂停淡入淡出
      const fadeOn = S.playPauseFadeEnabled !== false;
      const fadeItem = h('div', 'more-sheet-row' + (fadeOn ? ' is-accent' : ''));
      fadeItem.appendChild(svgIcon('volume'));
      const fadeCopy = h('div', 'more-sheet-row-copy');
      fadeCopy.append(h('strong', '', '播放/暂停淡入淡出'), h('small', '', '开始播放时渐强、暂停时渐弱，避免声音戛然而止'));
      const fadeSw = h('button', 'switch' + (fadeOn ? ' on' : ''));
      fadeSw.type = 'button';
      fadeSw.setAttribute('aria-label', '播放/暂停淡入淡出开关');
      const toggleFade = ev => {
        if (ev) ev.stopPropagation();
        S.playPauseFadeEnabled = !fadeOn;
        saveStore();
        renderSheet();
      };
      fadeSw.onclick = toggleFade;
      fadeItem.onclick = toggleFade;
      fadeItem.append(fadeCopy, fadeSw);
      group.appendChild(fadeItem);

      // 10. 不感兴趣（在自己曲库中不出现）
      if (song && !inLibrary) {
        addItem({
          icon: 'close', title: '不感兴趣',
          subtitle: '减少相似推荐并立即切至下一首',
          onClick: () => { closeModal(backdrop); dislikeCurrentSong(); }
        });
      }

      // 11. 相似歌曲
      addItem({
        icon: 'sparkle', title: '相似歌曲',
        subtitle: '发现与当前曲目同风格的好歌',
        onClick: () => { closeModal(backdrop); void openSimilarSongs(); }
      });

      // 12. 定时关闭（独立原生窗口）
      addItem({
        icon: 'clock', title: '定时关闭',
        trailing: sleepTrailing, accent: S.sleepMode !== 'off',
        chevron: true, sleepLive: true,
        onClick: () => openSleepTimerSheet(() => renderSheet())
      });

      bodyHost.appendChild(group);

      // PC 快捷音量与桌面歌词控制条（不占用 6 键播控栏，方便桌面快速调节）
      const pcStrip = h('div', 'more-pc-strip');
      const volLine = h('div', 'more-pc-vol');
      volLine.appendChild(h('span', '', '音量'));
      const volInput = h('input'); volInput.type = 'range'; volInput.min = '0'; volInput.max = '100'; volInput.step = '1';
      volInput.value = String(Math.round(S.volume * 100));
      const volText = h('span', '', Math.round(S.volume * 100) + '%');
      volText.style.textAlign = 'right';
      const volReset = makeSliderResetBtn('音量', () => {
        setVolume(defaults.volume, true);
        const pct = Math.round(defaults.volume * 100);
        volInput.value = String(pct);
        volText.textContent = pct + '%';
        volReset.classList.remove('modified');
      }, Math.abs(S.volume - defaults.volume) > 0.005);
      volInput.oninput = () => {
        const pct = Math.round(Number(volInput.value) || 0);
        setVolume(pct / 100, false);
        volText.textContent = pct + '%';
        volReset.classList.toggle('modified', Math.abs(S.volume - defaults.volume) > 0.005);
      };
      volInput.onchange = () => saveStore();
      volLine.append(volInput, volText, volReset);
      const pcBtnRow = h('div', 'fx-chip-wrap');
      const dlBtn = h('button', 'fx-chip' + (S.desktopLyrics ? ' active' : ''), S.desktopLyrics ? '桌面歌词：开' : '桌面歌词：关');
      dlBtn.type = 'button';
      dlBtn.onclick = () => { applyDesktopLyrics(!S.desktopLyrics); renderSheet(); };
      const lockBtn = h('button', 'fx-chip' + (S.desktopLyricsLocked ? ' active' : ''), S.desktopLyricsLocked ? '已锁定桌面歌词' : '锁定桌面歌词');
      lockBtn.type = 'button';
      lockBtn.onclick = () => {
        S.desktopLyricsLocked = !S.desktopLyricsLocked; saveStore();
        window.desktopWindow?.setDesktopLyricsLocked?.(S.desktopLyricsLocked);
        renderSheet();
      };
      pcBtnRow.append(dlBtn, lockBtn);
      pcStrip.append(volLine, pcBtnRow);
      bodyHost.appendChild(pcStrip);
    };

    renderSheet();
    backdrop.appendChild(box);
  }
  function openPlaybackMenu() { openPlaybackMoreSheet(); }
  function generateSyncPairCode() {
    try {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return String(100000 + (arr[0] % 900000));
    } catch (_) {
      return String(100000 + Math.floor(Math.random() * 900000));
    }
  }
  function formatSyncPairCode(code) {
    const clean = String(code || '').replace(/\D/g, '');
    return clean.length === 6 ? clean.slice(0, 3) + ' ' + clean.slice(3) : clean;
  }
  function syncPlatformLabel(platform) {
    if (platform === 'harmony') return 'HarmonyOS';
    if (platform === 'android') return 'Android';
    if (platform === 'win32' || platform === 'windows') return 'Windows';
    if (platform === 'darwin' || platform === 'macos') return 'macOS';
    if (platform === 'linux') return 'Linux';
    return platform || '设备';
  }
  function openSyncPanel() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '局域网同步'));
    box.appendChild(h('p', 'muted', '仅已加入「设备信任圈」的设备可互相发送或自动同步数据，防止同 Wi-Fi 下陌生设备误同步。'));
    const autoRow = settingSwitch('同局域网自动同步歌单', '仅与信任圈内同样开启此项的设备自动合并歌单与收藏', S.lanAutoSync === true, async value => {
      S.lanAutoSync = value; saveStore();
      if (value) await persistFavoritesToLibrary(false);
      window.lxMusic?.syncSetAuto?.(value).catch?.(() => {});
    });
    const transitiveRow = settingSwitch(
      '信任圈成员互通',
      '开启后，配对新设备时自动同步对方信任圈里的设备并互相引荐；关闭则仅拉入当前配对设备',
      true,
      async value => {
        try {
          await window.lxMusic?.syncSetTransitive?.(value);
          notify(value ? '已开启信任圈成员互通' : '已关闭信任圈成员互通（仅拉入当前配对设备）');
        } catch (_) {}
      }
    );
    const transitiveInput = transitiveRow.querySelector('input[type="checkbox"]');
    box.append(autoRow, transitiveRow);
    const status = h('p', 'muted', '正在读取设备…');
    const trustedHead = h('div', 'sync-section-head');
    const trustedList = h('div', '');
    const nearbyHead = h('div', 'sync-section-head');
    nearbyHead.appendChild(h('span', '', '附近未信任设备'));
    const list = h('div', '');
    const directRow = h('div', 'sync-direct-row');
    const directInput = h('input'); directInput.type = 'text'; directInput.placeholder = '广播隔离时手动直连：输入对端 IP:端口（如 192.168.1.20:41300）';
    const directBtn = h('button', 'pill-btn', '直连');
    directBtn.onclick = async () => {
      const target = directInput.value.trim();
      if (!target) return notify('请输入对端 IP 地址');
      const code = generateSyncPairCode();
      directBtn.disabled = true; directBtn.textContent = '连接中…';
      status.textContent = '正在连接 ' + target + '（若未信任将请求加入信任圈，验证码：' + formatSyncPairCode(code) + '）…';
      try {
        await persistFavoritesToLibrary();
        const result = await window.lxMusic.syncSendDirect(target, code);
        if (result?.mode === 'pair') {
          const extra = result.introducedCount > 0 ? `，并同步加入对方信任圈内 ${result.introducedCount} 台设备` : '';
          status.textContent = result.accepted
            ? '已将「' + (result.peerName || target) + '」加入信任圈' + extra + '，请在上方信任圈中发送同步'
            : '对方未接受信任请求：' + (result.message || '已拒绝');
          if (result.accepted) refresh();
        } else {
          status.textContent = result?.accepted
            ? '已直连同步到「' + (result.peerName || target) + '」'
            : '对方未接受：' + (result?.message || '已拒绝');
        }
      } catch (error) { status.textContent = '直连失败：' + error.message; }
      directBtn.disabled = false; directBtn.textContent = '直连';
    };
    directRow.append(directInput, directBtn);
    box.append(status, trustedHead, trustedList, nearbyHead, list, directRow);
    backdrop.appendChild(box);
    const confirmRemoveTrusted = (item) => {
      const confirmBackdrop = modal(null);
      const confirmBox = h('div', 'modal glass');
      confirmBox.appendChild(h('h2', '', '移出信任圈'));
      confirmBox.appendChild(h('p', 'muted', '确定将「' + (item.name || '设备') + '」移出设备信任圈吗？移出后双方将无法手动发送或自动同步数据。'));
      const actions = h('div', 'modal-actions');
      const cancelBtn = h('button', 'pill-btn', '取消');
      const okBtn = h('button', 'pill-btn accent', '确认移出');
      cancelBtn.onclick = () => closeModal(confirmBackdrop);
      okBtn.onclick = async () => {
        cancelBtn.disabled = okBtn.disabled = true;
        try {
          await window.lxMusic.syncRemoveTrusted(item.id);
          closeModal(confirmBackdrop);
          notify('已将「' + (item.name || '设备') + '」移出信任圈');
          refresh();
        } catch (error) {
          closeModal(confirmBackdrop);
          status.textContent = '移除失败：' + error.message;
        }
      };
      actions.append(cancelBtn, okBtn);
      confirmBox.appendChild(actions);
      confirmBackdrop.appendChild(confirmBox);
    };
    let refreshSeq = 0;
    const refresh = async () => {
      const seq = ++refreshSeq;
      try {
        const [state, devices, trusted] = await Promise.all([
          window.lxMusic.syncStatus(),
          window.lxMusic.syncDevices(),
          window.lxMusic.syncTrusted ? window.lxMusic.syncTrusted() : Promise.resolve([]),
        ]);
        if (seq !== refreshSeq || !box.isConnected) return;
        if (transitiveInput && typeof state?.trustCircleTransitive === 'boolean') {
          transitiveInput.checked = state.trustCircleTransitive;
        }
        const addrText = Array.isArray(state.addresses) && state.addresses.length && state.port
          ? `（${state.addresses[0]}:${state.port}）`
          : '';
        status.textContent = '本机：' + (state.deviceName || 'LxMine PC') + addrText;
        const trustedArr = Array.isArray(trusted) ? trusted : [];
        const trustedIds = new Set(trustedArr.map(item => item.id));
        const onlineMap = new Map((devices || []).map(item => [item.id, item]));

        trustedHead.replaceChildren(h('span', '', '设备信任圈（' + trustedArr.length + ' 台）'));
        trustedList.replaceChildren();
        if (!trustedArr.length) {
          trustedList.appendChild(h('p', 'muted', '当前信任圈为空：请先在下方「附近未信任设备」点击「加入信任圈」，对方确认验证码后即可在此发送同步。'));
        } else {
          trustedArr.forEach(item => {
            const online = onlineMap.get(item.id);
            const row = h('div', 'queue-row sync-device-row');
            const copy = h('div', 'copy');
            const title = h('strong', '', item.name || '设备');
            const badge = h('span', 'sync-trust-tag ' + (online ? 'trusted' : 'untrusted'), online ? '在线' : '离线');
            title.appendChild(badge);
            const meta = [syncPlatformLabel(item.platform)];
            if (online) meta.push(online.address + ':' + online.port);
            if (online?.autoSyncPlaylists) meta.push('自动同步已开启');
            copy.append(title, h('small', '', meta.join(' · ')));
            const actions = h('div', 'sync-row-actions');
            const sendBtn = h('button', 'pill-btn' + (online ? ' accent' : ''), online ? '发送同步' : '离线');
            sendBtn.disabled = !online;
            sendBtn.onclick = async () => {
              if (!online) return;
              sendBtn.disabled = true; sendBtn.textContent = '等待对方确认…';
              try {
                await persistFavoritesToLibrary();
                const result = await window.lxMusic.syncSend(online.id);
                if (result?.code === 'UNTRUSTED') {
                  status.textContent = '「' + item.name + '」已将本机移出信任圈，请先移除再重新加入信任圈';
                } else {
                  status.textContent = result?.accepted ? '已保存到「' + item.name + '」' : '对方未接受：' + (result?.message || '已拒绝');
                }
              } catch (error) { status.textContent = '同步失败：' + error.message; }
              sendBtn.disabled = false; sendBtn.textContent = '发送同步';
            };
            const removeBtn = h('button', 'pill-btn', '移除');
            removeBtn.onclick = () => confirmRemoveTrusted(item);
            actions.append(sendBtn, removeBtn);
            row.append(copy, actions);
            trustedList.appendChild(row);
          });
        }

        list.replaceChildren();
        const allDevices = Array.isArray(devices) ? devices : [];
        const untrustedDevices = allDevices
          .filter(device => !trustedIds.has(device.id))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        if (!allDevices.length) {
          list.appendChild(h('p', 'muted', '还没有自动发现其他设备，确认连接同一 Wi-Fi 或使用下方 IP 直连。'));
        } else if (!untrustedDevices.length) {
          list.appendChild(h('p', 'muted', '附近发现的 ' + allDevices.length + ' 台设备均已在上方信任圈内，请在信任圈中发送或管理。'));
        } else {
          untrustedDevices.forEach(device => {
            const row = h('div', 'queue-row sync-device-row');
            const metaParts = [syncPlatformLabel(device.platform), (device.address || '') + (device.port ? ':' + device.port : '')];
            if (device.autoSyncPlaylists) metaParts.push('自动同步已开启');
            const copy = h('div', 'copy');
            const title = h('strong', '', device.name || '设备');
            title.appendChild(h('span', 'sync-trust-tag untrusted', '未信任'));
            copy.append(title, h('small', '', metaParts.filter(Boolean).join(' · ')));
            const pairBtn = h('button', 'pill-btn accent', '加入信任圈');
            pairBtn.onclick = async () => {
              const code = generateSyncPairCode();
              pairBtn.disabled = true; pairBtn.textContent = '等待确认…';
              status.textContent = '等待「' + device.name + '」确认加入信任圈（核对验证码：' + formatSyncPairCode(code) + '）…';
              try {
                const result = await window.lxMusic.syncPair(device.id, code);
                const extra = result?.introducedCount > 0 ? `（并同步加入对方信任圈内 ${result.introducedCount} 台设备）` : '';
                status.textContent = result?.accepted
                  ? '已将「' + (result.peerName || device.name) + '」加入信任圈' + extra
                  : '对方未接受：' + (result?.message || '已拒绝');
                if (result?.accepted) refresh();
              } catch (error) { status.textContent = '加入信任圈失败：' + error.message; }
              pairBtn.disabled = false; pairBtn.textContent = '加入信任圈';
            };
            row.append(copy, pairBtn);
            list.appendChild(row);
          });
        }
      } catch (error) { status.textContent = '读取失败：' + error.message; }
    };
    refresh();
    const unsubDevices = window.lxMusic?.onSyncEvent?.('devices-changed', () => {
      if (!box.isConnected) { unsubDevices?.(); return; }
      refresh();
    });
    const unsubTrusted = window.lxMusic?.onSyncEvent?.('trusted-changed', () => {
      if (!box.isConnected) { unsubTrusted?.(); return; }
      refresh();
    });
    const refreshBtn = h('button', 'pill-btn', '刷新设备');
    refreshBtn.onclick = refresh;
    box.appendChild(h('div', 'modal-actions')).appendChild(refreshBtn);
    checkPendingSync();
  }
  let checkingPendingSync = false;
  async function checkPendingSync() {
    if (!window.lxMusic || !window.lxMusic.syncPending) return;
    if (checkingPendingSync) return;
    checkingPendingSync = true;
    try {
      const pending = await window.lxMusic.syncPending();
      const existing = document.querySelector('.sync-incoming-modal');
      if (existing && pending?.some(item => item.pendingId === existing.dataset.pendingId)) return;
      if (existing) { existing.classList.remove('sync-incoming-modal'); closeModal(existing.parentElement); }
      if (!pending || !pending.length) return;
      const incoming = pending[0];
      const isPair = incoming.kind === 'pair';
      const backdrop = modal(null);
      const box = h('div', 'modal glass sync-incoming-modal');
      box.dataset.pendingId = incoming.pendingId;
      const peerName = (incoming.peer && incoming.peer.name) || '另一台设备';
      if (isPair) {
        box.appendChild(h('h2', '', '信任圈加入请求'));
        box.appendChild(h('p', 'muted', '「' + peerName + '」（' + syncPlatformLabel(incoming.peer?.platform) + '）请求加入您的设备信任圈。请核对对方屏幕上的验证码，确认后可与本机互相发送及自动同步歌单：'));
        box.appendChild(h('div', 'sync-pair-code', formatSyncPairCode(incoming.code)));
        if (incoming.transitive) {
          box.appendChild(h('p', 'muted', '对方已开启「信任圈成员互通」：若本机也开启此开关，确认后双方信任圈内已有设备将自动互相加入。'));
        }
      } else {
        box.appendChild(h('h2', '', '接收同步'));
        const summary = incoming.summary || {};
        box.appendChild(h('p', 'muted', '已信任设备「' + peerName + '」将发送 ' +
          (summary.playlists || 0) + ' 个歌单、' + (summary.sources || 0) + ' 个音源及设置，覆盖本机数据。'));
      }
      const status = h('p', 'muted', incoming.lastError || '');
      const actions = h('div', 'modal-actions');
      const reject = h('button', 'pill-btn', '拒绝');
      const accept = h('button', 'pill-btn accent', isPair ? '信任此设备' : '接收并覆盖');
      const respond = async accepted => {
        reject.disabled = accept.disabled = true;
        status.textContent = accepted ? (isPair ? '正在加入信任圈…' : '正在保存…') : '正在拒绝…';
        try {
          const result = await window.lxMusic.syncRespond(incoming.pendingId, accepted);
          if (!result || result.ok !== true) {
            if (result?.code === 'PENDING_NOT_FOUND') { closeModal(backdrop); notify(result.message); checkPendingSync(); return; }
            throw new Error(result?.message || '操作未能保存，请重试');
          }
          closeModal(backdrop);
          if (accepted) {
            if (isPair) notify('已将「' + peerName + '」加入设备信任圈');
            else await refreshSyncedLibrary();
          }
        } catch (error) { status.textContent = error.message; reject.disabled = accept.disabled = false; }
      };
      reject.onclick = () => respond(false); accept.onclick = () => respond(true);
      actions.append(reject, accept);
      box.append(status, actions);
      backdrop.appendChild(box);
      const expiryWatch = setInterval(() => { if (!box.isConnected) clearInterval(expiryWatch); else checkPendingSync(); }, 2000);
    } catch (_) {} finally { checkingPendingSync = false; }
  }

  /* ---------------- dock / input wiring ---------------- */
  function bindDock() {
    $('#dock-cover').onclick = openDetail;
    $('#dock-copy').onclick = openDetail;
    $('#dock-controls').addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      if (action === 'toggle') togglePlayback();
      else if (action === 'prev') nextSong(-1);
      else if (action === 'next') nextSong(1);
      else if (action === 'like') toggleFavorite(S.current);
      else if (action === 'mode') cycleMode();
      else if (action === 'download') downloadCurrent();
      else if (action === 'queue') openQueue();
      else if (action === 'more') openPlaybackMenu();
      else if (action === 'volume') openVolumePopover(button);
    });
    // Capture the lyrics button before any other click handler can navigate.
    // This is deliberately a document capture listener: the only allowed
    // outcome of this button is toggling the overlay, never switching tabs.
    document.addEventListener('click', event => {
      const button = event.target && event.target.closest
        ? event.target.closest('#dock-controls [data-action="desktop-lyrics"]')
        : null;
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      applyDesktopLyrics(!S.desktopLyrics);
    }, true);
    const lyricsButton = $('#dock-controls [data-action="desktop-lyrics"]');
    if (lyricsButton) {
      lyricsButton.oncontextmenu=event=>{event.preventDefault();S.desktopLyricsLocked=!S.desktopLyricsLocked;saveStore();window.desktopWindow?.setDesktopLyricsLocked?.(S.desktopLyricsLocked);notify(S.desktopLyricsLocked?'桌面歌词已锁定':'桌面歌词已解锁');};
    }
    const seek = $('#seek');
    let seekPointerId = null;
    const seekValueFromClientX = (clientX) => {
      const rect = seek.getBoundingClientRect();
      const maxVal = Math.max(1, Number(seek.max) || S.duration || 1);
      if (!rect || rect.width <= 0) return Number(seek.value) || 0;
      const thumbHalf = 6;
      const usable = Math.max(1, rect.width - thumbHalf * 2);
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left - thumbHalf) / usable));
      return Math.round(ratio * maxVal);
    };
    const previewSeekValue = (val) => {
      const maxVal = Math.max(1, Number(seek.max) || S.duration || 1);
      const clamped = Math.max(0, Math.min(maxVal, val));
      seek.value = String(clamped);
      seek.style.setProperty('--seek-pct', Math.max(0, Math.min(100, (clamped / maxVal) * 100)).toFixed(3) + '%');
      $('#time-now').textContent = fmtTime(clamped);
      return clamped;
    };
    // 直接接管进度条指针按下/移动/松开：单点轨道任意位置首下即准确跳转，拖动按屏幕刷新率丝滑跟手。
    seek.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!S.current || !(S.duration > 0)) return;
      event.preventDefault();
      seek.dataset.drag = '1';
      seekPointerId = event.pointerId;
      try { seek.setPointerCapture(event.pointerId); } catch (_) {}
      previewSeekValue(seekValueFromClientX(event.clientX));
    });
    seek.addEventListener('pointermove', event => {
      if (seek.dataset.drag !== '1' || (seekPointerId !== null && event.pointerId !== seekPointerId)) return;
      previewSeekValue(seekValueFromClientX(event.clientX));
    });
    const commitSeekPointer = (event, commit) => {
      if (seek.dataset.drag !== '1') return;
      if (seekPointerId !== null && event && event.pointerId !== undefined && event.pointerId !== seekPointerId) return;
      const target = event && Number.isFinite(event.clientX)
        ? previewSeekValue(seekValueFromClientX(event.clientX))
        : (Number(seek.value) || 0);
      seek.dataset.drag = '';
      if (seekPointerId !== null) {
        try { seek.releasePointerCapture(seekPointerId); } catch (_) {}
        seekPointerId = null;
      }
      if (commit) {
        seekGuardTarget = target;
        seekGuardUntil = Date.now() + 900;
        seekTo(target);
      }
      try { seek.blur(); } catch (_) {}
    };
    seek.addEventListener('pointerup', event => commitSeekPointer(event, true));
    seek.addEventListener('pointercancel', event => commitSeekPointer(event, false));
    seek.addEventListener('input', () => {
      if (seek.dataset.drag === '1') return;
      previewSeekValue(Number(seek.value) || 0);
    });
    seek.addEventListener('change', () => {
      if (seek.dataset.drag === '1') return;
      const target = previewSeekValue(Number(seek.value) || 0);
      seekGuardTarget = target;
      seekGuardUntil = Date.now() + 900;
      seekTo(target);
    });

    // 全局平滑滑动条增强：所有 input[type=range]（进度条除外）拖动期临时切换连续 step='any' 消除跳格顿挫，
    // 按屏幕刷新率节流派发 input，松手精确回弹步进并提交 change。
    if (!document.documentElement.dataset.lxSmoothRangeBound) {
      document.documentElement.dataset.lxSmoothRangeBound = '1';
      document.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const el = event.target;
        if (!(el instanceof HTMLInputElement) || el.type !== 'range' || el.id === 'seek' || el.disabled) return;
        const min = Number.isFinite(Number(el.min)) && el.min !== '' ? Number(el.min) : 0;
        const max = Number.isFinite(Number(el.max)) && el.max !== '' ? Number(el.max) : 100;
        if (max <= min) return;
        const logicalStepStr = el.dataset.logicalStep || el.getAttribute('step') || '1';
        el.dataset.logicalStep = logicalStepStr;
        const logicalStep = logicalStepStr === 'any' ? 0 : (Number(logicalStepStr) || 0);
        event.preventDefault();
        el.step = 'any';
        const pointerId = event.pointerId;
        try { el.setPointerCapture(pointerId); } catch (_) {}
        const calcRaw = (clientX) => {
          const rect = el.getBoundingClientRect();
          const thumbHalf = 7;
          const usable = Math.max(1, rect.width - thumbHalf * 2);
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left - thumbHalf) / usable));
          return min + (max - min) * ratio;
        };
        const snapFinal = (raw) => {
          const clamped = Math.max(min, Math.min(max, raw));
          if (logicalStep > 0) {
            const snapped = min + Math.round((clamped - min) / logicalStep) * logicalStep;
            return Math.max(min, Math.min(max, Math.round(snapped * 10000) / 10000));
          }
          return clamped;
        };
        let pendingRaf = 0;
        let lastRaw = calcRaw(event.clientX);
        el.value = String(lastRaw);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        const onMove = (moveEv) => {
          if (moveEv.pointerId !== pointerId) return;
          lastRaw = calcRaw(moveEv.clientX);
          el.value = String(lastRaw);
          if (!pendingRaf) {
            pendingRaf = requestAnimationFrame(() => {
              pendingRaf = 0;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            });
          }
        };
        const cleanup = (endEv, commit) => {
          if (endEv.pointerId !== pointerId) return;
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onCancel);
          if (pendingRaf) { cancelAnimationFrame(pendingRaf); pendingRaf = 0; }
          try { el.releasePointerCapture(pointerId); } catch (_) {}
          el.step = logicalStepStr;
          if (commit) {
            const finalVal = snapFinal(calcRaw(endEv.clientX));
            el.value = String(finalVal);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        const onUp = (upEv) => cleanup(upEv, true);
        const onCancel = (cancelEv) => cleanup(cancelEv, false);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
      }, true);
    }
    const nav = $('#nav');
    let navDown = false, navDragged = false, navStart = 0, navLast = 0;
    nav.addEventListener('pointerdown', event => { if (document.body.classList.contains('phone-compact')) return; navDown = true; navDragged = false; navStart = event.clientX; navLast = event.clientX; }, { passive: true });
    nav.addEventListener('pointermove', event => {
      if (!navDown) return;
      navLast = event.clientX;
      if (Math.abs(navLast - navStart) > 10) navDragged = true;
      if (!navDragged) return;
      const rect = nav.getBoundingClientRect();
      const index = Math.max(0, Math.min(2, Math.floor((navLast - rect.left) / (rect.width / 3))));
      const tabs = ['home', 'library', 'settings'];
      if (tabs[index] !== S.tab) setTab(tabs[index]);
    }, { passive: true });
    const navUp = () => { navDown = false; setTimeout(() => { navDragged = false; }, 0); };
    window.addEventListener('pointerup', navUp, { passive: true });
    window.addEventListener('pointercancel', navUp, { passive: true });
    window.addEventListener('blur', navUp);
    document.addEventListener('lxmine-pointer-release', navUp);
    $$('#nav .nav-item').forEach(button => {
      button.onclick = () => {
        if (document.body.classList.contains('phone-compact') && button.dataset.tab === S.tab) { S.phoneExpanded = true; S.scrollTravel = 0; S.dockCompact = false; updateHomeCompact(); return; }
        setTab(button.dataset.tab);
      };
    });
  }
  function bindSearch() {
    const input = $('#search-input');
    let timer = 0;
    input.addEventListener('input', () => {
      $('#search-clear').classList.toggle('hidden', !input.value);
      clearTimeout(timer);
      const value = input.value.trim();
      if (!value) { S.search.query = ''; renderSearchLanding(); return; }
      timer = setTimeout(() => performSearch(false), 380);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); clearTimeout(timer); performSearch(false); }
      if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
    });
    $('#search-submit').onclick = () => performSearch(false);
    $('#search-clear').onclick = () => { input.value = ''; S.search.query = ''; $('#search-clear').classList.add('hidden'); renderSearchLanding(); input.focus(); };
    $('#search-back').onclick = closeSearch;
  }
  function bindDetail() {
    $('#detail-back').onclick = closeDetail;
    const earBtn = $('#ear-monitor-btn'); if (earBtn) earBtn.onclick = openEarMonitorSheet;
    const cBtn = $('#comments-btn'); if (cBtn) cBtn.onclick = openComments;
    const qBtn = $('#quality-btn'); if (qBtn) qBtn.onclick = openQualityMenu;
    $('#style-btn').onclick = openStyleMenu;
    // PC 没有双指手势，沉浸按钮常驻：按下进入（隐藏其余控件），再按退出。
    $('#immersive-btn').onclick = () => { setDetailImmersive(!document.body.classList.contains('detail-immersive')); };
    updateEarMonitorButton();
  }
  function bindComments() {
    $('#comments-back').onclick = closeComments;
  }
  let lastSearchGeomKey = '';
  function updateSearchNodeGeometry(phone, scroll) {
    const entry = $('#search-node');
    if (!entry) return;
    const distance = phone ? 100 : 70;
    const t = Math.max(0, Math.min(1, scroll / distance));
    const w = innerWidth;
    const geomKey = (phone ? '1:' : '0:') + w + ':' + t.toFixed(3);
    if (geomKey === lastSearchGeomKey) return;
    lastSearchGeomKey = geomKey;
    entry.style.setProperty('--sr', t.toFixed(3));
    const height = 50;
    const baseWidth = phone ? Math.max(50, w - 40) : Math.max(50, Math.min(340, w - 300));
    const width = baseWidth + (50 - baseWidth) * t;
    if (phone) {
      entry.style.top = (92 - 50 * t).toFixed(1) + 'px';
      entry.style.left = (20 + (w - 70 - 20) * t).toFixed(1) + 'px';
      entry.style.right = 'auto';
    } else {
      entry.style.top = '38px';
      entry.style.left = 'auto';
      entry.style.right = '40px';
    }
    entry.style.width = width.toFixed(1) + 'px';
    entry.style.height = height.toFixed(1) + 'px';
    entry.style.borderRadius = '25px';
    entry.style.justifyContent = t > .88 ? 'center' : 'flex-start';
    entry.style.padding = t > .88 ? '0' : '0 16px';
    entry.style.gap = t > .88 ? '0' : '10px';
  }
  // 横向行出血：先清掉旧偏移量测出真实位置，再把行左右推到窗口边缘、内容缩回对齐。
  function syncRowBleed() {
    const w = window.innerWidth;
    const rows = [...document.querySelectorAll('.row-scroll')].filter(row => row.dataset.bleedW !== String(w));
    rows.forEach(row => {
      row.dataset.bleedW = String(w);
      row.style.marginLeft = ''; row.style.marginRight = '';
      row.style.paddingLeft = ''; row.style.paddingRight = '';
    });
    const insets = rows.map(row => Math.max(26, row.getBoundingClientRect().left));
    rows.forEach((row, index) => {
      const inset = insets[index];
      row.style.marginLeft = -inset + 'px'; row.style.marginRight = -inset + 'px';
      row.style.paddingLeft = inset + 'px'; row.style.paddingRight = inset + 'px';
    });
  }
  function setProgressiveBlurProgress(blurEl, scrollTop) {
    if (!blurEl) return;
    const raw = Math.max(0, Math.min(1, (Number(scrollTop || 0) - 4) / 44));
    const idle = raw <= 0.001;
    const nextVal = idle ? '0' : (raw * raw * (3 - 2 * raw)).toFixed(3);
    if (blurEl.dataset.pblurVal === nextVal) return;
    blurEl.dataset.pblurVal = nextVal;
    blurEl.classList.toggle('pblur-idle', idle);
    blurEl.style.setProperty('--pblur-progress', nextVal);
  }
  function updateHomeCompact() {
    // Phase 1: batch all DOM layout reads before any writes to avoid layout thrashing during scroll/resize.
    const appEl = $('#app');
    const scroll = appEl ? (appEl.scrollTop || 0) : 0;
    const phone = window.innerWidth / Math.max(1, window.innerHeight) < 0.87;
    const searchVisible = isSearchVisible();
    let activeChip = null;
    if (appEl && S.tab === 'home' && !S.detailOpen && !searchVisible && !S.commentsOpen) {
      let active = '';
      const barLine = 210;
      const appTop = appEl.getBoundingClientRect().top;
      const sections = document.querySelectorAll('.section[data-section]');
      for (let i = 0; i < sections.length; i += 1) {
        const block = sections[i];
        const top = block.getBoundingClientRect().top - appTop;
        if (top <= barLine) active = block.dataset.section;
      }
      // 页底强制"分类"：页底时最后板块到不了胶囊栏线，且一栏/两栏切换需要 ~44px
      // 滚动余量，判定带放宽到 90px，切栏时的页面回滚不会把高亮抖到"热门"。
      if (scroll + appEl.clientHeight >= appEl.scrollHeight - 90) active = 'category';
      activeChip = active;
    }

    // Phase 2: apply state & DOM writes cleanly in one pass.
    setProgressiveBlurProgress($('#top-progressive-blur'), scroll);
    // 底部一栏/两栏：按滑动方向累计切换，不再"只在顶部才两栏"。
    // 往下翻收成一栏，往回翻一段距离就展开两栏；到顶永远两栏。
    if (S.lastScroll === null) S.lastScroll = scroll;
    const delta = Math.max(-60, Math.min(60, scroll - S.lastScroll));
    S.lastScroll = scroll;
    if (Math.abs(delta) >= 0.5) {
      if (S.scrollTravel !== 0 && (delta > 0) !== (S.scrollTravel > 0)) S.scrollTravel = 0;
      S.scrollTravel += delta;
    }
    const prevDock = S.dockCompact;
    if (scroll <= 4) { S.dockCompact = false; S.phoneExpanded = false; S.scrollTravel = 0; }
    else if (S.scrollTravel > 44) { S.dockCompact = true; S.phoneExpanded = false; }
    else if (S.scrollTravel < -44) S.dockCompact = false;
    if (S.phoneExpanded) S.dockCompact = false;
    // 切栏与胶囊高亮解耦：切栏瞬间的滚动回滚不影响高亮判定。
    if (S.dockCompact !== prevDock) S.homeChipHoldUntil = Date.now() + 700;
    S.homeCompact = scroll >= (phone ? 100 : 70);
    document.body.classList.toggle('phone-layout', phone);
    updateSearchNodeGeometry(phone, scroll);
    const firstLevel = ['home','library','settings'].includes(S.tab) && (!S.currentView || S.currentView.main);
    const compact = phone && S.dockCompact && firstLevel && !searchVisible && !S.detailOpen && !S.commentsOpen;
    document.body.classList.toggle('phone-compact', compact);
    const entry = $('#search-node');
    if (entry) {
      const homeLevel = S.tab === 'home' && (!S.currentView || S.currentView.name === 'home');
      const show = homeLevel && !S.detailOpen && !searchVisible && !S.commentsOpen;
      entry.classList.toggle('off', !show);
    }
    // 快捷胶囊高亮跟随滚动：始终取最后一个滚过胶囊栏的板块，页底也保持
    // "分类"高亮（用户已确认删除"页底无高亮"规则）；点击后 800ms 内不抢。
    if (activeChip !== null && Date.now() > (S.homeChipHoldUntil || 0) && S.homeChipAnchor !== activeChip) {
      S.homeChipAnchor = activeChip;
      document.querySelectorAll('.home-chip').forEach(node => node.classList.toggle('active', node.dataset.anchor === activeChip));
    }
    const back = $('#floating-back');
    if (back) {
      const view = S.currentView;
      const canBack = !!view && !['home','library','settings'].includes(view.name) && scroll > 90 && !S.detailOpen && !searchVisible && !S.commentsOpen;
      back.classList.toggle('off', !canBack);
    }
  }
  function bindDragDeform() {
    window.LxGlass.bindInteractions();
    const animations = new WeakMap();
    let pressed = null;
    const selector = 'button,select,[role="button"],[role="tab"],[role="switch"],.menu-row,input[type="checkbox"],input[type="radio"],input[type="range"]';
    function controlFrom(target) {
      if (!(target instanceof Element) || target.closest('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),[contenteditable="true"]')) return null;
      // The dock spring scales its skin and content together; avoid a second
      // per-button scale multiplying the shared press amplitude.
      if (target.closest('#dock,#nav')) return null;
      for (let node = target; node && node !== document.body; node = node.parentElement) {
        if ((node.matches(selector) || typeof node.onclick === 'function') && !node.disabled && node.getAttribute('aria-disabled') !== 'true') return node;
      }
      return null;
    }
    function animateScale(node, value) {
      // The material spring transforms glass controls with their foreground.
      if (node.matches('.glass:not(.modal):not(.popover)')) return;
      const scale = parseFloat(getComputedStyle(node).scale) || 1;
      animations.get(node)?.cancel();
      const animation = node.animate([{ scale }, { scale: value }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      animations.set(node, animation);
      if (value === 1) animation.finished.then(() => {
        if (animations.get(node) === animation) { animation.cancel(); animations.delete(node); }
      }).catch(() => {});
    }
    function release() {
      if (!pressed) return;
      pressed.classList.remove('control-pressed');
      animateScale(pressed, 1); pressed = null;
    }
    function press(node) {
      release();
      if (!node) return;
      pressed = node; node.classList.add('control-pressed'); animateScale(node, 1.03);
    }
    document.addEventListener('pointerdown', event => {
      if (event.button === 0 && event.isPrimary !== false) press(controlFrom(event.target));
    }, true);
    document.addEventListener('keydown', event => {
      if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) press(controlFrom(event.target));
    }, true);
    document.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') release(); }, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    // Pointer events released over the playback iframe do not bubble to this
    // document. Clear both feedback layers there without changing click targets.
    function releaseAcrossFrames() {
      release(); window.LxGlass.release();
      document.dispatchEvent(new Event('lxmine-pointer-release'));
    }
    for (const frame of document.querySelectorAll('iframe')) {
      const bind = () => {
        try {
          frame.contentWindow.addEventListener('pointerup', releaseAcrossFrames, true);
          frame.contentWindow.addEventListener('pointercancel', releaseAcrossFrames, true);
        } catch (_) {}
      };
      frame.addEventListener('load', bind); bind();
    }
  }
  function bindAudio() {
    audio.addEventListener('timeupdate', () => {
      if (S.resolving || !audio.duration) return;
      updateProgress();
      if (Date.now() - (bindAudio.lastSave || 0) > 5000) { bindAudio.lastSave = Date.now(); savePlayback(); }
    });
    audio.addEventListener('seeked', () => {
      const curMs = (audio.currentTime || 0) * 1000;
      if (pendingStartSeekMs > 0 && pendingStartSeekToken === S.resolveToken) {
        if (Math.abs(curMs - pendingStartSeekMs) <= 2500) {
          pendingStartSeekMs = 0;
          pendingStartSeekToken = 0;
          seekGuardUntil = 0;
          seekGuardTarget = -1;
        }
      } else {
        seekGuardUntil = 0;
        seekGuardTarget = -1;
      }
      if (!S.resolving && audio.duration) updateProgress();
    });
    audio.addEventListener('loadedmetadata', () => {
      applyPendingStartSeek();
      updateProgress();
      if (S.autoMixEnabled) refreshAutoMixPlan();
    });
    audio.addEventListener('canplay', () => {
      applyPendingStartSeek();
    });
    audio.addEventListener('play', () => { if (playPauseFadeMode !== 'out') setPlaying(true); });
    audio.addEventListener('playing', () => {
      applyPendingStartSeek();
      S.consecutiveAutoSkipCount = 0;
      if (!S.current) return;
      S.recentlyPlayed = [Object.assign({}, S.current), ...S.recentlyPlayed.filter(song => identity(song) !== identity(S.current))];
      scheduleSaveStore(400);
      if (S.currentView.name === 'library' && !S.detailOpen && !isSearchVisible()) renderLibrary();
    });
    audio.addEventListener('pause', () => {
      if (S.playRequested && !audio.ended && !S.resolving && playPauseFadeMode !== 'out') {
        externalCallPaused = true;
      }
      if (playPauseFadeMode !== 'out') setPlaying(false);
    });
    audio.addEventListener('ended', () => {
      if (S.autoMixActive || S.previewRecovering) return;
      const song = S.current;
      const expectedMs = song ? effectiveExpectedDurationMs(song) : 0;
      const endedAtMs = Math.max(Number(S.position) || 0, (audio.currentTime || 0) * 1000);
      const isPrematureVip = Boolean(
        song && !song.localUrl && song.provider !== 'local' &&
        expectedMs >= 75000 && endedAtMs >= 2500 &&
        endedAtMs < expectedMs * 0.72 && (expectedMs - endedAtMs) >= 22000
      );
      if (isPrematureVip) {
        const recovered = recoverVipPreviewOrShortStream(Math.max(0, endedAtMs - 1200), 'preview', () => {
          if (S.mode === '单曲循环') { seekTo(0); audio.play().catch(() => {}); return; }
          const last = S.queueIndex >= S.queue.length - 1;
          if (S.mode === '顺序播放' && last) { setPlaying(false); return; }
          nextSong(1, { fromAutoAdvance: true });
        });
        if (recovered) return;
      }
      setPlaying(false);
      if (S.sleepMode === 'song' || S.sleepPendingStop) {
        clearSleepTimer(true);
        notify('定时关闭已到，当前歌曲已播完暂停');
        return;
      }
      if (S.mode === '单曲循环') { seekTo(0); audio.play().catch(() => {}); return; }
      const last = S.queueIndex >= S.queue.length - 1;
      if (S.mode === '顺序播放' && last) return;
      nextSong(1, { fromAutoAdvance: true });
    });
    audio.addEventListener('loadedmetadata', () => {
      if (S.resolving || S.previewRecovering) return;
      const song = S.current;
      const actualMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
      const mismatch = classifyStreamDurationMismatch(song, actualMs);
      if (mismatch !== 'ok') {
        audio.pause();
        const token = S.resolveToken;
        const stopExhausted = () => {
          if (token !== S.resolveToken) return;
          audio.pause();
          setPlaying(false);
          notify(mismatch === 'wrong'
            ? '检测到音源返回曲目与原曲不符，已拦截，请切换音源或平台'
            : '检测到试听片段且暂无可用完整音源，已停止');
        };
        const started = recoverVipPreviewOrShortStream(0, mismatch, stopExhausted);
        if (!started && !S.previewRecovering) stopExhausted();
      }
    });
    audio.addEventListener('error', () => {
      if (S.resolving || !audio.getAttribute('src') || !S.playbackUrl) return;
      const song = S.current;
      const key = song ? identity(song) : '';
      const isOnlineTrack = song && !song.localUrl && song.source !== 'local' && song.provider !== 'local';
      if (isOnlineTrack && typeof navigator !== 'undefined' && navigator.onLine === false) {
        cancelPlayPauseFade(false);
        audio.pause();
        audio.removeAttribute('src');
        S.playbackUrl = '';
        S.loadedSongKey = '';
        setPlaying(false);
        notify('当前网络已断开，无法播放未缓存的在线歌曲');
        return;
      }
      if (song && !song.localUrl && S.previewRetryKey !== key) {
        S.previewRetryKey = key;
        const token = S.resolveToken;
        resolveWithFallback(song, { forceResolve: true, raceAll: true, excludeSourceIds: S.activeSourceId ? [S.activeSourceId] : [] })
          .then(resolved => {
            if (token !== S.resolveToken || !resolved || !resolved.url) return;
            S.playbackUrl = resolved.url;
            S.currentResolvedSourceId = resolved.sourceId || S.activeSourceId || '';
            setDeckSource(audio, resolved.url);
            S.loadedSongKey = key;
            if (S.playRequested) resumeWithFade(true).catch(() => {});
          })
          .catch(() => {
            if (token === S.resolveToken) {
              audio.pause();
              audio.removeAttribute('src');
              S.playbackUrl = '';
              S.loadedSongKey = '';
              setPlaying(false);
              if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                notify('当前网络已断开，无法播放未缓存的在线歌曲');
              }
            }
          });
        return;
      }
      setPlaying(false);
    });
    audio.volume = S.volume;
    updateVolumeUI();
    function resumeAfterCallOrSession() {
      externalCallPaused = false;
      clearTimeout(externalCallResumeTimer);
      S.playRequested = true;
      if (S.resolving || !S.current) return;
      const curKey = identity(S.current);
      if (!audio.getAttribute('src') || !S.playbackUrl || S.loadedSongKey !== curKey || audio.error) {
        playSong(S.current, S.queue, { startMs: S.position, fromSearch: S.playingFromSearch });
      } else {
        resumeWithFade(false).catch(() => {
          if (S.current) playSong(S.current, S.queue, { startMs: S.position, fromSearch: S.playingFromSearch });
        });
      }
    }
    let bluetoothHandsFreeActive = false;
    async function detectHandsFreeCallDevice() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return false;
        const list = await navigator.mediaDevices.enumerateDevices();
        return list.some(d => d && d.kind === 'audiooutput' && /hands-?free|ag audio|hfp|communications/i.test(String(d.label || '')));
      } catch (_) {
        return false;
      }
    }
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        const nowHfp = await detectHandsFreeCallDevice();
        const wasHfp = bluetoothHandsFreeActive;
        bluetoothHandsFreeActive = nowHfp;
        if (!nowHfp && (wasHfp || externalCallPaused) && externalCallPaused && !S.playing && S.current) {
          clearTimeout(externalCallResumeTimer);
          externalCallResumeTimer = setTimeout(() => {
            if (externalCallPaused && !S.playing && S.current) resumeAfterCallOrSession();
          }, 480);
        }
      });
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          resumeAfterCallOrSession();
        });
        navigator.mediaSession.setActionHandler('pause', async () => {
          const wasPlayingNow = !!(S.playing || S.playRequested);
          pauseWithFade(true);
          if (wasPlayingNow) {
            const hfp = await detectHandsFreeCallDevice();
            if (hfp) {
              bluetoothHandsFreeActive = true;
              externalCallPaused = true;
            } else {
              externalCallPaused = false;
            }
          }
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => nextSong(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => nextSong(1));
        navigator.mediaSession.setActionHandler('seekto', details => { if (details && Number.isFinite(details.seekTime)) seekTo(details.seekTime * 1000); });
      } catch (_) {}
    }
  }
  function bindKeyboard() {
    document.addEventListener('keydown', event => {
      if (shortcutRecorderCleanup) return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if ((event.key === ' ' || event.key === 'Enter') && target?.closest('button,[role="button"],[role="tab"],[role="switch"]')) return;
      if (event.key === 'Escape') { goBack(); return; }
      const combo = shortcutEventToCombo(event);
      if (!combo) return;
      const map = Object.assign({}, DEFAULT_SHORTCUTS, S.shortcuts || {});
      const matched = Object.keys(map).find(action => map[action] && map[action] === combo);
      if (matched) {
        event.preventDefault();
        dispatchShortcutAction(matched);
      }
    });
  }
  let downloadsRefreshTimer = 0;
  function bindIpcEvents() {
    window.addEventListener('focus', checkPendingSync);
    window.desktopWindow?.onGlobalHotkey?.(payload => {
      if (payload && payload.action) dispatchShortcutAction(payload.action);
    });
    window.desktopWindow?.onDesktopLyricsEnabledState?.(data=>{S.desktopLyrics=!!data.enabled;saveStore();updateDesktopLyricsButton();if(S.desktopLyrics)pushDesktopLyrics(true);if(S.currentView?.name==='lyrics-settings')renderLyricsSettings();});
    window.desktopWindow?.onDesktopLyricsLockState?.(data=>{S.desktopLyricsLocked=!!data.locked;saveStore();if(S.currentView?.name==='lyrics-settings')renderLyricsSettings();});
    window.desktopWindow?.onDesktopLyricsAction?.(action=>{if(action==='prev')nextSong(-1);else if(action==='next')nextSong(1);else if(action==='toggle')togglePlayback();});
    if (window.lxMusic && window.lxMusic.onDownloadsChanged) window.lxMusic.onDownloadsChanged(jobs => {
      S.downloads = Array.isArray(jobs) ? jobs : [];
      if (S.currentView.name === 'downloads') {
        clearTimeout(downloadsRefreshTimer);
        downloadsRefreshTimer = setTimeout(() => {
          if (S.currentView.name === 'downloads') renderDownloads(true);
        }, 120);
      }
    });
    const syncEvents = ['devices-changed', 'incoming', 'applied'];
    syncEvents.forEach(name => {
      if (!window.lxMusic || !window.lxMusic.onSyncEvent) return;
      try {
        window.lxMusic.onSyncEvent(name, async data => {
          if (name === 'devices-changed') { S.devices = data || []; }
          else if (name === 'incoming') checkPendingSync();
          else if (name === 'applied') { await refreshSyncedLibrary(data); }
        });
      } catch (_) {}
    });
  }
  let _pbSongRef = null, _pbSongJson = 'null', _pbQueueRef = null, _pbQueueLen = -1, _pbQueueHeadKey = '', _pbQueueJson = '[]';
  function savePlayback() {
    try {
      if (S.current !== _pbSongRef) {
        _pbSongRef = S.current;
        _pbSongJson = JSON.stringify(S.current || null);
      }
      const qLen = Array.isArray(S.queue) ? S.queue.length : 0;
      const qHeadKey = qLen > 0 ? identity(S.queue[0]) + '|' + identity(S.queue[qLen - 1]) : '';
      if (S.queue !== _pbQueueRef || qLen !== _pbQueueLen || qHeadKey !== _pbQueueHeadKey) {
        _pbQueueRef = S.queue;
        _pbQueueLen = qLen;
        _pbQueueHeadKey = qHeadKey;
        _pbQueueJson = JSON.stringify(Array.isArray(S.queue) ? S.queue : []);
      }
      const posNum = Number.isFinite(Number(S.position)) ? Math.round(Number(S.position)) : 0;
      const idxNum = Number.isFinite(Number(S.queueIndex)) ? Number(S.queueIndex) : -1;
      localStorage.setItem(STORE_KEY + '.playback', `{"song":${_pbSongJson},"queue":${_pbQueueJson},"index":${idxNum},"position":${posNum}}`);
    } catch (_) {}
  }
  function restorePlayback() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY + '.playback') || 'null');
      if (!saved || !saved.song) return;
      const sanitizeRestoredTrack = (track) => {
        if (!track || typeof track !== 'object') return track;
        if (!track.localUrl && track.source !== 'local' && track.provider !== 'local' && track.url) {
          const copy = Object.assign({}, track);
          delete copy.url;
          return copy;
        }
        return track;
      };
      S.current = sanitizeRestoredTrack(saved.song);
      S.queue = Array.isArray(saved.queue) ? saved.queue.map(sanitizeRestoredTrack) : [S.current];
      S.queueIndex = Math.max(0, Math.min(S.queue.length - 1, Number(saved.index) || 0));
      S.duration = durationOf(S.current);
      const rawPos = Math.max(0, Number(saved.position) || 0);
      S.position = (S.duration > 5000 && rawPos >= S.duration - 2500) ? 0 : rawPos;
      setStageSong(S.current); updateDock();
      loadLyrics(S.current, ++S.resolveToken).catch(() => {});
      updateProgress(S.position);
      if (S.resumeOnStartup === true) {
        const restored = S.current;
        refreshSources(true).then(() => {
          if (S.current === restored && !S.playing && !audio.src) {
            playSong(restored, S.queue, { startMs: S.position, forceResolve: true });
          }
        });
      }
    } catch (_) {}
  }
  function restoreToggle() {
    togglePlayback();
  }

  function boot() {
    initStage();
    setTimeout(() => {
      const bootStyle = effectiveStyleName();
      S.plainStageMounted = true;
      if (bootStyle !== 'off' && !S.stageGraphicsFailed) {
        if (String(bootStyle).startsWith('folia-')) S.foliaStageMounted = true;
        else S.mineStageMounted = true;
        S.dynamicStageMounted = true;
      }
      pushStagePresentation(); pushStageMetadata();
    }, 350);
    showSplash();
    bindWindowChrome();
    $('#search-node').onclick = openSearch;
    $('#floating-back').onclick = goBack;
    bindDock();
    bindSearch();
    bindDetail();
    bindComments();
    // Optical surfaces supply local press light without a clipped ripple layer.
    bindDragDeform();
    installGlassDecorator();
    let appScrollRaf = 0;
    $('#app').addEventListener('scroll', () => {
      if (appScrollRaf) return;
      appScrollRaf = requestAnimationFrame(() => {
        appScrollRaf = 0;
        updateHomeCompact();
      });
    }, { passive: true });
    $('#search-body')?.addEventListener('scroll', () => {
      setProgressiveBlurProgress($('#search-top-blur'), $('#search-body')?.scrollTop || 0);
    }, { passive: true });
    $('#comments-body')?.addEventListener('scroll', () => {
      setProgressiveBlurProgress($('#comments-top-blur'), $('#comments-body')?.scrollTop || 0);
    }, { passive: true });
    setProgressiveBlurProgress($('#search-top-blur'), 0);
    setProgressiveBlurProgress($('#comments-top-blur'), 0);
    let winResizeRaf = 0;
    let winResizeClassTimer = 0;
    window.addEventListener('resize', () => {
      document.body.classList.add('is-resizing');
      clearTimeout(winResizeClassTimer);
      winResizeClassTimer = setTimeout(() => { document.body.classList.remove('is-resizing'); }, 120);
      if (winResizeRaf) return;
      winResizeRaf = requestAnimationFrame(() => {
        winResizeRaf = 0;
        document.querySelectorAll('.row-scroll').forEach(row => { delete row.dataset.bleedW; });
        document.querySelectorAll('.playlist-mosaic').forEach(layoutMosaic);
        updateSearchInsets();
        updateHomeCompact();
        if (S.detailOpen) syncLyric(true);
      });
    });
    updateHomeCompact();
    bindAudio();
    bindKeyboard();
    bindIpcEvents();
    syncGlobalShortcuts();
    initRetainedPcModes();
    applyPageCustomBg();
    if (S.audioFx && (S.audioFx.active || (S.audioFx.spatialMode && S.audioFx.spatialMode !== 'off'))) applyAudioFx(S.audioFx, false);
    if (S.styleName === SMART_MODE_ID) updateSmartStage(false);
    applyLyricTheme();
    updateDock();
    setTab('home');
    restorePlayback();
    refreshSources(true);
    loadHome(true).catch(error => notify('首页加载失败：' + error.message));
    loadSyncDevices();
    if (S.lanAutoSync) persistFavoritesToLibrary(false).then(() => window.lxMusic?.syncSetAuto?.(true)).catch?.(() => {});
    checkPendingSync();
    if (S.desktopLyrics) setTimeout(() => {if(S.desktopLyrics)applyDesktopLyrics(true);}, 1200);
    if (S.closeToTray && window.desktopWindow && window.desktopWindow.setCloseBehavior) window.desktopWindow.setCloseBehavior('tray').catch(() => {});
    if (S.launchAtStartup && window.desktopWindow && window.desktopWindow.setLaunchAtStartup) window.desktopWindow.setLaunchAtStartup(true).catch(() => {});
    syncWallpaperUi();
  }

  let booted = false;
  window.__lxmine = {
    S, playSong, setTab, openSearch, openDetail, openQueue, openSwitchPlatformModal, applySwitchedPlatformSong,
    toggleFavorite, syncAllLikeStates, hydrateCovers, refreshHomeByDoubleTap,
    notify, checkPendingSync, pushStageMetadata, buildListeningProfile, enrichFeedWithHabits
  };
  document.addEventListener('DOMContentLoaded', () => { if (!booted) { booted = true; boot(); } });
  if (document.readyState !== 'loading' && !booted) { booted = true; boot(); }
})();




