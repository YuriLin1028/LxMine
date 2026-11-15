/* LxMine PC renderer — tablet-first layout, rewritten on top of the existing
   Electron IPC/LX source backend. */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const audio = $('#audio');
  const STORE_KEY = 'lxmine.pc.v1';
  const MINE_STYLES = [
    ['mine-0', 'emily专辑封面'], ['mine-1', '滚筒'], ['mine-2', '星球'], ['mine-3', '虚空'],
    ['mine-4', '唱片'], ['mine-5', '星河'], ['mine-6', '安魂'], ['mine-7', '音域回响 · 地形'],
    ['mine-8', '音域回响 · 工坊'], ['mine-9', '月蚀圣环'], ['mine-10', '雨幕霓虹'],
    ['mine-11', '折光蝶群'], ['mine-12', '深海绽放']
  ];
  const PLATFORMS = [
    ['all', '聚合', 'all'], ['kw', '酷我', 'kuwo'], ['kg', '酷狗', 'kugou'], ['wy', '网易云', 'netease'], ['tx', 'QQ 音乐', 'qq']
  ];
  const KIND_TABS = [['music', '综合'], ['songlist', '歌单'], ['artist', '歌手'], ['album', '专辑'], ['lyric', '歌词'], ['podcast', '播客']];
  const PROVIDER_LABEL = { kuwo: '酷我', kugou: '酷狗', netease: '网易云', qq: 'QQ 音乐', migu: '咪咕', local: '本地', mineradio: 'LxMine' };
  const SOURCE_OF_PROVIDER = { kuwo: 'kw', kugou: 'kg', netease: 'wy', qq: 'tx' };
  const SEARCH_SOURCES = ['kw', 'kg', 'wy', 'tx'];

  const defaults = {
    tab: 'home', homePlatform:'wy', quality: '128k', mode: '列表循环', styleName: 'mine-7', lyricOffset: 0,
    resumeOnStartup: false, startupAnimation: true, desktopLyrics: false, desktopLyricsLocked:false, wallpaperMode: false, closeToTray: false, launchAtStartup: false, favorites: [], recentlyPlayed: [], searchHistory: [], volume: 1,
    lyricShowTranslation: true, lyricShowRomaji: false,
    lyricColorMode: 'cover-gradient', lyricColor: '#f4d28a', lyricColor2: '#8fb2a6',
    desktopLyricLines: 3, desktopLyricSize: 1,
    desktopLyricColorMode: 'cover-gradient', desktopLyricColor: '#f4d28a', desktopLyricColor2: '#8fb2a6',
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
    queue: [], queueIndex: -1, current: null, playing: false, position: 0, duration: 0,
    lyrics: [], lyricIndex: -1, lyricOffset: 0,
    detailOpen: false, commentsOpen: false, searchOpen: false, desktopLyricsPushedAt: 0, searchOriginRect: null, homeCompact: false, phoneExpanded: false, dockCompact: false, scrollTravel: 0, lastScroll: null, homeChipAnchor: 'banner', homeChipHoldUntil: 0, playingFeedId: '', viewTransitionToken: 0,
    scrollMemory: {}, commentToken: 0, resolveToken: 0, feedToken: 0,
    currentView: { name: 'home' }, stack: [], routeSeed: 0
  });
  S.recentlyPlayed = Array.isArray(S.recentlyPlayed) ? S.recentlyPlayed.filter(song => song && song.id && song.name) : [];
  S.lyricOffset = Number(S.lyricOffset) || 0;
  S.volume = Number(S.volume);
  if (!Number.isFinite(S.volume) || S.volume < 0) S.volume = 1;
  S.volume = Math.max(0, Math.min(1, S.volume));
  const lyricColorModes = ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'];
  for (const key of ['lyricColorMode', 'desktopLyricColorMode']) {
    if (!lyricColorModes.includes(S[key])) S[key] = 'cover-gradient';
  }
  S.lyricShowTranslation = S.lyricShowTranslation !== false;
  S.lyricShowRomaji = S.lyricShowRomaji === true;
  S.desktopLyricLines = [1, 2, 3, 5].includes(Number(S.desktopLyricLines)) ? Number(S.desktopLyricLines) : 3;
  S.desktopLyricSize = Math.max(0.72, Math.min(1.55, Number(S.desktopLyricSize) || 1));
  S.lyricColor = /^#[0-9a-f]{6}$/i.test(S.lyricColor || '') ? S.lyricColor : '#f4d28a';
  S.lyricColor2 = /^#[0-9a-f]{6}$/i.test(S.lyricColor2 || '') ? S.lyricColor2 : '#8fb2a6';
  S.desktopLyricColor = /^#[0-9a-f]{6}$/i.test(S.desktopLyricColor || '') ? S.desktopLyricColor : '#f4d28a';
  S.desktopLyricColor2 = /^#[0-9a-f]{6}$/i.test(S.desktopLyricColor2 || '') ? S.desktopLyricColor2 : '#8fb2a6';

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        tab: S.tab, homePlatform:S.homePlatform, quality: S.quality, mode: S.mode, styleName: S.styleName,
        lyricOffset: S.lyricOffset, resumeOnStartup: S.resumeOnStartup === true, startupAnimation: S.startupAnimation,
        desktopLyrics: S.desktopLyrics, desktopLyricsLocked:S.desktopLyricsLocked, wallpaperMode: S.wallpaperMode, closeToTray: S.closeToTray, launchAtStartup: S.launchAtStartup,
        favorites: S.favorites, recentlyPlayed: S.recentlyPlayed, searchHistory: S.searchHistory, volume: S.volume,
        lyricShowTranslation: S.lyricShowTranslation, lyricShowRomaji: S.lyricShowRomaji,
        lyricColorMode: S.lyricColorMode, lyricColor: S.lyricColor, lyricColor2: S.lyricColor2,
        desktopLyricLines: S.desktopLyricLines, desktopLyricSize: S.desktopLyricSize,
        desktopLyricColorMode: S.desktopLyricColorMode, desktopLyricColor: S.desktopLyricColor, desktopLyricColor2: S.desktopLyricColor2,
        mosaicSeed: S.mosaicSeed
      }));
    } catch (_) {}
  }
  // 歌单库拼贴只随机一次：种子写入 localStorage，之后每次启动都复用同一排列。
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
  function svgIcon(name, className) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (className) svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 24 24');
    const paths = {
      play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
      music: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
      pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/>',
      heart: '<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.8a4.1 4.1 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
      more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
      left: '<path d="M15 5l-7 7 7 7"/>',
      right: '<path d="M9 5l7 7-7 7"/>',
      library: '<rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>',
      queue: '<path d="M4 6h9M4 12h9M4 18h5" stroke="currentColor" fill="none"/><path d="M17 6v9" stroke="currentColor" fill="none"/><circle cx="15.5" cy="17.5" r="2.2" fill="currentColor" stroke="none"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
      down: '<path d="M5 9l7 7 7-7"/>',
      download: '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 20h16"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      import: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 11v5"/><path d="M9.5 13.5 12 16l2.5-2.5"/>',
      refresh: '<path d="M20 9A8 8 0 1 0 20 15"/><path d="M20 3v6h-6"/>',
      scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="4"/>',
      sparkle: '<path d="M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
      close: '<path d="M6 6l12 12M18 6L6 18"/>'
    };
    svg.innerHTML = paths[name] || '';
    return svg;
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
  function identity(song) { return song ? ((songSource(song) || song.provider || 'x') + ':' + (song.id || song.name)) : ''; }
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
  function stageWindow() {
    try { return document.getElementById('stage-frame').contentWindow; } catch (_) { return null; }
  }
  function initStage() {
    const frame = document.getElementById('stage-frame');
    if (!frame) return;
    const ready = () => {
      try { const win = frame.contentWindow; win.__lxmineNative = { seek: (ms) => seekTo(Number(ms) || 0) }; } catch (_) {}
      S.stageReady = true;
      try { frame.style.opacity = '1'; } catch (_) {}
      pushStageMetadata();
      pushStageClock(true);
    };
    frame.addEventListener('load', ready);
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') setTimeout(ready, 60);
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
    if (!S.current) return;
    const win = stageWindow();
    if (!win || !win.lxmineStage) { setTimeout(pushStageMetadata, 220); return; }
    const cover = stageCoverSource(S.current);
    const lyricColors = resolveLyricColors('detail');
    const data = {
      id: identity(S.current),
      audioUrl: stageAudioUrl(),
      mode: S.styleName,
      lines: S.lyrics.map(line => ({ timeMs: line.time, text: line.text })),
      translationLines: S.lyrics
        .filter(line => (S.lyricShowTranslation && line.translation) || (S.lyricShowRomaji && line.romaji))
        .map(line => ({ timeMs: line.time, text: [S.lyricShowTranslation ? line.translation : '', S.lyricShowRomaji ? line.romaji : ''].filter(Boolean).join(' · ') })),
      lyricColorMode: S.lyricColorMode === 'cover-gradient' ? 'auto' : 'custom',
      lyricColors: { primary: lyricColors.primary, secondary: lyricColors.secondary, highlight: lyricColors.gradient ? lyricColors.secondary : lyricColors.highlight, glow: lyricColors.glow },
      name: S.current.name || '',
      singer: S.current.artist || S.current.singer || '',
      cover: cover ? new URL(cover, location.href).href : '',
      duration: S.duration || durationOf(S.current),
      lyricOffset: Number(S.lyricOffset) || 0,
      topInset: 0,
      bottomInset: 0
    };
    try { win.lxmineStage.metadata(data); } catch (error) { console.warn('[Stage] metadata', error); }
    S.wallpaperStage = data;
    if (S.wallpaperMode) window.desktopWindow?.updateWallpaperMode?.({ stage: data, clock: { positionMs: S.position, playing: !!S.playing } }).catch(() => {});
  }
  function setStageSong(song, preserveStage) {
    refreshLyricPalette(song && song.cover);
    const frame = document.getElementById('stage-frame');
    if (frame && !preserveStage) {
      frame.style.opacity = '0';
      clearTimeout(setStageSong.revealTimer);
      setStageSong.revealTimer = setTimeout(() => { try { frame.style.opacity = '1'; } catch (_) {} }, 900);
    }
    const fallback = document.getElementById('stage-fallback');
    if (fallback) {
      const cover = song && song.cover ? coverUrl(song.cover) : '';
      fallback.style.backgroundImage = cover ? 'url("' + cover.replace(/"/g, '%22') + '"), radial-gradient(80% 70% at 50% 90%, var(--stage-a, #3b5b51), #07080a 70%)' : 'radial-gradient(80% 70% at 50% 90%, var(--stage-a, #3b5b51), #07080a 70%)';
    }
    pushStageMetadata();
  }
  function pushStageClock(force) {
    const win = stageWindow();
    if (!win || !win.lxmineStage) return;
    try { win.lxmineStage.clock({ positionMs: Math.max(0, Number(S.position) || 0), playing: !!S.playing }); } catch (_) {}
    if (S.wallpaperMode && Date.now() - (S.wallpaperClockAt || 0) > 240) {
      S.wallpaperClockAt = Date.now();
      window.desktopWindow?.updateWallpaperMode?.({ clock: { positionMs: S.position, playing: !!S.playing } }).catch(() => {});
    }
  }

  /* ---------------- header / navigation ---------------- */
  function setHeader(title, subtitle, options) {
    const opts = options || {};
    $('#page-title').textContent = title;
    // 双击左上角标题 = 刷新首页内容（与移动端一致）。
    $('#page-title').ondblclick = () => {
      if (S.tab === 'home' && (!S.currentView || S.currentView.name === 'home') && !S.searchOpen && !S.detailOpen && !S.commentsOpen) {
        S.feed = null;
        renderHome();
        loadHome(true);
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
    splash.classList.add('hide');
    setTimeout(() => {
      splash.style.display = 'none';
      try { const frame = $('#splash-frame'); if (frame) frame.src = 'about:blank'; } catch (_) {}
    }, 680);
  }
  function showSplash() {
    const splash = $('#splash');
    if (!S.startupAnimation) {
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
      document.body.classList.toggle('window-maximized', !!state.isMaximized);
      document.body.classList.toggle('window-fullscreen', !!(state.isFullScreen || state.isNativeFullScreen));
      const maxBtn = $('#win-maximize');
      if (maxBtn) {
        maxBtn.setAttribute('aria-label', state.isMaximized ? '还原' : '最大化');
        maxBtn.classList.toggle('is-restored', !!state.isMaximized);
        const icon = state.isMaximized
          ? '<svg viewBox="0 0 24 24"><rect x="7" y="4" width="12" height="12" rx="1.4"/><path d="M4 8v10a2 2 0 0 0 2 2h10"/></svg>'
          : '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>';
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
  function isFavorite(song) {
    const key = identity(song);
    return !!key && S.favorites.some(item => identity(item) === key);
  }
  function toggleFavorite(song) {
    if (!song) return;
    const key = identity(song);
    if (!key) return;
    const index = S.favorites.findIndex(item => identity(item) === key);
    if (index >= 0) S.favorites.splice(index, 1); else S.favorites.unshift(song);
    saveStore(); updateDock();
    const likeBtn = $('#dock-controls [data-action="like"]');
    if (likeBtn) { likeBtn.classList.remove('pop'); void likeBtn.offsetWidth; likeBtn.classList.add('pop'); }
    notify(index >= 0 ? '已取消喜欢' : '已添加到「我喜欢的」');
  }
  function updateDock() {
    const song = S.current;
    const key = identity(song);
    if (key && key !== updateDock.lastKey) {
      const copy = $('#dock-copy');
      copy.classList.remove('swap'); void copy.offsetWidth; copy.classList.add('swap');
    }
    updateDock.lastKey = key;
    $('#dock-title').textContent = song ? song.name : '尚未播放';
    $('#dock-artist').textContent = song ? (song.busy ? '正在准备…' : (song.artist || song.singer || '未知歌手')) : '选择歌曲，开始聆听';
    $('#cover-inner').style.backgroundImage = coverUrl(song && song.cover) ? 'url("' + coverUrl(song.cover).replace(/"/g, '%22') + '")' : 'none';
    $('#cover-inner').style.backgroundColor = song && song.cover ? '' : '#1a1c20';
    $('#cover-ring').style.setProperty('--progress', (S.duration > 0 ? Math.min(100, S.position / S.duration * 100) : 0) + '%');
    $$('#dock-controls [data-action="like"]').forEach(btn => btn.classList.toggle('active', isFavorite(song)));
    $('#play-btn').setAttribute('aria-label', S.playing ? '暂停' : '播放');
    const modeBtn = $('#dock-controls [data-action="mode"]');
    if (modeBtn) modeBtn.innerHTML = S.mode === '随机播放' ? '<svg viewBox="0 0 24 24"><path d="M3 7h4l10 10h4"/><path d="M17 13l4 4-4 4"/><path d="M3 17h4l3-3"/><path d="M14 8l3-3h4"/><path d="M17 3l4 4-4 4"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M4 7h16"/><path d="M7 21l-3-3 3-3"/><path d="M20 17H4"/></svg>';
    document.body.classList.toggle('playing', S.playing);
    updateDesktopLyricsButton();
    updateVolumeUI();
    document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === S.tab));
    if ('mediaSession' in navigator && song) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.name || '', artist: song.artist || song.singer || '', album: song.album || '',
          artwork: coverUrl(song.cover) ? [{ src: coverUrl(song.cover), sizes: '512x512', type: 'image/jpeg' }] : []
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
  async function resolveWithFallback(song) {
    if (song.localUrl) return song.localUrl;
    if (song.url && /^https?:/i.test(song.url)) return song.url;
    const sources = S.sources.length ? S.sources : [];
    let activeIndex = Math.max(0, sources.findIndex(item => item.id === S.activeSourceId));
    let lastError = null;
    const attempts = Math.max(1, Math.min(6, sources.length || 1));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await window.lxMusic.resolve(song, S.quality);
        if (result && result.url) return result.url;
      } catch (error) {
        lastError = error;
        if (!sources.length || attempt === attempts - 1) break;
        const source = sources[(activeIndex + attempt + 1) % sources.length];
        if (!source) break;
        try {
          await window.lxMusic.activateSource(source.id);
          S.activeSourceId = source.id;
          notify('当前音源失败，已切换到「' + source.name + '」');
        } catch (_) {}
      }
    }
    throw lastError || new Error('没有可用的播放地址');
  }
  async function playSong(song, queue, options) {
    if (!song) return;
    const opts = options || {};
    const token = ++S.resolveToken;
    const list = Array.isArray(queue) && queue.length ? queue.slice() : [song];
    const index = Math.max(0, list.findIndex(item => identity(item) === identity(song)));
    S.queue = list; S.queueIndex = index; S.current = song; S.duration = durationOf(song); S.position = Number(opts.startMs) || 0;
    if (!opts.keepFeedId) S.playingFeedId = '';
    S.lyrics = []; S.lyricIndex = -1;
    setStageSong(song); updateDock(); renderDetailLyrics(); pushDesktopLyrics(true); syncWallpaperUi();
    try {
      const url = await resolveWithFallback(song);
      if (token !== S.resolveToken) return;
      S.playbackUrl = url;
      audio.src = url;
      if (opts.startMs) { try { audio.currentTime = Number(opts.startMs) / 1000; } catch (_) {} }
      await audio.play();
      pushStageMetadata();
      pushStageClock(true);
      loadLyrics(song, token);
    } catch (error) {
      if (token !== S.resolveToken) return;
      notify('播放失败：' + (error && error.message || error));
      setPlaying(false);
    }
  }
  function togglePlayback() {
    if (!S.current) return;
    if (!audio.src) { playSong(S.current, S.queue, { startMs: S.position }); return; }
    if (audio.paused) audio.play().catch(error => notify('播放失败：' + error.message));
    else audio.pause();
  }
  function nextSong(step) {
    if (!S.queue.length) return;
    let index = S.queueIndex;
    if (S.mode === '随机播放' && S.queue.length > 1) {
      index = (index + 1 + Math.floor(Math.random() * (S.queue.length - 1))) % S.queue.length;
    } else if (S.mode === '单曲循环' && step > 0) {
      index = Math.max(0, index);
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
    const btn = $('#dock-controls [data-action="mode"]');
    if (btn) btn.innerHTML = S.mode === '随机播放' ? '<svg viewBox="0 0 24 24"><path d="M3 7h4l10 10h4"/><path d="M17 13l4 4-4 4"/><path d="M3 17h4l3-3"/><path d="M14 8l3-3h4"/><path d="M17 3l4 4-4 4"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M4 7h16"/><path d="M7 21l-3-3 3-3"/><path d="M20 17H4"/></svg>';
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
      primary: style.getPropertyValue('--stage-b').trim() || '#f4d28a',
      secondary: '#ffffff',
      highlight: style.getPropertyValue('--stage-a').trim() || '#8fb2a6',
      glow: style.getPropertyValue('--stage-b').trim() || '#f4d28a'
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
    const value = normalizeHexColor(hex, '#f4d28a');
    const rgb = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (hsl.l < minLightness) hsl.l = minLightness;
    if (hsl.s < .22) hsl.s = .22;
    return hslToHex(hsl.h, hsl.s, hsl.l);
  }
  function lyricFallbackPalette() {
    const style = getComputedStyle(document.documentElement);
    const primary = normalizeHexColor(style.getPropertyValue('--stage-b').trim(), '#f4d28a');
    const secondary = normalizeHexColor(style.getPropertyValue('--stage-a').trim(), '#8fb2a6');
    return { primary, secondary, highlight: mixHex(primary, '#ffffff', .38), glow: secondary };
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
    const custom1 = normalizeHexColor(desktop ? S.desktopLyricColor : S.lyricColor, '#f4d28a');
    const custom2 = normalizeHexColor(desktop ? S.desktopLyricColor2 : S.lyricColor2, '#8fb2a6');
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
      frameRate: 60,
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
      button.classList.toggle('is-muted', percent <= 0);
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
      frameRate: 60,
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
    const raw = String(text).split(/\r?\n/);
    for (const line of raw) {
      const stamps = Array.from(line.matchAll(/\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g));
      if (!stamps.length) continue;
      const body = line.replace(/\[[^\]]*\]/g, '').trim();
      if (!body) continue;
      for (const stamp of stamps) {
        const time = (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000;
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

  async function loadLyrics(song, token) {
    S.lyrics = []; S.lyricIndex = -1; renderDetailLyrics();
    let payload = null;
    try { payload = await window.lxMusic.lyric(song, S.quality); } catch (_) {}
    let text = payload && (payload.lyric || payload.lxlyric || payload.yrc || '');
    let translation = payload && (payload.tlyric || payload.ytlrc || '');
    let romaji = payload && (payload.rlyric || payload.romalrc || payload.yromalrc || payload.roma || '');
    if (!text && (songSource(song) === 'wy' || song.provider === 'netease')) {
      try {
        const data = await getJson('/api/lyric?id=' + encodeURIComponent(song.id));
        text = data && (data.lyric || data.lrc || '');
        translation = translation || (data && (data.tlyric || data.ytlrc || ''));
        romaji = romaji || (data && (data.romalrc || data.yromalrc || data.roma || ''));
      } catch (_) {}
    }
    if (token !== S.resolveToken) return;
    const main = parseLrc(text);
    const translated = parseLrc(translation);
    const romanized = parseLrc(romaji);
    S.lyrics = mergeLyricAux(mergeLyricAux(main, translated, 'translation'), romanized, 'romaji');
    S.lyricIndex = -1;
    renderDetailLyrics();
    syncLyric(true);
    pushStageMetadata();
    pushDesktopLyrics(true);
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
  function refreshSyncedLibrary() {
    if (syncLibraryRefresh) return syncLibraryRefresh;
    syncLibraryRefresh = (async () => {
      S.libraryRevision = (S.libraryRevision || 0) + 1;
      const [library, sources] = await Promise.all([
        window.desktopWindow.listBuiltInPlaylists(), window.lxMusic.sources()
      ]);
      if (!library || library.ok === false || !Array.isArray(library.playlists)) throw new Error('同步后读取资料库失败');
      S.library = library.playlists;
      S.sources = sources.sources || [];
      S.activeSourceId = sources.activeId || '';
      renderCurrent();
      notify('同步已保存：' + S.library.length + ' 个歌单');
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
  async function loadMergedFeed() {
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
    const newSongs = mergeRoundRobin(ok.map(part => part.newSongs || []), songKeyFn);
    const categoryItems = [], categorySeen = new Set();
    for (const part of ok) for (const tag of part.categories || []) {
      const name = typeof tag.name === 'string' ? tag.name : '';
      if (!name || categorySeen.has(name)) continue;
      categorySeen.add(name);
      categoryItems.push({ id: 'category-' + name, name, cover: '', count: 0, playCount: 0, request: { source: part.source || 'wy', type: 'hot', category: name } });
    }
    const dayNumber = Math.floor(Date.now() / 86400000);
    const dailySongs = dailyShuffle(newSongs, dayNumber);
    const daily = { id: 'daily-30', name: '每日三十首', cover: (dailySongs[0] || {}).cover || '', count: dailySongs.length, playCount: 0 };
    const sections = [
      { id: 'playlists', title: '推荐歌单', kind: 'playlist', items: recommend },
      { id: 'charts', title: '排行榜', kind: 'playlist', items: charts },
      { id: 'hot', title: '热门歌单', kind: 'playlist', items: hot },
      { id: 'category', title: '歌单分类', kind: 'playlist', items: categoryItems },
    ];
    return { source: 'all', sections, playlists: recommend, newSongs, charts, daily, dailySongs };
  }
  async function loadHome(force) {
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
        loadMergedFeed(), libraryPromise, localPromise, downloadsPromise, sourcesPromise
      ]);
      S.feedCache['all']=feed;
      if (token !== S.feedToken) return;
      S.feed = feed || { playlists: [], newSongs: [], charts: [] };
      if (libraryRevision === (S.libraryRevision || 0)) S.library = (library && library.playlists) || [];
      S.localTracks = (local && local.tracks) || [];
      S.downloads = Array.isArray(downloads) ? downloads : [];
      if (libraryRevision === (S.libraryRevision || 0)) {
        S.sources = (sources && sources.sources) || [];
        S.activeSourceId = (sources && sources.activeId) || '';
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
    view.style.transition = 'opacity .13s ease, transform .13s ease';
    view.style.opacity = '0';
    view.style.transform = back ? 'translateY(7px)' : 'translateY(-7px)';
    setTimeout(() => {
      if (token !== S.viewTransitionToken) return;
      renderFn();
      view.style.transition = 'none'; view.style.opacity = '1'; view.style.transform = 'none';
      requestAnimationFrame(() => { view.style.transition = 'opacity .32s var(--spring), transform .38s var(--spring)'; });
    }, 125);
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
  const GRADS = [['#2E3A8C','#6C4AB6'],['#0F6F5C','#3FA796'],['#8C2E2E','#C76B4A'],['#3C5A99','#7FA8E0'],['#6A3A8C','#B84AB6'],['#8C6A1E','#D9B24A']];
  function gradFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return GRADS[hash % GRADS.length];
  }
  function playlistCard(item) {
    const node = h('div', 'card');
    const art = h('div', 'art');
    if (item.cover) art.style.backgroundImage = 'url("' + coverUrl(item.cover).replace(/"/g, '%22') + '")';
    else {
      const grad = gradFor(item.name || '');
      art.style.background = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
      art.style.color = '#F2F1F7';
      art.style.display = 'flex';
      art.style.alignItems = 'center';
      art.style.justifyContent = 'center';
      art.style.fontSize = '34px';
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
    if (song.cover) art.style.backgroundImage = 'url("' + coverUrl(song.cover).replace(/"/g, '%22') + '")';
    const badge = srcBadge(song.source);
    if (badge) art.appendChild(badge);
    node.append(art);
    node.appendChild(h('h3', '', song.name || '未知歌曲'));
    node.appendChild(h('p', '', (song.artist || song.singer || platformName(song))));
    node.onclick = () => playSong(song, [song]);
    return node;
  }
  function localPlaylistCard(playlist) {
    const node = h('div', 'card');
    const art = h('div', 'art');
    if (playlist.cover) art.style.backgroundImage = 'url("' + coverUrl(playlist.cover).replace(/"/g, '%22') + '")';
    else {
      const heart = svgIcon('heart', 'heart'); heart.style.width = '46px'; heart.style.height = '46px';
      heart.style.color = 'var(--accent)'; art.appendChild(heart);
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
    const more = h('button', 'more-ball glass light', '···');
    more.type = 'button'; more.setAttribute('aria-label', title + '，更多');
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
    [['新歌','newSongs','music'],['歌单','playlists','library'],['排行榜','charts','queue'],['热门','hot','play'],['分类','category','more']].forEach(([label,anchor,icon])=>{
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
    // 头图：竖排长卡片（每日三十首 + 融合榜单），卡片贴屏幕物理边缘。
    const bannerItems=[];
    if(S.feed.daily)bannerItems.push(S.feed.daily);
    (S.feed.charts||[]).slice(0,5).forEach(chart=>bannerItems.push(chart));
    const bannerBlock=h('section','section banner-section');
    bannerBlock.dataset.section='banner';
    const bannerWrap=h('div','row-wrap');
    const bannerRow=h('div','row-scroll banner-row');
    bannerItems.forEach(item=>{
      const card=h('button','banner-card');
      // background 简写会重置 backgroundImage：有封面只设图，无封面才落渐变兜底。
      const grad=gradFor(item.name||'');
      if(item.cover)card.style.backgroundImage='url("'+coverUrl(item.cover).replace(/"/g,'%22')+'")';
      else card.style.background='linear-gradient(135deg,'+grad[0]+','+grad[1]+')';
      const note=item.id==='daily-30'?(new Date().getMonth()+1)+'月'+new Date().getDate()+'日 · 融合推荐 '+(item.count||30)+' 首':((item.playCount?formatPlayCount(item.playCount)+'次播放 · ':'')+(item.count||0)+' 首');
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
      const more=h('button','more-ball glass light','···');
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
    const spec=S.feed?.sections?.find(s=>s.id===section);view.items=spec?.items;view.itemKind=spec?.kind;
    pushView(view);
    if(spec?.request)window.LxPagination.collectAll((page,limit)=>window.lxMusic.homeSection({...spec.request,page,limit}),{limit:spec.request.source==='kg'?20:36,cancelled:()=>S.currentView!==view}).then(result=>{if(S.currentView===view){view.items=result.items;view.warning=result.warning;renderMore(view);}}).catch(error=>{if(S.currentView===view){view.warning=error.message;renderMore(view);}});
  }
  function sectionTitle(section) {
    return ({ playlists: '推荐歌单', newSongs: '每周新歌', charts: '排行榜', recent: '最近常听' })[section] || section;
  }
  function moreItems(view) {
    if(view.items)return view.items;
    if (view.section === 'recent') {
      const list = [];
      if (S.current) list.push(S.current);
      (S.library || []).forEach(item => list.push({ __playlist: true, ...item }));
      return list;
    }
    return (S.feed && S.feed[view.section]) || [];
  }
  function renderMore(view) {
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
    if (view.itemKind==='song' || view.section==='newSongs') {
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
    // 唯一歌曲行：宽窗（>=760px）行内直接显示下载/爱心/加号；窄窗收成下载+展开箭头，
    // 展开后再显示爱心/加号/时长。搜索、歌单、榜单、板块详情共用这一份 DOM。
    const opts = options || {};
    const item = h('div', 'song-item');
    const row = h('div', 'song-row');
    const art = h('div', 'row-art');
    if (song.cover) art.style.backgroundImage = 'url("' + coverUrl(song.cover).replace(/"/g, '%22') + '")';
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
    const like = h('button', 'row-act row-like' + (isFavorite(song) ? ' active' : ''));
    like.type = 'button'; like.setAttribute('aria-label', isFavorite(song) ? '取消喜欢' : '喜欢');
    like.appendChild(svgIcon('heart'));
    const add = h('button', 'row-act row-add');
    add.type = 'button'; add.setAttribute('aria-label', '添加到歌单');
    add.appendChild(svgIcon('plus'));
    add.onclick = event => { event.stopPropagation(); openAddMenu(song); };
    const actions = h('div', 'row-actions');
    if (song.source === 'local') actions.append(like, add);
    else actions.append(dl, like, add);
    // 展开面板按需创建：宽窗永远不展开，搜索几千行时不再为每行预建两份隐藏按钮。
    const panel = h('div', 'song-expand');
    let panelBuilt = false;
    let panelLike = null;
    const applyLike = (on) => {
      like.classList.toggle('active', on);
      if (panelLike) panelLike.classList.toggle('active', on);
    };
    const toggleLike = event => {
      event.stopPropagation(); toggleFavorite(song); applyLike(isFavorite(song));
    };
    like.onclick = toggleLike;
    const buildPanel = () => {
      if (panelBuilt) return;
      panelBuilt = true;
      panelLike = h('button', 'row-act row-like' + (isFavorite(song) ? ' active' : ''));
      panelLike.type = 'button'; panelLike.setAttribute('aria-label', isFavorite(song) ? '取消喜欢' : '喜欢');
      panelLike.appendChild(svgIcon('heart'));
      panelLike.onclick = toggleLike;
      const panelAdd = h('button', 'row-act row-add');
      panelAdd.type = 'button'; panelAdd.setAttribute('aria-label', '添加到歌单');
      panelAdd.appendChild(svgIcon('plus'));
      panelAdd.onclick = event => { event.stopPropagation(); openAddMenu(song); };
      const time = h('span', 'song-duration', fmtTime(song.durationMs || 0));
      panel.append(panelLike, panelAdd, time);
    };
    const expand = h('button', 'row-act row-expand');
    expand.type = 'button'; expand.setAttribute('aria-label', '展开歌曲操作');
    expand.appendChild(svgIcon('down'));
    expand.onclick = event => { event.stopPropagation(); buildPanel(); item.classList.toggle('open'); };
    row.append(art, main, album, actions, expand);
    row.onclick = () => { playSong(song, context || [song]); if (opts.openDetail) openDetail(); };
    row.oncontextmenu = event => { event.preventDefault(); openAddMenu(song); };
    if (S.current && identity(S.current) === identity(song)) row.classList.add('playing');
    item.append(row, panel);
    return item;
  }
  function songListCard(songs, context) {
    const card = h('div', 'song-list');
    requestAnimationFrame(()=>appendRowsInFrames(card,songs,(song,index)=>songRow(song,context,index)));
    return card;
  }

  /* ---------------- library ---------------- */
  const MOSAIC_PATTERNS = [[2, 2], [1, 1], [1, 2], [2, 1], [1, 1], [2, 1], [1, 2], [1, 1], [2, 2], [1, 2], [2, 1], [1, 1]];
  const MOSAIC_GRADS = [
    ['#2E3A8C', '#6C4AB6'], ['#0F6F5C', '#3FA796'], ['#8C2E2E', '#C76B4A'],
    ['#3C5A99', '#7FA8E0'], ['#6A3A8C', '#B84AB6'], ['#8C6A1E', '#D9B24A']
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
    const span = mosaicSpan(index, total);
    node.style.gridColumn = 'span ' + span[0];
    node.style.gridRow = 'span ' + span[1];
    const art = h('div', 'art');
    if (opts.cover) art.style.backgroundImage = 'url("' + coverUrl(opts.cover).replace(/"/g, '%22') + '")';
    else {
      const grad = mosaicGrad(opts.name || '');
      art.style.background = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
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
    notify('歌单库排列已刷新');
  }
  function renderLibrary() {
    S.tab = 'library';
    setBodyMode('tab');
    // 内置“我喜欢的”是收藏夹的镜像（旧数据 isFavorite=true），已由顶部收藏卡代表，必须过滤；
    // 名称兜底兼容没有 isFavorite 字段的旧缓存。
    const libraryItems = (S.library || []).filter(playlist => playlist.isFavorite !== true && playlist.name !== '我喜欢的');
    setHeader('歌单库', (libraryItems.length + ' 个歌单'), {
      actions: [
        { icon: 'refresh', label: '随机排列', onClick: refreshMosaic },
        { icon: 'download', label: '下载管理', onClick: () => pushView({ name: 'downloads', title: '下载', main: true }) },
        { icon: 'import', label: '导入歌单', onClick: openImportPlaylist },
        { icon: 'plus', label: '新建歌单', onClick: openCreatePlaylist }
      ]
    });
    const root = mainRoot();
    const grid = h('div', 'playlist-mosaic');
    const tiles = [];
    tiles.push({ icon: 'heart', countText: S.favorites.length + ' 首歌曲',
      name: '我喜欢的', detail: '你收藏的歌曲',
      onClick: () => pushView({ name: 'playlist', kind: 'favorites', id: 'favorites', title: '我喜欢的', count: S.favorites.length, main: true }) });
    tiles.push({ icon: 'music', countText: S.recentlyPlayed.length + ' 首歌曲',
      name: '最近播放', detail: '按最近播放时间排列',
      onClick: () => pushView({ name: 'playlist', kind: 'recent', id: 'recent', title: '最近播放', count: S.recentlyPlayed.length, main: true }) });
    libraryItems.forEach(playlist => tiles.push({
      cover: playlist.cover, icon: 'music', countText: (playlist.trackCount || 0) + ' 首歌曲',
      name: playlist.name || '歌单', detail: '歌单', onClick: () => openBuiltIn(playlist) }));
    tiles.push({ icon: 'music', countText: S.localTracks.length + ' 首本地歌曲',
      name: '本地音乐', detail: '导入电脑里的音频', onClick: openLocal });
    const ordered = seededShuffle(tiles, S.mosaicSeed);
    const total = ordered.length;
    ordered.forEach((opts, index) => grid.appendChild(libraryCard(opts, index, total)));
    root.appendChild(grid);
    requestAnimationFrame(() => layoutMosaic(grid));
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
    box.appendChild(h('p', 'muted', '粘贴网易云、QQ、酷我的歌单链接，或 LX 导出的歌单 JSON。'));
    const input = h('textarea');
    input.placeholder = 'https://music.163.com/playlist?id=... 或 LX JSON';
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'pill-btn', '取消'); cancel.onclick = () => closeModal(backdrop);
    const confirm = h('button', 'pill-btn accent', '导入');
    confirm.onclick = async () => {
      const value = input.value.trim();
      if (!value) return notify('请先粘贴歌单链接或 JSON');
      confirm.disabled = true; confirm.textContent = '导入中…';
      try {
        const result = await window.lxMusic.importPlaylist(value);
        notify('已导入 ' + ((result && result.importedLists) || 1) + ' 个歌单');
        closeModal(backdrop);
        await loadHome(true);
        if (S.tab === 'library') renderLibrary();
      } catch (error) {
        notify('导入失败：' + error.message);
        confirm.disabled = false; confirm.textContent = '导入';
      }
    };
    actions.append(cancel, confirm);
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
  function openListSortMenu(anchor, songs, state, refresh) {
    const choice = (mode, label) => ({
      label, checked: state.mode === mode,
      action: () => { state.mode = mode; refresh(); }
    });
    openAnchoredMenu(anchor, [
      choice('added', '添加顺序'),
      choice('name', '歌名首字母'),
      choice('artist', '歌手名'),
      choice('album', '专辑名首字'),
      { label: '手动排列', checked: state.mode === 'manual', action: () => {
        showManualOrderDialog(arrangeSongs(songs, { mode: state.mode, manual: state.manual, query: '' }), keys => {
          state.manual = keys; state.mode = 'manual'; refresh();
        });
      } }
    ]);
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
    done.onclick = () => { close(); onDone(list.map(identity)); };
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
    const art = h('div', 'art');
    if (view.cover) art.style.backgroundImage = 'url("' + coverUrl(view.cover).replace(/"/g, '%22') + '")';
    else art.appendChild(iconGlyph('music'));
    const copy = h('div', '');
    copy.appendChild(h('h2', '', view.title || '歌单'));
    copy.appendChild(h('p', '', (view.tracks.length || view.count || 0) + ' 首歌曲 · ' + (view.kind === 'builtin' ? 'LxMine 歌单' : view.kind === 'favorites' ? '我喜欢的' : view.kind === 'recent' ? '最近播放' : '网络歌单')));
    const actions = h('div', 'hero-actions');
    const play = h('button', 'pill-btn accent', '播放全部');
    play.onclick = () => { if (view.tracks.length) playSong(view.tracks[0], view.tracks); };
    actions.appendChild(play);
    const sortBtn = h('button', 'pill-btn', '排列');
    sortBtn.onclick = () => openListSortMenu(sortBtn, view.tracks, tools, () => refreshList());
    actions.appendChild(sortBtn);
    if (view.kind === 'feed') {
      const save = h('button', 'pill-btn', '导入到歌单库');
      save.onclick = async () => {
        try {
          await window.lxMusic.importPlaylist(String(view.id), 'wy');
          await loadHome(true);
          notify('已保存「' + view.title + '」');
        } catch (error) { notify('导入失败：' + error.message); }
      };
      actions.appendChild(save);
    }
    if (view.kind === 'builtin' && !view.favorite) {
      const remove = h('button', 'pill-btn', '删除歌单');
      remove.onclick = async () => {
        if (!confirm('删除「' + view.title + '」？')) return;
        try {
          await window.desktopWindow.deleteBuiltInPlaylist(view.id);
          await loadHome(true); goBack();
        } catch (error) { notify('删除失败：' + error.message); }
      };
      actions.appendChild(remove);
    }
    copy.appendChild(actions);
    hero.append(art, copy);
    root.appendChild(hero);
    if (view.error) root.appendChild(h('div', 'empty-hint', view.error));
    else if (!view.tracks.length) root.appendChild(h('div', 'empty-hint', '这个歌单还没有歌曲'));
    else {
      const listBar = createListBar(view.tracks, tools, () => refreshList());
      toggleListSearch = () => { listBar.setSearchOpen(!tools.searchOpen); refreshList(); };
      const listHost = h('div', 'list-tools-host');
      root.append(listBar.node, listHost);
      refreshList = () => {
        const list = arrangeSongs(view.tracks, tools);
        listBar.setCount(list.length);
        listHost.replaceChildren();
        if (list.length) listHost.appendChild(songListCard(list, view.tracks));
        else listHost.appendChild(h('div', 'empty-hint', '没有匹配的歌曲'));
      };
      refreshList();
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
    playbackCard.appendChild(settingSelect('MineRadio 动效', 'PC 端使用同一套视觉语言', MINE_STYLES, S.styleName, value => {
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
    systemCard.appendChild(settingSwitch('启动时继续播放上次内容', '默认关闭，保留上次歌曲和进度，打开软件保持暂停', S.resumeOnStartup === true, value => { S.resumeOnStartup = value; saveStore(); }));
    systemCard.appendChild(settingSwitch('启动动画', '关闭后直接进入首页', S.startupAnimation, value => { S.startupAnimation = value; saveStore(); }));
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
    aboutRow.append(aboutCopy, h('span', 'value', '1.0.0'));
    about.appendChild(aboutRow);
    root.appendChild(about);
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
      const primary = h('input', 'lyric-color-input');
      primary.type = 'color';
      primary.value = normalizeHexColor(S[colorKey], '#f4d28a');
      primary.setAttribute('aria-label', title + '主色');
      primary.oninput = () => { S[colorKey] = primary.value; saveStore(); applyLyricTheme(); };
      controls.appendChild(primary);
      if (mode === 'custom-gradient') {
        const secondary = h('input', 'lyric-color-input');
        secondary.type = 'color';
        secondary.value = normalizeHexColor(S[color2Key], '#8fb2a6');
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
    detailCard.appendChild(settingSwitch('显示翻译 / 音译', '在主歌词下方显示翻译或音译', S.lyricShowTranslation, value => {
      S.lyricShowTranslation = value; saveStore(); renderDetailLyrics(); syncLyric(true); pushStageMetadata();
    }));
    detailCard.appendChild(settingSwitch('显示罗马音', '日文等歌词显示罗马音（数据源提供时）', S.lyricShowRomaji, value => {
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
    setBodyMode('secondary');
    setHeader('音源', (S.sources.length + ' 个音源'), { back: goBack });
    const root = mainRoot();
    const actions = h('div', 'page-head-actions');
    const fileBtn = h('button', 'pill-btn accent', '导入音源文件');
    fileBtn.onclick = async () => {
      try { const result = await window.lxMusic.importSourceFile(); if (result) { notify('音源已导入'); await refreshSources(); } }
      catch (error) { notify('导入失败：' + error.message); }
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
    setBodyMode('secondary');
    setHeader('下载', '', { back: goBack });
    const root = mainRoot();
    const card = h('div', 'song-list');
    (S.downloads || []).forEach(job => {
      const row = h('div', 'song-row');
      const art = h('div', 'row-art');
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
    S.searchOpen = false;
    S.search.open = false;
    const overlay = $('#search-overlay');
    const animation = morphSearchClose();
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.classList.add('hidden'); overlay.classList.remove('closing');
      try { if (animation) animation.cancel(); } catch (_) {}
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
    // 搜索歌曲结果与歌单/榜单详情同构：都装在透明 song-list 里，行只用标准 songRow。
    let musicList = null;
    const settled=await Promise.allSettled(sourceIds.map(source=>window.LxPagination.collectAll(
      (page,limit)=>window.lxMusic.search({query,source,type,page,limit}),{
        limit:type==='music'?50:30,cancelled:()=>!current(),
        onPage:async ({added})=>{
          if(!current())return;
          const fresh=added.filter(item=>{const key=[item.source||item.provider||source,item.kind||type,item.id||item.name].join(':');if(seen.has(key))return false;seen.add(key);return true;});
          if(!fresh.length)return;
          all.push(...fresh);
          searchStatus('已获取 '+all.length+' 条，正在自动获取其余结果…');
          let host = resultsRoot;
          if (type === 'music') {
            if (!musicList) { musicList = h('div', 'song-list'); resultsRoot.appendChild(musicList); }
            host = musicList;
          }
          await appendRowsInFrames(host,fresh,(item,index)=>type==='music'
            ? songRow(item,all,all.length-fresh.length+index,{openDetail:true})
            : searchEntityRow(item),current);
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
    if (type === 'music') {
      // 搜索歌曲同样支持列表内搜索与排序；全部结果到齐后统一重排，避免分页途中顺序跳动。
      const tools = S.searchTools || (S.searchTools = { query: '', mode: 'added', manual: null, searchOpen: false });
      let redraw = () => {};
      const bar = createListBar(all, tools, () => redraw());
      const play = h('button', 'list-tools-play', '播放全部');
      play.onclick = () => {
        const list = arrangeSongs(all, tools);
        if (list.length) playSong(list[0], list);
      };
      const sort = h('button', 'list-tools-sort', '排列');
      sort.onclick = () => openListSortMenu(sort, all, tools, () => redraw());
      bar.node.prepend(play, sort);
      if (musicList) musicList.remove();
      const host = h('div', 'search-song-host');
      resultsRoot.append(bar.node, host);
      redraw = () => {
        const list = arrangeSongs(all, tools);
        bar.setCount(list.length);
        host.replaceChildren();
        if (list.length) appendRowsInFrames(host, list, (item, index) => songRow(item, list, index, { openDetail: true }), () => S.searchOpen && S.search.query === query);
        else host.appendChild(h('div', 'empty-hint', '没有匹配的歌曲'));
      };
      redraw();
    }
  }
  function searchEntityRow(item) {
    const row = h('div', 'search-row');
    const art = h('div', 'art');
    if (item.cover) art.style.backgroundImage = 'url("' + coverUrl(item.cover).replace(/"/g, '%22') + '")';
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
    S.detailFromSearch = !!S.searchOpen;
    document.body.classList.remove('detail-leaving');
    document.body.classList.remove('detail-immersive');
    document.body.classList.add('detail-entering');
    $('#search-overlay').classList.add('hidden');
    $('#detail-overlay').classList.remove('hidden');
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
    clearTimeout(detailRevealTimer); clearTimeout(detailCloseHoldTimer); clearTimeout(detailCloseTimer);
    document.body.classList.remove('detail-entering');
    document.body.classList.remove('detail-immersive');
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
    const overlay = $('#comments-overlay');
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.classList.add('hidden'); overlay.classList.remove('closing');
      setBodyMode(S.detailOpen ? 'detail' : 'tab');
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
  function openQueue() {
    const backdrop = modal(null);
    backdrop.classList.add('sheet-backdrop');
    const box = h('div', 'modal glass sheet');
    box.appendChild(h('h2', '', '播放队列'));
    if (!S.queue.length) box.appendChild(h('p', 'muted', '队列还是空的，先播放一首歌。'));
    S.queue.forEach((song, index) => {
      const row = h('div', 'queue-row' + (index === S.queueIndex ? ' playing' : ''));
      const art = h('div', 'art');
      if (song.cover) art.style.backgroundImage = 'url("' + coverUrl(song.cover).replace(/"/g, '%22') + '")';
      const copy = h('div', 'copy');
      copy.appendChild(h('strong', '', song.name || '未知歌曲'));
      copy.appendChild(h('small', '', song.artist || song.singer || ''));
      row.append(art, copy);
      row.onclick = () => { S.queueIndex = index; playSong(song, S.queue); closeModal(backdrop); };
      box.appendChild(row);
    });
    backdrop.appendChild(box);
  }
  function openAddMenu(song) {
    const backdrop = modal(null);
    const box = h('div', 'modal glass');
    box.appendChild(h('h2', '', '添加到歌单'));
    const lists = S.library || [];
    if (!lists.length) box.appendChild(h('p', 'muted', '还没有歌单，先在歌单库新建一个。'));
    const direct = h('div', 'queue-row');
    const directCopy = h('div', 'copy'); directCopy.appendChild(h('strong', '', '下载这首歌'));
    direct.appendChild(directCopy);
    direct.onclick = () => { closeModal(backdrop); downloadCurrent(song); };
    box.appendChild(direct);
    lists.forEach(playlist => {
      const row = h('div', 'queue-row');
      const copy = h('div', 'copy'); copy.appendChild(h('strong', '', playlist.name)); copy.appendChild(h('small', '', (playlist.trackCount || 0) + ' 首'));
      row.append(copy);
      row.onclick = async () => {
        try {
          await window.desktopWindow.addBuiltInPlaylistTrack(playlist.id, song);
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
    box.appendChild(h('p', 'muted', '同一 Wi-Fi 下的手机、平板和电脑会出现在这里。接收方确认后才会覆盖数据。'));
    const status = h('p', 'muted', '正在读取设备…');
    const list = h('div', '');
    box.append(status, list);
    backdrop.appendChild(box);
    const refresh = async () => {
      try {
        const state = await window.lxMusic.syncStatus();
        status.textContent = '本机：' + (state.deviceName || 'LxMine PC');
        const devices = await window.lxMusic.syncDevices();
        list.replaceChildren();
        if (!devices.length) list.appendChild(h('p', 'muted', '还没有发现其他设备。'));
        devices.forEach(device => {
          const row = h('div', 'queue-row');
          const copy = h('div', 'copy'); copy.appendChild(h('strong', '', device.name || '设备')); copy.appendChild(h('small', '', (device.platform || '') + ' · ' + (device.address || '')));
          const send = h('button', 'pill-btn', '发送本机数据');
          send.onclick = async () => {
            send.disabled = true; send.textContent = '等待对方确认…';
            try {
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
    nav.addEventListener('pointerup', navUp, { passive: true });
    nav.addEventListener('pointercancel', navUp, { passive: true });
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
    $('#immersive-btn').onclick = () => { document.body.classList.toggle('detail-immersive'); };
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
    document.querySelectorAll('.row-scroll').forEach(row => {
      if (row.dataset.bleedW === String(w)) return;
      row.dataset.bleedW = String(w);
      row.style.marginLeft = ''; row.style.marginRight = '';
      row.style.paddingLeft = ''; row.style.paddingRight = '';
      const rect = row.getBoundingClientRect();
      const inset = Math.max(26, rect.left);
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
  function bindDragDeform() { window.LxGlass.bindInteractions(); }
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
    audio.addEventListener('error', () => { notify('音频播放失败，请尝试切换音源或音质'); setPlaying(false); });
    audio.volume = S.volume;
    updateVolumeUI();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
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
      setStageSong(S.current); updateDock(); loadSimilar();
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
    checkPendingSync();
    setTimeout(() => { if (S.current) loadSimilar(); }, 1200);
    if (S.desktopLyrics) setTimeout(() => {if(S.desktopLyrics)applyDesktopLyrics(true);}, 1200);
    if (S.closeToTray && window.desktopWindow && window.desktopWindow.setCloseBehavior) window.desktopWindow.setCloseBehavior('tray').catch(() => {});
    if (S.launchAtStartup && window.desktopWindow && window.desktopWindow.setLaunchAtStartup) window.desktopWindow.setLaunchAtStartup(true).catch(() => {});
    syncWallpaperUi();
  }

  let booted = false;
  window.__lxmine = { S, playSong, setTab, openSearch, openDetail, notify, checkPendingSync, pushStageMetadata };
  document.addEventListener('DOMContentLoaded', () => { if (!booted) { booted = true; boot(); } });
  if (document.readyState !== 'loading' && !booted) { booted = true; boot(); }
})();




