/* LxMine PC renderer — tablet-first layout, rewritten on top of the existing
   Electron IPC/LX source backend. */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const audio = $('#audio');
  const STORE_KEY = 'lxmine.pc.v1';
  const MINE_STYLES = [
    ['off', '关闭动效'],
    ['mine-0', 'emily专辑封面'], ['mine-1', '滚筒'], ['mine-2', '星球'], ['mine-3', '虚空'],
    ['mine-4', '唱片'], ['mine-5', '星河'], ['mine-6', '安魂'], ['mine-7', '音域回响 · 地形'],
    ['mine-8', '音域回响 · 工坊'], ['mine-9', '月蚀圣环'], ['mine-10', '雨幕霓虹'],
    ['mine-11', '折光蝶群'], ['mine-12', '深海绽放']
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
    resumeOnStartup: false, startupAnimation: false, refreshAlgoOnDoubleTap: true, algoRefreshSeed: 0,
    desktopLyrics: false, desktopLyricsLocked:false, wallpaperMode: false, closeToTray: false, launchAtStartup: false, lanAutoSync: false, favorites: [], recentlyPlayed: [], searchHistory: [], volume: 1,
    lyricShowTranslation: true, lyricShowRomaji: false, lyricFontSize: 1,
    lyricColorMode: 'cover-gradient', lyricColor: '#7dd3fc', lyricColor2: '#a5b4fc',
    desktopLyricLines: 3, desktopLyricSize: 1,
    desktopLyricColorMode: 'cover-gradient', desktopLyricColor: '#7dd3fc', desktopLyricColor2: '#a5b4fc',
    mosaicSeed: 0
  };
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
    queue: [], queueIndex: -1, current: null, playing: false, playRequested: false, resolving: false, position: 0, duration: 0,
    lyrics: [], lyricIndex: -1, lyricOffset: 0,
    detailOpen: false, commentsOpen: false, searchOpen: false, desktopLyricsPushedAt: 0, searchOriginRect: null, homeCompact: false, phoneExpanded: false, dockCompact: false, scrollTravel: 0, lastScroll: null, homeChipAnchor: 'banner', homeChipHoldUntil: 0, playingFeedId: '', viewTransitionToken: 0,
    scrollMemory: {}, commentToken: 0, resolveToken: 0, feedToken: 0,
    currentView: { name: 'home' }, stack: [], routeSeed: 0
  });
  S.recentlyPlayed = Array.isArray(S.recentlyPlayed) ? S.recentlyPlayed.filter(song => song && song.id && song.name) : [];
  S.lyricOffset = Number(S.lyricOffset) || 0;
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
  S.lyricFontSize = Math.max(0.75, Math.min(1.4, Number(S.lyricFontSize) || 1));
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

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        tab: S.tab, homePlatform:S.homePlatform, quality: S.quality, mode: S.mode, styleName: S.styleName,
        lyricOffset: S.lyricOffset, appearance: S.appearance, resumeOnStartup: S.resumeOnStartup === true, startupAnimation: S.startupAnimation,
        refreshAlgoOnDoubleTap: S.refreshAlgoOnDoubleTap !== false, algoRefreshSeed: S.algoRefreshSeed,
        desktopLyrics: S.desktopLyrics, desktopLyricsLocked:S.desktopLyricsLocked, wallpaperMode: S.wallpaperMode, closeToTray: S.closeToTray, launchAtStartup: S.launchAtStartup, lanAutoSync: S.lanAutoSync === true,
        favorites: S.favorites, recentlyPlayed: S.recentlyPlayed, searchHistory: S.searchHistory, volume: S.volume,
        lyricShowTranslation: S.lyricShowTranslation, lyricShowRomaji: S.lyricShowRomaji, lyricFontSize: S.lyricFontSize,
        lyricColorMode: S.lyricColorMode, lyricColor: S.lyricColor, lyricColor2: S.lyricColor2,
        desktopLyricLines: S.desktopLyricLines, desktopLyricSize: S.desktopLyricSize,
        desktopLyricColorMode: S.desktopLyricColorMode, desktopLyricColor: S.desktopLyricColor, desktopLyricColor2: S.desktopLyricColor2,
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
    ic_search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
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
    trash: 'ic_trash', edit: 'ic_edit', switchPlatform: 'ic_switch_platform', music: 'ic_music',
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
  let stageWindowVisible = !document.hidden;
  let previousStageStyle = S.styleName;
  let dynamicStageStyle = S.styleName === 'off' ? 'mine-7' : S.styleName;
  function stageWindow() {
    try { return document.getElementById(S.styleName === 'off' || S.stageGraphicsFailed ? 'plain-stage-frame' : 'stage-frame').contentWindow; } catch (_) { return null; }
  }
  function setDetailImmersive(immersive) {
    const hidden = !!S.detailOpen && !!immersive;
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
  }
  function stageWindowsForUpdate() {
    return ['stage-frame', 'plain-stage-frame'].map(id => document.getElementById(id).contentWindow).filter(target => target?.lxmineStage);
  }
  function initStage() {
    ['stage-frame', 'plain-stage-frame'].forEach(id => {
      const frame = document.getElementById(id);
      const degraded = () => {
        if (id !== 'stage-frame' || S.stageGraphicsFailed) return;
        S.stageGraphicsFailed = true; S.dynamicStageReady = false; S.dynamicStageMounted = false; S.plainStageMounted = true;
        pushStagePresentation();
        notify('图形资源暂不可用，已临时使用纯文字歌词');
      };
      const visualReady = () => {
        if (id !== 'stage-frame' || frame.dataset.ready !== '1' || S.styleName === 'off' || !S.detailOpen || !stageWindowVisible) return;
        if (!S.dynamicStageReady) { S.dynamicStageReady = true; pushStagePresentation(); }
      };
      const ready = () => {
        if (frame.contentWindow?.__lxmineStageUnavailable) { degraded(); return; }
        if (!frame.contentWindow?.lxmineStage) return;
        frame.contentWindow.__lxmineNative = { seek: ms => seekTo(Number(ms) || 0), visualReady, degraded,
          immersive: show => {
            if (S.detailOpen && !S.commentsOpen && frame.style.pointerEvents === 'auto' && frame.style.opacity === '1') setDetailImmersive(String(show) !== '1');
          } };
        frame.dataset.ready = '1';
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
    const data = {
      id: identity(S.current),
      audioUrl: stageAudioUrl(),
      mode: S.styleName,
      lines: S.lyrics.map(line => ({ timeMs: line.time, text: line.text, ...(line.words ? { words: line.words } : {}) })),
      translationLines: S.lyrics
        .filter(line => (S.lyricShowTranslation && line.translation) || (S.lyricShowRomaji && line.romaji))
        .map(line => ({ timeMs: line.time, text: [S.lyricShowTranslation ? line.translation : '', S.lyricShowRomaji ? line.romaji : ''].filter(Boolean).join(' · ') })),
      lyricColorMode: S.lyricColorMode.endsWith('gradient') ? 'custom-gradient' : 'custom-solid',
      lyricColors: { primary: lyricColors.primary, secondary: lyricColors.secondary, highlight: lyricColors.gradient ? lyricColors.secondary : lyricColors.highlight, glow: lyricColors.glow },
      name: S.current.name || '',
      singer: S.current.artist || S.current.singer || '',
      cover: cover ? new URL(cover, location.href).href : '',
      duration: S.duration || durationOf(S.current),
      lyricOffset: Number(S.lyricOffset) || 0,
      lyricScale: Math.max(0.75, Math.min(1.4, Number(S.lyricFontSize) || 1)),
      appearance: document.body.classList.contains('light-theme') ? 'light' : 'dark',
      topInset: 0,
      bottomInset: 0
    };
    document.documentElement.style.setProperty('--lyric-detail-scale', String(Math.max(0.75, Math.min(1.4, Number(S.lyricFontSize) || 1))));
    for (const target of stageWindowsForUpdate()) {
      const mode = target === document.getElementById('stage-frame').contentWindow ? dynamicStageStyle : 'off';
      try {
        target.lxmineStage.clock({ positionMs: Math.max(0, Number(S.position) || 0), playing: !!S.playing });
        target.lxmineStage.metadata({ ...data, mode });
      } catch (error) { console.warn('[Stage] metadata', error); }
    }
    S.wallpaperStage = data;
    if (S.wallpaperMode) window.desktopWindow?.updateWallpaperMode?.({ stage: data, clock: { positionMs: S.position, playing: !!S.playing } }).catch(() => {});
  }
  function setStageSong(song) {
    refreshLyricPalette(song && song.cover);
    const fallback = document.getElementById('stage-fallback');
    if (fallback) {
      const cover = song && song.cover ? coverUrl(song.cover) : '';
      fallback.style.backgroundImage = cover ? 'url("' + cover.replace(/"/g, '%22') + '")' : 'none';
    }
    pushStageMetadata();
  }
  function pushStageClock(force) {
    pushStagePresentation();
    for (const target of stageWindowsForUpdate()) {
      try { target.lxmineStage.clock({ positionMs: Math.max(0, Number(S.position) || 0), playing: !!S.playing }); } catch (_) {}
    }
    if (S.wallpaperMode && Date.now() - (S.wallpaperClockAt || 0) > 240) {
      S.wallpaperClockAt = Date.now();
      window.desktopWindow?.updateWallpaperMode?.({ clock: { positionMs: S.position, playing: !!S.playing } }).catch(() => {});
    }
  }
  function pushStagePresentation() {
    applyAppearance();
    const active = window.desktopWindow ? stageWindowVisible : !document.hidden;
    if (previousStageStyle !== S.styleName) {
      S.stageGraphicsFailed = false;
      if (S.styleName !== 'off' && previousStageStyle === 'off') S.dynamicStageReady = false;
      previousStageStyle = S.styleName;
    }
    if (S.styleName !== 'off') dynamicStageStyle = S.styleName;
    if (active && S.detailOpen) { if (S.styleName === 'off') S.plainStageMounted = true; else if (!S.stageGraphicsFailed) S.dynamicStageMounted = true; }
    const plainVisible = S.styleName === 'off' || (S.plainStageMounted && !S.dynamicStageReady);
    document.body.classList.toggle('plain-stage', !!plainVisible);
    document.getElementById('stage')?.setAttribute('aria-hidden', String(!(S.detailOpen && !S.commentsOpen)));
    for (const plain of [false, true]) {
      const frame = document.getElementById(plain ? 'plain-stage-frame' : 'stage-frame');
      const mounted = plain ? S.plainStageMounted : S.dynamicStageMounted;
      const path = mounted ? (plain ? '/mine-stage/plain-stage.html' : '/mine-stage/harmony-stage.html') : 'about:blank';
      if (frame.getAttribute('src') !== path) { frame.dataset.ready = ''; frame.src = path; }
      const visible = active && S.detailOpen && !S.commentsOpen && (plain ? plainVisible : S.styleName !== 'off' && !S.stageGraphicsFailed);
      frame.contentWindow?.lxmineStage?.presentation?.({ visible: !!visible, detail: !!visible });
      frame.style.opacity = visible && (plain || S.dynamicStageReady) ? '1' : '0';
      frame.style.pointerEvents = visible && (plain ? plainVisible : !plainVisible) ? 'auto' : 'none';
    }
    S.stageReady = document.getElementById(S.styleName === 'off' || S.stageGraphicsFailed ? 'plain-stage-frame' : 'stage-frame').dataset.ready === '1';
  }
  const systemAppearance = matchMedia('(prefers-color-scheme: dark)');
  function applyAppearance() {
    const light = S.appearance === 'light' || (S.appearance !== 'dark' && !systemAppearance.matches);
    const changed = document.body.classList.contains('light-theme') !== light;
    document.body.classList.toggle('light-theme', light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
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
  function persistFavoritesToLibrary() {
    if (!window.desktopWindow || !window.desktopWindow.syncFavoriteTracks) return Promise.resolve();
    return window.desktopWindow.syncFavoriteTracks(S.favorites).then(() => {
      window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
    }).catch(() => {});
  }
  async function hydrateFavoritesFromLibrary(playlists, forceOverwrite) {
    if (!window.desktopWindow || !window.desktopWindow.readBuiltInPlaylist) return;
    const list = Array.isArray(playlists) ? playlists : [];
    const fav = list.find(item => item && (item.isFavorite === true || item.name === '我喜欢的'));
    if (!fav) {
      if (forceOverwrite) {
        S.favorites = [];
        saveStore();
        updateDock();
      } else if (S.favorites.length > 0) {
        await persistFavoritesToLibrary();
      }
      return;
    }
    if (!forceOverwrite && S.favorites.length > 0 && fav.trackCount === S.favorites.length) return;
    try {
      const collected = await window.LxPagination.collectAll(async (page, limit) => {
        const data = await window.desktopWindow.readBuiltInPlaylist(fav.id, { offset: (page - 1) * limit, limit });
        if (!data || data.ok === false) throw new Error(data?.error || '歌单不可用');
        return { ...data, items: data.tracks || [] };
      }, { limit: 500 });
      if (forceOverwrite || !S.favorites.length || collected.items.length > 0) {
        S.favorites = collected.items;
        saveStore();
        syncAllLikeStates();
        updateDock();
        if (S.currentView?.name === 'playlist' && S.currentView.kind === 'favorites') {
          S.currentView.tracks = S.favorites.slice();
          S.currentView.count = S.favorites.length;
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
    btn.setAttribute('aria-label', on ? '取消喜欢' : '喜欢');
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
  function toggleFavorite(song) {
    if (!song) return;
    const key = identity(song);
    if (!key) return;
    const index = S.favorites.findIndex(item => identity(item) === key);
    if (index >= 0) S.favorites.splice(index, 1); else S.favorites.unshift(song);
    saveStore();
    syncAllLikeStates(key);
    updateDock();
    void persistFavoritesToLibrary();
    notify(index >= 0 ? '已取消喜欢' : '已添加到「我喜欢的」');
  }
  function updateDock() {
    const song = S.current;
    const key = identity(song);
    if (key !== updateDock.lastKey) {
      if (key) {
        const copy = $('#dock-copy');
        copy.classList.remove('swap'); void copy.offsetWidth; copy.classList.add('swap');
      }
      $$('.for-you-card[data-song-key]').forEach(el => el.classList.toggle('playing', !!key && el.dataset.songKey === key));
    }
    updateDock.lastKey = key;
    $('#dock-title').textContent = song ? song.name : '尚未播放';
    $('#dock-artist').textContent = song ? (song.busy ? '正在准备…' : (song.artist || song.singer || '未知歌手')) : '选择歌曲，开始聆听';
    const rawDockCover = rawCoverOf(song);
    const coverInner = $('#cover-inner');
    if (coverInner) {
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
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.name || '', artist: song.artist || song.singer || '', album: song.album || '',
          artwork: coverUrl(rawDockCover) ? [{ src: coverUrl(rawDockCover), sizes: '512x512', type: 'image/jpeg' }] : []
        });
        navigator.mediaSession.playbackState = S.playing ? 'playing' : 'paused';
      } catch (_) {}
    }
  }
  function updateProgress() {
    S.position = (audio.currentTime || 0) * 1000;
    S.duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : durationOf(S.current);
    $('#time-now').textContent = fmtTime(S.position);
    $('#time-total').textContent = fmtTime(S.duration);
    const seek = $('#seek');
    if (document.activeElement !== seek) seek.max = String(Math.max(1, S.duration));
    if (document.activeElement !== seek) seek.value = String(Math.min(S.position, Math.max(1, S.duration)));
    $('#cover-ring').style.setProperty('--progress', (S.duration > 0 ? Math.min(100, S.position / S.duration * 100) : 0) + '%');
    syncLyric();
    pushStageClock(false);
    pushDesktopLyrics(false);
    if (S.wallpaperMode) syncWallpaperUi();
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
  async function playSong(song, queue, options) {
    if (!song) return;
    const opts = options || {};
    const token = ++S.resolveToken;
    S.playRequested = opts.autoPlay !== false;
    S.resolving = true;
    S.previewRetryKey = '';
    audio.pause();
    const list = Array.isArray(queue) && queue.length ? queue.slice() : [song];
    const index = Math.max(0, list.findIndex(item => identity(item) === identity(song)));
    S.queue = list; S.queueIndex = index; S.current = song; S.duration = durationOf(song); S.position = Number(opts.startMs) || 0;
    if (!opts.keepFeedId) S.playingFeedId = '';
    S.lyrics = []; S.lyricIndex = -1;
    setStageSong(song); updateDock(); renderDetailLyrics(); pushDesktopLyrics(true); syncWallpaperUi();
    try {
      const resolved = await resolveWithFallback(song);
      if (token !== S.resolveToken) return;
      const url = typeof resolved === 'string' ? resolved : resolved.url;
      S.playbackUrl = url;
      audio.src = url;
      if (opts.startMs) { try { audio.currentTime = Number(opts.startMs) / 1000; } catch (_) {} }
      if (S.playRequested) await audio.play();
      if (resolved && resolved.switched && resolved.sourceName) {
        notify('已自动切换至「' + resolved.sourceName + '」');
      }
      pushStageMetadata();
      pushStageClock(true);
      loadLyrics(song, token);
    } catch (error) {
      if (token !== S.resolveToken) return;
      notify(friendlyPlayError(error));
      setPlaying(false);
    } finally {
      if (token === S.resolveToken) S.resolving = false;
    }
  }
  function togglePlayback() {
    if (!S.current) return;
    if (S.resolving) { S.playRequested = true; return; }
    if (!audio.src) { playSong(S.current, S.queue, { startMs: S.position }); return; }
    if (audio.paused) { S.playRequested = true; audio.play().catch(error => notify('播放失败：' + error.message)); }
    else { S.playRequested = false; audio.pause(); }
  }
  function nextSong(step) {
    if (!S.queue.length) return;
    let index = S.queueIndex;
    if (S.mode === '随机播放' && S.queue.length > 1) {
      index = (index + 1 + Math.floor(Math.random() * (S.queue.length - 1))) % S.queue.length;
    } else {
      index = (index + step + S.queue.length) % S.queue.length;
    }
    S.queueIndex = index;
    playSong(S.queue[index], S.queue);
  }
  function cycleMode() {
    const modes = ['列表循环', '单曲循环', '随机播放', '顺序播放'];
    S.mode = modes[(modes.indexOf(S.mode) + 1) % modes.length];
    saveStore();
    notify('播放顺序：' + S.mode);
    updateDock();
  }
  function seekTo(ms) {
    if (!audio.duration) return;
    const value = Math.max(0, Math.min(Number(ms) || 0, audio.duration * 1000));
    audio.currentTime = value / 1000;
    S.position = value; updateProgress(); syncLyric(true); pushStageClock(true);
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
    pushDesktopLyrics(true);
    pushStageMetadata();
    const preview = document.querySelector('.lyric-settings-preview');
    if (preview) updateLyricPreview(preview);
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
    image.onload = () => {
      if (token !== S.coverPaletteToken) return;
      try {
        const palette = paletteFromImage(image);
        if (palette) {
          S.coverPalette = palette;
          applyLyricTheme();
          if (S.currentView && S.currentView.name === 'lyrics-settings') renderLyricsSettings();
        }
      } catch (_) {
        S.coverPalette = fallback;
        applyLyricTheme();
      }
    };
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

  function lyricSnapshot() {
    if (!S.lyrics.length) return { text: '', progress: 0, index: 0 };
    let index = 0;
    for (let i = 0; i < S.lyrics.length; i += 1) { if (S.lyrics[i].time <= S.position + (Number(S.lyricOffset) || 0)) index = i; else break; }
    const line = S.lyrics[index];
    const next = S.lyrics[index + 1];
    const span = Math.max(500, (next ? next.time : line.time + 4200) - line.time);
    return { text: line.text || '', progress: Math.max(0, Math.min(1, (S.position + (Number(S.lyricOffset) || 0) - line.time) / span)), index };
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
    audio.volume = next;
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
    const value = h('span', 'volume-value', Math.round(S.volume * 100) + '%');
    head.appendChild(value);
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
    input.addEventListener('input', () => setVolume(Number(input.value) / 100, false));
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
  function wallpaperPayload(enabled) {
    return {
      stage: S.wallpaperStage || null,
      clock: { positionMs: S.position, playing: !!S.playing },
      enabled: !!enabled,
      title: S.current ? (S.current.name || '') : '',
      artist: S.current ? (S.current.artist || S.current.singer || '') : '',
      cover: S.current ? (S.current.cover || '') : '',
      playing: !!S.playing,
      preset: 7,
      opacity: 0.8,
      frameRate: 120,
      colors: overlayColors()
    };
  }
  function syncWallpaperUi() {
    // Wallpaper has its own desktop host; the application remains usable.
    document.body.classList.remove('wallpaper-mode');
    const ui = $('#wallpaper-ui');
    ui.classList.add('hidden');
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
      const active = result && (result.ok === true || result.enabled === true || (result.status && result.status.enabled === true));
      S.wallpaperMode = !!enabled && active !== false;
      if (enabled && active === false) notify('无法进入全屏壁纸模式：' + ((result && (result.error || result.status && result.status.lastError)) || '系统不支持'));
      saveStore(); syncWallpaperUi();
      if (S.wallpaperMode && S.tab === 'settings') notify('壁纸模式已开启，可在设置或托盘菜单关闭');
    } catch (error) {
      S.wallpaperMode = false; saveStore(); syncWallpaperUi();
      notify('全屏壁纸模式失败：' + error.message);
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
          if (changed && S.currentView?.name === 'settings') renderSettings();
        });
      } catch (_) {}
    }
    if (window.desktopWindow.getWallpaperModeStatus) {
      window.desktopWindow.getWallpaperModeStatus().then(result => {
        const active = !!(result && result.status && (result.status.enabled === true || result.status.active === true));
        S.wallpaperMode = active; syncWallpaperUi();
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
        const body = enhanced[3].replace(/[<(]-?\d+,-?\d+(?:,-?\d+)?[>)]/g, '').trim();
        if (body) rows.push({ time: Number(enhanced[1]) + offset, text: body });
        continue;
      }
      const stamps = Array.from(line.matchAll(/\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g));
      if (!stamps.length) continue;
      const body = line.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>|<-?\d+,-?\d+>/g, '').trim();
      if (!body) continue;
      for (const stamp of stamps) {
        const time = (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000 + offset;
        if (Number.isFinite(time)) rows.push({ time, text: body });
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
        let best = null, distance = 260;
        for (const candidate of auxiliary) {
          const diff = Math.abs(candidate.time - line.time);
          if (diff <= distance) { distance = diff; best = candidate; }
        }
        if (best && distance <= 260) text = best.text;
      }
      text = String(text || '').trim();
      if (!text || text === line.text) return line;
      return Object.assign({}, line, { [key]: text });
    });
  }

  async function loadLyrics(song, token, retry = false) {
    clearTimeout(loadLyrics.retryTimer);
    if (!retry) { S.lyrics = []; S.lyricIndex = -1; renderDetailLyrics(); }
    const hasTimedLrc = value => /\[\d{1,3}:\d{2}|\[\d+,\d+\]/.test(String(value || ''));
    const publish = payload => {
      if (!payload || token !== S.resolveToken) return;
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
      const lines = main.length >= S.lyrics.length ? main : S.lyrics;
      S.lyrics = mergeLyricAux(mergeLyricAux(lines, translated, 'translation'), romanized, 'romaji');
      S.lyricIndex = -1;
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
    if (!hasTimedLrc(text) && (songSource(song) === 'wy' || song.provider === 'netease')) {
      try {
        const data = await getJson('/api/lyric?id=' + encodeURIComponent(song.id));
        text = data && (data.lyric || data.lrc || text || '');
        translation = translation || (data && (data.tlyric || data.ytlrc || ''));
        romaji = romaji || (data && (data.romalrc || data.yromalrc || data.roma || ''));
      } catch (_) {}
    }
    publish({ ...(payload || {}), lyric: text, tlyric: translation, romalrc: romaji });
    await publicPending;
    if (token !== S.resolveToken) return;
    // 本地歌曲或自定义源返回无时间戳文本/缺失封面时，继续走跨平台瀑布流补齐歌词与封面
    if (canQueryPublicAssets && (!S.lyrics.length || !rawCoverOf(song))) {
      try {
        const fallbackAssets = await window.lxMusic.songAssets(song);
        if (token === S.resolveToken && fallbackAssets) publish(fallbackAssets);
      } catch (_) {}
    }
    if (token !== S.resolveToken) return;
    if (!retry && song.provider !== 'local' && (!S.lyrics.length || !rawCoverOf(song))) {
      loadLyrics.retryTimer = setTimeout(() => {
        if (token === S.resolveToken) loadLyrics(S.current, token, true);
      }, 16000);
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
      node.onclick = () => seekTo(line.time + (Number(S.lyricOffset) || 0));
      root.appendChild(node);
    });
  }
  function syncLyric(force) {
    if (!S.lyrics.length) return;
    const target = (Number(S.position) || 0) + (Number(S.lyricOffset) || 0);
    let index = 0;
    for (let i = 0; i < S.lyrics.length; i += 1) { if (S.lyrics[i].time <= target) index = i; else break; }
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
    pushDesktopLyrics(false);
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
      const visibleCount = S.library.filter(item => !item.isFavorite && item.name !== '我喜欢的').length;
      notify((syncPayload?.autoSync ? '已自动同步歌单：' : '同步已保存：') + visibleCount + ' 个歌单');
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
      if (pl && !pl.isFavorite && pl.name !== '我喜欢的' && Array.isArray(pl.tracks)) {
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
      .filter(pl => pl && !pl.isFavorite && pl.name !== '我喜欢的' && (pl.trackCount || 0) > 0)
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
    const freshByArtist = [];
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
          ? '红心偏好'
          : ('常听 · ' + artist);
        const tagged = Object.assign({}, song, { recommendReason: reason });
        const inLast5 = profile.recentLast5Keys.has(identity(tagged)) || profile.recentLast5Keys.has(songHabitKey(tagged));
        if (inLast5) reservePlayed.push(tagged);
        else fresh.push(tagged);
      });
      freshByArtist.push(fresh);
    });
    const dedup = (items, seenIds, seenHabits) => {
      const out = [];
      for (const song of items) {
        if (!song) continue;
        const id = identity(song), hk = songHabitKey(song);
        if ((id && seenIds.has(id)) || (hk && seenHabits.has(hk))) continue;
        if (id) seenIds.add(id);
        if (hk) seenHabits.add(hk);
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
        return Object.assign({}, song, { recommendReason: isFav ? '红心偏好' : ('常听 · ' + matched) });
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
      feed.newSongs = [
        ...feed.newSongs.filter(s => !usedInRec.has(songHabitKey(s))),
        ...feed.newSongs.filter(s => usedInRec.has(songHabitKey(s)))
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
  function refreshSources() {
    if (!window.lxMusic || !window.lxMusic.sources) return Promise.resolve();
    S.sourcesLoading = true;
    return window.lxMusic.sources().then(snapshot => {
      S.sources = (snapshot && snapshot.sources) || [];
      S.activeSourceId = (snapshot && snapshot.activeId) || '';
      S.sourcesLoading = false;
      if (S.currentView.name === 'sources') renderSources();
      if (S.currentView.name === 'settings') renderSettings();
    }).catch(error => { S.sourcesLoading = false; notify(error.message); });
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
  function transitionView(renderFn, back) {
    const view = $('#view');
    const token = ++S.viewTransitionToken;
    if (!view || !view.childElementCount) { renderFn(); return; }
    view.style.transition = 'opacity .12s cubic-bezier(.3,0,.8,.15), transform .12s cubic-bezier(.3,0,.8,.15)';
    view.style.opacity = '0';
    view.style.transform = back ? 'translateY(8px)' : 'translateY(-8px)';
    setTimeout(() => {
      if (token !== S.viewTransitionToken) return;
      renderFn();
      view.style.transition = 'none';
      view.style.opacity = '0';
      view.style.transform = back ? 'translateY(-10px)' : 'translateY(12px)';
      requestAnimationFrame(() => {
        if (token !== S.viewTransitionToken) return;
        view.style.transition = 'opacity .26s cubic-bezier(.2,.85,.2,1), transform .3s cubic-bezier(.2,.85,.2,1)';
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
    S.searchOpen = false; S.detailOpen = false; S.commentsOpen = false;
    setBodyMode(tab === 'home' || tab === 'library' || tab === 'settings' ? 'tab' : 'secondary');
    transitionView(() => {
      if (tab === 'home') renderHome();
      else if (tab === 'library') renderLibrary();
      else renderSettings();
    }, false);
    restoreScroll(scrollKey(S.currentView));
    updateHomeCompact();
    updateDock();
  }
  function pushView(view) {
    saveScroll();
    S.stack.push(S.currentView);
    S.currentView = view;
    transitionView(() => renderCurrent(), false);
    try { $('#app').scrollTop = 0; } catch (_) {}
  }
  function goBack() {
    // Dismiss the visible surface first; Escape must not navigate the page
    // underneath a queue sheet or an anchored material menu.
    const menuBackdrop = $$('.menu-backdrop').at(-1);
    if (menuBackdrop) { menuBackdrop.click(); return; }
    const modalBackdrop = $$('.modal-backdrop').at(-1);
    if (modalBackdrop) { closeModal(modalBackdrop); return; }
    if ($('#detail-overlay').classList.contains('closing')) return;
    if (S.commentsOpen) { closeComments(); return; }
    if (S.detailOpen) { closeDetail(); return; }
    if (S.searchOpen) { closeSearch(); return; }
    saveScroll();
    const previous = S.stack.pop();
    if (previous) {
      S.currentView = previous;
      transitionView(() => renderCurrent(), true);
      restoreScroll(scrollKey(previous));
    } else {
      setTab(S.tab);
    }
  }
  function deferPageRefresh() {
    if (!S.detailOpen && !S.searchOpen && !S.commentsOpen) { S.pageRefreshPending = false; return false; }
    S.pageRefreshPending = true;
    return true;
  }
  function flushPageRefresh() {
    if (!S.pageRefreshPending || S.detailOpen || S.searchOpen || S.commentsOpen) return;
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
    // skipAnim：数据刷新触发的重渲染不重放入场动画——整页淡入叠在黑底上会被当成"遮罩"。
    const wrapper = h('div', (skipAnim ? '' : 'view-in ') + (className || ''));
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
        if (touchedFav) void persistFavoritesToLibrary();
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
        let chunkUpdated = 0;
        chunk.forEach((song, idx) => {
          const key = identity(song);
          coverInFlightKeys.delete(key);
          coverAttemptedKeys.add(key);
          const found = Array.isArray(urls) ? String(urls[idx] || '').trim() : '';
          if (found && propagateSongCover(song, found)) {
            chunkUpdated += 1;
            totalUpdated += 1;
          }
        });
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
  function songCard(song) {
    const node = h('div', 'card song-card');
    const art = h('div', 'art');
    applyArtSurface(art, rawCoverOf(song), song.name || song.artist || '', 'music', identity(song));
    const badge = srcBadge(song.source);
    if (badge) art.appendChild(badge);
    node.append(art);
    node.appendChild(h('h3', '', song.name || '未知歌曲'));
    node.appendChild(h('p', '', (song.artist || song.singer || platformName(song))));
    node.onclick = () => playSong(song, [song]);
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
      const isFavReason = String(song.recommendReason).includes('红心');
      const pill = h('span', 'for-you-reason' + (isFavReason ? ' is-fav' : ''), song.recommendReason);
      copy.appendChild(pill);
    }
    copy.appendChild(h('strong', 'for-you-title', song.name || '未知歌曲'));
    copy.appendChild(h('span', 'for-you-sub', (song.artist || song.singer || platformName(song)) + (song.album ? ' · ' + song.album : '')));
    node.append(art, copy);
    node.onclick = () => playSong(song, Array.isArray(queue) && queue.length ? queue : [song]);
    node.oncontextmenu = event => { event.preventDefault(); openAddMenu(song); };
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
    node.appendChild(h('h3', '', playlist.name || '我喜欢的'));
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
    // 猜你喜欢：基于红心收藏、最近播放与曲库偏好的个性化双行推荐（冷启动为空时自动隐藏）。
    if (Array.isArray(S.feed.forYou) && S.feed.forYou.length) {
      const forYouBlock = h('section', 'section for-you-section');
      const forYouHead = h('div', 'section-head');
      forYouHead.appendChild(h('h2', '', '猜你喜欢'));
      const topArtistLabel = (S.feed.topArtists || []).slice(0, 3).join(' · ');
      if (topArtistLabel) {
        forYouHead.appendChild(h('span', 'note', '基于你的红心与近期常听：' + topArtistLabel));
      }
      forYouHead.appendChild(h('div', 'spacer'));
      const playAllForYou = h('button', 'list-tools-play for-you-play-all', '播放全部');
      playAllForYou.type = 'button';
      playAllForYou.onclick = () => { if (S.feed.forYou.length) playSong(S.feed.forYou[0], S.feed.forYou); };
      forYouHead.appendChild(playAllForYou);
      const moreForYou = h('button', 'more-ball glass light');
      moreForYou.type = 'button';
      moreForYou.setAttribute('aria-label', '猜你喜欢，更多');
      moreForYou.appendChild(svgIcon('more'));
      moreForYou.onclick = () => openMore('forYou', '猜你喜欢');
      forYouHead.appendChild(moreForYou);
      forYouBlock.appendChild(forYouHead);
      const forYouWrap = h('div', 'row-wrap');
      const forYouRow = h('div', 'row-scroll for-you-row');
      for (let i = 0; i < S.feed.forYou.length; i += 2) {
        const col = h('div', 'for-you-col');
        col.appendChild(forYouCard(S.feed.forYou[i], S.feed.forYou));
        if (S.feed.forYou[i + 1]) col.appendChild(forYouCard(S.feed.forYou[i + 1], S.feed.forYou));
        forYouRow.appendChild(col);
      }
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
      bar.node.prepend(play, sort);
      const host = h('div', 'list-tools-host');
      block.append(bar.node, host);
      refreshNewSongs = () => {
        const list = arrangeSongs(S.feed.newSongs, tools);
        bar.setCount(list.length);
        host.replaceChildren();
        if (list.length) host.appendChild(songListCard(list.slice(0, 10), list));
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
      bar.node.prepend(play, sort);
      const host = h('div', 'list-tools-host');
      root.append(bar.node, host);
      refreshList = () => {
        const list = arrangeSongs(items, tools);
        bar.setCount(list.length);
        host.replaceChildren();
        if (list.length) host.appendChild(songListCard(list, items));
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
  async function openFeedPlaylist(item, autoplay) {
    if (item.request && !item.source) {
      // 分类入口：进入该分类的歌单列表页（按平台拉取），拉取期间显示加载圈。
      const view={name:'more',section:'category-'+item.id,title:item.name,main:true};
      view.items=[];view.itemKind='playlist';view.loading=true;
      pushView(view);
      window.LxPagination.collectAll((page,limit)=>window.lxMusic.homeSection({...item.request,page,limit}),{limit:item.request.source==='kg'?20:36,cancelled:()=>S.currentView!==view}).then(result=>{if(S.currentView===view){view.items=result.items;view.warning=result.warning;view.loading=false;renderMore(view);}}).catch(error=>{if(S.currentView===view){view.warning=error.message;view.loading=false;renderMore(view);}});
      return;
    }
    pushView({ name: 'playlist', kind: 'feed', feedItem:item, id: String(item.id), title: item.name, cover: item.cover, count: item.count||item.trackCount || 0, main: true, autoplay: !!autoplay });
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
    const add = h('button', 'row-act row-add');
    add.type = 'button'; add.setAttribute('aria-label', '添加到歌单');
    add.appendChild(svgIcon('plus'));
    add.onclick = event => { event.stopPropagation(); openAddMenu(song, opts); };
    const actions = h('div', 'row-actions');
    if (!isOnline) actions.append(like, add);
    else actions.append(dl, like, add);
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
    // 展开面板按需创建：宽窗永远不展开，搜索几千行时不再为每行预建两份隐藏按钮。
    const panel = h('div', 'song-expand');
    let panelBuilt = false;
    let panelLike = null;
    const toggleLike = event => {
      event.stopPropagation();
      toggleFavorite(song);
      const nowLiked = isFavorite(song);
      renderLikeButton(like, nowLiked, true);
      if (panelLike) renderLikeButton(panelLike, nowLiked, true);
      if (typeof opts.onLikeChanged === 'function') opts.onLikeChanged(song, nowLiked);
    };
    like.onclick = toggleLike;
    const buildPanel = () => {
      if (panelBuilt) return;
      panelBuilt = true;
      panelLike = h('button', 'row-act row-like');
      panelLike.type = 'button';
      if (songKey) panelLike.dataset.likeKey = songKey;
      renderLikeButton(panelLike, isFavorite(song), false);
      panelLike.onclick = toggleLike;
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
      panel.append(panelLike, panelAdd);
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
    row.onclick = () => { playSong(song, context || [song]); if (opts.openDetail) openDetail(); };
    row.oncontextmenu = event => { event.preventDefault(); openAddMenu(song, opts); };
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
  const MOSAIC_PATTERNS = [[2, 2], [1, 1], [1, 2], [2, 1], [1, 1], [2, 1], [1, 2], [1, 1], [2, 2], [1, 2], [2, 1], [1, 1]];
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
    // 固定变化序列：前 6 张在 6 列网格里正好填满两行（2x2 + 1x1 + 1x2 + 2x1 + 1x1 + 2x1）；
    // 4 张时用 2x2 + 2x1 + 1x1 + 1x1 填满 4 列（手机两列时也能填满）。
    if (total === 4) return [[2, 2], [2, 1], [1, 1], [1, 1]][index];
    if (total === 5) return [[2, 2], [2, 2], [2, 1], [1, 1], [1, 1]][index];
    return MOSAIC_PATTERNS[index % MOSAIC_PATTERNS.length];
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
        if (covered) updateTileArt('.mosaic-tile[data-tile-kind="favorites"]', rawCoverOf(covered), '我喜欢的');
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
    // 内置“我喜欢的”是收藏夹的镜像（旧数据 isFavorite=true），已由顶部收藏卡代表，必须过滤；
    // 名称兜底兼容没有 isFavorite 字段的旧缓存。
    const libraryItems = (S.library || []).filter(playlist => playlist.isFavorite !== true && playlist.name !== '我喜欢的');
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
    const favCover = rawCoverOf(S.favorites.find(s => rawCoverOf(s)));
    const recentCover = rawCoverOf(S.recentlyPlayed.find(s => rawCoverOf(s)));
    const localCover = rawCoverOf(S.localTracks.find(s => rawCoverOf(s)));
    const tiles = [];
    tiles.push({ tileKind: 'favorites', cover: favCover, icon: 'heartFill', countText: S.favorites.length + ' 首歌曲',
      name: '我喜欢的', detail: '你收藏的歌曲',
      onClick: () => pushView({ name: 'playlist', kind: 'favorites', id: 'favorites', title: '我喜欢的', count: S.favorites.length, main: true }) });
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
  async function downloadBatchSongs(songs) {
    const downloadable = (Array.isArray(songs) ? songs : []).filter(item => item && item.source !== 'local' && item.provider !== 'local');
    if (!downloadable.length) return notify('没有可下载的在线歌曲');
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
    copy.append(h('strong', '', '编辑歌单'), h('small', '', '可修改歌单名、勾选批量删除/下载，或拖动 ≡ 调整自定义顺序'));
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
    const removeSelected = h('button', 'pill-btn', '移除所选');
    const downloadSelected = h('button', 'pill-btn', '下载所选');
    const cancel = h('button', 'pill-btn', '取消');
    const save = h('button', 'pill-btn accent', '保存');
    const countText = h('span', 'manual-order-count', list.length + ' 首');
    foot.append(countText, removeSelected, downloadSelected, cancel, save);
    const close = () => backdrop.remove();
    let dragIndex = -1;
    const updateCounts = () => {
      countText.textContent = list.length + ' 首';
      allLabel.textContent = `全选（已选 ${selected.size} 首）`;
      allCheck.checked = list.length > 0 && selected.size === list.length;
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
    downloadSelected.onclick = () => {
      const chosen = list.filter((song, idx) => selected.has(identity(song) || ('idx-' + idx)));
      void downloadBatchSongs(chosen);
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
    const heroCover = view.cover || rawCoverOf(view.tracks.find(t => rawCoverOf(t))) || '';
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
      : view.kind === 'favorites' ? '红心珍藏'
      : view.kind === 'recent' ? '听歌足迹'
      : '精选歌单';
    const heroBadge = h('span', 'hero-kicker', heroBadgeLabel);
    const titleHeading = h('h2', '', view.title || '歌单');
    const countLine = h('p', '', (view.tracks.length || view.count || 0) + ' 首歌曲 · ' + (view.kind === 'builtin' ? 'LxMine 歌单' : view.kind === 'favorites' ? '我喜欢的' : view.kind === 'recent' ? '最近播放' : '网络歌单'));
    copy.append(heroBadge, titleHeading, countLine);
    const actions = h('div', 'hero-actions');
    const play = h('button', 'pill-btn accent', '播放全部');
    play.onclick = () => { if (view.tracks.length) playSong(view.tracks[0], view.tracks); };
    actions.appendChild(play);
    const persistManual = (view.kind === 'builtin' || view.kind === 'favorites') ? async (orderedSongs) => {
      if (view.kind === 'favorites') {
        S.favorites = orderedSongs.slice();
        saveStore();
        await persistFavoritesToLibrary();
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
    if (view.kind !== 'local' && view.tracks.some(item => item && item.source !== 'local' && item.provider !== 'local')) {
      const batchDl = h('button', 'pill-btn', '批量下载');
      batchDl.onclick = () => downloadBatchSongs(arrangeSongs(view.tracks, tools));
      actions.appendChild(batchDl);
    }
    if (view.kind === 'feed') {
      const save = h('button', 'pill-btn', '导入到曲库');
      save.onclick = async () => {
        try {
          await window.lxMusic.importPlaylist(String(view.id), 'wy');
          window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
          await loadHome(true);
          notify('已保存「' + view.title + '」');
        } catch (error) { notify('导入失败：' + error.message); }
      };
      actions.appendChild(save);
    }
    if (view.kind === 'builtin' && !view.favorite) {
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
    const removeSingleSong = (view.kind === 'builtin' || view.kind === 'favorites') ? async (song) => {
      const key = identity(song);
      if (view.kind === 'favorites') {
        toggleFavorite(song);
        view.tracks = S.favorites.slice();
        view.count = view.tracks.length;
        countLine.textContent = view.tracks.length + ' 首歌曲 · 我喜欢的';
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
            countLine.textContent = (view.tracks.length || view.count || 0) + ' 首歌曲 · ' + (view.kind === 'builtin' ? 'LxMine 歌单' : view.kind === 'favorites' ? '我喜欢的' : '最近播放');
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
        listBar.setCount(list.length);
        listHost.replaceChildren();
        if (list.length) {
          listHost.appendChild(songListCard(list, view.tracks, {
            onRemove: removeSingleSong,
            removeLabel: view.kind === 'favorites' ? '取消喜欢' : '从歌单移除',
            onSwitchPlatform: switchSongInPlaylist,
            switchContext: canSwitchInPlaylist ? { mode: 'playlist', playlistView: view, onReplaced: () => refreshList() } : null,
            onLikeChanged: view.kind === 'favorites' ? () => {
              view.tracks = S.favorites.slice();
              countLine.textContent = view.tracks.length + ' 首歌曲 · 我喜欢的';
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
  function renderSettings() {
    if (deferPageRefresh()) return;
    S.tab = 'settings';
    setBodyMode('tab');
    setHeader('设置', '', { actions: [] });
    const root = mainRoot();
    root.appendChild(h('div', 'setting-title', '音乐源'));
    const sourceRow = h('div', 'setting-row');
    sourceRow.style.borderRadius = '22px';
    sourceRow.style.background = 'rgba(255,255,255,.045)';
    sourceRow.style.border = '1px solid rgba(255,255,255,.07)';
    const sourceCopy = h('div', 'copy');
    const active = (S.sources || []).find(item => item.id === S.activeSourceId) || S.sources[0];
    sourceCopy.appendChild(h('strong', '', active ? active.name : '未添加音源'));
    sourceCopy.appendChild(h('small', '', (S.sources.length || 0) + ' 个音源 · 当前使用'));
    const chevron = h('span', 'value', '›');
    sourceRow.append(sourceCopy, chevron);
    sourceRow.onclick = () => pushView({ name: 'sources', title: '音源', main: true });
    root.appendChild(sourceRow);

    root.appendChild(h('div', 'setting-title', '播放'));
    const playbackCard = h('div', 'settings-card');
    playbackCard.appendChild(settingSelect('音质', '播放和下载优先使用该档位', [['128k', '标准 128k'], ['320k', '高品质 320k'], ['flac', '无损 flac']], S.quality, value => {
      S.quality = value; saveStore(); notify('音质：' + value); if (S.current) playSong(S.current, S.queue, { startMs: S.position });
    }));
    playbackCard.appendChild(settingSelect('播放顺序', '列表循环 / 单曲 / 随机 / 顺序', [['列表循环', '列表循环'], ['单曲循环', '单曲循环'], ['随机播放', '随机播放'], ['顺序播放', '顺序播放']], S.mode, value => { S.mode = value; saveStore(); updateDock(); }));
    playbackCard.appendChild(settingSelect('MineRadio 动效', '仅播放页生效，关闭后保留模糊封面与纯文字歌词', MINE_STYLES, S.styleName, value => {
      S.styleName = value; saveStore(); pushStageMetadata(); notify('动效：' + (MINE_STYLES.find(item => item[0] === value) || [])[1]);
    }));
    root.appendChild(playbackCard);

    root.appendChild(h('div', 'setting-title', '歌词'));
    const lyricCard = h('div', 'settings-card');
    const lyricRow = h('div', 'setting-row');
    const lyricCopy = h('div', 'copy');
    lyricCopy.appendChild(h('strong', '', '歌词设置'));
    lyricCopy.appendChild(h('small', '', '详情页颜色、翻译/罗马音、桌面歌词与时间偏移'));
    const lyricChevron = h('span', 'value', '›');
    lyricRow.append(lyricCopy, lyricChevron);
    lyricRow.onclick = () => pushView({ name: 'lyrics-settings', title: '歌词设置', main: false });
    lyricCard.appendChild(lyricRow);
    root.appendChild(lyricCard);

    root.appendChild(h('div', 'setting-title', '系统与互联'));
    const systemCard = h('div', 'settings-card');
    systemCard.appendChild(settingSelect('外观', '全局配色，播放页背景随之调整', [['dark', '深色'], ['light', '浅色'], ['system', '跟随系统']], S.appearance, value => { S.appearance = value; saveStore(); applyAppearance(); }));
    systemCard.appendChild(settingSwitch('启动时继续播放上次内容', '默认关闭，保留上次歌曲和进度，打开软件保持暂停', S.resumeOnStartup === true, value => { S.resumeOnStartup = value; saveStore(); }));
    systemCard.appendChild(settingSwitch('双击刷新同步重算推荐', '双击首页左上角标题刷新时，同时重洗猜你喜欢与每日推荐算法内容', S.refreshAlgoOnDoubleTap !== false, value => {
      S.refreshAlgoOnDoubleTap = value; saveStore();
      notify(value ? '已开启双击刷新同步重算推荐' : '双击刷新将仅更新常规首页板块');
    }));
    systemCard.appendChild(settingSwitch('关闭窗口后留在托盘', '关闭主窗口时继续在后台播放', S.closeToTray, value => {
      S.closeToTray = value; saveStore();
      if (window.desktopWindow && window.desktopWindow.setCloseBehavior) window.desktopWindow.setCloseBehavior(value ? 'tray' : 'exit').catch(() => {});
      notify(value ? '关闭窗口后将继续在托盘运行' : '关闭窗口将退出应用');
    }));
    systemCard.appendChild(settingSwitch('开机自动启动', '登录 Windows 后自动启动 LxMine', S.launchAtStartup, value => {
      S.launchAtStartup = value; saveStore();
      if (window.desktopWindow && window.desktopWindow.setLaunchAtStartup) window.desktopWindow.setLaunchAtStartup(value).then(result => { if (result && result.ok === false) notify('设置失败：' + (result.error || '系统不允许')); }).catch(error => notify('设置失败：' + error.message));
    }));
    systemCard.appendChild(settingSwitch('壁纸模式', '场景铺到桌面，主窗口可照常打开；在此或托盘菜单关闭', S.wallpaperMode, value => applyWallpaperMode(value)));
    systemCard.appendChild(settingSwitch('同局域网自动同步歌单', '发现同网络下同样开启自动同步的手机/电脑时，歌单与喜欢变动自动合并同步', S.lanAutoSync === true, value => {
      S.lanAutoSync = value; saveStore();
      window.lxMusic?.syncSetAuto?.(value).catch?.(() => {});
      notify(value ? '已开启同局域网歌单自动同步' : '已关闭同局域网歌单自动同步');
    }));
    const syncRow = h('div', 'setting-row');
    const syncCopy = h('div', 'copy'); syncCopy.appendChild(h('strong', '', '局域网同步')); syncCopy.appendChild(h('small', '', '手机、平板与电脑之间双向同步歌单、音源和设置'));
    const syncBtn = h('button', 'pill-btn', '管理'); syncBtn.onclick = openSyncPanel;
    syncRow.append(syncCopy, syncBtn);
    systemCard.appendChild(syncRow);
    const downloadRow = h('div', 'setting-row');
    const downloadCopy = h('div', 'copy'); downloadCopy.appendChild(h('strong', '', '下载管理')); downloadCopy.appendChild(h('small', '', (S.downloads || []).filter(item => item.state === 'complete').length + ' 首已完成'));
    const downloadBtn = h('button', 'pill-btn', '查看'); downloadBtn.onclick = () => pushView({ name: 'downloads', title: '下载', main: true });
    downloadRow.append(downloadCopy, downloadBtn);
    systemCard.appendChild(downloadRow);
    root.appendChild(systemCard);
    root.appendChild(h('div', 'setting-title', '关于'));
    const about = h('div', 'settings-card');
    const aboutRow = h('div', 'setting-row');
    const aboutCopy = h('div', 'copy'); aboutCopy.appendChild(h('strong', '', 'LxMine')); aboutCopy.appendChild(h('small', '', 'LX 音源 · MineRadio 视觉 · 平板同源界面'));
    aboutRow.append(aboutCopy, h('span', 'value', '1.1.0'));
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

  let updateModalEl = null;
  let updateChecking = false;
  function closeUpdateModal() {
    if (updateModalEl) {
      updateModalEl.remove();
      updateModalEl = null;
    }
  }
  function formatUpdateMb(bytes) {
    const n = Number(bytes) || 0;
    return n > 0 ? (n / 1048576).toFixed(1) + ' MB' : '';
  }
  function showUpdateModal(options) {
    closeUpdateModal();
    const backdrop = h('div', 'update-modal-backdrop');
    const box = h('div', 'update-modal-box');
    const title = h('div', 'update-modal-title', options.title || '版本更新');
    const sub = h('div', 'update-modal-sub', options.subtitle || '');
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

    const actions = h('div', 'update-modal-actions');
    const secondaryBtn = h('button', 'pill-btn', options.secondaryLabel || '关闭');
    secondaryBtn.onclick = () => {
      if (options.onSecondary) options.onSecondary();
      else closeUpdateModal();
    };
    actions.appendChild(secondaryBtn);

    let primaryBtn = null;
    if (options.primaryLabel) {
      primaryBtn = h('button', 'pill-btn accent', options.primaryLabel);
      primaryBtn.onclick = () => {
        if (options.onPrimary) {
          options.onPrimary({ primaryBtn, secondaryBtn, progressWrap, progressFill, progressText });
        }
      };
      actions.appendChild(primaryBtn);
    }
    box.append(actions);
    backdrop.appendChild(box);
    backdrop.onclick = (e) => { if (e.target === backdrop && !backdrop.dataset.busy) closeUpdateModal(); };
    document.body.appendChild(backdrop);
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
      const primary = h('input', 'lyric-color-input');
      primary.type = 'color';
      primary.value = normalizeHexColor(S[colorKey], '#7dd3fc');
      primary.setAttribute('aria-label', title + '主色');
      primary.oninput = () => { S[colorKey] = primary.value; saveStore(); applyLyricTheme(); };
      controls.appendChild(primary);
      if (mode === 'custom-gradient') {
        const secondary = h('input', 'lyric-color-input');
        secondary.type = 'color';
        secondary.value = normalizeHexColor(S[color2Key], '#a5b4fc');
        secondary.setAttribute('aria-label', title + '辅色');
        secondary.oninput = () => { S[color2Key] = secondary.value; saveStore(); applyLyricTheme(); };
        controls.appendChild(secondary);
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
    copy.appendChild(h('small', '', '正值歌词延后，负值歌词提前'));
    const controls = h('div', 'offset-row');
    const input = h('input'); input.type = 'number'; input.min = '-10000'; input.max = '10000'; input.step = '50'; input.value = String(S.lyricOffset);
    const range = h('input'); range.type = 'range'; range.min = '-10000'; range.max = '10000'; range.step = '50'; range.value = String(S.lyricOffset);
    const reset = h('button', 'pill-btn', '重置');
    const apply = value => {
      S.lyricOffset = Math.max(-10000, Math.min(10000, Number(value) || 0));
      input.value = String(S.lyricOffset);
      range.value = String(S.lyricOffset);
      saveStore(); syncLyric(true); pushDesktopLyrics(true);
    };
    reset.onclick = () => apply(0);
    input.onchange = () => apply(input.value);
    range.oninput = () => apply(range.value);
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
    detailSizeCopy.appendChild(h('small', '', '播放页歌词字号，75%–140%'));
    const detailSizeControls = h('div', 'lyric-size-controls');
    const detailSizeRange = h('input'); detailSizeRange.type = 'range'; detailSizeRange.min = '75'; detailSizeRange.max = '140'; detailSizeRange.step = '1'; detailSizeRange.value = String(Math.round((Number(S.lyricFontSize) || 1) * 100));
    const detailSizeValue = h('span', 'value', Math.round((Number(S.lyricFontSize) || 1) * 100) + '%');
    detailSizeRange.oninput = () => {
      S.lyricFontSize = Number(detailSizeRange.value) / 100;
      detailSizeValue.textContent = detailSizeRange.value + '%';
      saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
    };
    detailSizeControls.append(detailSizeRange, detailSizeValue);
    detailSizeRow.append(detailSizeCopy, detailSizeControls);
    detailCard.appendChild(detailSizeRow);
    detailCard.appendChild(settingSwitch('显示翻译', '在主歌词下方显示中文等翻译歌词', S.lyricShowTranslation, value => {
      S.lyricShowTranslation = value; saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
    }));
    detailCard.appendChild(settingSwitch('显示音译 / 罗马音', '日韩等外语歌词显示音译或罗马音（数据源提供时）', S.lyricShowRomaji, value => {
      S.lyricShowRomaji = value; saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
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
    sizeRange.oninput = () => {
      S.desktopLyricSize = Number(sizeRange.value) / 100;
      sizeValue.textContent = sizeRange.value + '%';
      saveStore(); pushDesktopLyrics(true);
    };
    sizeControls.append(sizeRange, sizeValue);
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
  function renderDownloads() {
    if (deferPageRefresh()) return;
    setBodyMode('secondary');
    setHeader('下载', '', { back: goBack });
    const root = mainRoot();
    const card = h('div', 'song-list');
    (S.downloads || []).forEach(job => {
      const row = h('div', 'song-row');
      const art = h('div', 'row-art');
      applyArtSurface(art, rawCoverOf(job) || rawCoverOf(job.song), job.name || job.artist || '', 'download');
      const main = h('div', 'row-main');
      main.appendChild(h('strong', '', job.name || '未知歌曲'));
      const percent = job.total ? Math.round(job.received / job.total * 100) : 0;
      main.appendChild(h('small', '', (job.artist || '') + ' · ' + (job.state === 'complete' ? '已完成' : job.state === 'failed' ? job.error : job.state === 'cancelled' ? '已取消' : '下载中 ' + percent + '%')));
      const album = h('div', 'album', job.quality || '');
      const actions = h('div', '');
      row.append(art, main, album, h('div', ''), actions);
      if (job.state === 'downloading') {
        const cancel = h('button', 'pill-btn', '取消');
        cancel.onclick = () => window.lxMusic.cancelDownload(job.id);
        row.lastChild.appendChild(cancel);
      }
      if (job.state === 'complete') {
        const location = h('small', 'muted', job.filePath || '');
        main.appendChild(location);
        const reveal = h('button', 'pill-btn', '打开位置');
        reveal.onclick = () => window.lxMusic.revealDownload(job.id).catch(error => notify(error.message));
        actions.appendChild(reveal);
      }
      card.appendChild(row);
    });
    if (!(S.downloads || []).length) card.appendChild(h('div', 'empty-hint', '还没有下载任务'));
    root.appendChild(card);
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
      const list = arrangeSongs(S.localTracks, tools);
      if (list.length) playSong(list[0], list);
    };
    const sort = h('button', 'list-tools-sort', '排列');
    sort.onclick = () => openListSortMenu(sort, S.localTracks, tools, () => refreshList());
    bar.node.prepend(play, sort);
    const host = h('div', 'list-tools-host');
    root.append(bar.node, host);
    refreshList = () => {
      const list = arrangeSongs(S.localTracks, tools);
      bar.setCount(list.length);
      host.replaceChildren();
      if (list.length) host.appendChild(songListCard(list, S.localTracks));
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
  function openSearch() {
    const entry = document.querySelector('.search-entry');
    S.searchOriginRect = entry ? entry.getBoundingClientRect() : null;
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
  function closeSearch() {
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
    ['华语流行', '周杰伦', '林俊杰', '邓紫棋', '陈奕迅', '纯音乐', '粤语', '轻音乐'].forEach(value => {
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
          row = songRow(song, displayed, index, { openDetail: true });
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
      play.onclick = () => { if (displayed.length) playSong(displayed[0], displayed); };
      const sort = h('button', 'list-tools-sort', '排列');
      sort.onclick = () => openListSortMenu(sort, all, tools, refreshMusicRows);
      bar.node.prepend(play, sort);
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
      if (item.kind === 'songlist') {
        const source = item.source || SOURCE_OF_PROVIDER[item.provider] || 'wy';
        if (source === 'wy' || source === 'netease') {
          closeSearch();
          await openFeedPlaylist({ id: item.id, name: item.name, cover: item.cover, trackCount: item.count });
        } else {
          try {
            notify('正在导入歌单…');
            await window.lxMusic.importPlaylist(String(item.id), source);
            await loadHome(true); notify('已保存「' + item.name + '」');
          } catch (error) { notify('导入失败：' + error.message); }
        }
        return;
      }
      if(item.song){const song=Object.assign({},item.song,{provider:item.source,artist:item.song.singer,cover:item.song.coverUrl});playSong(song,[song]);openDetail();return;}
      try {
        notify('正在获取全部歌曲…');
        const result=await window.lxMusic.entityTracks({id:item.id,source:item.source||'wy',kind:item.kind});
        closeSearch();pushView({name:'playlist',kind:'entity',id:item.id,title:item.name,cover:item.cover,tracks:result.items,warning:result.warning,main:false});
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
    S.detailFromSearch = !!S.searchOpen;
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
  function closeDetail() {
    S.detailOpen = false;
    pushStagePresentation();
    clearTimeout(detailRevealTimer); clearTimeout(detailCloseHoldTimer); clearTimeout(detailCloseTimer);
    document.body.classList.remove('detail-entering');
    setDetailImmersive(false);
    const overlay = $('#detail-overlay');
    overlay.classList.add('closing');
    // Hold first, fade the stage behind the capsule, and only then return the
    // capsule to its home position (never both at once).
    detailCloseHoldTimer = setTimeout(() => document.body.classList.add('detail-leaving'), 140);
    detailCloseTimer = setTimeout(() => {
      overlay.classList.add('hidden'); overlay.classList.remove('closing');
      document.body.classList.remove('detail-leaving');
      $('#timeline').classList.add('hidden');
      if (S.detailFromSearch && S.searchOpen) { $('#search-overlay').classList.remove('hidden'); setBodyMode('search'); }
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
    menu.style.visibility='hidden';
    let escapeHandler = null;
    const close = () => {
      if (!menu.isConnected || menu.classList.contains('closing')) return Promise.resolve();
      menu.classList.add('closing');
      if (backdrop) backdrop.remove();
      if (escapeHandler) document.removeEventListener('keydown', escapeHandler, true);
      return Promise.resolve(window.LxPopupMotion.close(menu)).finally(()=>{menu.remove();});
    };
    items.forEach(item => {
      const row = h('div', 'menu-row' + (item.checked ? ' checked' : ''));
      row.appendChild(h('span', 'menu-label', item.label));
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
    openAnchoredMenu($('#style-btn'), MINE_STYLES.map(([value, label]) => ({
      label,
      checked: S.styleName === value,
      action: () => { S.styleName = value; saveStore(); pushStageMetadata(); notify('动效：' + label); }
    })));
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
      body.replaceChildren(h('div', 'search-status', '评论读取失败：' + error.message));
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
    main.append(top, h('p', '', comment.content || ''));
    const meta = h('div', 'comment-meta');
    meta.appendChild(h('span', '', comment.location || ''));
    meta.appendChild(h('span', 'likes', '♥ ' + (comment.liked || 0)));
    main.appendChild(meta);
    row.append(avatar, main);
    return row;
  }

  /* ---------------- modal / queue / sync ---------------- */
  function modal(content) {
    const backdrop = h('div', 'modal-backdrop');
    if (content) backdrop.appendChild(content);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); });
    $('#modal-root').appendChild(backdrop);
    return backdrop;
  }
  function closeModal(backdrop) {
    if (!backdrop || !backdrop.parentNode || backdrop.classList.contains('closing')) return;
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
          await persistFavoritesToLibrary();
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

    filterItems.forEach(([id, label]) => {
      const pill = h('button', 'sp-filter-pill' + (id === activeFilter ? ' active' : ''), label);
      pill.type = 'button';
      pill.onclick = () => {
        activeFilter = id;
        filterBar.querySelectorAll('.sp-filter-pill').forEach(node => node.classList.toggle('active', node.dataset.filterId === id));
        renderCandidates();
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

    const fetchCandidates = async () => {
      try {
        if (!window.lxMusic || typeof window.lxMusic.platformCandidates !== 'function') {
          throw new Error('当前环境不支持跨平台检索');
        }
        const list = await window.lxMusic.platformCandidates(song, ['wy', 'tx', 'kg', 'kw']);
        candidates = Array.isArray(list) ? list : [];
        loading = false;
        if (!backdrop.isConnected) return;
        renderCandidates();
        void hydrateCovers(candidates, () => {
          if (backdrop.isConnected) renderCandidates();
        });
      } catch (error) {
        loading = false;
        loadErr = error && error.message ? error.message : String(error);
        if (backdrop.isConnected) renderCandidates();
      }
    };
    void fetchCandidates();
  }

  function openQueue() {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    const listWrap = h('div', '');
    box.append(h('h2', '', '播放队列'), listWrap);
    const renderQueueList = () => {
      listWrap.replaceChildren();
      if (!S.queue.length) {
        listWrap.appendChild(h('p', 'muted', '队列还是空的，先播放一首歌。'));
        return;
      }
      S.queue.forEach((song, index) => {
        const songKey = identity(song);
        const isOnline = song && song.source !== 'local' && song.provider !== 'local';
        const row = h('div', 'queue-row' + (index === S.queueIndex ? ' playing' : ''));
        const art = h('div', 'art');
        applyArtSurface(art, rawCoverOf(song), song.name || song.artist || '', 'music', songKey);
        const badge = srcBadge(songSource(song) || song.source);
        if (badge) art.appendChild(badge);
        const copy = h('div', 'copy');
        copy.appendChild(h('strong', '', song.name || '未知歌曲'));
        copy.appendChild(h('small', '', (song.artist || song.singer || '未知歌手') + (isOnline ? ' · ' + platformName(song) : '')));
        const rowActs = h('div', 'queue-actions');
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
        row.append(art, copy, rowActs);
        row.onclick = () => { S.queueIndex = index; playSong(song, S.queue); closeModal(backdrop); };
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
  function openAddMenu(song, opts) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '歌曲操作'));
    const lists = (S.library || []).filter(item => !item.isFavorite && item.name !== '我喜欢的');
    if (typeof opts?.onRemove === 'function') {
      const rem = h('div', 'queue-row');
      const remCopy = h('div', 'copy'); remCopy.appendChild(h('strong', '', opts.removeLabel || '从当前歌单移除'));
      rem.appendChild(remCopy);
      rem.onclick = () => { closeModal(backdrop); opts.onRemove(song); };
      box.appendChild(rem);
    }
    const favRow = h('div', 'queue-row');
    const favCopy = h('div', 'copy'); favCopy.appendChild(h('strong', '', isFavorite(song) ? '取消喜欢' : '添加到「我喜欢的」'));
    favRow.appendChild(favCopy);
    favRow.onclick = () => { closeModal(backdrop); toggleFavorite(song); if (typeof opts?.onLikeChanged === 'function') opts.onLikeChanged(song, isFavorite(song)); };
    box.appendChild(favRow);
    if (song && song.source !== 'local' && song.provider !== 'local') {
      const switchRow = h('div', 'queue-row');
      const switchCopy = h('div', 'copy');
      switchCopy.append(
        h('strong', '', '切换歌曲平台'),
        h('small', '', '当前：' + platformName(song) + ' · 搜索网易云 / QQ / 酷狗 / 酷我同名版本')
      );
      switchRow.appendChild(switchCopy);
      switchRow.onclick = () => {
        closeModal(backdrop);
        const ctx = opts?.switchContext || (S.queue.some(q => identity(q) === identity(song)) ? { mode: 'queue' } : { mode: 'standalone' });
        openSwitchPlatformModal(song, ctx);
      };
      box.appendChild(switchRow);
      const direct = h('div', 'queue-row');
      const directCopy = h('div', 'copy'); directCopy.appendChild(h('strong', '', '下载这首歌'));
      direct.appendChild(directCopy);
      direct.onclick = () => { closeModal(backdrop); downloadCurrent(song); };
      box.appendChild(direct);
    }
    if (!lists.length) box.appendChild(h('p', 'muted', '还没有自建歌单，可在曲库新建一个。'));
    lists.forEach(playlist => {
      const row = h('div', 'queue-row');
      const copy = h('div', 'copy'); copy.appendChild(h('strong', '', playlist.name)); copy.appendChild(h('small', '', (playlist.trackCount || 0) + ' 首'));
      row.append(copy);
      row.onclick = async () => {
        try {
          await window.desktopWindow.addBuiltInPlaylistTrack(playlist.id, song);
          window.lxMusic?.syncTriggerAuto?.().catch?.(() => {});
          closeModal(backdrop); notify('已添加到「' + playlist.name + '」'); await loadHome(true);
        } catch (error) { notify('添加失败：' + error.message); }
      };
      box.appendChild(row);
    });
    backdrop.appendChild(box);
  }
  function openPlaybackMenu() {
    openAnchoredMenu($('#dock-controls [data-action="more"]'), [
      { label: '播放顺序 · ' + S.mode, action: () => cycleMode() },
      { label: '下载歌曲', action: () => downloadCurrent() },
      { label: '播放队列', action: () => openQueue() },
      { label: '音量 · ' + Math.round(S.volume * 100) + '%', action: () => openVolumePopover($('#dock-controls [data-action="more"]')) }
      ,{label:S.desktopLyrics?'关闭桌面歌词':'打开桌面歌词',action:()=>applyDesktopLyrics(!S.desktopLyrics)}
      ,{label:S.desktopLyricsLocked?'解锁桌面歌词':'锁定桌面歌词',action:()=>{S.desktopLyricsLocked=!S.desktopLyricsLocked;saveStore();window.desktopWindow?.setDesktopLyricsLocked?.(S.desktopLyricsLocked);}}
    ]);
  }
  function openSyncPanel() {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '局域网同步'));
    box.appendChild(h('p', 'muted', '同一 Wi-Fi 下的手机、平板和电脑会出现在这里（包含「我喜欢的」与全部歌单）。若路由器开启了广播隔离，可输入对端 IP:端口直连发送。'));
    const autoRow = settingSwitch('同局域网自动同步歌单', '双方均开启时，歌单和收藏变动自动合并同步', S.lanAutoSync === true, value => {
      S.lanAutoSync = value; saveStore();
      window.lxMusic?.syncSetAuto?.(value).catch?.(() => {});
    });
    box.appendChild(autoRow);
    const status = h('p', 'muted', '正在读取设备…');
    const list = h('div', '');
    const directRow = h('div', 'sync-direct-row');
    const directInput = h('input'); directInput.type = 'text'; directInput.placeholder = '手动直连：输入对端 IP:端口（如 192.168.1.20:41300）';
    const directBtn = h('button', 'pill-btn', '直连发送');
    directBtn.onclick = async () => {
      const target = directInput.value.trim();
      if (!target) return notify('请输入对端 IP 地址');
      directBtn.disabled = true; directBtn.textContent = '等待确认…';
      try {
        await persistFavoritesToLibrary();
        const result = await window.lxMusic.syncSendDirect(target);
        status.textContent = result?.accepted ? '已直连同步到 ' + target : '对方未接受：' + (result?.message || '已拒绝');
      } catch (error) { status.textContent = '直连失败：' + error.message; }
      directBtn.disabled = false; directBtn.textContent = '直连发送';
    };
    directRow.append(directInput, directBtn);
    box.append(status, list, directRow);
    backdrop.appendChild(box);
    const refresh = async () => {
      try {
        const state = await window.lxMusic.syncStatus();
        const addrText = Array.isArray(state.addresses) && state.addresses.length && state.port
          ? `（${state.addresses[0]}:${state.port}）`
          : '';
        status.textContent = '本机：' + (state.deviceName || 'LxMine PC') + addrText;
        const devices = await window.lxMusic.syncDevices();
        list.replaceChildren();
        if (!devices.length) list.appendChild(h('p', 'muted', '还没有自动发现其他设备，确认连接同一 Wi-Fi 或使用下方 IP 直连。'));
        devices.forEach(device => {
          const row = h('div', 'queue-row');
          const copy = h('div', 'copy'); copy.appendChild(h('strong', '', device.name || '设备')); copy.appendChild(h('small', '', (device.platform || '') + ' · ' + (device.address || '') + (device.port ? ':' + device.port : '')));
          const send = h('button', 'pill-btn', '发送本机数据');
          send.onclick = async () => {
            send.disabled = true; send.textContent = '等待对方确认…';
            try {
              await persistFavoritesToLibrary();
              const result = await window.lxMusic.syncSend(device.id);
              status.textContent = result.accepted ? '已保存到「' + device.name + '」' : '对方未接受：' + (result.message || '已拒绝');
            } catch (error) { status.textContent = '同步失败：' + error.message; }
            send.disabled = false; send.textContent = '发送本机数据';
          };
          row.append(copy, send);
          list.appendChild(row);
        });
      } catch (error) { status.textContent = '读取失败：' + error.message; }
    };
    refresh();
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
      const backdrop = modal(null);
      const box = h('div', 'modal glass sync-incoming-modal');
      box.dataset.pendingId = incoming.pendingId;
      box.appendChild(h('h2', '', '接收同步'));
      const summary = incoming.summary || {};
      box.appendChild(h('p', 'muted', '「' + (incoming.peer && incoming.peer.name || '另一台设备') + '」将发送 ' +
        (summary.playlists || 0) + ' 个歌单、' + (summary.sources || 0) + ' 个音源及设置，覆盖本机数据。'));
      const status = h('p', 'muted', incoming.lastError || '');
      const actions = h('div', 'modal-actions');
      const reject = h('button', 'pill-btn', '拒绝');
      const accept = h('button', 'pill-btn accent', '接收并覆盖');
      const respond = async accepted => {
        reject.disabled = accept.disabled = true; status.textContent = accepted ? '正在保存…' : '正在拒绝…';
        try {
          const result = await window.lxMusic.syncRespond(incoming.pendingId, accepted);
          if (!result || result.ok !== true) {
            if (result?.code === 'PENDING_NOT_FOUND') { closeModal(backdrop); notify(result.message); checkPendingSync(); return; }
            throw new Error(result?.message || '同步未能保存，请重试');
          }
          closeModal(backdrop);
          if (accepted) await refreshSyncedLibrary();
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
      else if (action === 'prev') { if (audio.currentTime > 3) seekTo(0); else nextSong(-1); }
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
    seek.addEventListener('input', () => {
      seek.dataset.drag = '1';
      $('#time-now').textContent = fmtTime(Number(seek.value) || 0);
    });
    seek.addEventListener('change', () => {
      seek.dataset.drag = ''; seekTo(Number(seek.value) || 0);
    });
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
    $('#comments-btn').onclick = openComments;
    $('#quality-btn').onclick = openQualityMenu;
    $('#style-btn').onclick = openStyleMenu;
    // PC 没有双指手势，沉浸按钮常驻：按下进入（隐藏其余控件），再按退出。
    $('#immersive-btn').onclick = () => { setDetailImmersive(!document.body.classList.contains('detail-immersive')); };
  }
  function bindComments() {
    $('#comments-back').onclick = closeComments;
  }
  function updateSearchNodeGeometry(phone, scroll) {
    const entry = $('#search-node');
    if (!entry) return;
    const distance = phone ? 100 : 70;
    const t = Math.max(0, Math.min(1, scroll / distance));
    entry.style.setProperty('--sr', t.toFixed(3));
    const height = 50;
    const baseWidth = phone ? Math.max(50, innerWidth - 40) : Math.max(50, Math.min(340, innerWidth - 300));
    const width = baseWidth + (50 - baseWidth) * t;
    if (phone) {
      entry.style.top = (92 - 50 * t).toFixed(1) + 'px';
      entry.style.left = (20 + (innerWidth - 70 - 20) * t).toFixed(1) + 'px';
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
  function updateHomeCompact() {
    const scroll = $('#app').scrollTop || 0;
    const phone = window.innerWidth / Math.max(1, window.innerHeight) < 0.87;
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
    const compact = phone && S.dockCompact && firstLevel && !S.searchOpen && !S.detailOpen && !S.commentsOpen;
    document.body.classList.toggle('phone-compact', compact);
    const entry = $('#search-node');
    if (entry) {
      const homeLevel = S.tab === 'home' && (!S.currentView || S.currentView.name === 'home');
      const show = homeLevel && !S.detailOpen && !S.searchOpen && !S.commentsOpen;
      entry.classList.toggle('off', !show);
    }
    // 快捷胶囊高亮跟随滚动：始终取最后一个滚过胶囊栏的板块，页底也保持
    // "分类"高亮（用户已确认删除"页底无高亮"规则）；点击后 800ms 内不抢。
    if (S.tab === 'home' && !S.detailOpen && !S.searchOpen && !S.commentsOpen) {
      const appEl = $('#app');
      let active = '';
      const barLine = 210;
      const appTop = appEl.getBoundingClientRect().top;
      document.querySelectorAll('.section[data-section]').forEach(block => {
        const top = block.getBoundingClientRect().top - appTop;
        if (top <= barLine) active = block.dataset.section;
      });
      // 页底强制"分类"：页底时最后板块到不了胶囊栏线，且一栏/两栏切换需要 ~44px
      // 滚动余量，判定带放宽到 90px，切栏时的页面回滚不会把高亮抖到"热门"。
      if (appEl.scrollTop + appEl.clientHeight >= appEl.scrollHeight - 90) active = 'category';
      if (Date.now() > (S.homeChipHoldUntil || 0) && S.homeChipAnchor !== active) {
        S.homeChipAnchor = active;
        document.querySelectorAll('.home-chip').forEach(node => node.classList.toggle('active', node.dataset.anchor === active));
      }
    }
    const back = $('#floating-back');
    if (back) {
      const view = S.currentView;
      const canBack = !!view && !['home','library','settings'].includes(view.name) && scroll > 90 && !S.detailOpen && !S.searchOpen && !S.commentsOpen;
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
      if (!audio.duration) return;
      updateProgress();
      if (Date.now() - (bindAudio.lastSave || 0) > 5000) { bindAudio.lastSave = Date.now(); savePlayback(); }
    });
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('playing', () => {
      if (!S.current) return;
      S.recentlyPlayed = [Object.assign({}, S.current), ...S.recentlyPlayed.filter(song => identity(song) !== identity(S.current))];
      saveStore();
      if (S.currentView.name === 'library' && !S.detailOpen && !S.searchOpen) renderLibrary();
    });
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => {
      setPlaying(false);
      if (S.mode === '单曲循环') { seekTo(0); audio.play().catch(() => {}); return; }
      const last = S.queueIndex >= S.queue.length - 1;
      if (S.mode === '顺序播放' && last) return;
      nextSong(1);
    });
    audio.addEventListener('loadedmetadata', () => {
      const song = S.current;
      if (!song || song.localUrl) return;
      const expectedMs = durationOf(song);
      const actualMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
      const key = identity(song);
      // 30 秒 VIP 试听运行时拦截：若标称完整歌曲（>=75s）但实际流只有 <=45s（且不足原长 45%），自动无感换源/跨平台重解析。
      if (expectedMs >= 75000 && actualMs > 5000 && actualMs <= 45000 && actualMs < expectedMs * 0.45 && S.previewRetryKey !== key) {
        S.previewRetryKey = key;
        const token = S.resolveToken;
        resolveWithFallback(song, { forceResolve: true, raceAll: true, excludeSourceIds: S.activeSourceId ? [S.activeSourceId] : [] })
          .then(resolved => {
            if (token !== S.resolveToken || !resolved || !resolved.url) return;
            S.playbackUrl = resolved.url;
            audio.src = resolved.url;
            if (S.playRequested) audio.play().catch(() => {});
          })
          .catch(() => {});
      }
    });
    audio.addEventListener('error', () => {
      const song = S.current;
      const key = song ? identity(song) : '';
      if (song && !song.localUrl && S.previewRetryKey !== key) {
        S.previewRetryKey = key;
        const token = S.resolveToken;
        resolveWithFallback(song, { forceResolve: true, raceAll: true, excludeSourceIds: S.activeSourceId ? [S.activeSourceId] : [] })
          .then(resolved => {
            if (token !== S.resolveToken || !resolved || !resolved.url) return;
            S.playbackUrl = resolved.url;
            audio.src = resolved.url;
            if (S.playRequested) audio.play().catch(() => {});
          })
          .catch(() => { notify('当前歌曲暂无法播放，请尝试切换音源或音质'); setPlaying(false); });
        return;
      }
      notify('当前歌曲暂无法播放，请尝试切换音源或音质');
      setPlaying(false);
    });
    audio.volume = S.volume;
    updateVolumeUI();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          S.playRequested = true;
          if (S.resolving) return;
          if (!audio.src && S.current) playSong(S.current, S.queue, { startMs: S.position });
          else audio.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => { S.playRequested = false; audio.pause(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => nextSong(-1));
        navigator.mediaSession.setActionHandler('nexttrack', () => nextSong(1));
        navigator.mediaSession.setActionHandler('seekto', details => { if (details && Number.isFinite(details.seekTime)) seekTo(details.seekTime * 1000); });
      } catch (_) {}
    }
  }
  function bindKeyboard() {
    document.addEventListener('keydown', event => {
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if ((event.key === ' ' || event.key === 'Enter') && target?.closest('button,[role="button"],[role="tab"],[role="switch"]')) return;
      if (event.key === 'Escape') { goBack(); return; }
      if (event.key === ' ') { event.preventDefault(); togglePlayback(); return; }
      if (event.key === 'ArrowRight' && event.altKey) { event.preventDefault(); nextSong(1); return; }
      if (event.key === 'ArrowLeft' && event.altKey) { event.preventDefault(); nextSong(-1); return; }
      if ((event.key === 'f' || event.key === 'F') && (event.ctrlKey || event.metaKey)) { event.preventDefault(); openSearch(); }
    });
  }
  function bindIpcEvents() {
    window.addEventListener('focus', checkPendingSync);
    window.desktopWindow?.onDesktopLyricsEnabledState?.(data=>{S.desktopLyrics=!!data.enabled;saveStore();updateDesktopLyricsButton();if(S.currentView?.name==='lyrics-settings')renderLyricsSettings();});
    window.desktopWindow?.onDesktopLyricsLockState?.(data=>{S.desktopLyricsLocked=!!data.locked;saveStore();});
    window.desktopWindow?.onDesktopLyricsAction?.(action=>{if(action==='prev')nextSong(-1);else if(action==='next')nextSong(1);else if(action==='toggle')togglePlayback();});
    if (window.lxMusic && window.lxMusic.onDownloadsChanged) window.lxMusic.onDownloadsChanged(jobs => {
      S.downloads = Array.isArray(jobs) ? jobs : [];
      if (S.currentView.name === 'downloads') renderDownloads();
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
  function savePlayback() {
    try {
      localStorage.setItem(STORE_KEY + '.playback', JSON.stringify({
        song: S.current, queue: S.queue, index: S.queueIndex, position: S.position
      }));
    } catch (_) {}
  }
  function restorePlayback() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY + '.playback') || 'null');
      if (!saved || !saved.song) return;
      S.current = saved.song; S.queue = Array.isArray(saved.queue) ? saved.queue : [saved.song];
      S.queueIndex = Math.max(0, Number(saved.index) || 0); S.position = Math.max(0, Number(saved.position) || 0);
      S.duration = durationOf(saved.song);
      setStageSong(S.current); updateDock();
      loadLyrics(S.current, ++S.resolveToken).catch(() => {});
      $('#time-now').textContent = fmtTime(S.position);
      if (S.resumeOnStartup === true) {
        const restored = S.current;
        refreshSources().then(() => { if (S.current === restored && !S.playing && !audio.src) playSong(restored, S.queue, { startMs: S.position }); });
      }
    } catch (_) {}
  }
  function restoreToggle() {
    if (!S.current) return;
    if (!audio.src) playSong(S.current, S.queue, { startMs: S.position });
    else togglePlayback();
  }

  function boot() {
    initStage();
    setTimeout(() => {
      S.dynamicStageMounted = true; S.plainStageMounted = true;
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
    $('#app').addEventListener('scroll', updateHomeCompact, { passive: true });
    window.addEventListener('resize', () => {
      document.querySelectorAll('.row-scroll').forEach(row => { delete row.dataset.bleedW; });
      document.querySelectorAll('.playlist-mosaic').forEach(layoutMosaic);
      updateSearchInsets();
      updateHomeCompact();
    });
    updateHomeCompact();
    bindAudio();
    bindKeyboard();
    bindIpcEvents();
    initRetainedPcModes();
    applyLyricTheme();
    updateDock();
    setTab('home');
    restorePlayback();
    loadHome(true).catch(error => notify('首页加载失败：' + error.message));
    loadSyncDevices();
    if (S.lanAutoSync) window.lxMusic?.syncSetAuto?.(true).catch?.(() => {});
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




