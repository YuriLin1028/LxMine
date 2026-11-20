import { musicButtonPress } from '../components/MaterialControls';
import { webview } from '@kit.ArkWeb';
import { PRODUCT_NAME } from 'BuildProfile';
import { common, ConfigurationConstant } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { avSession, AVCastPickerStyle } from '@kit.AVSessionKit';
import { ShareService } from '../services/ShareService';
import { deviceInfo } from '@kit.BasicServicesKit';
import { picker, fileIo } from '@kit.CoreFileKit';
import { buffer } from '@kit.ArkTS';
import { uiMaterial, window, curves, LengthMetrics, display } from '@kit.ArkUI';
import { hdsMaterial } from '@kit.UIDesignKit';
import { GripService, GripSide } from '../services/GripService';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { MaterialSurface, MaterialIcon, musicMaterial, musicSheetMaterial, musicMenuMaterial, MATERIAL_PRESS_SCALE } from '../components/MaterialControls';
import { Song } from '../model/Song';
import { loadPlaybackSnapshot, savePlaybackSnapshot, loadRecentSongs, saveRecentSongs } from '../services/Store';
import { setLatestPlaybackState } from '../services/Continuation';
import { searchLx, searchAllLx, LxSearchSource } from '../services/SearchApi';
import { CatalogueResults } from '../components/CatalogueResults';
import { CatalogueEntity, searchCatalogue, catalogueTracks, SEARCH_KINDS, SEARCH_KIND_IDS } from '../services/CatalogueApi';
import { LxHost, LxSourceInfo, LxSongInfo, LxHash } from '../services/LxRuntime';
import { PlayerService, SessionLyricLine } from '../services/PlayerService';
import { decodePlaylistFile } from '../services/PlaylistFiles';
import { LyricLine, parseLrc } from '../services/LyricParser';
import { publicLyricBundle } from '../services/LyricService';
import { initStore, loadAppData, saveAppData, loadDeviceId, saveUiDiagnostics, loadHomeCache, saveHomeCache, AppData } from '../services/Store';
import { LanDiscovery, LanDevice } from '../services/LanDiscovery';
import { LanSyncServer, SyncIncoming } from '../services/LanSyncServer';
import { pushBundle, pushDirect, SyncBundle, SyncSourcePayload, uniqueSyncSources } from '../services/LanSyncClient';
import { SourceImportBatch } from '../services/SourceImports';
import { MusicPlaylist, createPlaylist, parsePlaylists, playlistWithSong, playlistWithoutSongs, playlistRenamed, playlistReordered, playlistSongReplaced, playlistCoversPatched, mergeSyncPlaylists, songKey } from '../services/MusicLibrary';
import { FeedPlaylist, FeedSongsResult, HomeFeed, FeedSection, loadPlatformSection, loadFeedPlaylistSongs, loadMergedHome, enrichPersonalizedHome, loadMergedChartSongs, platformFeedSongs, hydrateSongCovers, applyCoversToSongs, recordListenHabit } from '../services/HomeFeed';
import { PlatformSwitchDialog } from '../components/PlatformSwitchDialog';
import { UpdateDialog } from '../components/UpdateDialog';
import { AppUpdateInfo, UpdateProgress, checkHarmonyUpdate, downloadHapToCache, cancelHarmonyUpdateDownload, saveCachedHapToUserLocation, openAppGalleryInviteTest } from '../services/AppUpdater';
import { HarmonyPcWindowService, isHarmonyPc } from '../services/HarmonyPcWindowService';
import { DockLayer } from '../components/DockLayer';
import { SearchPlaybackBar } from '../components/SearchPlaybackBar';
import { MineHome } from '../components/MineHome';
import { HomeChips } from '../components/HomeChips';
import { FeedSectionPage } from '../components/FeedSectionPage';
import { PageHeader } from '../components/PageHeader';
import { LaunchScene } from '../components/LaunchScene';
import { DownloadsView } from '../components/DownloadsView';
import { MusicDownloads, MusicDownload } from '../services/MusicDownloads';
import { CoverPalette, CoverColors, EMPTY_COVER_COLORS } from '../services/CoverPalette';
import { NativePlayer } from '../components/NativePlayer';
import { CommentsPanel } from '../components/CommentsPanel';
import { CarConnectivity } from '../services/CarConnectivity';
import { MineRadioStage } from '../components/MineRadioStage';
import { AlignedSettings } from '../components/AlignedSettings';
import { LyricPreferences, lyricPreferences, lyricPrimary, lyricSecondary } from '../services/LyricPreferences';
import { NativeSettings } from '../components/NativeSettings';
import { LibraryView } from '../components/LibraryView';
import { LocalMusicView } from '../components/LocalMusicView';
import { LocalScanDialog, LocalScanItem } from '../components/LocalScanDialog';
import { SongOrderDialog } from '../components/SongOrderDialog';
import { PlaylistEditDialog } from '../components/PlaylistEditDialog';
import { SongListTools } from '../components/SongListTools';
import { orderSongList } from '../services/SongOrder';
import { LocalMusic, DownloadTrack } from '../services/LocalMusic';
import { SongListView } from '../components/SongListView';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { INK, TEXT, MUTED, ACCENT, platformName } from '../components/Theme';

// 应用装配与用户动作；可见界面全部原生。
interface PlaybackSnapshot { explicit?: boolean; song: Song; queue: Song[]; positionMs: number; playing: boolean; }
interface SongListInput { songs: Song[]; scroller: Scroller; }
interface PlatformOption { id: LxSearchSource; label: string; }
interface SongAssets { coverUrl: string; lyric: string; tlyric: string; romalrc: string; }
interface SongPicture { url: string; }
interface SongMatchInput extends Song { matchSources: string[]; }
interface RaceUrlResult { url?: string; sourceId?: string; sourceName?: string; type?: string; switched?: boolean; switchedPlatform?: string; }
@Entry
@Component
struct Index {
  @State private tab: string = '发现';
  @State private wide: boolean = false;
  @State private statusInset: number = 28;
  @State private bottomInset: number = 16;
  @State private showSheet: boolean = false;
  @State private gripEnabled: boolean = false;
  @State private gripSide: GripSide = 'center';
  @State private miniExpanded: boolean = true;
  @State private searchOpen: boolean = false;
  @State private searchMorph: number = 0;
  @State private searchPressed: boolean = false;
  @State private searchHistory: string[] = [];
  @State private homeFeed: HomeFeed | null = null;
  @State private homePlatform: string = 'wy';
  private homeFeedToken:number=0;
  private homeFeedCache:Map<string,HomeFeed>=new Map<string,HomeFeed>();
  private homeFeedRefreshing: boolean = false;
  // 首页爬取结果整表替换会重建整棵列表；滚动/二级页期间先挂起，空闲后再应用。
  private pendingHomeFeed: HomeFeed | null = null;
  private homeFeedApplyTimer: number = -1;
  private lastHomeScrollAt: number = 0;
  @State private discoveryCompact: boolean = false;
  // 首页快捷胶囊：吸顶显隐与当前板块高亮。
  @State private homeChipAnchor: string = 'banner';
  private lastChipCompute: number = 0;
  private chipAnchorHoldUntil: number = 0;
  @State private openedFeedSourceId: string = '';
  @State private openedFeedLoading: boolean = false;
  // 底部播控/导航：true = 一栏（单个导航图标与播控并排），false = 两栏（播控在上、导航在下）。
  @State private dockCollapsed: boolean = false;
  private searchWasCompact: boolean = false;
  @State private landscape: boolean = false;
  // 横屏详情页沉浸：false 时只留背景动效与歌词，控件全部隐藏。
  @State private stageControlsVisible: boolean = true;
  private twoFingerActive: boolean = false;
  private twoFingerStartY: number = -1;
  private twoFingerLastY: number = -1;
  private twoFingerStartDist: number = 0;
  private twoFingerLastDist: number = 0;
  private lastScrollOffset: number = -1;
  private scrollTravel: number = 0;
  private maxScrollSeen: number = 0;
  private homeAtBottom: boolean = false;
  private suppressScrollUntil: number = 0;
  private mainWindow: window.Window | null = null;
  private dockReady: boolean = false;
  @State private viewportHeight: number = 800;
  @StorageLink('lxliaForeground') @Watch('foregroundChanged') private foreground: boolean = true;
  @StorageLink('lxmineStageMemoryPressure') @Watch('releaseStageCache') private stageMemoryPressure: number = 0;
  @StorageLink('lxmineSystemColorMode') @Watch('systemThemeChanged') private systemColorMode: number = -1;
  @StorageLink('lxmine_deep_link') @Watch('deepLinkChanged') private deepLink: string = '';
  @StorageLink('lxmine_shared_playlist') @Watch('consumeSharedPlaylist') private sharedPlaylist: string = '';
  @State private keyword: string = '';
  @State private platform: LxSearchSource = 'all';
  @State private searchKind: string = 'music';
  @State private entities: CatalogueEntity[] = [];
  @State private openedEntity: CatalogueEntity | null = null;
  @State private entitySongs: Song[] = [];
  @State private results: Song[] = [];
  @State private loading: boolean = false;
  @State private hasMore: boolean = false;
  @State private selected: Song | null = null;
  @State private coverColors: CoverColors = EMPTY_COVER_COLORS;
  @State private queue: Song[] = [];
  @State private playing: boolean = false;
  @State private playbackUrl: string = '';
  @State private viewportWidth: number = 400;
  @State private resolving: boolean = false;
  @State private positionMs: number = 0;
  @State private duration: number = 0;
  @State private lyrics: LyricLine[] = [];
  @State @Watch('playerVisibilityChanged') private showPlayer: boolean = false;
  @State private stageMounted: boolean = false;
  @State private dynamicStageMounted: boolean = false;
  @State private plainStageMounted: boolean = false;
  @State private dynamicStageReady: boolean = false;
  @State private dynamicStageFailed: boolean = false;
  @State private dynamicStyle: string = 'mine-0';
  private stagePlaceholder: Song = { source: 'local', id: '', name: '', singer: '', albumName: '', albumId: '', durationMs: 0, qualitys: [], coverUrl: '' };
  private previousStyle: string = 'mine-0';
  @State private playerReveal: number = 0;
  @State @Watch('applyAppearance') private commentsOpen: boolean = false;
  @State private downloadsOpen: boolean = false;
  @State private downloadItems: MusicDownload[] = [];
  private adoptedDownloads: string = '';
  @State private playlists: MusicPlaylist[] = [];
  @State private openedPlaylist: MusicPlaylist | null = null;
  @State @Watch('feedSectionChanged') private feedSection: string = '';
  @State private feedSectionLoading: boolean = false;
  private feedOpening: boolean = false;
  @State private feedReveal: number = 0;
  @State private feedAnchorX: number = 0;
  @State private feedAnchorY: number = 0;
  @State private feedAnchorSize: number = 36;
  private feedCloseTimer: number = -1;
  private feedReadyAt: number = 0;
  private backGuardUntil: number = 0;
  @State private feedClosing: boolean = false;
  @State private sourcesReveal: number = 1;
  @State private sourcesClosing: boolean = false;
  private sourcesCloseTimer: number = -1;
  @State private settingsPanel: string = 'main';
  @State private lyricPrefs: LyricPreferences = lyricPreferences();
  @State private stageTranslations: LyricLine[] = [];
  private translatedLyrics: LyricLine[] = [];
  private romajiLyrics: LyricLine[] = [];
  @State recentSongs: Song[] = [];
  @State private localTracks: Song[] = [];
  @State private localMusicBusy: boolean = false;
  @State private scanOpen: boolean = false;
  @State private scanItems: LocalScanItem[] = [];
  @State private listSearchOpen: boolean = false;
  @State private listQuery: string = '';
  @State private listSortMode: string = 'added';
  @State private manualOrder: string[] = [];
  @State private orderOpen: boolean = false;
  @State private orderSongs: Song[] = [];
  private localMusic: LocalMusic = new LocalMusic();
  private localScroller: Scroller = new Scroller();
  private libraryRestoreOffset: number = 0;
  private playlistReturnTab: string = '资料库';
  private playlistReturnFeed: string = '';
  private playlistReturnFeedOffset: number = 0;
  private playlistReturnHomeOffset: number = 0;
  @State private sources: SyncSourcePayload[] = [];
  @State private sourcesOpen: boolean = false;
  @State private activeId: string = '';
  @State private sourceReady: boolean = false;
  @State private quality: string = '128k';
  @State private libraryMosaicSeed: number = 0;
  @State @Watch('visualStyleChanged') private styleName: string = 'mine-0';
  @State private stageBgOpacity: number = 0.78;
  @State private stageBgImage: string = '';
  @State @Watch('applyAppearance') private appearance: string = 'system';
  @State private mode: string = '列表循环';
  @State private lyricOffset: number = 0;
  @State private devices: LanDevice[] = [];
  @State private deviceName: string = 'Harmony';
  @State private lanSsid: string = '';
  @State private lanLocalAddress: string = '';
  @State private lanAutoSync: boolean = false;
  @State private allowLandscapeLocked: boolean = true;
  @State private mixWithOthers: boolean = false;
  @State private refreshAlgoDoubleTap: boolean = true;
  private algoRefreshSeed: number = 0;
  @State private editPlaylistOpen: boolean = false;
  @State private switchTargetSong: Song | null = null;
  @State private switchTargetScope: string = '';
  private autoSyncTimer: number = -1;
  private suppressAutoSyncUntil: number = 0;
  @State private carAvailable: boolean = false;
  @State private carConnected: boolean = false;
  @State private carDetail: string = '正在检测 HiCar…';
  @State private message: string = '';
  @State private error: string = '';
  @State private incoming: SyncIncoming | null = null;
  @State private applying: boolean = false;
  @State private sheet: string = '';
  @State private draft: string = '';
  @State private busy: boolean = false;
  @State private intro: boolean = false;
  @State private startupAnimation: boolean = false;
  @State private resumeOnStartup: boolean = false;
  @State private introOpacity: number = 1;
  @State private introScale: number = 0.93;
  private readonly tabs: string[] = ['发现', '资料库', '设置'];
  private readonly platforms: PlatformOption[] = [{ id: 'all', label: '聚合搜索' }, { id: 'kw', label: '酷我' }, { id: 'kg', label: '酷狗' }, { id: 'wy', label: '网易云' }, { id: 'tx', label: 'QQ 音乐' }];
  private readonly searchSuggestions: string[] = ['华语流行', '周杰伦', '林俊杰', '邓紫棋', '陈奕迅', '薛之谦', '经典老歌', '纯音乐', '粤语', '轻音乐'];
  private controller: webview.WebviewController = new webview.WebviewController();
  private searchController: SearchController = new SearchController();
  private searchScroller: Scroller = new Scroller();
  private homeScroller: Scroller = new Scroller();
  private feedScroller: Scroller = new Scroller();
  private libraryScroller: Scroller = new Scroller();
  // 歌单详情单独一个 Scroller：和网格共用时，切换到详情会继承网格滚动偏移，
  // 列表头会被顶进状态栏。每次打开歌单重新 new 一个，保证从顶部开始。
  private playlistScroller: Scroller = new Scroller();
  private settingsScroller: Scroller = new Scroller();
  private settingsRestoreOffset: number = 0;
  private downloadsReturnTab: string = '资料库';
  @State private updateChecking: boolean = false;
  @State private updateDialogOpen: boolean = false;
  @State private updateInfo: AppUpdateInfo | null = null;
  @State private updateError: string = '';
  @State private updateDownloading: boolean = false;
  @State private updateProgress: UpdateProgress = { mirror: '', received: 0, total: 0, percent: 0 };
  @State private updateDownloadedPath: string = '';
  @State private desktopLyrics: boolean = false;
  @State private desktopLyricsLocked: boolean = false;
  @State private wallpaperMode: boolean = false;
  @StorageProp('lxmine_pc_lyric_cmd') @Watch('onPcLyricCmd') private pcLyricCmd: string = '';
  private pcWindow: HarmonyPcWindowService = new HarmonyPcWindowService();
  private lastPcLyricPushAt: number = 0;
  private queueScroller: Scroller = new Scroller();
  private host: LxHost = new LxHost();
  private player: PlayerService = new PlayerService();
  private car: CarConnectivity = new CarConnectivity();
  private foldListener = (status: display.FoldStatus): void => {
    console.info(`[Fold] status=${status}`);
    this.configureWindow();
    this.introTimers.push(setTimeout(() => this.prewarmStages(), 350));
  };
  private downloads: MusicDownloads = new MusicDownloads();
  private coverPalette: CoverPalette = new CoverPalette();
  private discovery: LanDiscovery | null = null;
  private syncServer: LanSyncServer = new LanSyncServer();
  private shareService: ShareService = new ShareService();
  private grip: GripService = new GripService();
  private promptedIncoming: string = '';
  private deviceId: string = '';
  private settings: Record<string, Object> = {};
  private hostReady: boolean = false;
  private storeReady: boolean = false;
  private disposed: boolean = false;
  private pendingPlayback: PlaybackSnapshot | null = null;
  // 鸿蒙应用接续：EntryAbility.onContinue 产出快照，接收侧经 want.parameters 回灌。
  // explicit=true：无视"启动时继续播放"设置，接续即按原进度播放。
  @StorageProp('lxmine_continue_playback') @Watch('onContinuationArrived') private continuationWant: string = '';
  private continuationConsumed: string = '';
  private onContinuationArrived(): void {
    this.consumeContinuation(this.continuationWant);
  }
  private consumeContinuation(json: string): void {
    if (typeof json !== 'string' || !json || this.continuationConsumed === json) return;
    this.continuationConsumed = json;
    try {
      const saved = JSON.parse(json) as PlaybackSnapshot;
      if (saved.song && typeof saved.song.id === 'string' && typeof saved.song.name === 'string' && Array.isArray(saved.queue) && Number.isFinite(saved.positionMs)) {
        saved.explicit = true;
        this.pendingPlayback = saved; this.selected = saved.song; this.queue = saved.queue; this.shareService.setSong(saved.song);
        this.positionMs = Math.max(0, saved.positionMs); this.livePositionMs = this.positionMs; this.duration = saved.song.durationMs;
        this.restorePlaybackIfReady();
      }
    } catch (_) {}
  }
  private lastPlaybackSave: number = 0;
  private lastPlaybackDiskSave: number = 0;
  private lastPositionUiAt: number = 0;
  private livePositionMs: number = 0;
  private snapshotSong: Song | null = null;
  private snapshotQueue: Song[] | null = null;
  private snapshotSongJson: string = '';
  private snapshotQueueJson: string = '';
  private lastContinuationAt: number = 0;
  private lastForeground: boolean = true;
  private searchToken: number = 0;
  // 搜索进度回调节流：searchAllLx 每页/每平台都会带全量数组回调，
  // 整表替换 @State 会让滚动期整列表反复重建而严重掉帧，600ms 内的中间帧跳过。
  private searchProgressAt: number = 0;
  private playToken: number = 0;
  private previewRetryKey: string = '';

  private async checkAppUpdate(silent: boolean = false): Promise<void> {
    if (this.updateChecking) return;
    this.updateChecking = true;
    if (!silent) this.updateError = '';
    try {
      const info = await checkHarmonyUpdate();
      this.updateInfo = info;
      this.updateError = '';
      this.updateDownloadedPath = '';
      if (info.hasUpdate || !silent) {
        this.updateDialogOpen = true;
      }
    } catch (error) {
      if (!silent) {
        this.updateInfo = null;
        this.updateError = (error as Error).message || '无法连接更新服务器';
        this.updateDialogOpen = true;
      }
    } finally {
      this.updateChecking = false;
    }
  }

  private async startUpdateHapDownload(): Promise<void> {
    const asset = this.updateInfo?.asset;
    if (!asset || this.updateDownloading) return;
    this.updateDownloading = true;
    this.updateError = '';
    this.updateProgress = { mirror: '', received: 0, total: asset.size, percent: 0 };
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      const path = await downloadHapToCache(ctx, asset, (p: UpdateProgress) => {
        this.updateProgress = p;
      });
      this.updateDownloadedPath = path;
      this.updateDownloading = false;
      await this.saveUpdateHapToLocation();
    } catch (error) {
      this.updateDownloading = false;
      const msg = (error as Error).message || '下载失败，请稍后重试';
      if (msg !== '已取消下载') this.updateError = msg;
    }
  }

  private async saveUpdateHapToLocation(): Promise<void> {
    const cached = this.updateDownloadedPath;
    const asset = this.updateInfo?.asset;
    if (!cached || !asset) return;
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      const saved = await saveCachedHapToUserLocation(ctx, cached, asset.name);
      if (saved) {
        this.updateDialogOpen = false;
        this.notify(`已保存 ${asset.name} 到指定位置`, 3200);
      }
    } catch (error) {
      this.updateError = `保存失败：${(error as Error).message}`;
    }
  }

  private async openUpdateInviteLink(): Promise<void> {
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      await openAppGalleryInviteTest(ctx);
      this.updateDialogOpen = false;
    } catch (error) {
      this.updateError = `无法打开应用市场邀测链接：${(error as Error).message}`;
    }
  }

  private dismissUpdateDialog(): void {
    cancelHarmonyUpdateDownload();
    this.updateDownloading = false;
    this.updateDialogOpen = false;
  }

  private onPcLyricCmd(): void {
    const cmd = this.pcLyricCmd;
    if (!cmd) return;
    if (cmd.startsWith('close:')) {
      this.desktopLyrics = false;
      this.pcWindow.setDesktopLyrics(false, this.desktopLyricsLocked).catch(() => {});
    } else if (cmd.startsWith('lock:')) {
      const locked = cmd.startsWith('lock:1:');
      this.desktopLyricsLocked = locked;
      this.pcWindow.setDesktopLyricsLocked(locked).catch(() => {});
    }
  }

  private syncHarmonyPcDesktopLyrics(timeMs: number, force: boolean = false): void {
    if (!this.desktopLyrics || !isHarmonyPc()) return;
    const now = Date.now();
    if (!force && now - this.lastPcLyricPushAt < 220) return;
    this.lastPcLyricPushAt = now;
    const adj = timeMs + this.lyricOffset;
    let mainLine = this.selected ? `${this.selected.name}${this.selected.singer ? ' - ' + this.selected.singer : ''}` : 'LxMine';
    let subLine = '';
    if (this.lyrics.length) {
      let idx = 0;
      for (let i = 0; i < this.lyrics.length; i += 1) {
        if (this.lyrics[i].timeMs <= adj) idx = i;
        else break;
      }
      mainLine = this.lyrics[idx]?.text || mainLine;
      const trans = this.translatedLyrics.find((line: LyricLine) => Math.abs(line.timeMs - this.lyrics[idx].timeMs) <= 450);
      if (this.lyricPrefs.showTranslation && trans && trans.text) subLine = trans.text;
    }
    this.pcWindow.syncLyrics(mainLine, subLine, lyricPrimary(this.lyricPrefs, this.coverColors), this.desktopLyricsLocked);
  }

  private toggleHarmonyPcWallpaper(enabled: boolean): void {
    this.wallpaperMode = enabled;
    if (enabled) {
      this.showPlayer = true;
      this.stageControlsVisible = false;
    } else {
      this.stageControlsVisible = true;
    }
    this.pcWindow.setWallpaperMode(enabled).catch(() => {});
  }
  private assetRetryTimer: number = -1;
  private page: number = 1;
  private submitted: string = '';
  private pollTimer: number = -1;
  private lanKeepAlive: boolean = false;
  private introTimers: number[] = [];
  private sourceInfo: LxSourceInfo = { name: '', description: '', version: '', author: '', homepage: '' };
  aboutToAppear(): void {
    this.disposed = false;
    // A fresh process should open on Home, not restore a transient overlay from the last UI snapshot.
    this.tab = '发现'; this.openedPlaylist = null; this.feedSection = ''; this.feedClosing = false; this.sourcesOpen = false; this.sourcesClosing = false;
    this.downloadsOpen = false; this.searchOpen = false; this.openedEntity = null; this.showPlayer = false; this.playerReveal = 0; this.searchMorph = 0; this.commentsOpen = false;
    this.configureWindow();
    try { display.on('foldStatusChange', this.foldListener); } catch (_) {}
    console.info(`[LxMineMaterial] supported=${uiMaterial.isImmersiveMaterialSupported()} level=${uiMaterial.getGlobalMaterialLevel()}`);
    this.player.initialize(getContext(this) as common.UIAbilityContext);
    if (PRODUCT_NAME.toString() !== 'store') {
      this.car.start((connected: boolean, detail: string) => {
        this.carAvailable = this.car.available;
        this.carConnected = connected;
        this.carDetail = detail;
        if (connected) this.notify('检测到 HiCar 连接，请在车机确认应用入口', 2500);
      });
    }
    this.shareService.start();
    this.player.onBeforePlay(async () => { await this.setLanKeepAlive(false); });
    this.localMusic.onChange = (songs: Song[]) => {
      this.localTracks = songs;
      if (this.openedPlaylist?.kind === 'local') {
        this.openedPlaylist = { id: this.openedPlaylist.id, name: this.openedPlaylist.name, kind: 'local',
          songs, songIds: songs.map((song: Song) => songKey(song)), createdAt: this.openedPlaylist.createdAt, updatedAt: Date.now() };
      }
    };
    this.localMusic.onError = (message: string) => { this.error = message; };
    this.localMusic.initialize(getContext(this) as common.UIAbilityContext);
    this.downloads.onError = (message: string) => { this.error = message; this.notify(message, 3000); };
    this.downloads.onChange = (items: MusicDownload[]) => {
      for (const item of items) {
        const previous = this.downloadItems.find((old: MusicDownload) => old.id === item.id);
        if (item.state === 'complete' && previous && previous.state !== 'complete') this.notify('下载完成：' + item.song.name, 3000);
      }
      this.downloadItems = items;
      const completed = items.filter((item: MusicDownload) => item.state === 'complete')
        .map((item: MusicDownload): DownloadTrack => { return { song: item.song, path: item.path }; });
      const signature = completed.map((item: DownloadTrack) => item.path).join('|');
      if (completed.length && signature !== this.adoptedDownloads) {
        this.adoptedDownloads = signature;
        this.localMusic.adoptDownloads(completed);
        this.localTracks = this.localMusic.songs();
      }
    };
    this.downloads.initialize(getContext(this) as common.UIAbilityContext);
    this.localMusic.adoptDownloads(this.downloadItems.filter((item: MusicDownload) => item.state === 'complete')
      .map((item: MusicDownload): DownloadTrack => { return { song: item.song, path: item.path }; }));
    this.localTracks = this.localMusic.songs();
    this.player.onState((state: string) => {
      this.playing = state === 'playing'; this.duration = this.player.durationMs();
      if ((state === 'prepared' || state === 'playing') && this.selected && this.selected.source !== 'local') {
        const expectedMs = this.selected.durationMs ?? 0;
        const actualMs = this.duration;
        const sk = songKey(this.selected);
        if (expectedMs >= 75000 && actualMs > 5000 && actualMs <= 45000 && actualMs < expectedMs * 0.45 && this.previewRetryKey !== sk) {
          this.previewRetryKey = sk;
          const retrySong = this.selected;
          const retryToken = this.playToken;
          this.raceAllSourcesForSong(retrySong, this.activeId ? [this.activeId] : [], true).then((hit: RaceUrlResult) => {
            if (retryToken !== this.playToken || this.disposed || !hit.url) return;
            if (hit.sourceId && hit.sourceId !== this.activeId) {
              this.activeId = hit.sourceId;
              this.save();
            }
            const nextIntent = this.player.beginSwitch(true);
            this.player.playUrl(hit.url, retrySong, 0, true, nextIntent).then(() => {
              if (retryToken === this.playToken) this.playbackUrl = hit.url ?? '';
            }).catch(() => {});
          }).catch(() => {});
        }
      }
      if (state === 'playing') {
        this.setLanKeepAlive(false).catch(() => {});
        if (this.selected) {
          const song = this.selected;
          this.recentSongs = [song, ...this.recentSongs.filter((item: Song) => songKey(item) !== songKey(song))];
          saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
        }
      }
      if (state === 'completed') this.advance(1, true);
      if (state === 'playing' || state === 'paused') this.savePlayback(true);
    });
    this.player.onTime((time: number) => {
      this.livePositionMs = time;
      // 首页/资料库只按 1s 刷新进度状态；播放详情页才需要 200ms 的进度与歌词跟随。
      // 每次 timeUpdate 都写 @State 会让整页（含首页列表）反复重建，滚动时掉帧。
      const now = Date.now();
      if (now - this.lastPositionUiAt >= (this.showPlayer ? 200 : 1000)) {
        this.lastPositionUiAt = now;
        this.positionMs = time;
      }
      this.syncHarmonyPcDesktopLyrics(time, false);
      const duration = this.player.durationMs();
      if (duration !== this.duration) this.duration = duration;
      if (now - this.lastPlaybackSave > 5000) this.savePlayback();
      // 每秒刷新接续内存槽（不落盘）；只存对象引用，不再每秒 JSON.stringify 整条队列。
      else if (this.selected && !this.pendingPlayback && now - this.lastContinuationAt > 1000) {
        this.lastContinuationAt = now;
        setLatestPlaybackState(this.selected, this.queue, time, this.playing);
      }
    });
    this.player.onError((message: string) => {
      this.resolving = false;
      const cur = this.selected;
      const curKey = cur ? songKey(cur) : '';
      // 容器/解码/网络异常时静默触发跨平台换源，不弹英文红字报错
      if (cur && curKey && this.previewRetryKey !== curKey) {
        this.previewRetryKey = curKey;
        this.error = '';
        const retryToken = this.playToken;
        this.raceAllSourcesForSong(cur, this.activeId ? [this.activeId] : [], true).then((hit: RaceUrlResult) => {
          if (retryToken !== this.playToken || this.disposed || !hit.url) return;
          if (hit.sourceId && hit.sourceId !== this.activeId) {
            this.activeId = hit.sourceId;
            this.save();
          }
          const nextIntent = this.player.beginSwitch(true);
          this.player.playUrl(hit.url, cur, 0, true, nextIntent).then(() => {
            if (retryToken === this.playToken) this.playbackUrl = hit.url ?? '';
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      const raw = String(message || '').trim();
      const hasRawTech = /[A-Za-z_]{4,}|CONTAINER_ERR|Unsupported|HTTP\s*\d|ECONN|ETIMEDOUT|IO_ERR/i.test(raw);
      this.error = hasRawTech ? '当前音源暂不可播放，请切换其他音源或重试' : (raw || '当前音源暂不可播放');
    });
    this.player.onNext((step: number) => this.advance(step));
    this.initialize().catch((error: Error) => { this.error = `初始化失败：${error.message}`; });
  }
  aboutToDisappear(): void {
    this.savePlayback(true);
    this.grip.stop();
    this.disposed = true; this.playToken++; this.searchToken++;
    clearInterval(this.pollTimer);
    clearTimeout(this.feedCloseTimer);
    clearTimeout(this.sourcesCloseTimer);
    clearTimeout(this.homeFeedApplyTimer);
    clearTimeout(this.assetRetryTimer);
    clearTimeout(this.autoSyncTimer);
    this.pendingHomeFeed = null;
    for (const timer of this.introTimers) clearTimeout(timer);
    this.discovery?.stop(); this.syncServer.stop().catch(() => {});
    this.pcWindow.dispose().catch(() => {});
    try { display.off('foldStatusChange', this.foldListener); } catch (_) {}
    this.car.stop();
    this.shareService.stop();
    this.host.dispose(); this.player.release().catch(() => {});
  }
  onBackPress(): boolean {
    const now = Date.now();
    if (now < this.backGuardUntil) return true;
    const consume = (): boolean => { this.backGuardUntil = now + 1500; return true; };
    console.info(`[BackPress] player=${this.showPlayer} feed=${this.feedSection} playlist=${!!this.openedPlaylist} search=${this.searchOpen}`);
    if (this.incoming) return consume();
    if (this.editPlaylistOpen) { this.editPlaylistOpen = false; return consume(); }
    if (this.orderOpen) { this.orderOpen = false; return consume(); }
    if (this.scanOpen) { this.closeScanDialog(); return consume(); }
    if (this.showSheet) { this.showSheet = false; return consume(); }
    if (this.commentsOpen) { this.commentsOpen = false; return consume(); }
    if (this.showPlayer) { this.showPlayer = false; return consume(); }
    if (this.sourcesOpen) { this.closeSources(); return consume(); }
    if (this.settingsPanel !== 'main') { this.openSettingsPanel('main'); return consume(); }
    if (this.downloadsOpen) { this.closeDownloads(); return consume(); }
    if (this.feedSection) { this.closeFeedSection(); return consume(); }
    if (this.openedPlaylist) { this.closeOpenedPlaylist(); return consume(); }
    if (this.openedEntity) { this.openedEntity = null; return consume(); }
    if (this.searchOpen) { this.closeSearch(); return consume(); }
    return false;
  }
  private async initialize(): Promise<void> {
    await initStore(getContext(this) as common.UIAbilityContext);
    this.deviceId = await loadDeviceId();
    this.deviceName = deviceInfo.marketName || deviceInfo.productModel || 'Harmony';
    // Start LAN discovery before the stage/source bundle so a slow renderer
    // cannot delay peer visibility.
    this.syncServer.setIdentity(this.deviceId, this.deviceName);
    this.syncServer.onAutoPlaylists((playlistsJson: string): boolean => {
      try {
        const incomingLists = parsePlaylists(playlistsJson);
        const merged = mergeSyncPlaylists(this.playlists, incomingLists);
        this.suppressAutoSyncUntil = Date.now() + 3000;
        this.playlists = merged;
        if (this.openedPlaylist) {
          const updated = merged.find((item: MusicPlaylist) => item.id === this.openedPlaylist?.id);
          if (updated) this.openedPlaylist = updated;
        }
        this.save();
        this.notify('已自动合并局域网歌单', 1800);
        return true;
      } catch (_) { return false; }
    });
    this.discovery = new LanDiscovery(this.deviceId, this.deviceName);
    this.discovery.pendingRequests = () => this.syncServer.pullRequests();
    this.discovery.onDevices((devices: LanDevice[]) => { setTimeout(() => { if (!this.disposed) this.devices = devices; }, 0); });
    try {
      const port = await this.syncServer.start();
      this.discovery.setPort(port);
    } catch (error) {
      this.message = `局域网同步启动失败：${(error as Error).message}`;
    }
    this.pollTimer = setInterval(() => {
      if (!this.applying) {
        this.incoming = this.syncServer.pollIncoming();
        if (this.incoming && this.incoming.id !== this.promptedIncoming) this.askIncoming();
      }
      // 胶囊高亮维护：页底（含回弹区间）不高亮，其余取最后一个滚过胶囊栏的板块，容差放宽。
      // 板块/歌单详情盖住首页时停止几何测量，避免每 300ms 的 getRectangleById 抢滚动帧。
      if (this.foreground && this.tab === '发现' && !this.searchOpen && !this.showPlayer && !this.feedSection && !this.openedPlaylist && !this.applying && !this.disposed) {
        try {
          const offset = this.homeScroller.currentOffset().yOffset;
          const topMorph = this.viewportHeight < 500 ? 1 : 0;
          if (offset <= 4 && (this.discoveryCompact || this.searchMorph !== topMorph)) {
            this.getUIContext().animateTo({ curve: curves.springMotion(0.42, 0.9) }, () => {
              this.discoveryCompact = false; this.searchMorph = topMorph;
            });
          }
          if (offset > this.maxScrollSeen + 2) this.maxScrollSeen = offset;
          if (Date.now() > this.chipAnchorHoldUntil) {
            // 高亮始终跟随最后一个滚过胶囊栏的板块；页底保持"分类"高亮
            // （"页底无高亮"规则已删除；页底时板块顶到不了胶囊栏线，强制"分类"）。
            let active = 'banner';
            // 页底强制"分类"只认 onScrollEdge 边缘标记（homeAtBottom）。
            // 不要用 maxScrollSeen 近似：下滑时它跟随 offset，任意位置都会误判页底。
            if (this.homeAtBottom) {
              active = 'category';
            } else {
              const barLine = this.headerHeight() + 150;
              for (const anchor of ['banner', 'newSongs', 'playlists', 'charts', 'hot', 'category']) {
                try {
                  const rect = this.getUIContext().getComponentUtils().getRectangleById('section-' + anchor);
                  // 板块按纵向顺序排列：遇到第一个在胶囊栏下方的板块即可停止，后面只会更低。
                  if (this.getUIContext().px2vp(rect.windowOffset.y) <= barLine) active = anchor;
                  else break;
                } catch (_) {}
              }
            }
            if (active !== this.homeChipAnchor) this.homeChipAnchor = active;
          }
        } catch (_) {}
      }
    }, 300);
    this.discovery.start().then(() => {
      if (!this.disposed) {
        this.lanSsid = this.discovery?.getSsid() ?? '';
        const ip = this.discovery?.getLocalIp() ?? '';
        const port = this.syncServer.currentPort();
        this.lanLocalAddress = ip && port > 0 ? `${ip}:${port}` : ip;
      }
    }).catch((error: Error) => { this.message = `设备发现暂不可用：${error.message}`; });
    // Media playback owns the single continuous task. A DATA_TRANSFER task here
    // used to linger and replace the system media/live-view capsule.
    try { await backgroundTaskManager.stopBackgroundRunning(getContext(this) as common.UIAbilityContext); } catch (_) {}
    this.lanKeepAlive = false;
    await saveUiDiagnostics(JSON.stringify({ immersive: uiMaterial.isImmersiveMaterialSupported(), level: uiMaterial.getGlobalMaterialLevel(), state: uiMaterial.getMaterialInfo(), hdsTypes: hdsMaterial.getSystemMaterialTypes() }));
    const data = await loadAppData();
    this.settings = JSON.parse(data.settingsJson) as Record<string, Object>;
    const playbackJson = await loadPlaybackSnapshot();
    if (playbackJson) {
      try {
        const saved = JSON.parse(playbackJson) as PlaybackSnapshot;
        if (saved.song && typeof saved.song.id === 'string' && typeof saved.song.name === 'string' && Array.isArray(saved.queue) && Number.isFinite(saved.positionMs)) {
          this.pendingPlayback = saved; this.selected = saved.song; this.queue = saved.queue; this.positionMs = Math.max(0, saved.positionMs); this.livePositionMs = this.positionMs; this.duration = saved.song.durationMs;
          this.coverPalette.colors(saved.song.coverUrl).then((colors: CoverColors) => { if (this.selected?.id === saved.song.id) this.coverColors = colors; });
        }
      } catch (_) {}
    }
    const continuedJson = AppStorage.get<string>('lxmine_continue_playback');
    if (typeof continuedJson === 'string' && continuedJson) {
      AppStorage.delete('lxmine_continue_playback');
      this.consumeContinuation(continuedJson);
    }
    if (this.deepLink) this.handleDeepLink(this.deepLink);
    this.restoreSettings();
    // 先渲染上次的首页快照，网络刷新在后台替换，避免冷启动长时间空白。
    try {
      const cachedFeed = await loadHomeCache('all');
      if (cachedFeed) {
        const parsed = JSON.parse(cachedFeed) as HomeFeed;
        // 只接受带融合榜单的缓存，旧格式（榜单带平台角标）直接丢弃走网络刷新。
        if (parsed.charts?.[0]?.parts?.length) this.homeFeed = parsed;
      }
    } catch (_) {}
    this.playlists = parsePlaylists(data.playlistsJson);
    if (!this.playlists.length) this.playlists = [createPlaylist('我喜欢的', true)];
    this.syncLikedKeysStorage();
    this.sources = uniqueSyncSources(JSON.parse(data.sourcesJson) as SyncSourcePayload[]);
    try { this.recentSongs = JSON.parse(await loadRecentSongs()) as Song[]; } catch (_) { this.recentSongs = []; }
    if (!this.sources.length && data.sourceScript) this.sources = [this.sourceFromScript(data.sourceScript)];
    this.activeId = data.activeSourceId || this.sources[0]?.id || ''; this.storeReady = true; this.save(); this.restorePlaybackIfReady(); this.consumeSharedPlaylist();
    this.restoreSource();
    this.refreshHomeFeed().catch(() => {});
  }
  private async refreshHomeFeed(force: boolean = false, refreshAlgo: boolean = false): Promise<void> {
    if(!this.hostReady||!this.storeReady)return;
    // 启动期 initialize 与 Web onPageEnd 会各触发一次；同一轮爬取未结束时不再重复发车。
    if (this.homeFeedRefreshing && !force) return;
    this.homeFeedRefreshing = true;
    if (refreshAlgo) this.algoRefreshSeed += 1;
    const seed = this.algoRefreshSeed;
    const token=++this.homeFeedToken;const startedAt=Date.now();
    try {
      const baseFeed = await loadMergedHome(this.host, seed);
      const feed = await enrichPersonalizedHome(baseFeed, this.recentSongs, this.playlists, this.host, seed, this.searchHistory).catch((): HomeFeed => baseFeed);
      this.homeFeedCache.set('all',feed);
      if(token!==this.homeFeedToken||this.disposed)return;
      console.info(`[HomeFeed] merged platforms ok sections=${feed.sections?.length??0} playlists=${feed.playlists.length} new=${feed.newSongs.length} charts=${feed.charts.length} seed=${seed} load=${Date.now()-startedAt}ms`);
      this.queueHomeFeed(feed);
      if (force) {
        this.notify(refreshAlgo ? '首页与推荐算法已刷新' : '首页信息已刷新', 1800);
      }
      this.hydrateLibraryCovers().catch(() => {});
    } catch (error) { if(token===this.homeFeedToken)this.error=`首页读取失败：${(error as Error).message}`; }
    finally { if (token === this.homeFeedToken) this.homeFeedRefreshing = false; }
  }
  private async hydrateLibraryCovers(): Promise<void> {
    if (!this.hostReady || !this.storeReady || this.disposed) return;
    const missing: Song[] = [];
    for (const list of this.playlists) {
      const songs = list.songs ?? [];
      if (!songs.length) continue;
      if (!songs.some((s: Song) => s.coverUrl.length > 0)) {
        missing.push(songs[0]);
      }
    }
    for (const s of this.recentSongs.slice(0, 20)) {
      if (!s.coverUrl && s.source !== 'local') missing.push(s);
    }
    for (const s of this.queue.slice(0, 24)) {
      if (!s.coverUrl && s.source !== 'local') missing.push(s);
    }
    if (!missing.length) return;
    const covers = await hydrateSongCovers(this.host, missing);
    if (!covers.size || this.disposed) return;
    let playlistChanged = false;
    this.playlists = this.playlists.map((list: MusicPlaylist): MusicPlaylist => {
      const patched = playlistCoversPatched(list, covers);
      if (patched !== list) playlistChanged = true;
      return patched;
    });
    const nextRecent = applyCoversToSongs(this.recentSongs, covers);
    if (nextRecent !== this.recentSongs) {
      this.recentSongs = nextRecent;
      saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
    }
    this.queue = applyCoversToSongs(this.queue, covers);
    if (this.openedPlaylist) {
      this.openedPlaylist = playlistCoversPatched(this.openedPlaylist, covers);
    }
    if (playlistChanged) this.save();
  }
  private async hydrateOpenedListCovers(): Promise<void> {
    if (!this.hostReady || this.disposed) return;
    const opened = this.openedPlaylist;
    if (!opened || !opened.songs?.length || opened.kind === 'local') return;
    const covers = await hydrateSongCovers(this.host, opened.songs);
    if (!covers.size || this.disposed) return;
    if (this.openedPlaylist && this.openedPlaylist.id === opened.id) {
      this.openedPlaylist = playlistCoversPatched(this.openedPlaylist, covers);
    }
    if (opened.kind === 'recent') {
      this.recentSongs = applyCoversToSongs(this.recentSongs, covers);
      saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
      return;
    }
    let changed = false;
    this.playlists = this.playlists.map((list: MusicPlaylist): MusicPlaylist => {
      if (list.id !== opened.id) return list;
      const patched = playlistCoversPatched(list, covers);
      if (patched !== list) changed = true;
      return patched;
    });
    if (changed) this.save();
  }
  /** 只比较会改变布局的内容（板块/条目 id、数量、歌曲 id），忽略播放量等文字刷新。 */
  private homeFeedSignature(feed: HomeFeed | null): string {
    if (!feed) return '';
    const listSig = (items: FeedPlaylist[]): string => items.map((item: FeedPlaylist) => `${item.id}:${item.count}`).join(',');
    const songSig = (songs: Song[]): string => songs.map((song: Song) => `${song.source}:${song.id}`).join(',');
    const sectionSig = (feed.sections ?? []).map((section: FeedSection) => `${section.id}:${listSig(section.items)}`).join('|');
    return `${sectionSig}#${listSig(feed.charts)}#${songSig(feed.newSongs)}#${songSig(feed.forYou ?? [])}#${songSig(feed.similar)}#${feed.daily?.count ?? 0}#${feed.dailySongs?.length ?? 0}`;
  }
  private queueHomeFeed(feed: HomeFeed): void {
    // 没有旧内容（冷启动/双击刷新）时无滚动可保护，直接回填，避免多等一个延迟窗口。
    if (!this.homeFeed) {
      console.info('[HomeFeed] apply first feed');
      this.pendingHomeFeed = null; clearTimeout(this.homeFeedApplyTimer);
      this.homeFeed = feed;
      saveHomeCache('all', JSON.stringify(feed)).catch(() => {});
      return;
    }
    // 缓存快照与网络结果通常完全一致；直接跳过整表替换，避免滚动中无意义重建。
    if (this.homeFeedSignature(feed) === this.homeFeedSignature(this.homeFeed)) {
      this.pendingHomeFeed = null; clearTimeout(this.homeFeedApplyTimer);
      console.info('[HomeFeed] refresh unchanged; skip rebuild');
      return;
    }
    this.pendingHomeFeed = feed;
    this.schedulePendingHomeFeed();
  }
  private schedulePendingHomeFeed(): void {
    clearTimeout(this.homeFeedApplyTimer);
    this.homeFeedApplyTimer = setTimeout(() => this.applyPendingHomeFeed(), 700);
  }
  /** 滚动结束后再换首页数据；不在滑动惯性中做 JSON 序列化/整树重建。 */
  private applyPendingHomeFeed(): void {
    const feed = this.pendingHomeFeed;
    if (!feed || this.disposed) return;
    const scrolling = Date.now() - this.lastHomeScrollAt < 650;
    const busyPage = this.tab !== '发现' || this.searchOpen || !!this.feedSection || !!this.openedPlaylist || this.showPlayer;
    if (scrolling || busyPage) {
      this.homeFeedApplyTimer = setTimeout(() => this.applyPendingHomeFeed(), 600);
      return;
    }
    this.pendingHomeFeed = null;
    console.info('[HomeFeed] apply refreshed feed');
    this.homeFeed = feed;
    // 大对象序列化和 preferences flush 也放到空闲时，避免爬取完成瞬间抢 UI 线程。
    saveHomeCache('all', JSON.stringify(feed)).catch(() => {});
  }
  /** 曲库右上角刷新：换一个持久化种子，立即重排，重启后保持新排列。 */
  private refreshLibraryMosaic(): void {
    this.libraryMosaicSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
    this.settings['lxmine_mosaic_seed'] = this.libraryMosaicSeed;
    this.save();
    this.notify('曲库排列已刷新', 1500);
  }
  /** 每次进入一个新列表都清空列表工具状态，避免把上一个歌单的搜索/排序带到下一个。 */
  private resetListTools(): void {
    this.listSearchOpen = false;
    this.listQuery = '';
    this.listSortMode = 'added';
    this.manualOrder = [];
    this.orderOpen = false;
    this.orderSongs = [];
  }
  private listBaseSongs(): Song[] {
    if (this.openedPlaylist?.kind === 'local') return this.localTracks;
    return this.openedPlaylist?.songs ?? [];
  }
  /** 列表内搜索 + 排序（添加顺序/歌名/歌手/专辑/手动）。 */
  private arrangedSongs(songs: Song[]): Song[] {
    return orderSongList(songs, this.listSortMode, this.manualOrder, this.listQuery);
  }
  private openManualOrder(): void {
    this.orderSongs = this.arrangedSongs(this.listBaseSongs());
    this.orderOpen = true;
  }
  private openManualOrderFor(songs: Song[]): void {
    this.orderSongs = this.arrangedSongs(songs);
    this.orderOpen = true;
  }
  private applyManualOrder(keys: string[]): void {
    const opened = this.openedPlaylist;
    if (opened && (this.canDeleteOpenedPlaylist() || opened.isFavorite)) {
      const updated = playlistReordered(opened, keys);
      this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
      this.openedPlaylist = updated;
      this.manualOrder = [];
      this.listSortMode = 'added';
      this.orderOpen = false;
      this.save();
      this.triggerAutoSync();
      this.notify('已保存歌单自定义顺序', 1500);
      return;
    }
    this.manualOrder = keys;
    this.listSortMode = 'manual';
    this.orderOpen = false;
    this.notify('已按自定义顺序显示', 1500);
  }
  @Builder private listSearchBar() {
    Row({ space: 8 }) {
      Image($r('app.media.ic_search')).width(18).height(18).opacity(0.7)
      TextInput({ text: this.listQuery, placeholder: '搜索本列表' }).layoutWeight(1).height(40).fontSize(14)
        .fontColor(TEXT).placeholderColor(MUTED).backgroundColor(Color.Transparent).padding(0)
        .onChange((value: string) => { this.listQuery = value; })
      Text('取消').fontSize(13).fontColor(MUTED).padding({ left: 6, right: 2, top: 8, bottom: 8 })
        .onClick(() => { this.listSearchOpen = false; this.listQuery = ''; })
    }.width('100%').height(44).padding({ left: 14, right: 14 })
      .backgroundColor('#0DFFFFFF').borderRadius(16).border({ width: 1, color: '#14FFFFFF' })
  }
  private openLocalMusic(): void {
    this.resetListTools();
    try { this.libraryRestoreOffset = this.libraryScroller.currentOffset().yOffset; } catch (_) {}
    this.playlistReturnTab = '资料库'; this.playlistReturnFeed = '';
    this.openedPlaylist = { id: 'local-hm', name: '本地音乐', kind: 'local', songs: this.localTracks,
      songIds: this.localTracks.map((song: Song) => songKey(song)), createdAt: 0, updatedAt: Date.now() };
    this.tab = '资料库'; this.discoveryCompact = false;
    setTimeout(() => { try { this.localScroller.scrollTo({ xOffset: 0, yOffset: 0 }); } catch (_) {} }, 0);
  }
  private async scanLocalMusic(): Promise<void> {
    if (this.localMusicBusy) return;
    this.localMusicBusy = true;
    try {
      const uris = await new picker.AudioViewPicker(getContext(this) as common.UIAbilityContext)
        .select({ maxSelectNumber: 500 });
      if (!uris.length) return;
      this.scanItems = uris.map((uri: string, index: number): LocalScanItem => {
        const name = decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1)) || `音频 ${index + 1}`;
        return { uri, name };
      });
      this.scanOpen = true;
    } catch (error) {
      this.error = `识别本地音频失败：${(error as Error).message}`;
    } finally {
      this.localMusicBusy = false;
    }
  }
  private async importLocalAudio(): Promise<void> {
    if (this.localMusicBusy) return;
    let uris: string[] = [];
    try {
      this.localMusicBusy = true;
      uris = await new picker.AudioViewPicker(getContext(this) as common.UIAbilityContext)
        .select({ maxSelectNumber: 500 });
    } catch (error) {
      this.error = `导入本地音频失败：${(error as Error).message}`;
    } finally {
      this.localMusicBusy = false;
    }
    if (uris.length) await this.addLocalUris(uris);
  }
  private closeScanDialog(): void {
    this.scanOpen = false;
    this.scanItems = [];
  }
  private confirmScan(uris: string[]): void {
    this.closeScanDialog();
    if (uris.length) this.addLocalUris(uris);
  }
  private async addLocalUris(uris: string[]): Promise<void> {
    if (this.localMusicBusy || !uris.length) return;
    this.localMusicBusy = true;
    this.notify(`正在添加 ${uris.length} 个音频…`, 2500);
    try {
      const added = await this.localMusic.addUris(uris);
      this.localTracks = this.localMusic.songs();
      if (this.openedPlaylist?.kind === 'local') {
        this.openedPlaylist = { id: this.openedPlaylist.id, name: this.openedPlaylist.name, kind: 'local',
          songs: this.localTracks, songIds: this.localTracks.map((song: Song) => songKey(song)),
          createdAt: this.openedPlaylist.createdAt, updatedAt: Date.now() };
      }
      this.notify(added > 0 ? `已添加 ${added} 首本地音乐` : '没有新增音频（可能已添加过）', 2500);
    } catch (error) {
      this.error = `添加本地音乐失败：${(error as Error).message}`;
    } finally {
      this.localMusicBusy = false;
    }
  }
  private async openFeedPlaylist(item: FeedPlaylist, autoplay: boolean = false, feedOffsetArg: number = -1, homeOffsetArg: number = -1): Promise<void> {
    this.resetListTools();
    this.playlistScroller = new Scroller();
    const returnTab = this.tab;
    const returnFeed = this.feedSection;
    let feedOffset = feedOffsetArg;
    let homeOffset = homeOffsetArg;
    if (feedOffset < 0) { try { feedOffset = returnFeed ? this.feedScroller.currentOffset().yOffset : 0; } catch (_) { feedOffset = 0; } }
    if (homeOffset < 0) { try { homeOffset = returnFeed ? 0 : this.homeScroller.currentOffset().yOffset; } catch (_) { homeOffset = 0; } }
    if (item.id === 'daily-30') {
      // 每日三十首：进入详细列表（队列已在内存，秒开）；点卡片上的播放键则直接开播。
      const songs = this.homeFeed?.dailySongs ?? this.homeFeed?.newSongs.slice(0, 30) ?? [];
      if (!songs.length) { this.error = '每日推荐还没有内容'; return; }
      this.openedFeedLoading = false;
      const shell: MusicPlaylist = { id: 'daily-30', name: '每日三十首', kind: 'lx', songs, songIds: songs.map((song: Song) => songKey(song)), createdAt: Date.now(), updatedAt: Date.now() };
      this.openedFeedSourceId = 'daily-30';
      this.playlistReturnTab = returnTab;
      this.playlistReturnFeed = returnFeed;
      this.playlistReturnFeedOffset = feedOffset;
      this.playlistReturnHomeOffset = homeOffset;
      this.openedPlaylist = shell;
      this.libraryRestoreOffset = 0;
      this.feedSection = '';
      this.tab = '资料库';
      this.discoveryCompact = false;
      if (autoplay) this.playSong(songs[0], songs);
      return;
    }
    if (item.request && !item.source) {
      // 分类入口：注入对应板块（按平台拉取该分类歌单），复用 feedSection 的加载与返回。
      const sectionId = 'category-' + item.id;
      const feed = this.homeFeed;
      if (feed && !(feed.sections ?? []).some((section: FeedSection) => section.id === sectionId)) {
        feed.sections = [...(feed.sections ?? []), { id: sectionId, title: item.name, kind: 'playlist', items: [], request: item.request }];
      }
      this.openFeedSection(sectionId);
      return;
    }
    // 先跳转出歌单壳（立即响应），歌曲在后台装载；失败退回来源页并报错。
    const shell: MusicPlaylist = { id: `feed-${item.id}`, name: item.name, kind: 'lx', songs: [], songIds: [], createdAt: Date.now(), updatedAt: Date.now() };
    this.openedFeedSourceId = item.id;
    this.playlistReturnTab = returnTab;
    this.playlistReturnFeed = returnFeed;
    this.playlistReturnFeedOffset = feedOffset;
    this.playlistReturnHomeOffset = homeOffset;
    this.openedPlaylist = shell;
    this.openedFeedLoading = true;
    this.libraryRestoreOffset = 0;
    this.feedSection = '';
    this.tab = '资料库';
    this.discoveryCompact = false;
    try {
      let songs: Song[] = [];
      if (item.parts && item.parts.length) {
        songs = await loadMergedChartSongs(this.host, item);
      } else if (item.source) {
        const result = await platformFeedSongs(this.host, item);
        if (result.warning) this.message = result.warning;
        songs = result.items;
      } else {
        songs = await loadFeedPlaylistSongs(item.id, (count: number) => { this.message = `${count} 首歌曲的平台资料暂不可获取，已显示其余全部歌曲`; });
      }
      if (!songs.length) { this.error = '歌单暂时没有可播放歌曲'; this.openedPlaylist = null; this.openedFeedSourceId = ''; this.openedFeedLoading = false; this.tab = returnTab; this.feedSection = returnFeed; return; }
      shell.songs = songs; shell.songIds = songs.map((song: Song) => songKey(song)); shell.updatedAt = Date.now();
      this.openedPlaylist = shell;
      this.openedFeedLoading = false;
      if (autoplay) this.playSong(songs[0], songs);
      // 卡片上的数量与实际歌曲数对齐（跨平台去重/截断后可能少于标称之和）。
      const feed = this.homeFeed;
      if (feed) {
        let touched = false;
        const patch = (list: FeedPlaylist[]): FeedPlaylist[] => list.map((entry: FeedPlaylist): FeedPlaylist => {
          if (entry.id !== item.id) return entry;
          touched = true;
          const patched: FeedPlaylist = { id: entry.id, name: entry.name, cover: entry.cover, count: songs.length, playCount: entry.playCount };
          if (entry.source !== undefined) patched.source = entry.source;
          if (entry.kind !== undefined) patched.kind = entry.kind;
          if (entry.period !== undefined) patched.period = entry.period;
          if (entry.parts !== undefined) patched.parts = entry.parts;
          if (entry.request !== undefined) patched.request = entry.request;
          return patched;
        });
        const nextCharts = patch(feed.charts ?? []);
        const nextSections = (feed.sections ?? []).map((section: FeedSection): FeedSection => ({ id: section.id, title: section.title, kind: section.kind, items: patch(section.items), error: section.error, request: section.request }));
        if (touched) this.homeFeed = { source: feed.source, sections: nextSections, playlists: nextSections.find((section: FeedSection) => section.id === 'playlists')?.items ?? feed.playlists, newSongs: feed.newSongs, charts: nextCharts, similar: feed.similar, daily: feed.daily, dailySongs: feed.dailySongs };
      }
    } catch (error) {
      this.error = `歌单加载失败：${(error as Error).message}`;
      this.openedPlaylist = null; this.openedFeedSourceId = ''; this.openedFeedLoading = false; this.tab = returnTab; this.feedSection = returnFeed;
    }
  }
  // A feed playlist is a library-looking detail, but Back must restore the page it
  // was opened from (home section or a chart list), not strand the user in 资料库.
  private rememberPlaylistContext(): void {
    this.playlistReturnTab = this.tab;
    this.playlistReturnFeed = this.feedSection;
    this.playlistReturnFeedOffset = 0;
    this.playlistReturnHomeOffset = 0;
    if (this.feedSection) {
      try { this.playlistReturnFeedOffset = this.feedScroller.currentOffset().yOffset; } catch (_) {}
    } else {
      try { this.playlistReturnHomeOffset = this.homeScroller.currentOffset().yOffset; } catch (_) {}
    }
  }
  private restoreSettings(): void {
    const appearance = this.settings['lxmine_appearance'];
    this.appearance = typeof appearance === 'string' && ['dark', 'light', 'system'].includes(appearance) ? appearance : 'system';
    this.applyAppearance();
    this.lyricPrefs = lyricPreferences(JSON.stringify(this.settings['lxmine_lyrics'] ?? {}));
    this.updateStageTranslations();
    this.resumeOnStartup = this.settings['lxmine_resume_on_startup'] === true;
    this.gripEnabled = this.settings['lxlia_grip_enabled'] === true;
    this.allowLandscapeLocked = this.settings['lxmine_allow_landscape_locked'] !== false;
    this.mixWithOthers = this.settings['lxmine_mix_with_others'] === true;
    this.player.setMixWithOthers(this.mixWithOthers);
    this.refreshAlgoDoubleTap = this.settings['lxmine_refresh_algo_double_tap'] !== false;
    this.lanAutoSync = this.settings['lxmine_lan_auto_sync'] === true;
    this.syncServer.setAutoSync(this.lanAutoSync);
    this.discovery?.setAutoSync(this.lanAutoSync);
    this.applyOrientation(this.showPlayer);
    this.startupAnimation = this.settings['lxlia_startup_animation'] !== false;
    if (!this.startupAnimation) this.intro = false;
    const history = this.settings['lxlia_search_history'];
    if (Array.isArray(history)) this.searchHistory = history.filter((term: Object) => typeof term === 'string').map((term: Object) => term as string).slice(0, 10);
    this.foregroundChanged();
    const quality = this.settings['lxlia_audio_quality'];
    if (typeof quality === 'string' && ['128k', '320k', 'flac'].includes(quality)) this.quality = quality;
    const style = this.settings['lxlia_native_style'];
    if (typeof style === 'string' && MINE_RADIO_MODES.some((mode: MineRadioMode) => mode.id === style)) this.styleName = style;
    const bgOp = this.settings['lxmine_stage_bg_opacity'];
    if (typeof bgOp === 'number' && Number.isFinite(bgOp)) this.stageBgOpacity = Math.max(0, Math.min(1, bgOp));
    this.loadCustomStageBgImage();
    const mode = this.settings['lxlia_play_mode'];
    const platform=this.settings['lxmine_home_platform'];if(typeof platform==='string'&&['wy','tx','kw','kg'].includes(platform))this.homePlatform=platform;
    if (typeof mode === 'string' && ['列表循环', '单曲循环', '随机播放', '顺序播放'].includes(mode)) this.mode = mode;
    const lyricOffset = this.settings['lxlia_lyric_offset'];
    if (typeof lyricOffset === 'number') this.lyricOffset = Math.max(-10000, Math.min(10000, lyricOffset));
    // 曲库拼贴只随机一次：种子落设置，之后每次启动复用同一排列。
    const mosaicSeed = this.settings['lxmine_mosaic_seed'];
    if (typeof mosaicSeed === 'number' && mosaicSeed > 0) this.libraryMosaicSeed = mosaicSeed;
    else {
      this.libraryMosaicSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
      this.settings['lxmine_mosaic_seed'] = this.libraryMosaicSeed;
      if (this.storeReady) this.save();
    }
  }
  private async persist(): Promise<void> {
    this.settings['lxmine_lyrics'] = this.lyricPrefs;
    this.settings['lxmine_resume_on_startup'] = this.resumeOnStartup;
    this.settings['lxmine_allow_landscape_locked'] = this.allowLandscapeLocked;
    this.settings['lxmine_mix_with_others'] = this.mixWithOthers;
    this.settings['lxmine_refresh_algo_double_tap'] = this.refreshAlgoDoubleTap;
    this.settings['lxmine_lan_auto_sync'] = this.lanAutoSync;
    this.settings['lxmine_home_platform']=this.homePlatform;
    this.settings['lxmine_appearance'] = this.appearance;
    this.settings['lxlia_grip_enabled'] = this.gripEnabled;
    this.settings['lxlia_startup_animation'] = this.startupAnimation;
    this.settings['lxlia_audio_quality'] = this.quality; this.settings['lxlia_native_style'] = this.styleName;
    this.settings['lxmine_stage_bg_opacity'] = this.stageBgOpacity;
    this.settings['lxlia_play_mode'] = this.mode; this.settings['lxlia_lyric_offset'] = this.lyricOffset;
    const data: AppData = { sourceScript: this.sources.find((source: SyncSourcePayload) => source.id === this.activeId)?.script ?? '',
      sourcesJson: JSON.stringify(this.sources), activeSourceId: this.activeId, settingsJson: JSON.stringify(this.settings), playlistsJson: JSON.stringify(this.playlists) };
    await saveAppData(data);
  }
  private stageBgFilePath(): string {
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext | undefined;
    return ctx ? `${ctx.filesDir}/custom_stage_bg.dataurl` : '';
  }
  private loadCustomStageBgImage(): void {
    const path = this.stageBgFilePath();
    if (!path) return;
    try {
      if (fileIo.accessSync(path)) {
        const text = fileIo.readTextSync(path);
        if (text && text.startsWith('data:image/')) this.stageBgImage = text;
      }
    } catch (_) {}
  }
  private async pickStageBgImage(): Promise<void> {
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext | undefined;
    if (!ctx) return;
    let file: fileIo.File | null = null;
    try {
      const docPicker = new picker.DocumentViewPicker(ctx);
      const opts = new picker.DocumentSelectOptions();
      opts.maxSelectNumber = 1;
      opts.fileSuffixFilters = ['.jpg', '.jpeg', '.png', '.webp'];
      const uris = await docPicker.select(opts);
      if (!uris || !uris.length) return;
      const uri = uris[0];
      file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
      const stat = fileIo.statSync(file.fd);
      if (stat.size <= 0 || stat.size > 12 * 1024 * 1024) {
        this.notify('图片不能超过 12MB');
        return;
      }
      const bytes = new ArrayBuffer(stat.size);
      fileIo.readSync(file.fd, bytes);
      const lower = uri.toLowerCase();
      const mime = lower.endsWith('.png') ? 'image/png' : (lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
      const dataUrl = `data:${mime};base64,${buffer.from(bytes).toString('base64')}`;
      const target = this.stageBgFilePath();
      if (target) {
        const out = fileIo.openSync(target, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
        try { fileIo.writeSync(out.fd, dataUrl); } finally { fileIo.closeSync(out.fd); }
      }
      this.stageBgImage = dataUrl;
      this.notify('已更新播放页自定义背景图');
    } catch (_) {
      this.notify('选择背景图失败');
    } finally {
      if (file) { try { fileIo.closeSync(file.fd); } catch (_) {} }
    }
  }
  private clearStageBgImage(): void {
    const path = this.stageBgFilePath();
    if (path) { try { if (fileIo.accessSync(path)) fileIo.unlinkSync(path); } catch (_) {} }
    this.stageBgImage = '';
    this.notify('已恢复默认专辑封面背景');
  }
  private save(): void { this.persist().catch((error: Error) => { this.error = `保存失败：${error.message}`; }); }
  private sourceFromScript(script: string): SyncSourcePayload {
    const name = script.match(/@name\s+([^\r\n*]+)/)?.[1]?.trim() || '自定义音源';
    return { id: `harmony-source-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, name, script, description: '', author: '', version: '', homepage: '', allowShowUpdateAlert: false, importedAt: Date.now() };
  }
  private restoreSource(): void {
    const active = this.sources.find((source: SyncSourcePayload) => source.id === this.activeId);
    if (this.hostReady && this.storeReady && active && !this.sourceReady && !this.sourceActivation) this.activate(active);
  }
  private sourceActivation: Promise<void> | null = null;
  private activationGeneration: number = 0;
  private activate(source: SyncSourcePayload): Promise<void> {
    const activation = this.activateSource(source, ++this.activationGeneration);
    this.sourceActivation = activation;
    activation.finally(() => { if (this.sourceActivation === activation) this.sourceActivation = null; });
    return activation;
  }
  private async activateSource(source: SyncSourcePayload, generation: number): Promise<void> {
    this.sourceReady = false;
    try {
      await this.host.loadSource(source.script, { name: source.name, description: source.description, author: source.author, version: source.version, homepage: source.homepage });
      if (generation !== this.activationGeneration || this.disposed) return;
      this.activeId = source.id ?? ''; this.sourceReady = true; this.save(); this.message = `已启用「${source.name}」`; this.restorePlaybackIfReady();
    } catch (error) { if (generation === this.activationGeneration) this.error = `音源加载失败：${(error as Error).message}`; }
  }
  private async search(more: boolean = false): Promise<void> {
    try { this.getUIContext().getFocusController().clearFocus(); } catch (_) {}
    if (more) return;
    const query = more ? this.submitted : this.keyword.trim(); if (!query) return;
    if (!more) {
      this.searchHistory = [query, ...this.searchHistory.filter((term: string) => term !== query)].slice(0, 10);
      this.settings['lxlia_search_history'] = this.searchHistory;
      this.save();
    }
    const token = ++this.searchToken, platform = this.platform, page = more ? this.page + 1 : 1;
    this.searchOpen = true; this.openedEntity = null; this.loading = true; this.error = '';
    if (!more) { this.results = []; this.entities = []; this.searchProgressAt = 0; }
    try {
      if (this.searchKind !== 'music') {
        const response = await searchCatalogue(this.host, platform, this.searchKind, query, page,()=>token!==this.searchToken||this.disposed,(items: CatalogueEntity[], total: number) => {
          if (token !== this.searchToken || this.disposed) return;
          if (Date.now() - this.searchProgressAt < 600) return;
          this.searchProgressAt = Date.now();
          this.entities = items; this.submitted = query; this.message = `已获取 ${items.length} 条，正在自动获取其余结果…`;
        });
        if (token !== this.searchToken || this.disposed) return;
        this.entities = more ? this.entities.concat(response.items) : response.items;
        this.submitted = query; this.page = 1; this.hasMore = false;
        this.message = response.warning || ''; return;
      }
      const result = await searchAllLx(platform, query, (items:Song[],total:number)=>{
        if(token!==this.searchToken||this.disposed)return;
        if (Date.now() - this.searchProgressAt < 600) return;
        this.searchProgressAt = Date.now();
        this.results=items;this.submitted=query;this.message=`已获取 ${items.length} 条，正在自动获取其余结果…`;
      },()=>token!==this.searchToken||this.disposed);
      if (token !== this.searchToken || this.disposed) return;
      this.results = more ? this.results.concat(result.items) : result.items;
      this.submitted = query; this.page = 1; this.hasMore = false;
      this.message = result.warning || `共 ${result.items.length} 条结果`;
      if (!this.results.length) this.message = '没有找到歌曲，试试其他关键词或平台';
      if (this.hostReady && this.results.some((s: Song) => !s.coverUrl)) {
        hydrateSongCovers(this.host, this.results).then((covers: Map<string, string>) => {
          if (token !== this.searchToken || this.disposed || !covers.size) return;
          this.results = applyCoversToSongs(this.results, covers);
        }).catch(() => {});
      }
    } catch (error) { if (token === this.searchToken) this.error = `搜索失败：${(error as Error).message}`; }
    finally { if (token === this.searchToken) this.loading = false; }
  }
  private async openEntity(entity: CatalogueEntity): Promise<void> {
    try {
      if (entity.song) { await this.playSong(entity.song, this.entities.filter((item: CatalogueEntity) => item.song !== undefined).map((item: CatalogueEntity) => item.song!)); return; }
      if (entity.kind === 'songlist') {
        const lists = parsePlaylists(await this.host.importPlaylist(entity.id, entity.source));
        this.playlists = this.playlists.filter((list: MusicPlaylist) => !lists.some((incoming: MusicPlaylist) => incoming.id === list.id)).concat(lists);
        await this.persist(); this.message = `已导入「${entity.name}」`; this.tab = '资料库'; this.libraryRestoreOffset = 0; this.playlistScroller = new Scroller(); this.openedPlaylist = lists[0] ?? null; return;
      }
      this.loading = true;
      this.openedEntity = entity; this.entitySongs = [];
      const tracks = await catalogueTracks(this.host, entity, 1, (items: Song[], total: number) => {
        if (this.openedEntity?.id !== entity.id) return;
        this.entitySongs = items; this.message = `已获取 ${items.length} 首，正在自动获取其余歌曲…`;
      }, () => this.disposed || this.openedEntity?.id !== entity.id);
      this.entitySongs = tracks.items; this.openedEntity = entity; this.message=tracks.warning||'';this.searchScroller.scrollTo({ xOffset: 0, yOffset: 0 });
    } catch (error) { this.error = (error as Error).message; }
    finally { this.loading = false; }
  }
  private async playSong(song: Song, queue: Song[], startMs: number = 0, autoPlay: boolean = true): Promise<void> {
    if (this.selected && songKey(this.selected) !== songKey(song) && this.positionMs > 1500) {
      recordListenHabit(this.selected, this.positionMs, this.duration || this.selected.durationMs, false);
    }
    clearTimeout(this.assetRetryTimer);
    this.pendingPlayback = null;
    const local = (song.source === 'local' ? this.localMusic.pathFor(song) : '') || this.downloads.offline(song);
    if (!local && !this.sourceReady && !this.sourceActivation) { this.error = '先在设置中启用一个支持此平台的音源'; this.tab = '设置'; return; }
    const token = ++this.playToken;
    const intentId = this.player.beginSwitch(autoPlay);
    this.selected = song; this.shareService.setSong(song); this.coverColors = EMPTY_COVER_COLORS;
    this.coverPalette.colors(song.coverUrl).then((colors: CoverColors) => { if (token === this.playToken && !this.disposed) this.coverColors = colors; });
    this.queue = queue; this.positionMs = Math.max(0, startMs); this.livePositionMs = this.positionMs; this.duration = song.durationMs;
    this.lyrics = []; this.translatedLyrics = []; this.romajiLyrics = []; this.stageTranslations = []; this.resolving = true; this.error = '';
    this.player.setLyricData([], this.lyricOffset);
    this.playbackUrl = '';
    let info = this.songInfo(song);
    try {
      await this.player.pauseForSwitch();
      if (token !== this.playToken || this.disposed) return;
      await this.setLanKeepAlive(false);
      if (token !== this.playToken || this.disposed) return;
      if (!local) {
        while (this.sourceActivation) await this.sourceActivation;
        if (!this.sourceReady) throw new Error('音源尚未就绪，请重新启用音源');
        info = await this.resolveSongInfo(song);
      }
      if (token !== this.playToken || this.disposed) return;
      this.previewRetryKey = '';
      if (local) {
        await this.player.playFile(local, song, startMs, autoPlay, intentId);
        if (token === this.playToken) {
          this.playbackUrl = `file://${local}`;
          this.loadLyrics(info, song, token);
        }
        return;
      }
      const hit = await this.raceAllSourcesForSong(song, [], false);
      if (token !== this.playToken || this.disposed) return;
      const url = hit.url ?? '';
      if (!url) throw new Error('暂未找到可用完整音源，请检查网络或导入更多音源');
      if (hit.sourceId && hit.sourceId !== this.activeId) {
        this.activeId = hit.sourceId;
        this.save();
      }
      await this.player.playUrl(url, song, startMs, autoPlay, intentId);
      if (token === this.playToken) {
        this.playbackUrl = url;
        this.error = '';
        if (hit.switched && hit.sourceName) {
          this.notify(`已自动切换至「${hit.sourceName}」`, 2200);
        }
      }
      // 部分 LX 音源在 musicUrl 请求中缓存歌词，必须等它完成后读取。
      this.loadLyrics(info, song, token);
    } catch (error) {
      const message = (error as Error).message;
      if (token === this.playToken) this.error = this.friendlyPlayError(message);
    }
    finally { if (token === this.playToken) this.resolving = false; }
  }
  private friendlyPlayError(raw: string): string {
    const msg = (raw ?? '').trim();
    if (!msg) return '暂未找到可用完整音源，请稍后重试';
    if (/^[\x00-\x7F]+$/.test(msg) || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|socket|HTTP \d{3}|timeout|status code/i.test(msg)) {
      return '当前歌曲暂无法获取完整音源，请检查网络或导入更多音源';
    }
    return msg;
  }
  private async raceAllSourcesForSong(song: Song, excludeSourceIds: string[] = [], raceAll: boolean = false): Promise<RaceUrlResult> {
    const payload = JSON.stringify({
      sources: this.sources,
      activeId: this.activeId,
      song,
      quality: this.quality,
      excludeSourceIds,
      raceAll,
    });
    const raw = await this.host.catalogue('race-music-url', payload);
    return JSON.parse(raw) as RaceUrlResult;
  }
  private songInfo(song: Song): LxSongInfo {
    const hashes: Record<string, LxHash> = {};
    const sourceHashes = song.hashes ?? {};
    for (const quality of Object.keys(sourceHashes)) hashes[quality] = { hash: sourceHashes[quality] } as LxHash;
    const source = song.source ?? 'kw';
    return { source, songmid: song.id, hash: song.hash, _types: hashes, strMediaMid: song.strMediaMid, songId: song.songId, name: song.name, singer: song.singer,
      albumName: song.albumName, albumId: song.albumId, interval: Math.round(song.durationMs / 1000), type: this.host.quality(source, this.quality) };
  }
  private async resolveSongInfo(song: Song): Promise<LxSongInfo> {
    if (song.source !== 'qishui') return this.songInfo(song);
    const input = JSON.parse(JSON.stringify(song)) as SongMatchInput;
    input.matchSources = this.host.supportedSources('musicUrl');
    const matched = JSON.parse(await this.host.catalogue('match-song', JSON.stringify(input))) as Song;
    return this.songInfo(matched);
  }
  private async downloadSong(song: Song): Promise<void> {
    if (!this.sourceReady) { this.error = '先启用音源再下载'; this.notify(this.error); this.tab = '设置'; return; }
    try {
      const info = await this.resolveSongInfo(song);
      const extension = info.type.includes('flac') ? 'flac' : 'mp3';
      const name = `${song.singer} - ${song.name}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 160);
      const uris = await new picker.DocumentViewPicker(getContext(this) as common.UIAbilityContext).save({ newFileNames: [`${name}.${extension}`] });
      if (!uris.length) return;
      this.notify(`正在获取「${song.name}」的下载地址…`, 2000);
      const url = await this.host.requestMusicUrl(info);
      await this.downloads.start(song, info.type, url, uris[0]);
      this.message = `开始下载「${song.name}」`;
      this.notify(this.message);
    } catch (error) { this.error = `下载失败：${(error as Error).message}`; this.notify(this.error, 3000); }
  }
  private async downloadBatch(songs: Song[]): Promise<void> {
    if (!this.sourceReady) { this.error = '先启用音源再批量下载'; this.notify(this.error); this.tab = '设置'; return; }
    const seen = new Set<string>();
    const queue: Song[] = [];
    let skipped = 0;
    for (const song of songs) {
      const key = songKey(song);
      if (seen.has(key)) continue;
      seen.add(key);
      if (song.source === 'local' || !!this.downloads.offline(song)) {
        skipped += 1;
        continue;
      }
      queue.push(song);
    }
    if (!queue.length) {
      this.notify(skipped > 0 ? '所选歌曲已在本地或已下载完成' : '没有可下载的歌曲', 2200);
      return;
    }
    this.notify(`开始批量解析下载（共 ${queue.length} 首）…`, 2200);
    let cursor = 0;
    let started = 0;
    let failed = 0;
    const worker = async (): Promise<void> => {
      while (cursor < queue.length && !this.disposed) {
        const index = cursor++;
        const song = queue[index];
        try {
          const info = await this.resolveSongInfo(song);
          const url = await this.host.requestMusicUrl(info);
          await this.downloads.start(song, info.type, url);
          started += 1;
        } catch (_) {
          failed += 1;
        }
      }
    };
    const concurrency = Math.min(2, queue.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);
    const parts: string[] = [`已加入下载 ${started} 首`];
    if (skipped > 0) parts.push(`跳过已存在 ${skipped} 首`);
    if (failed > 0) parts.push(`失败 ${failed} 首`);
    this.message = parts.join('，');
    this.notify(this.message, 2800);
  }
  private async exportDownload(item: MusicDownload): Promise<void> {
    try {
      const extension = item.path.split('.').pop() ?? 'mp3';
      const name = `${item.song.singer} - ${item.song.name}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 160);
      const uris = await new picker.DocumentViewPicker(getContext(this) as common.UIAbilityContext).save({ newFileNames: [`${name}.${extension}`] });
      if (!uris.length) return;
      await this.downloads.exportFile(item.id, uris[0]);
      this.notify('已保存到系统所选位置');
    } catch (error) { this.notify(`保存失败：${(error as Error).message}`); }
  }
  private async loadLyrics(info: LxSongInfo, song: Song, token: number, retry: boolean = false): Promise<void> {
    clearTimeout(this.assetRetryTimer);
    let lines: LyricLine[] = retry ? this.lyrics : [], translation: LyricLine[] = retry ? this.translatedLyrics : [], romaji: LyricLine[] = retry ? this.romajiLyrics : [];
    let cover = song.coverUrl;
    let lastPublishedSig = '';
    const publish = (): void => {
      if (token !== this.playToken || this.disposed) return;
      const sig = `${cover ?? ''}|${lines.length}:${lines[0]?.text ?? ''}|${translation.length}:${translation[0]?.text ?? ''}|${romaji.length}:${romaji[0]?.text ?? ''}`;
      if (sig === lastPublishedSig) return;
      lastPublishedSig = sig;
      if (cover && cover !== this.selected?.coverUrl) {
        const updated = JSON.parse(JSON.stringify(song)) as Song;
        updated.coverUrl = cover;
        this.selected = updated;
        const singleMap = new Map<string, string>();
        singleMap.set(songKey(song), cover);
        this.queue = applyCoversToSongs(this.queue, singleMap);
        this.results = applyCoversToSongs(this.results, singleMap);
        const nextRecent = applyCoversToSongs(this.recentSongs, singleMap);
        if (nextRecent !== this.recentSongs) {
          this.recentSongs = nextRecent;
          saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
        }
        let plChanged = false;
        this.playlists = this.playlists.map((list: MusicPlaylist): MusicPlaylist => {
          const patched = playlistCoversPatched(list, singleMap);
          if (patched !== list) plChanged = true;
          return patched;
        });
        if (this.openedPlaylist) {
          this.openedPlaylist = playlistCoversPatched(this.openedPlaylist, singleMap);
        }
        if (plChanged) this.save();
        this.shareService.setSong(updated); this.player.setArtwork(updated);
        this.coverPalette.colors(updated.coverUrl).then((colors: CoverColors) => { if (token === this.playToken && !this.disposed) this.coverColors = colors; });
      }
      this.lyrics = lines; this.translatedLyrics = translation; this.romajiLyrics = romaji; this.updateStageTranslations();
      const sessionLines: SessionLyricLine[] = lines.map((line: LyricLine) => { return { timeMs: line.timeMs, text: line.text } as SessionLyricLine; });
      this.player.setLyricData(sessionLines, this.lyricOffset);
    };
    if (song.source === 'local') {
      lines = parseLrc(this.localMusic.lyricFor(song));
      publish();
      if (!lines.length && this.hostReady && song.name && song.name !== '未知歌曲') {
        try {
          const json = await this.host.catalogue('song-assets', JSON.stringify(song));
          const full = JSON.parse(json) as SongAssets;
          const fallbackLines = parseLrc(full.lyric);
          if (fallbackLines.length) {
            lines = fallbackLines;
            translation = parseLrc(full.tlyric);
            romaji = parseLrc(full.romalrc);
            publish();
          }
        } catch (_) {}
      }
      return;
    }
    const publicPending = this.host.catalogue('song-assets', JSON.stringify(song)).then((json: string) => {
      const full = JSON.parse(json) as SongAssets;
      const publicLines = parseLrc(full.lyric);
      if (publicLines.length > lines.length) lines = publicLines;
      if (!translation.length) translation = parseLrc(full.tlyric);
      if (!romaji.length) romaji = parseLrc(full.romalrc);
      cover = full.coverUrl || cover;
      publish();
    }).catch(() => {});
    try {
      const bundle = await this.host.requestLyricBundle(info);
      const provided = parseLrc(bundle.lxlyric || bundle.lyric || '');
      if (provided.length >= lines.length && provided.length > 0) lines = provided;
      const providedTranslation = parseLrc(bundle.tlyric || '');
      const providedRomaji = parseLrc(bundle.romalrc || bundle.rlyric || '');
      if (providedTranslation.length) translation = providedTranslation;
      if (providedRomaji.length) romaji = providedRomaji;
      publish();
    } catch (_) {}
    await publicPending;
    if (!cover && this.host.supports(info.source, 'pic')) {
      try {
        const picture = (await this.host.request('pic', info, 6000)).trim();
        const url = picture.startsWith('{') ? (JSON.parse(picture) as SongPicture).url : picture;
        if (/^https?:\/\//i.test(url)) cover = url.replace(/^http:/i, 'https:');
        publish();
      } catch (_) {}
    }
    if (!retry && token === this.playToken && !this.disposed && (!lines.length || !cover)) this.assetRetryTimer = setTimeout(() => {
      if (token === this.playToken && !this.disposed && this.selected) this.loadLyrics(info, this.selected, token, true);
    }, 16000);
  }
  private toggle(): void {
    if (this.resolving) return;
    this.setLanKeepAlive(false).catch(() => {});
    if (this.playing) this.player.pause().catch((error: Error) => { this.error = error.message; });
    else this.player.resume().then((resumed: boolean) => {
      if (!resumed && this.selected) this.playSong(this.selected, this.queue, this.positionMs);
    }).catch((error: Error) => { this.error = error.message; });
  }
  private advance(step: number, completed: boolean = false): void {
    if (!this.queue.length || !this.selected) return;
    if (completed) {
      recordListenHabit(this.selected, this.duration || this.selected.durationMs, this.duration || this.selected.durationMs, true);
    }
    const index = this.queue.findIndex((song: Song) => songKey(song) === songKey(this.selected!));
    if (completed && this.mode === '顺序播放' && index >= this.queue.length - 1) return;
    let next = (index + step + this.queue.length) % this.queue.length;
    if (completed && this.mode === '单曲循环') next = Math.max(0, index);
    else if (this.mode === '随机播放' && this.queue.length > 1) next = (Math.max(0, index) + 1 + Math.floor(Math.random() * (this.queue.length - 1))) % this.queue.length;
    this.playSong(this.queue[next], this.queue);
  }
  private syncLikedKeysStorage(): void {
    const fav = this.playlists.find((list: MusicPlaylist) => list.isFavorite);
    const keys = (fav?.songs ?? []).map((item: Song) => songKey(item));
    AppStorage.setOrCreate('lxmine_liked_keys', keys.length ? `|${keys.join('|')}|` : '||');
  }
  private likedSignature(): string {
    const fav = this.playlists.find((list: MusicPlaylist) => list.isFavorite);
    return fav ? `${fav.updatedAt}:${fav.songIds?.length ?? fav.songs?.length ?? 0}` : '0';
  }
  private liked(song: Song): boolean { return this.playlists.some((list: MusicPlaylist) => list.isFavorite && (list.songs ?? []).some((item: Song) => songKey(item) === songKey(song))); }
  private like(song: Song): void {
    let favorite = this.playlists.find((list: MusicPlaylist) => list.isFavorite);
    if (!favorite) { favorite = createPlaylist('我喜欢的', true); this.playlists = this.playlists.concat(favorite); }
    const next = playlistWithSong(favorite, song, this.liked(song));
    this.playlists = this.playlists.map((list: MusicPlaylist) => list.id === next.id ? next : list);
    if (this.openedPlaylist?.id === next.id) this.openedPlaylist = next;
    this.syncLikedKeysStorage();
    this.save();
    this.triggerAutoSync();
  }
  private addToPlaylist(song: Song): void {
    AlertDialog.show({ title: '添加到歌单', message: song.name, buttons: this.playlists.filter((list: MusicPlaylist) => list.kind === 'lx').map((list: MusicPlaylist) => {
      return { value: list.name, action: () => {
        const next = playlistWithSong(list, song);
        this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === next.id ? next : item);
        if (this.openedPlaylist?.id === next.id) this.openedPlaylist = next;
        this.save();
        this.triggerAutoSync();
        this.message = `已添加到「${list.name}」`;
      } } as AlertDialogButtonOptions;
    }) });
  }
  private canSwitchInOpenedPlaylist(): boolean {
    const opened = this.openedPlaylist;
    if (!opened || opened.kind === 'local') return false;
    return this.canDeleteOpenedPlaylist() || !!opened.isFavorite || opened.kind === 'recent';
  }
  private openSwitchPlatform(song: Song, scope: string): void {
    if (song.source === 'local') return;
    this.switchTargetSong = song;
    this.switchTargetScope = scope;
  }
  private applyPlatformSwitch(replacement: Song): void {
    const target = this.switchTargetSong;
    const scope = this.switchTargetScope;
    this.switchTargetSong = null;
    this.switchTargetScope = '';
    if (!target) return;
    const targetKey = songKey(target);
    const replaceInArray = (arr: Song[]): Song[] => {
      const out: Song[] = [];
      const seen = new Set<string>();
      for (const item of arr) {
        const cur = songKey(item) === targetKey ? replacement : item;
        const k = songKey(cur);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(cur);
      }
      return out;
    };
    const wasSelected = this.selected ? songKey(this.selected) === targetKey : false;
    if (scope === 'playlist' && this.openedPlaylist) {
      const opened = this.openedPlaylist;
      if (opened.kind === 'recent') {
        this.recentSongs = replaceInArray(this.recentSongs);
        this.openedPlaylist = { id: opened.id, name: opened.name, kind: 'recent', songs: this.recentSongs, createdAt: 0, updatedAt: Date.now() };
        saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
      } else {
        const updated = playlistSongReplaced(opened, targetKey, replacement);
        this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
        this.openedPlaylist = updated;
        this.save();
        this.triggerAutoSync();
      }
    }
    if (scope === 'queue' || this.queue.some((item: Song) => songKey(item) === targetKey)) {
      this.queue = replaceInArray(this.queue);
    }
    if (wasSelected) {
      this.playSong(replacement, this.queue.length ? this.queue : [replacement], 0, this.playing);
    }
    this.notify(`已切换至 ${platformName(replacement.source ?? '')} 版本`, 1800);
  }
  private canRemoveFromOpenedPlaylist(): boolean {
    const opened = this.openedPlaylist;
    if (!opened) return false;
    return this.canDeleteOpenedPlaylist() || !!opened.isFavorite;
  }
  private removeSongFromOpenedPlaylist(song: Song): void {
    const opened = this.openedPlaylist;
    if (!opened || !this.canRemoveFromOpenedPlaylist()) return;
    if (opened.isFavorite) {
      this.like(song);
      this.notify(`已取消喜欢「${song.name}」`, 1600);
      return;
    }
    const updated = playlistWithoutSongs(opened, new Set<string>([songKey(song)]));
    this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
    this.openedPlaylist = updated;
    this.save();
    this.triggerAutoSync();
    this.notify(`已从歌单移除「${song.name}」`, 1600);
  }
  private saveEditedPlaylist(nextName: string, remainingSongs: Song[]): void {
    const opened = this.openedPlaylist;
    if (!opened) { this.editPlaylistOpen = false; return; }
    let updated: MusicPlaylist = opened;
    if (!opened.isFavorite && nextName.trim() && nextName.trim() !== opened.name) {
      updated = playlistRenamed(updated, nextName.trim());
    }
    const keepKeys = new Set<string>(remainingSongs.map((item: Song) => songKey(item)));
    const removeKeys = new Set<string>();
    for (const item of (updated.songs ?? [])) {
      const k = songKey(item);
      if (!keepKeys.has(k)) removeKeys.add(k);
    }
    updated = playlistWithoutSongs(updated, removeKeys);
    updated = playlistReordered(updated, remainingSongs.map((item: Song) => songKey(item)));
    this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
    this.openedPlaylist = updated;
    this.editPlaylistOpen = false;
    this.save();
    this.triggerAutoSync();
    this.notify('歌单修改已保存', 1600);
  }
  private cycle(field: string): void {
    if (field === 'style') { const index = MINE_RADIO_MODES.findIndex((mode: MineRadioMode) => mode.id === this.styleName); this.styleName = MINE_RADIO_MODES[(index + 1) % MINE_RADIO_MODES.length].id; }
    if (field === 'mode') { const values = ['列表循环', '单曲循环', '随机播放', '顺序播放']; this.mode = values[(values.indexOf(this.mode) + 1) % values.length]; }
    if (field === 'quality') { const values = ['128k', '320k', 'flac']; this.quality = values[(values.indexOf(this.quality) + 1) % values.length]; }
    this.save();
  }
  private openSheet(sheet: string): void {
    this.draft = sheet === '重命名歌单' && this.openedPlaylist ? this.openedPlaylist.name : '';
    this.sheet = sheet;
    this.error = '';
    this.showSheet = true;
    if (sheet === '播放队列' && this.selected) {
      const activeKey = songKey(this.selected);
      setTimeout(() => {
        const idx = this.queue.findIndex((item: Song) => songKey(item) === activeKey);
        if (idx >= 0) {
          try { this.queueScroller.scrollToIndex(idx, true, ScrollAlign.CENTER); } catch (_) {}
        }
      }, 140);
    }
  }
  private async submitSheet(): Promise<void> {
    if (this.busy || !this.draft.trim()) return;
    this.busy = true; this.error = '';
    let createdName = '';
    let renamedName = '';
    let playlistChanged = false;
    try {
      if (this.sheet === '新建歌单') { const created = createPlaylist(this.draft.trim()); this.playlists = this.playlists.concat(created); createdName = created.name; playlistChanged = true; }
      else if (this.sheet === '重命名歌单' && this.openedPlaylist && this.canDeleteOpenedPlaylist()) {
        const updated = playlistRenamed(this.openedPlaylist, this.draft.trim());
        this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
        this.openedPlaylist = updated;
        renamedName = updated.name;
        playlistChanged = true;
      }
      else if (this.sheet === '导入歌单') {
        const lists = parsePlaylists(await this.host.importPlaylist(this.draft.trim(), this.platform === 'all' ? 'wy' : this.platform));
        this.playlists = this.playlists.filter((list: MusicPlaylist) => !lists.some((incoming: MusicPlaylist) => incoming.id === list.id)).concat(lists);
        this.message = `已导入 ${lists.length} 个歌单，共 ${lists.reduce((sum: number, list: MusicPlaylist) => sum + (list.songs?.length ?? 0), 0)} 首`;
        const warnings = lists.map((list: MusicPlaylist) => list.warning ?? '').filter((value: string) => value.length > 0).join('\n');
        this.notify(this.message + (warnings ? '\n' + warnings : ''), warnings ? 8000 : 3000);
        playlistChanged = true;
      } else if (this.sheet === '添加音源') {
        const source = this.sourceFromScript(this.draft);
        await this.host.loadSource(source.script, this.sourceInfo);
        this.sources = this.sources.concat(source); this.activeId = source.id ?? ''; this.sourceReady = true;
      }
      await this.persist(); this.showSheet = false;
      if (playlistChanged) this.triggerAutoSync();
      if (createdName) this.notify(`已创建歌单「${createdName}」`);
      if (renamedName) this.notify(`已重命名为「${renamedName}」`);
    } catch (error) { this.error = (error as Error).message; }
    finally { this.busy = false; this.consumeSharedPlaylist(); }
  }
  private consumeSharedPlaylist(): void {
    if (!this.hostReady || !this.storeReady || this.busy || !this.sharedPlaylist) return;
    const text = this.sharedPlaylist;
    this.sharedPlaylist = '';
    this.openSheet('导入歌单');
    this.draft = text;
    this.submitSheet();
  }
  private async importFile(source: boolean): Promise<void> {
    if (source) { await this.importSourceFiles(); return; }
    let file: fileIo.File | null = null;
    try {
      const uris = await new picker.DocumentViewPicker(getContext(this) as common.UIAbilityContext).select({ maxSelectNumber: 1 });
      if (!uris.length) return;
      file = fileIo.openSync(uris[0], fileIo.OpenMode.READ_ONLY);
      const size = fileIo.statSync(file.fd).size;
      if (size > (source ? 8 : 32) * 1024 * 1024) throw new Error(`文件超过 ${source ? 8 : 32} MB`);
      const bytes = new ArrayBuffer(size); fileIo.readSync(file.fd, bytes);
      const text = source ? buffer.from(bytes).toString() : await decodePlaylistFile(bytes, (getContext(this) as common.UIAbilityContext).cacheDir);
      this.openSheet(source ? '添加音源' : '导入歌单'); this.draft = text;
      await this.submitSheet();
    } catch (error) { this.error = `导入失败：${(error as Error).message}`; }
    finally { if (file) fileIo.closeSync(file.fd); }
  }
  private async importSourceFiles(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try {
      const uris = await new picker.DocumentViewPicker(getContext(this) as common.UIAbilityContext).select({ maxSelectNumber: 500 });
      if (!uris.length) return;
      const batch = new SourceImportBatch(this.sources);
      for (const uri of uris) {
        let file: fileIo.File | null = null;
        let name = uri.split('/').pop() || '音源文件';
        try {
          name = decodeURIComponent(name);
          file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
          const size = (await fileIo.stat(file.fd)).size;
          if (size > 8 * 1024 * 1024) throw new Error('音源文件超过 8 MB');
          const bytes = new ArrayBuffer(size);
          const read = await fileIo.read(file.fd, bytes);
          if (read !== size) throw new Error('文件未能完整读取');
          batch.add(name, buffer.from(bytes).toString());
        } catch (error) { batch.fail(name, (error as Error).message || '无法读取文件'); }
        finally { if (file) await fileIo.close(file.fd).catch(() => {}); }
      }
      if (batch.imported.length) {
        this.sources = this.sources.concat(batch.imported);
        if (!this.sources.some((item: SyncSourcePayload) => item.id === this.activeId)) {
          this.activeId = batch.imported[0].id ?? ''; this.sourceReady = false;
        }
        await this.persist();
        this.restoreSource();
      }
      this.showSheet = false; this.message = batch.summary();
      AlertDialog.show({ title: '音源导入结果', message: batch.report(),
        confirm: { value: '完成', action: () => {} } });
    } catch (error) { this.error = `导入失败：${(error as Error).message}`; }
    finally { this.busy = false; this.consumeSharedPlaylist(); }
  }
  private removeSource(source: SyncSourcePayload): void {
    AlertDialog.show({ title: '移除音源', message: `移除「${source.name}」？`, primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '移除', action: () => {
      this.sources = this.sources.filter((item: SyncSourcePayload) => item.id !== source.id);
      if (source.id === this.activeId) { this.activeId = ''; this.sourceReady = false; }
      this.save();
    } } });
  }
  private async send(device: LanDevice): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.message = `等待「${device.name}」确认接收…`;
    try {
      await this.persist();
      const bundle: SyncBundle = { protocol: 'lxlia-lansync/1', version: 1, createdAt: Date.now(), device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        settings: this.settings, playlists: this.playlists, sources: this.sources, activeSourceId: this.activeId };
      let accepted: boolean;
      if (device.receiveMode === 'pull') {
        const confirmation = this.syncServer.offerPush(device.id, JSON.stringify(bundle));
        this.discovery?.announceNow();
        accepted = await confirmation;
      } else accepted = await pushBundle(device, bundle);
      this.message = accepted ? `已同步到「${device.name}」` : '对方未接受同步';
    } catch (error) { this.message = `发送失败：${(error as Error).message}`; }
    finally { this.busy = false; }
  }
  private async sendDirect(target: string): Promise<void> {
    const raw = target.trim();
    if (!raw || this.busy) return;
    const colon = raw.lastIndexOf(':');
    const address = colon > 0 ? raw.slice(0, colon).trim() : raw;
    const port = colon > 0 ? Number(raw.slice(colon + 1).trim()) : 41300;
    if (!address || !Number.isFinite(port) || port <= 0 || port > 65535) {
      this.message = '请输入有效的 IP:端口（例如 192.168.1.10:41300）';
      this.notify(this.message);
      return;
    }
    this.busy = true;
    this.message = `正在直连 ${address}:${port} 等待确认…`;
    try {
      await this.persist();
      const bundle: SyncBundle = { protocol: 'lxlia-lansync/1', version: 1, createdAt: Date.now(), device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        settings: this.settings, playlists: this.playlists, sources: this.sources, activeSourceId: this.activeId };
      const accepted = await pushDirect(address, port, bundle, '/lxlia-sync/push', 130000);
      this.message = accepted ? `已直连同步到 ${address}:${port}` : '对方未接受同步';
      this.notify(this.message);
    } catch (error) {
      this.message = `直连发送失败：${(error as Error).message}`;
      this.notify(this.message, 3000);
    } finally { this.busy = false; }
  }
  private triggerAutoSync(): void {
    if (!this.lanAutoSync || Date.now() < this.suppressAutoSyncUntil || this.disposed) return;
    if (this.autoSyncTimer >= 0) clearTimeout(this.autoSyncTimer);
    this.autoSyncTimer = setTimeout(() => {
      this.autoSyncTimer = -1;
      if (!this.lanAutoSync || this.disposed) return;
      const peers = this.devices.filter((item: LanDevice) => item.autoSyncPlaylists === true && item.port > 0);
      if (!peers.length) return;
      const bundle: SyncBundle = { protocol: 'lxlia-lansync/1', version: 1, createdAt: Date.now(), device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        settings: {}, playlists: this.playlists, sources: [], activeSourceId: '' };
      for (const peer of peers) {
        pushDirect(peer.address, peer.port, bundle, '/lxlia-sync/auto-playlists', 10000).catch(() => {});
      }
    }, 1200);
  }
  /** 用户确认后校验全部数据，再持久化，最后回执；失败保留原数据。 */
  private async respond(accepted: boolean): Promise<void> {
    const incoming = this.incoming;
    if (!incoming || this.applying) return;
    this.applying = true;
    try {
      if (accepted) {
        const bundle = JSON.parse(incoming.bundleJson) as SyncBundle;
        const playlists = parsePlaylists(JSON.stringify(bundle.playlists));
        for (const source of bundle.sources) if (typeof source.script !== 'string' || typeof source.id !== 'string' || typeof source.name !== 'string') throw new Error('音源格式错误');
        bundle.sources = uniqueSyncSources(bundle.sources);
        const activeId = bundle.activeSourceId && bundle.sources.some((source: SyncSourcePayload) => source.id === bundle.activeSourceId) ? bundle.activeSourceId : '';
        const data: AppData = { sourceScript: '', sourcesJson: JSON.stringify(bundle.sources), activeSourceId: activeId, settingsJson: JSON.stringify(bundle.settings), playlistsJson: JSON.stringify(playlists) };
        await saveAppData(data);
        this.sources = bundle.sources; this.activeId = activeId; this.sourceReady = false;
        this.settings = bundle.settings; this.restoreSettings(); this.playlists = playlists; this.openedPlaylist = null;
        this.restoreSource(); this.message = `已接收「${incoming.peerName}」的数据`;
      }
      await this.syncServer.respond(incoming.id, accepted); this.incoming = null;
    } catch (error) {
      this.error = `同步失败：${(error as Error).message}`;
      await this.syncServer.respond(incoming.id, false, this.error); this.incoming = null;
    } finally { this.applying = false; }
  }
  private async configureWindow(): Promise<void> {
    try {
      const win = await window.getLastWindow(getContext(this) as common.UIAbilityContext);
      this.mainWindow = win;
      await win.setWindowLayoutFullScreen(true);
      const area = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      this.statusInset = this.getUIContext().px2vp(area.topRect.height);
      this.bottomInset = Math.max(12, this.getUIContext().px2vp(area.bottomRect.height));
      this.updateSystemBars();
    } catch (_) {}
  }
  /** 只有播放详情页允许旋转；其余页面锁竖屏，平板与车机遵循系统旋转锁定。 */
  private applyOrientation(detail: boolean): void {
    const win = this.mainWindow;
    if (!win) return;
    const freeRotate = deviceInfo.deviceType === 'car' || deviceInfo.deviceType === 'tablet';
    if (freeRotate) {
      win.setPreferredOrientation(window.Orientation.AUTO_ROTATION_RESTRICTED).catch((error: Error) => console.warn(`[Orientation] ${error.message}`));
      return;
    }
    const detailMode = this.allowLandscapeLocked ? window.Orientation.AUTO_ROTATION : window.Orientation.AUTO_ROTATION_RESTRICTED;
    const target = detail ? detailMode : window.Orientation.PORTRAIT;
    win.setPreferredOrientation(target).catch((error: Error) => console.warn(`[Orientation] ${error.message}`));
  }
  /** 点一栏里的圆球展开成两栏：清掉滚动方向累计，避免展开后又被惯性滚动立刻收回。 */
  private expandDock(): void {
    this.dockCollapsed = false;
    this.scrollTravel = 0;
    this.lastScrollOffset = -1;
    this.suppressScrollUntil = Date.now() + 600;
  }
  /** 详情页默认显示控件，双指纵向滑动切换沉浸，关闭详情页时恢复控件。 */
  private syncStageControls(): void {
    if (!this.showPlayer && !this.stageControlsVisible) {
      this.stageControlsVisible = true;
    }
  }
  private toggleStageControls(show: boolean): void {
    if (!this.showPlayer) return;
    if (this.stageControlsVisible === show) return;
    this.stageControlsVisible = show;
  }
  /** 双指上滑显示控件，下滑进入沉浸；若两指间距明显变化则属于双指缩放舞台，不触发沉浸切换。 */
  private stageGestureTouch(event: TouchEvent): void {
    if (!this.showPlayer || !this.foreground || this.commentsOpen || event.type === TouchType.Cancel) {
      this.twoFingerActive = false; this.twoFingerStartY = -1; this.twoFingerLastY = -1;
      this.twoFingerStartDist = 0; this.twoFingerLastDist = 0;
      return;
    }
    const dist = event.touches.length >= 2
      ? Math.hypot((event.touches[0].x || 0) - (event.touches[1].x || 0), event.touches[0].y - event.touches[1].y)
      : 0;
    if (event.type === TouchType.Down) {
      this.twoFingerActive = event.touches.length >= 2;
      this.twoFingerStartY = this.twoFingerActive ? (event.touches[0].y + event.touches[1].y) / 2 : -1;
      this.twoFingerLastY = this.twoFingerStartY;
      this.twoFingerStartDist = this.twoFingerActive ? dist : 0;
      this.twoFingerLastDist = this.twoFingerStartDist;
      return;
    }
    if (event.type === TouchType.Move) {
      if (!this.twoFingerActive && event.touches.length >= 2) {
        this.twoFingerActive = true;
        this.twoFingerStartY = (event.touches[0].y + event.touches[1].y) / 2;
        this.twoFingerStartDist = dist;
        this.twoFingerLastDist = this.twoFingerStartDist;
      }
      if (this.twoFingerActive && event.touches.length >= 2) {
        this.twoFingerLastY = (event.touches[0].y + event.touches[1].y) / 2;
        this.twoFingerLastDist = dist;
      }
      return;
    }
    if (event.type === TouchType.Up) {
      if (this.twoFingerActive && this.twoFingerStartY >= 0 && this.twoFingerLastY >= 0) {
        const delta = this.twoFingerLastY - this.twoFingerStartY;
        const pinched = Math.abs(this.twoFingerLastDist - this.twoFingerStartDist) > 20;
        if (!pinched && Math.abs(delta) > 36) this.toggleStageControls(delta < 0);
      }
      this.twoFingerActive = false; this.twoFingerStartY = -1; this.twoFingerLastY = -1;
      this.twoFingerStartDist = 0; this.twoFingerLastDist = 0;
    }
  }
  private foregroundChanged(): void {
    if (this.foreground) this.prewarmStages();
    if (!this.foreground) this.savePlayback(true);
    if (this.foreground !== this.lastForeground) {
      this.lastForeground = this.foreground;
      if (this.foreground && !this.disposed) this.discovery?.restart().then(() => { this.lanSsid = this.discovery?.getSsid() ?? ''; }).catch((error: Error) => { this.message = `重新连接局域网失败：${error.message}`; });
    }
    this.grip.stop(); this.gripSide = 'center';
    if (this.foreground && this.gripEnabled && !this.disposed) {
      this.grip.start(getContext(this) as common.UIAbilityContext, (side: GripSide) => {
        this.getUIContext().animateTo({ curve: curves.springMotion(0.44, 0.85) }, () => { this.gripSide = side; });
      }).then((available: boolean | null) => {
        if (available === false && this.foreground && this.gripEnabled) { this.gripEnabled = false; this.message = '握姿感知未获授权或此设备暂不支持，播控保持常规布局'; this.save(); }
      });
    }
  }
  private askIncoming(): void {
    const request = this.incoming; if (!request) return;
    this.promptedIncoming = request.id;
    this.getUIContext().showAlertDialog({ title: '接收同步',
      message: `「${request.peerName}」将发送 ${request.summary.playlists} 个歌单、${request.summary.sources} 个音源及 ${request.summary.settings} 项设置。接收后覆盖本机对应数据。`,
      autoCancel: false, systemMaterial: musicMenuMaterial(), primaryButton: { value: '拒绝', action: () => { this.respond(false); } },
      secondaryButton: { value: '接收并覆盖', action: () => { this.respond(true); } } });
  }
  @Builder private songListHeader($$: SongListInput) {
      if ($$.scroller === this.searchScroller && this.searchOpen) {
        ListItem() { Text(`${platformName(this.platform)} · ${$$.songs.length} 首`).fontSize(12).fontColor(MUTED).padding({ top: 12, bottom: 16 }) }
      }
      if ($$.scroller === this.playlistScroller && this.openedPlaylist && this.listSearchOpen) {
        ListItem() { this.listSearchBar() }
      }
      if ($$.scroller === this.playlistScroller && this.openedPlaylist) {
        ListItem() {
          SongListTools({ countText: `${$$.songs.length} 首歌曲`,
            disabled: !$$.songs.length,
            showDelete: this.canDeleteOpenedPlaylist(),
            showEdit: this.canDeleteOpenedPlaylist(),
            showBatchDownload: $$.songs.length > 0 && this.openedPlaylist.kind !== 'local',
            onPlayAll: () => { if ($$.songs.length) this.playSong($$.songs[0], $$.songs); },
            onSort: (mode: string) => { this.listSortMode = mode; },
            onManual: () => this.openManualOrder(),
            onDelete: () => this.deleteOpenedPlaylist(),
            onRename: () => this.openSheet('重命名歌单'),
            onBatchDelete: () => { this.editPlaylistOpen = true; },
            onBatchDownload: () => { this.downloadBatch($$.songs); } })
        }
      }
      if ($$.scroller === this.searchScroller && this.searchOpen) {
        ListItem() {
          SongListTools({ countText: `${$$.songs.length} 首歌曲`, disabled: !$$.songs.length,
            showBatchDownload: $$.songs.length > 0,
            onPlayAll: () => { if ($$.songs.length) this.playSong($$.songs[0], $$.songs); },
            onSort: (mode: string) => { this.listSortMode = mode; },
            onManual: () => this.openManualOrderFor(this.openedEntity ? this.entitySongs : this.results),
            onBatchDownload: () => { this.downloadBatch($$.songs); } })
        }
      }
  }
  @Builder private songList($$: SongListInput) {
    SongListView({ songs: $$.songs, scroller: $$.scroller, wide: this.wide,
      selectedKey: this.selected ? songKey(this.selected) : '',
      likedSignature: this.likedSignature(),
      contentTop: $$.scroller === this.queueScroller ? 0 : this.headerHeight(),
      contentBottom: $$.scroller === this.queueScroller ? 16 : this.searchOpen ? 150 : 180,
      showRemove: $$.scroller === this.playlistScroller && this.canRemoveFromOpenedPlaylist(),
      showSwitchPlatform: $$.scroller === this.queueScroller || ($$.scroller === this.playlistScroller && this.canSwitchInOpenedPlaylist()),
      removeLabel: this.openedPlaylist?.isFavorite ? '取消喜欢' : '从歌单移除',
      header: () => { this.songListHeader($$); }, likedSong: (song: Song) => this.liked(song),
      onPlay: (song: Song, context: Song[]) => { this.playSong(song, context); },
      onLike: (song: Song) => this.like(song), onMore: (song: Song) => this.addToPlaylist(song),
      onDownload: (song: Song) => this.downloadSong(song),
      onRemove: (song: Song) => this.removeSongFromOpenedPlaylist(song),
      onSwitchPlatform: (song: Song) => this.openSwitchPlatform(song, $$.scroller === this.queueScroller ? 'queue' : 'playlist'),
      onScroll: (offset: number) => { if ($$.scroller !== this.queueScroller) this.homeScroll(offset); } })
  }
  private compactHeader(): boolean { return this.discoveryCompact || this.viewportHeight < 500; }
  private secondaryDock(): boolean { return this.settingsPanel !== 'main' || !!((this.feedSection && !this.feedClosing) || this.openedPlaylist || this.downloadsOpen || (this.sourcesOpen && !this.sourcesClosing)); }
  private feedSectionTitle(): string {
    if (this.feedSection === 'forYou') return '猜你喜欢';
    if (this.feedSection === 'playlists') return '推荐歌单';
    if (this.feedSection === 'newSongs') return '每周新歌';
    if (this.feedSection === 'charts') return '排行榜';
    if (this.feedSection === 'similar') return '相似推荐';
    if (this.feedSection === 'recent') return '最近常听';
    if (this.feedSection === 'library') return '我的歌单';
    return this.homeFeed?.sections?.find((section)=>section.id===this.feedSection)?.title??'更多';
  }
  private feedSectionSubtitle(): string {
    let count = 0;
    if (this.feedSection === 'forYou') count = this.homeFeed?.forYou?.length ?? 0;
    else if (this.feedSection === 'playlists') count = this.homeFeed?.playlists.length ?? 0;
    else if (this.feedSection === 'newSongs') count = this.homeFeed?.newSongs.length ?? 0;
    else if (this.feedSection === 'charts') count = this.homeFeed?.charts.length ?? 0;
    else if (this.feedSection === 'similar') count = this.homeFeed?.similar.length ?? 0;
    else if (this.feedSection === 'recent') count = (this.selected ? 1 : 0) + this.playlists.length;
    else if (this.feedSection === 'library') count = this.playlists.length;
    return count > 0 ? `全部 ${count} 项` : '';
  }
  private feedSectionPlaylists(): FeedPlaylist[] {
    if (this.feedSection === 'charts') return this.homeFeed?.charts ?? [];
    if (this.feedSection === 'playlists') return this.homeFeed?.playlists ?? [];
    return this.homeFeed?.sections?.find((section)=>section.id===this.feedSection)?.items??[];
  }
  private feedSectionSongs(): Song[] {
    if (this.feedSection === 'forYou') return this.homeFeed?.forYou ?? [];
    if (this.feedSection === 'newSongs') return this.homeFeed?.newSongs ?? [];
    if (this.feedSection === 'similar') return this.homeFeed?.similar ?? [];
    if (this.feedSection === 'recent' && this.selected) return [this.selected];
    return [];
  }
  private feedSectionLocal(): MusicPlaylist[] {
    if (this.feedSection === 'recent' || this.feedSection === 'library') return this.playlists;
    return [];
  }
  /** 横幅播放键：不进列表页——静默取歌后直接从第一首开播；已在播则暂停/恢复切换。 */
  private async playFeedFromHome(item: FeedPlaylist): Promise<void> {
    if (this.openedFeedSourceId === item.id && this.selected) { this.toggle(); return; }
    let songs: Song[] = [];
    try {
      if (item.id === 'daily-30') songs = this.homeFeed?.dailySongs ?? this.homeFeed?.newSongs.slice(0, 30) ?? [];
      else if (item.parts && item.parts.length) songs = await loadMergedChartSongs(this.host, item);
      else if (item.source) songs = (await platformFeedSongs(this.host, item)).items;
      else songs = await loadFeedPlaylistSongs(item.id);
    } catch (error) { this.error = `播放失败：${(error as Error).message}`; return; }
    if (!songs.length) { this.error = '歌单暂时没有可播放歌曲'; return; }
    this.openedFeedSourceId = item.id;
    this.playSong(songs[0], songs);
  }
  private openFeedSection(section: string, x: number = 0, y: number = 0, size: number = 36): void {
    clearTimeout(this.feedCloseTimer);
    this.feedOpening = true;
    this.feedClosing = false;
    this.feedReadyAt = Date.now() + 350;
    if (x > this.viewportWidth || y > this.viewportHeight || size > 60) {
      x = this.getUIContext().px2vp(x); y = this.getUIContext().px2vp(y); size = this.getUIContext().px2vp(size);
    }
    this.feedAnchorX = x; this.feedAnchorY = y; this.feedAnchorSize = Math.max(24, size || 36);
    this.feedSection = section;
    const spec=this.homeFeed?.sections?.find((item:FeedSection)=>item.id===section);const platform=this.homePlatform;
    if(spec?.request){
      // 分类/榜单类板块按需拉取：详情页先显示加载圈，数据回填后消失。
      this.feedSectionLoading = true;
      loadPlatformSection(this.host,spec.request,()=>this.disposed||this.feedSection!==section||this.homePlatform!==platform).then((items:FeedPlaylist[])=>{
        const feed=this.homeFeed;if(!feed||this.disposed||this.feedSection!==section||this.homePlatform!==platform)return;
        const sections=feed.sections?.map((item:FeedSection):FeedSection=>({id:item.id,title:item.title,kind:item.kind,items:item.id===section?items:item.items,error:item.error,request:item.request}));
        this.homeFeed={source:feed.source,sections,playlists:section==='playlists'?items:feed.playlists,newSongs:feed.newSongs,charts:section==='charts'?items:feed.charts,similar:feed.similar,daily:feed.daily,dailySongs:feed.dailySongs};
        this.feedSectionLoading = false;
      }).catch((error:Error)=>{if(this.feedSection===section){this.message=error.message;this.feedSectionLoading = false;}});
    }
    if(section==='similar'&&this.selected){
      const seed=this.selected;
      this.feedSectionLoading = true;
      searchAllLx(this.homePlatform as LxSearchSource,seed.singer||seed.name,()=>{},()=>this.feedSection!=='similar'||this.disposed).then((result)=>{
        if(this.feedSection!=='similar'||this.disposed)return;
        const feed=this.homeFeed;if(!feed)return;
        this.homeFeed={source:feed.source,sections:feed.sections,playlists:feed.playlists,newSongs:feed.newSongs,charts:feed.charts,similar:result.items.filter((song:Song)=>songKey(song)!==songKey(seed))};
        if(result.warning)this.message=result.warning;
        this.feedSectionLoading = false;
      }).catch((error:Error)=>{this.error=error.message;this.feedSectionLoading = false;});
    }
    this.searchOpen = false; this.openedEntity = null; this.openedPlaylist = null; this.downloadsOpen = false;
    this.feedReveal = 0;
    this.getUIContext().animateTo({ curve: curves.springMotion(0.46, 0.82) }, () => { this.feedReveal = 1; });
    setTimeout(() => { this.feedOpening = false; try { this.feedScroller.scrollTo({ xOffset: 0, yOffset: 0 }); } catch (_) {} }, 0);
  }
  private closeFeedSection(): void {
    clearTimeout(this.feedCloseTimer);
    this.feedClosing = true;
    this.getUIContext().animateTo({ curve: curves.springMotion(0.58, 0.9) }, () => { this.feedReveal = 0; });
    this.feedCloseTimer = setTimeout(() => {
      // 分类详情是临时板块：离开后从首页 sections 移除，首页底部不会多出板块。
      const feed = this.homeFeed;
      if (feed && this.feedSection.startsWith('category-')) {
        feed.sections = (feed.sections ?? []).filter((section: FeedSection) => section.id !== this.feedSection);
      }
      this.feedSection = ''; this.feedClosing = false;
    }, 420);
  }
  private openSources(): void {
    clearTimeout(this.sourcesCloseTimer);
    try { this.settingsRestoreOffset = this.settingsScroller.currentOffset().yOffset; } catch (_) {}
    this.sourcesReveal = 0; this.sourcesClosing = false; this.sourcesOpen = true; this.discoveryCompact = false;
    setTimeout(() => {
      try { this.settingsScroller.scrollTo({ xOffset: 0, yOffset: 0 }); } catch (_) {}
      this.getUIContext().animateTo({ curve: curves.springMotion(0.5, 0.9) }, () => { this.sourcesReveal = 1; });
    }, 16);
  }
  private closeSources(): void {
    clearTimeout(this.sourcesCloseTimer);
    this.sourcesClosing = true;
    this.getUIContext().animateTo({ curve: curves.springMotion(0.5, 0.9) }, () => { this.sourcesReveal = 0; });
    const targetOffset = this.settingsRestoreOffset;
    this.sourcesCloseTimer = setTimeout(() => {
      this.sourcesOpen = false; this.sourcesClosing = false; this.sourcesReveal = 1;
      setTimeout(() => { try { this.settingsScroller.scrollTo({ xOffset: 0, yOffset: targetOffset }); } catch (_) {} }, 16);
    }, 300);
  }
  private openDownloads(fromTab: string): void {
    if (fromTab === '设置') {
      try { this.settingsRestoreOffset = this.settingsScroller.currentOffset().yOffset; } catch (_) {}
    }
    this.downloadsReturnTab = fromTab;
    this.settingsPanel = 'main';
    this.tab = '资料库';
    this.downloadsOpen = true;
    this.openedPlaylist = null;
  }
  private closeDownloads(): void {
    const returnTab = this.downloadsReturnTab || '资料库';
    this.downloadsOpen = false;
    this.tab = returnTab;
    if (returnTab === '设置') {
      const targetOffset = this.settingsRestoreOffset;
      setTimeout(() => { try { this.settingsScroller.scrollTo({ xOffset: 0, yOffset: targetOffset }); } catch (_) {} }, 16);
    }
  }
  // 歌单详情使用独立 Scroller；打开时换新实例，网格的滚动偏移不会带进详情。
  private closeOpenedPlaylist(): void {
    const returnTab = this.playlistReturnTab;
    const returnFeed = this.playlistReturnFeed;
    const feedOffset = this.playlistReturnFeedOffset;
    const homeOffset = this.playlistReturnHomeOffset;
    this.openedPlaylist = null; this.openedFeedSourceId = '';
    this.playlistReturnFeed = '';
    if (returnFeed) {
      this.tab = returnTab || '发现';
      this.feedSection = returnFeed;
      this.feedClosing = false;
      this.feedOpening = false;
      this.feedReveal = 1;
      this.feedReadyAt = Date.now() + 350;
      this.discoveryCompact = false;
      for (const delay of [80, 220, 520]) {
        setTimeout(() => { try { this.feedScroller.scrollTo({ xOffset: 0, yOffset: feedOffset }); } catch (_) {} }, delay);
      }
      return;
    }
    if (returnTab) this.tab = returnTab;
    for (const delay of [80, 220, 520]) {
      setTimeout(() => {
        try {
          if (returnTab === '资料库') this.libraryScroller.scrollTo({ xOffset: 0, yOffset: this.libraryRestoreOffset });
          else if (returnTab === '发现') this.homeScroller.scrollTo({ xOffset: 0, yOffset: homeOffset });
        } catch (_) {}
      }, delay);
    }
  }
  private feedSectionChanged(): void {
    if (this.feedSection && !this.feedOpening && !this.feedClosing && this.feedReveal === 0) this.feedReveal = 1;
  }
  private feedDim(): number { return this.feedSection ? this.feedReveal : 0; }
  @LocalBuilder private feedOverlay() {
    if (this.feedSection) {
      Stack({ alignContent: Alignment.TopStart }) {
        FeedSectionPage({ playlists: this.feedSectionPlaylists(), songs: this.feedSectionSongs(), localPlaylists: this.feedSectionLocal(),
          wide: this.wide, contentTop: this.statusInset + 82, scroller: this.feedScroller, emptyText: '这里还没有内容',
          sectionLoading: this.feedSectionLoading,
          selectedKey: this.selected ? songKey(this.selected) : '',
          likedSignature: this.likedSignature(),
          likedSong: (song: Song) => this.liked(song), onLikeSong: (song: Song) => this.like(song),
          onAddToPlaylist: (song: Song) => this.addToPlaylist(song), onDownloadSong: (song: Song) => this.downloadSong(song),
          onOpenFeed: (item: FeedPlaylist) => { if (Date.now() < this.feedReadyAt) return; let offset = 0; try { offset = this.feedScroller.currentOffset().yOffset; } catch (_) {} this.openFeedPlaylist(item, false, offset).catch(() => {}); },
          onPlaySong: (song: Song, queue: Song[]) => { if (Date.now() < this.feedReadyAt) return; this.playSong(song, queue).catch((error: Error) => { this.error = error.message; }); },
          onPlaySongs: (songs: Song[]) => { if (Date.now() < this.feedReadyAt) return; if (songs.length) this.playSong(songs[0], songs).catch((error: Error) => { this.error = error.message; }); },
          statusInset: this.statusInset, bottomInset: this.bottomInset,
          onOpenLocal: (playlist: MusicPlaylist) => { if (Date.now() < this.feedReadyAt) return; this.rememberPlaylistContext(); this.openedPlaylist = playlist; this.tab = '资料库'; this.feedSection = ''; this.discoveryCompact = false; this.hydrateOpenedListCovers().catch(() => {}); },
          onScroll: (offset: number) => {} })
        PageHeader({ title: this.feedSectionTitle(), subtitle: this.feedSectionSubtitle(), wide: this.wide,
          topInset: this.statusInset, backLabel: '返回首页', onBack: () => this.closeFeedSection() })
          .position({ x: 0, y: 0 })
      }.width('100%').height('100%').clip(false)
        .opacity(this.feedReveal)
        .translate({ y: (1 - this.feedReveal) * 18 })
        .hitTestBehavior(HitTestMode.Default).id('feed-overlay')
    }
  }
  private headerSubtitle(): string {
    if (this.tab === '资料库') return `${this.playlists.length} 个歌单`;
    return '';
  }
  private primaryTitle(): string {
    if (this.tab === '发现') return 'LxMine';
    if (this.tab === '资料库') return '曲库';
    return '设置';
  }
  /** 二级及以下页面统一交给 PageHeader；根 Navigation 标题区不再为每种页面各拼一套头部。 */
  private secondaryHeader(): boolean {
    return !!this.openedPlaylist || this.downloadsOpen || this.settingsPanel !== 'main' || this.sourcesOpen || (this.tab === '发现' && this.searchOpen);
  }
  private secondaryTitle(): string {
    if (this.openedPlaylist) return this.openedPlaylist.name;
    if (this.downloadsOpen) return '下载';
    if (this.sourcesOpen) return '音源';
    if (this.settingsPanel === 'lyrics') return '歌词设置';
    if (this.settingsPanel === 'sync') return '局域网同步';
    if (this.settingsPanel === 'car') return 'HiCar';
    if (this.tab === '发现' && this.searchOpen) return this.openedEntity?.name ?? '搜索';
    return 'LxMine';
  }
  private secondarySubtitle(): string {
    if (this.openedPlaylist) return this.openedFeedLoading && !(this.openedPlaylist.songs?.length) ? '' : `${this.openedPlaylist.songs?.length ?? 0} 首歌曲`;
    if (this.downloadsOpen) return this.downloadItems.length ? `${this.downloadItems.length} 个下载` : '';
    if (this.sourcesOpen) return `${this.sources.length} 个音源`;
    if (this.tab === '发现' && this.searchOpen && !this.openedEntity) return '公共音乐检索';
    return '';
  }
  private secondaryBackLabel(): string {
    if (this.downloadsOpen) return this.downloadsReturnTab === '设置' ? '返回设置' : '返回曲库';
    if (this.sourcesOpen || this.settingsPanel !== 'main') return '返回设置';
    if (this.tab === '发现' && this.searchOpen) return '返回首页';
    return '返回';
  }
  private secondaryBack(): () => void {
    if (this.downloadsOpen) return () => this.closeDownloads();
    if (this.sourcesOpen) return () => this.closeSources();
    if (this.settingsPanel !== 'main') return () => this.openSettingsPanel('main');
    if (this.tab === '发现' && this.searchOpen) return () => { if (this.openedEntity) this.openedEntity = null; else this.closeSearch(); };
    if (this.openedPlaylist) return () => this.closeOpenedPlaylist();
    return () => {};
  }
  private headerHeight(): number {
    return (this.tab === '发现' && !this.compactHeader() ? (this.searchOpen ? 190 : 148) : 82) + this.statusInset;
  }
  private searchPad(): number { return this.wide ? 32 : 20; }
  private searchBarWidth(): number { return this.viewportWidth - this.searchPad() * 2; }
  private searchBarY(): number { return this.statusInset + 70; }
  private searchBallX(): number { return this.viewportWidth - this.searchPad() - 44; }
  private searchBallY(): number { return this.statusInset + 10; }
  private searchEntryX(): number { return this.searchPad() + (this.searchBallX() - this.searchPad()) * this.searchMorph; }
  private searchEntryY(): number { return this.searchBarY() + (this.searchBallY() - this.searchBarY()) * this.searchMorph; }
  private searchEntryWidth(): number { return this.searchBarWidth() + (44 - this.searchBarWidth()) * this.searchMorph; }
  private searchEntryHeight(): number { return 48 - 4 * this.searchMorph; }
  private searchEntryFade(): number { return Math.max(0, 1 - this.searchMorph * 2.2); }
  @LocalBuilder private header() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.secondaryHeader()) {
        Column({ space: 12 }) {
          PageHeader({ title: this.secondaryTitle(), subtitle: this.secondarySubtitle(), wide: this.wide,
            topInset: this.statusInset, backLabel: this.secondaryBackLabel(), onBack: this.secondaryBack() })
          if (this.tab === '发现' && this.searchOpen) {
            // 搜索胶囊由 homeSearchEntry 单独绘制；这里保留 48vp 占位与下方平台/类型胶囊。
            Row().width('100%').height(48)
            Row({ space: 8 }) {
              Row({ space: 6 }) {
                Text('平台').fontSize(12).fontColor(MUTED)
                Select(this.platforms.map((platform: PlatformOption) => { return { value: platform.label } as SelectOption; }))
                  .value(platformName(this.platform)).selected(this.platforms.findIndex((p: PlatformOption) => p.id === this.platform)).layoutWeight(1)
                  .font({ size: 13 }).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onSelect((index: number) => {
                    this.platform = this.platforms[index].id; this.searchToken++; this.loading = false; this.results = []; this.entities = []; this.openedEntity = null; this.hasMore = false;
                    if (this.keyword.trim()) this.search();
                  })
              }.layoutWeight(1).alignItems(VerticalAlign.Center)
              Row({ space: 6 }) {
                Text('类型').fontSize(12).fontColor(MUTED)
                Select(SEARCH_KINDS.map((value: string) => { return { value } as SelectOption; }))
                  .selected(SEARCH_KIND_IDS.indexOf(this.searchKind)).value(SEARCH_KINDS[SEARCH_KIND_IDS.indexOf(this.searchKind)]).layoutWeight(1)
                  .font({ size: 13 }).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onSelect((index: number) => {
                    this.searchKind = SEARCH_KIND_IDS[index]; this.searchToken++; this.loading = false; this.results = []; this.entities = []; this.hasMore = false;
                    if (this.keyword.trim()) this.search();
                  })
              }.layoutWeight(1).alignItems(VerticalAlign.Center)
            }.width('100%').height(36).padding({ left: this.wide ? 34 : 22, right: this.wide ? 34 : 22 })
          }
        }.width('100%')
      } else {
        Column({ space: 12 }) {
          Row({ space: 12 }) {
            Column({ space: 3 }) {
              Text(this.primaryTitle()).fontSize(28).fontWeight(FontWeight.Bold).fontColor(TEXT).maxLines(1)
                // 双击左上角 LxMine 标题 = 刷新首页信息（开启设置开关时同步重算推荐算法）。
                .gesture(TapGesture({ count: 2 }).onAction(() => {
                  if (this.tab === '发现') {
                    this.pendingHomeFeed = null; clearTimeout(this.homeFeedApplyTimer);
                    this.homeFeed = null;
                    this.refreshHomeFeed(true, this.refreshAlgoDoubleTap).catch(() => {});
                  }
                }))
              if (this.headerSubtitle()) { Text(this.headerSubtitle()).fontSize(12).fontColor(MUTED) }
            }.alignItems(HorizontalAlign.Start).layoutWeight(1).margin({ top: 2 })
            if (this.tab === '资料库') {
              // 一级页操作球也统一 38vp、间距 8vp：不再比二级页顶栏大一圈。
              Row({ space: 8 }) {
                MaterialIcon({ icon: $r('app.media.refresh'), label: '随机排列', diameter: 38, action: () => this.refreshLibraryMosaic() })
                MaterialIcon({ icon: $r('app.media.ic_download'), label: '下载管理', diameter: 38, action: () => this.openDownloads('资料库') })
                MaterialIcon({ icon: $r('app.media.ic_import'), label: '导入歌单', diameter: 38, action: () => this.openSheet('导入歌单') })
                MaterialIcon({ icon: $r('app.media.ic_plus'), label: '新建歌单', diameter: 38, action: () => this.openSheet('新建歌单') })
              }.alignItems(VerticalAlign.Top)
            }
          }.width('100%').alignItems(VerticalAlign.Top)
        }.width('100%').padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20, top: this.statusInset + 6, bottom: 12 })
      }
      if (this.secondaryHeader() && this.openedPlaylist?.kind === 'local') {
        // 本地音乐页顶栏右上角动作；直接作为标题层覆盖，和 PageHeader 的 38vp 球同高。
        Row({ space: 8 }) {
          MaterialIcon({ icon: $r('app.media.ic_sparkle'), label: '智能识别手机里的音频', diameter: 38, raw: true, tint: false,
            disabled: this.localMusicBusy, action: () => { this.scanLocalMusic(); } })
          MaterialIcon({ icon: $r('app.media.ic_import'), label: '导入本地音频', diameter: 38,
            disabled: this.localMusicBusy, action: () => { this.importLocalAudio(); } })
          MaterialIcon({ icon: $r('app.media.ic_search'), label: '搜索本列表', diameter: 38, tint: false,
            action: () => { this.listSearchOpen = !this.listSearchOpen; if (!this.listSearchOpen) this.listQuery = ''; } })
        }.position({ x: this.viewportWidth - (this.wide ? 32 : 20) - 130, y: this.statusInset + 6 })
      }
      if (this.secondaryHeader() && this.openedPlaylist && this.openedPlaylist.kind !== 'local') {
        Row({ space: 8 }) {
          MaterialIcon({ icon: $r('app.media.ic_search'), label: '搜索本列表', diameter: 38, tint: false,
            action: () => { this.listSearchOpen = !this.listSearchOpen; if (!this.listSearchOpen) this.listQuery = ''; } })
        }.position({ x: this.viewportWidth - (this.wide ? 32 : 20) - 38, y: this.statusInset + 6 })
      }
    }.width('100%').height(this.headerHeight())
  }
  @LocalBuilder private searchShapeContent() {
    Row({ space: 10 }) {
      Image($r('app.media.ic_search')).width(20).height(20).opacity(0.72)
      if (this.searchOpen) {
        TextInput({ text: this.keyword, placeholder: '歌曲、歌手' }).layoutWeight(1).height(46).fontSize(15).fontColor(TEXT).placeholderColor(MUTED)
          .backgroundColor(Color.Transparent).borderRadius(0).padding(0).id('search-page-input')
          .onChange((value: string) => { this.keyword = value; }).onSubmit(() => { this.search(); })
        Text('搜索').fontSize(13).fontColor(TEXT).onClick(() => { this.search(); })
      } else if (this.searchMorph < 0.5) {
        Text('歌曲、歌手').fontSize(15).fontColor(MUTED).layoutWeight(1).opacity(this.searchEntryFade())
        Text('搜索').fontSize(13).fontColor(MUTED).opacity(this.searchEntryFade())
      }
    }
      .width('100%').height('100%')
      .padding({ left: 16 - 4 * this.searchMorph, right: 16 - 4 * this.searchMorph })
      .borderRadius(24 - 2 * this.searchMorph).backgroundColor(Color.Transparent)
      .systemMaterial(musicMaterial()).clip(true)
      .scale({ x: this.searchPressed ? MATERIAL_PRESS_SCALE : 1, y: this.searchPressed ? MATERIAL_PRESS_SCALE : 1 })
      .animation({ curve: curves.springMotion(0.36, 0.9) })
      .onTouch((event: TouchEvent) => {
        if (event.type === TouchType.Down) this.searchPressed = true;
        else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.searchPressed = false;
      })
      .onClick(() => this.openSearch())
  }
  @LocalBuilder private searchTitle() {
    Stack({ alignContent: Alignment.TopStart }) {
      Stack() { this.searchShapeContent() }
        .width(this.searchEntryWidth()).height(this.searchEntryHeight())
        .position({ x: this.searchEntryX(), y: this.searchEntryY() })
        .animation({ curve: curves.springMotion(0.44, 0.83) })
        .id('search-morph-node')
    }.width('100%').height(this.homeEntryHeight()).hitTestBehavior(HitTestMode.Transparent)
  }
  // Keep the native material title host alive at one size throughout the morph.
  // Resizing Navigation.title together with its child recreates the title and snaps the capsule.
  private homeEntryHeight(): number { return this.statusInset + 230; }
  @LocalBuilder private homeSearchEntry() {
    // One material node is the whole search affordance: the bar's right edge is
    // pinned and the left edge travels right/up, so the bar becomes the ball.
    Navigation() { Column() {} }
      .title({ builder: this.searchTitle, height: this.homeEntryHeight() }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
      .titleMode(NavigationTitleMode.Mini).hideBackButton(true).hideToolBar(true).mode(NavigationMode.Stack)
      .width('100%').height(this.homeEntryHeight()).backgroundColor(Color.Transparent).clip(false)
      .position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.Transparent)
      .opacity(Math.max(0, 1 - this.feedDim()))
      .id('home-search-entry')
  }
  @Builder private discover() {
    Column({ space: 14 }) {
      if (!this.searchOpen) {
        MineHome({ song: this.selected, playlists: this.playlists, wide: this.wide, sourceCount: this.sources.length, scroller: this.homeScroller, contentTop: this.headerHeight(),
          platform:this.homePlatform,
          onEdge: (edge: Edge) => { this.homeAtBottom = edge === Edge.Bottom; },
          feed: this.homeFeed, onOpenFeed: (playlist: FeedPlaylist) => { let offset = 0; try { offset = this.homeScroller.currentOffset().yOffset; } catch (_) {} this.openFeedPlaylist(playlist, false, -1, offset).catch(() => {}); },
          onPlayBanner: (playlist: FeedPlaylist) => this.playFeedFromHome(playlist),
          onPlayFeedSong: (song: Song, queue: Song[]) => { this.playSong(song, queue.length ? queue : [song]); },
          onPlaySongs: (songs: Song[]) => { if (songs.length) this.playSong(songs[0], songs); },
          statusInset: this.statusInset, bottomInset: this.bottomInset,
          likedSignature: this.likedSignature(),
          likedSong: (song: Song) => this.liked(song), onLikeSong: (song: Song) => this.like(song),
          onAddToPlaylist: (song: Song) => this.addToPlaylist(song), onDownloadSong: (song: Song) => this.downloadSong(song),
          activeAnchor: this.homeChipAnchor, onChip: (anchor: string) => this.onHomeChip(anchor),
          activeFeedId: this.openedFeedSourceId,
          playing: this.playing, selectedKey: this.selected ? songKey(this.selected) : '',
          activePlaylistId: this.openedPlaylist?.id ?? '',
          onMore: (section: string, x: number, y: number, size: number) => this.openFeedSection(section, x, y, size),
          onSearch: () => this.openSearch(), onSources: () => { this.navigateTab('设置'); },
          onPlayer: () => { this.showPlayer = true; }, onOpen: (playlist: MusicPlaylist) => { this.libraryRestoreOffset = 0; this.rememberPlaylistContext(); this.openedPlaylist = playlist; this.tab = '资料库'; this.discoveryCompact = false; this.hydrateOpenedListCovers().catch(() => {}); },
          onScroll: (offset: number) => this.homeScroll(offset) })
      } else if (this.openedEntity) {
        this.songList({ songs: this.arrangedSongs(this.entitySongs), scroller: this.searchScroller })
      } else if (this.entities.length) {
        CatalogueResults({ onScroll: (offset: number) => this.homeScroll(offset), items: this.entities, scroller: this.searchScroller, contentTop: this.headerHeight(), loading: this.loading, hasMore: this.hasMore,
          onOpen: (item: CatalogueEntity) => { this.openEntity(item); }, onDownload: (item: CatalogueEntity) => { if (item.song) this.downloadSong(item.song); }, onMore: () => { this.search(true); } })
      } else if (this.results.length) {
        this.songList({ songs: this.arrangedSongs(this.results), scroller: this.searchScroller })
      } else if (this.loading) {
        Column() {
          LoadingProgress().width(32).height(32).color(ACCENT)
        }.width('100%').height('100%').padding({ top: this.headerHeight() }).justifyContent(FlexAlign.Center)
      } else {
        Column({ space: 14 }) {
          if (this.searchHistory.length) {
            Text('搜索历史').fontSize(14).fontColor(TEXT).fontWeight(FontWeight.Medium)
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(10) } }) {
              ForEach(this.searchHistory, (word: string) => {
                Button(word, { type: ButtonType.Normal }).attributeModifier(musicButtonPress).fontSize(13).fontColor(MUTED).height(36).padding({ left: 14, right: 14 })
                  .backgroundColor('#0DFFFFFF').borderRadius(18).stateEffect(false).onClick(() => this.suggestSearch(word))
              }, (word: string) => word)
            }.width('100%')
          }
          Text('推荐搜索').fontSize(14).fontColor(TEXT).fontWeight(FontWeight.Medium)
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(10), cross: LengthMetrics.vp(10) } }) {
            ForEach(this.searchSuggestions, (word: string) => {
              Button(word, { type: ButtonType.Normal }).attributeModifier(musicButtonPress).fontSize(13).fontColor(TEXT).height(36).padding({ left: 14, right: 14 })
                .backgroundColor('#10FFFFFF').borderRadius(18).stateEffect(false).onClick(() => this.suggestSearch(word))
            }, (word: string) => word)
          }.width('100%')
        }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: this.headerHeight() + 16, bottom: 92 + this.bottomInset })
      }
    }.width('100%').height('100%')
      .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 16 })).animation({ curve: curves.springMotion(0.46, 0.8) }))
  }
  @Builder private library() {
    if (this.openedPlaylist) {
      if (this.openedPlaylist.kind === 'local') {
        LocalMusicView({ songs: this.arrangedSongs(this.localTracks), wide: this.wide, contentTop: this.headerHeight(),
          searchOpen: this.listSearchOpen, searchQuery: this.listQuery,
          selectedKey: this.selected ? songKey(this.selected) : '',
          likedSignature: this.likedSignature(),
          scroller: this.localScroller, likedSong: (song: Song) => this.liked(song),
          onPlay: (song: Song) => this.playSong(song, this.arrangedSongs(this.localTracks)),
          onLike: (song: Song) => this.like(song), onMore: (song: Song) => this.addToPlaylist(song),
          onPlayAll: () => { const list = this.arrangedSongs(this.localTracks); if (list.length) this.playSong(list[0], list); },
          onSort: (mode: string) => { this.listSortMode = mode; },
          onManualSort: () => this.openManualOrder(),
          onSearchChange: (value: string) => { this.listQuery = value; },
          onSearchClose: () => { this.listSearchOpen = false; this.listQuery = ''; },
          onScroll: (offset: number) => this.homeScroll(offset) })
          .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })).animation({ curve: curves.springMotion(0.46, 0.82) }))
      } else {
        Column() {
          if (this.openedFeedLoading && !this.openedPlaylist.songs?.length) {
            Column({ space: 12 }) {
              LoadingProgress().width(34).height(34).color(ACCENT)
              Text('正在载入歌单…').fontSize(13).fontColor(MUTED)
            }.width('100%').height('100%').justifyContent(FlexAlign.Center)
          }
          else if (this.openedPlaylist.songs?.length) { this.songList({ songs: this.arrangedSongs(this.openedPlaylist.songs), scroller: this.playlistScroller }) }
          else {
            Column({ space: 14 }) {
              Text(this.openedPlaylist.kind === 'lx' ? '从歌曲行内操作添加到此歌单' : '此歌单使用电脑上的本地音频文件。').fontSize(14).fontColor(MUTED)
              // 空歌单没有歌曲列表头（SongListTools），重命名与删除入口单独补在空态里。
              if (this.canDeleteOpenedPlaylist()) {
                Row({ space: 16 }) {
                  Button('重命名歌单').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(ACCENT).backgroundColor(Color.Transparent)
                    .onClick(() => this.openSheet('重命名歌单'))
                  Button('删除歌单').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontSize(13).fontColor(MUTED).backgroundColor(Color.Transparent)
                    .onClick(() => this.deleteOpenedPlaylist())
                }
              }
            }.width('100%').height('100%').justifyContent(FlexAlign.Center)
          }
        }.width('100%').height('100%')
          .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })).animation({ curve: curves.springMotion(0.46, 0.82) }))
      }
    } else {
      LibraryView({ onScroll: (offset: number) => this.homeScroll(offset), playlists: this.playlists, recentSongs: this.recentSongs, wide: this.wide, availableWidth: this.viewportWidth, mosaicSeed: this.libraryMosaicSeed, localCount: this.localTracks.length, localCover: (this.localTracks.find((s: Song) => s.coverUrl.length > 0)?.coverUrl) ?? '', contentTop: this.headerHeight(), scroller: this.libraryScroller,
        onOpen: (list: MusicPlaylist) => {
          this.resetListTools();
          try { this.libraryRestoreOffset = this.libraryScroller.currentOffset().yOffset; } catch (_) {}
          this.playlistReturnTab = '资料库'; this.playlistReturnFeed = '';
          this.playlistScroller = new Scroller();
          this.openedPlaylist = list; this.discoveryCompact = false;
          this.hydrateOpenedListCovers().catch(() => {});
          if (this.selected && list.songs?.length) {
            const activeKey = songKey(this.selected);
            const idx = list.songs.findIndex((item: Song) => songKey(item) === activeKey);
            if (idx >= 0) {
              setTimeout(() => { try { this.playlistScroller.scrollToIndex(idx + 1, true, ScrollAlign.CENTER); } catch (_) {} }, 160);
            }
          }
        }, onLocal: () => this.openLocalMusic(), onImport: () => this.openSheet('导入歌单'), onCreate: () => this.openSheet('新建歌单') })
        .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })).animation({ curve: curves.springMotion(0.46, 0.82) }))
    }
  }
  // 删除歌单只对「曲库里真实存在的自建/导入歌单」开放：
  // 推荐歌单、排行榜、每日三十首等在线列表也借用 kind: 'lx' 的外壳，但不在 this.playlists 里；
  // 我喜欢的、最近播放、本地音乐也一律不给删除入口。
  private canDeleteOpenedPlaylist(): boolean {
    const list = this.openedPlaylist;
    if (!list || list.isFavorite || list.kind !== 'lx') return false;
    return this.playlists.some((item: MusicPlaylist) => item.id === list.id);
  }
  private deleteOpenedPlaylist(): void {
    const list = this.openedPlaylist;
    if (!list || !this.canDeleteOpenedPlaylist()) return;
    this.getUIContext().showAlertDialog({ title: '删除歌单', message: `删除「${list.name}」？`, systemMaterial: musicMenuMaterial(),
      primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '删除', action: () => { this.playlists = this.playlists.filter((item: MusicPlaylist) => item.id !== list.id); this.closeOpenedPlaylist(); this.save(); this.triggerAutoSync(); } } });
  }
  private navigateTab(tab: string): void {
    if (this.searchOpen) { this.searchToken++; this.loading = false; }
    this.settingsPanel = 'main'; this.tab = tab; this.openedPlaylist = null; this.openedFeedSourceId = ''; this.downloadsOpen = false; this.sourcesOpen = false; this.sourcesClosing = false; this.searchOpen = false; this.feedSection = ''; this.error = '';
    const scroller = tab === '设置' ? this.settingsScroller : tab === '资料库' ? this.libraryScroller : this.homeScroller;
    try { this.discoveryCompact = scroller.currentOffset().yOffset > 56; } catch (_) { this.discoveryCompact = false; }
    this.searchMorph = this.discoveryCompact || this.viewportHeight < 500 ? 1 : 0;
    // 换页后滚动基准归零，避免把另一页的偏移当成滑动方向。
    this.lastScrollOffset = -1; this.scrollTravel = 0;
    this.dockCollapsed = this.discoveryCompact;
  }
  private async setLanKeepAlive(enabled: boolean): Promise<void> {
    if (enabled || !this.lanKeepAlive) return;
    try {
      const context = getContext(this) as common.UIAbilityContext;
      await backgroundTaskManager.stopBackgroundRunning(context);
      this.lanKeepAlive = false;
      console.info('[LanSync] legacy data-transfer task stopped');
    } catch (error) {
      console.info(`[LanSync] keepalive: ${(error as Error).message}`);
    }
  }
  private openSearch(): void {
    if (this.searchOpen) return;
    this.resetListTools();
    this.searchWasCompact = this.compactHeader();
    this.feedSection = '';
    this.keyword = ''; this.submitted = ''; this.results = []; this.entities = []; this.openedEntity = null; this.loading = false; this.hasMore = false; this.page = 1;
    this.getUIContext().animateTo({ curve: curves.springMotion(0.46, 0.8) }, () => { this.searchOpen = true; this.discoveryCompact = false; this.searchMorph = 0; });
  }
  private closeSearch(): void {
    this.searchToken++;
    this.loading = false;
    this.getUIContext().animateTo({ curve: curves.springMotion(0.46, 0.8) }, () => {
      this.searchOpen = false;
      this.discoveryCompact = this.searchWasCompact;
      this.searchMorph = this.searchWasCompact || this.viewportHeight < 500 ? 1 : 0;
    });
  }
  private suggestSearch(word: string): void {
    this.keyword = word;
    this.search().catch((error: Error) => { this.error = error.message; });
  }
  private activeScroller(): Scroller {
    if (this.tab === '设置') return this.settingsScroller;
    if (this.tab === '资料库') {
      if (this.openedPlaylist?.kind === 'local') return this.localScroller;
      if (this.openedPlaylist) return this.playlistScroller;
      return this.libraryScroller;
    }
    return this.homeScroller;
  }
  private homeScroll(offset: number): void {
    // 记录真实滚动活跃时间，供首页爬取结果延迟应用（只写普通字段，不触发 UI 重建）。
    if (this.tab === '发现' && !this.searchOpen && !this.feedSection && !this.openedPlaylist) this.lastHomeScrollAt = Date.now();
    // 胶囊高亮改由 300ms 轮询维护：惯性结束（Idle）后滚动回调不再触发，轮询才能拿到最终落点。
    // The search page has its own scroll. Its callbacks must not collapse the
    // shared search entry back into a ball after the user tapped the ball.
    if (this.searchOpen) return;
    if (Date.now() < this.suppressScrollUntil) { this.lastScrollOffset = offset; return; }
    // 到达底部后的回弹（offset 回落）不算"往回翻"，否则播控栏会在页尾自动展开。
    if (offset > this.maxScrollSeen + 2) { this.maxScrollSeen = offset; }
    if (offset < this.maxScrollSeen - 90) { this.homeAtBottom = false; }
    // 页底判定来自 onScrollEdge 事件；非首页滚动不误用首页的页底状态。
    const atBottom = this.homeAtBottom && this.tab === '发现';
    // 一栏/两栏由滑动方向决定，而不是只在页面最顶部才展开：
    // 往下翻累计一段距离收成一栏，往回翻累计一段距离展开成两栏；到顶永远两栏。
    const previous = this.lastScrollOffset;
    this.lastScrollOffset = offset;
    if (previous < 0) return;
    const delta = Math.max(-60, Math.min(60, offset - previous));
    if (Math.abs(delta) < 0.5) return;
    if (this.scrollTravel !== 0 && (delta > 0) !== (this.scrollTravel > 0)) this.scrollTravel = 0;
    this.scrollTravel += delta;
    // 底部一栏/两栏：只看滑动方向，到顶永远展开。
    let dock = this.dockCollapsed;
    if (offset <= 4) { dock = false; this.scrollTravel = 0; }
    else if (this.scrollTravel > 44) dock = true;
    else if (this.scrollTravel < -44 && !atBottom) dock = false;
    if (atBottom) this.scrollTravel = Math.min(this.scrollTravel, 0);
    if (dock !== this.dockCollapsed) {
      this.getUIContext().animateTo({ curve: curves.springMotion(0.42, 0.9) }, () => { this.dockCollapsed = dock; });
      // 切栏与胶囊高亮解耦：切栏动画期间的布局回滚不影响高亮判定。
      this.chipAnchorHoldUntil = Date.now() + 700;
    }
    // 头部仍然只在最顶部展开，避免展开后压在内容上。
    const next = offset > 56 ? true : offset <= 4 ? false : this.discoveryCompact;
    if (next !== this.discoveryCompact) {
      const before = this.headerHeight();
      const scroller = this.activeScroller();
      this.getUIContext().animateTo({ curve: curves.springMotion(0.42, 0.9) }, () => {
        this.discoveryCompact = next;
        this.searchMorph = next ? 1 : 0;
      });
      if (next) {
        const compensate = before - (82 + this.statusInset);
        if (compensate > 0 && offset - compensate > 56) {
          try { scroller.scrollTo({ xOffset: 0, yOffset: offset - compensate }); } catch (_) {}
          // 补正产生的滚动回调不能被当成"往回翻"，否则会立刻又展开。
          this.suppressScrollUntil = Date.now() + 400;
          this.lastScrollOffset = offset - compensate;
          this.scrollTravel = 0;
        }
      }
    }
  }
  /** 胶囊高亮跟随：取最后一个滚过头部下沿的板块。 */
  private updateHomeChipAnchor(): void {
    const anchors: string[] = ['banner', 'newSongs', 'playlists', 'charts'];
    let active = 'banner';
    for (const anchor of anchors) {
      try {
        const rect = this.getUIContext().getComponentUtils().getRectangleById('section-' + anchor);
        if (this.getUIContext().px2vp(rect.windowOffset.y) <= this.headerHeight() + 120) active = anchor;
      } catch (_) {}
    }
    if (active !== this.homeChipAnchor) this.homeChipAnchor = active;
  }
  private onHomeChip(anchor: string): void {
    this.homeChipAnchor = anchor;
    this.chipAnchorHoldUntil = Date.now() + 800;
    if (anchor === 'banner') { this.homeScroller.scrollTo({ xOffset: 0, yOffset: 0, animation: { duration: 320, curve: Curve.EaseInOut } }); return; }
    try {
      const rect = this.getUIContext().getComponentUtils().getRectangleById('section-' + anchor);
      const target = this.homeScroller.currentOffset().yOffset + this.getUIContext().px2vp(rect.windowOffset.y) - (this.headerHeight() + 64);
      this.homeScroller.scrollTo({ xOffset: 0, yOffset: Math.max(0, target), animation: { duration: 320, curve: Curve.EaseInOut } });
    } catch (_) {}
  }
  private notify(message: string, duration: number = 2500): void {
    if (!this.foreground) return;
    try { this.getUIContext().getPromptAction().showToast({ message, duration }); } catch (_) {}
  }
  /** 队列 JSON 只在队列引用变化时序列化；5s/1s 的进度刷新不再重复 stringify 整条队列。 */
  private playbackSnapshotJson(positionMs: number): string {
    const song = this.selected;
    if (song !== this.snapshotSong) {
      this.snapshotSong = song;
      this.snapshotSongJson = song ? JSON.stringify(song) : 'null';
    }
    if (this.queue !== this.snapshotQueue) {
      this.snapshotQueue = this.queue;
      this.snapshotQueueJson = JSON.stringify(this.queue);
    }
    return `{"song":${this.snapshotSongJson},"queue":${this.snapshotQueueJson},"positionMs":${positionMs},"playing":${this.playing}}`;
  }
  private savePlayback(persist: boolean = false): void {
    if (!this.storeReady || !this.selected || this.pendingPlayback) return;
    const now = Date.now();
    this.lastPlaybackSave = now;
    // 内存槽供 EntryAbility.onContinue 读取；真正接续时才序列化。
    setLatestPlaybackState(this.selected, this.queue, this.livePositionMs, this.playing);
    // 磁盘快照降到 15s 一次；暂停/切歌/退后台/退出时强制落盘。
    if (!persist && now - this.lastPlaybackDiskSave < 15000) return;
    this.lastPlaybackDiskSave = now;
    savePlaybackSnapshot(this.playbackSnapshotJson(this.livePositionMs)).catch((error: Error) => console.warn('[Playback] ' + error.message));
  }
  private restorePlaybackIfReady(): void {
    if (this.intro || !this.storeReady || !this.pendingPlayback || this.disposed) return;
    const saved = this.pendingPlayback;
    if (!this.resumeOnStartup && saved.explicit !== true) {
      if (saved.song.source !== 'local' && !this.hostReady) return;
      this.pendingPlayback = null;
      this.playing = false;
      this.loadLyrics(this.songInfo(saved.song), saved.song, this.playToken);
      return;
    }
    if (!this.sourceReady && !this.downloads.offline(saved.song)) return;
    this.pendingPlayback = null;
    this.playSong(saved.song, saved.queue.length ? saved.queue : [saved.song], Math.max(0, saved.positionMs), saved.explicit === true || (this.resumeOnStartup && saved.playing));
  }
  private async openCast(): Promise<void> {
    try {
      const helper = new avSession.AVCastPickerHelper(getContext(this) as common.UIAbilityContext);
      const options: avSession.AVCastPickerOptions = { sessionType: 'audio', pickerStyle: AVCastPickerStyle.STYLE_MENU };
      await helper.select(options);
    } catch (error) {
      this.message = `投播暂不可用：${(error as Error).message}`;
    }
  }
  private async shareCurrent(): Promise<void> {
    try {
      await this.shareService.show(getContext(this) as common.UIAbilityContext);
    } catch (error) {
      this.message = `分享失败：${(error as Error).message}`;
    }
  }
  private deepLinkChanged(): void {
    if (this.deepLink) this.handleDeepLink(this.deepLink);
  }
  private handleDeepLink(uri: string): void {
    try {
      const query = uri.indexOf('?') >= 0 ? uri.slice(uri.indexOf('?') + 1) : '';
      const params = new Map<string, string>();
      for (const pair of query.split('&')) {
        const index = pair.indexOf('=');
        if (index <= 0) continue;
        params.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
      }
      const source = params.get('source') ?? '';
      const id = params.get('id') ?? '';
      const name = params.get('name') ?? '';
      if (!source || !id || !name) return;
      const song: Song = {
        source, id, name,
        singer: params.get('singer') ?? '',
        albumName: params.get('album') ?? '',
        albumId: '',
        durationMs: Number(params.get('duration') ?? '0') || 0,
        qualitys: ['128k', '320k', 'flac'],
        coverUrl: params.get('cover') ?? '',
      };
      this.selected = song;
      this.shareService.setSong(song);
      this.queue = [song];
      this.pendingPlayback = { song, queue: [song], positionMs: 0, playing: true, explicit: true };
      AppStorage.delete('lxmine_deep_link');
      this.restorePlaybackIfReady();
    } catch (error) {
      this.message = `无法打开分享的歌曲：${(error as Error).message}`;
    }
  }
  private finishIntro(): void { this.intro = false; this.restorePlaybackIfReady(); }
  private playerVisibilityChanged(): void {
    this.stageControlsVisible = true;
    this.twoFingerActive = false; this.twoFingerStartY = -1; this.twoFingerLastY = -1;
    if (this.showPlayer) { this.stageMounted = true; this.mountPlaybackStage(); }
    this.updateSystemBars();
    // 打开详情页时立刻放行下一帧进度状态，避免沿用首页 1s 节流造成进度延迟。
    if (this.showPlayer) { this.lastPositionUiAt = 0; this.positionMs = this.livePositionMs; }
    // 返回/关闭与方向切换同步执行，避免"先保持横屏再转竖屏"的延迟。
    this.applyOrientation(this.showPlayer);
    this.syncStageControls();
    this.getUIContext().animateTo({ curve: curves.springMotion(0.62, 0.74) }, () => { this.playerReveal = this.showPlayer ? 1 : 0; });
  }
  private visualStyleChanged(): void {
    this.twoFingerActive = false; this.twoFingerStartY = -1; this.twoFingerLastY = -1;
    this.dynamicStageFailed = false;
    if (this.previousStyle === 'off' && this.styleName !== 'off') this.dynamicStageReady = false;
    this.previousStyle = this.styleName;
    if (this.styleName !== 'off') this.dynamicStyle = this.styleName;
    if (this.showPlayer) this.mountPlaybackStage();
  }
  private mountPlaybackStage(): void {
    this.stageMounted = true;
    if (this.styleName === 'off') this.plainStageMounted = true;
    else if (!this.dynamicStageFailed) this.dynamicStageMounted = true;
  }
  private prewarmStages(): void {
    if (this.disposed || !this.foreground) return;
    this.stageMounted = true; this.dynamicStageMounted = !this.dynamicStageFailed; this.plainStageMounted = true;
  }
  private releaseStageCache(): void {
    if (this.showPlayer && this.foreground) return;
    this.stageMounted = false; this.dynamicStageMounted = false; this.plainStageMounted = false; this.dynamicStageReady = false;
  }
  private stageLayerVisible(plain: boolean): boolean {
    return this.foreground && this.showPlayer && !this.commentsOpen &&
      (plain ? this.styleName === 'off' || !this.dynamicStageReady : this.styleName !== 'off' && !this.dynamicStageFailed);
  }
  private applyAppearance(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const mode = this.appearance === 'dark' ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK
      : this.appearance === 'light' ? ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT : ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET;
    context.getApplicationContext().setColorMode(mode);
    setTimeout(() => this.updateSystemBars(), 50);
  }
  private stageLight(): boolean {
    if (this.appearance === 'light') return true;
    if (this.appearance === 'dark') return false;
    if (this.systemColorMode === ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT) return true;
    if (this.systemColorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK) return false;
    return (this.getUIContext().getHostContext()!.resourceManager.getColorSync($r('app.color.page_background').id) & 0xFF) > 127;
  }
  private updateSystemBars(): void {
    const foreground = this.getUIContext().getHostContext()!.resourceManager.getColorSync($r('app.color.text_primary').id);
    const color = `#${(foreground >>> 0).toString(16).padStart(8, '0')}`;
    this.mainWindow?.setWindowSystemBarProperties({ statusBarColor: '#00000000', navigationBarColor: '#00000000', statusBarContentColor: color, navigationBarContentColor: color }).catch(() => {});
  }
  private systemThemeChanged(): void { setTimeout(() => this.updateSystemBars(), 50); }
  @LocalBuilder private sheetContent() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column({ space: 18 }) {
        Row({ space: 12 }) {
          Text(this.sheet).fontSize(24).fontWeight(FontWeight.Bold).fontColor(TEXT)
            .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          if (this.sheet !== '播放队列') {
            Button('取消').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(MUTED).enabled(!this.busy).onClick(() => { this.showSheet = false; })
            Button(this.busy ? '处理中…' : this.sheet === '新建歌单' ? '创建' : this.sheet === '重命名歌单' ? '保存' : this.sheet === '导入歌单' ? '导入' : '添加').attributeModifier(musicButtonPress)
              .buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(ACCENT).enabled(!this.busy && !!this.draft.trim())
              .onClick(() => { this.submitSheet(); })
          } else {
            Button('完成').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL).fontColor(ACCENT).enabled(!this.busy).onClick(() => { this.switchTargetSong = null; this.showSheet = false; })
          }
        }.width('100%')
        if (this.sheet === '播放队列') { this.songList({ songs: this.queue, scroller: this.queueScroller }) }
        else {
          if (this.error) { Text(this.error).fontColor('#FFB4B4').fontSize(13).width('100%') }
          Text(this.sheet === '导入歌单' ? '粘贴网易云、QQ、酷我、酷狗、汽水的分享内容，或选择 .lxmc / JSON 文件。汽水歌曲播放时匹配同名同歌手版本。' : this.sheet === '添加音源' ? '粘贴 LX 音源脚本，或一次选择多个 .js / .txt 文件。' : '输入歌单名称').fontSize(14).fontColor(MUTED).width('100%')
          if (this.sheet === '新建歌单' || this.sheet === '重命名歌单') {
            TextInput({ text: this.draft, placeholder: '歌单名称' }).height(48).fontSize(15)
              .onChange((value: string) => { this.draft = value; })
              .enterKeyType(EnterKeyType.Done).onSubmit(() => { this.submitSheet(); })
          } else {
            TextArea({ text: this.draft, placeholder: '在这里粘贴…' }).height(180)
              .fontSize(15).onChange((value: string) => { this.draft = value; })
          }
          if (this.sheet === '导入歌单') { Button('选择歌单文件').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.NORMAL).fontColor(ACCENT).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onClick(() => { this.importFile(false); }) }
          if (this.sheet === '添加音源') { Button('批量导入音源').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.NORMAL).fontColor(ACCENT).backgroundColor(Color.Transparent).systemMaterial(musicMaterial()).onClick(() => { this.importFile(true); }) }
        }
      }.width('100%').height(this.sheet === '播放队列' ? '100%' : 'auto').padding(24)

      if (this.sheet === '播放队列' && this.switchTargetScope === 'queue' && this.switchTargetSong !== null) {
        PlatformSwitchDialog({
          song: this.switchTargetSong,
          contextLabel: '播放队列',
          statusInset: 0,
          bottomInset: 8,
          host: this.host,
          onSelect: (replacement: Song) => this.applyPlatformSwitch(replacement),
          onClose: () => { this.switchTargetSong = null; this.switchTargetScope = ''; }
        })
      }
    }.width('100%').height(this.sheet === '播放队列' ? '100%' : 'auto')
  }
  private openSettingsPanel(panel: string): void {
    if (this.settingsPanel === 'main' && panel !== 'main') {
      try { this.settingsRestoreOffset = this.settingsScroller.currentOffset().yOffset; } catch (_) {}
    }
    this.settingsPanel = panel;
    const targetOffset = panel === 'main' ? this.settingsRestoreOffset : 0;
    setTimeout(() => { try { this.settingsScroller.scrollTo({ xOffset: 0, yOffset: targetOffset }); } catch (_) {} }, 16);
  }
  private reloadLyricExtras(): void { if (this.selected && this.sourceReady) this.loadLyrics(this.songInfo(this.selected), this.selected, this.playToken); }
  private updateStageTranslations(): void {
    const grouped = new Map<number, string[]>();
    const lines: LyricLine[] = [];
    if (this.lyricPrefs.showTranslation) lines.push(...this.translatedLyrics);
    if (this.lyricPrefs.showRomaji) lines.push(...this.romajiLyrics);
    for (const line of lines) { const values = grouped.get(line.timeMs) ?? []; if (!values.includes(line.text)) values.push(line.text); grouped.set(line.timeMs, values); }
    const result: LyricLine[] = []; grouped.forEach((values: string[], time: number) => result.push({ timeMs: time, text: values.join('\n'), words: [] }));
    this.stageTranslations = result.sort((a: LyricLine, b: LyricLine) => a.timeMs - b.timeMs);
  }
  @Builder private settingsView() {
    if (this.sourcesOpen) {
    NativeSettings({ onScroll: (offset: number) => this.homeScroll(offset), sources: this.sources, activeId: this.activeId, devices: this.devices, deviceName: this.deviceName, lanSsid: this.lanSsid, quality: this.quality,
      styleName: this.styleName, mode: this.mode, lyricOffset: this.lyricOffset, message: this.message, gripEnabled: this.gripEnabled, startupAnimation: this.startupAnimation, resumeOnStartup: this.resumeOnStartup, sourcesOnly: this.sourcesOpen, sourcesReveal: this.sourcesReveal, scroller: this.settingsScroller, contentTop: this.headerHeight(),
      carAvailable: this.carAvailable, carConnected: this.carConnected, carDetail: this.carDetail,
      onImportFile: () => { this.importFile(true); }, onImportText: () => this.openSheet('添加音源'),
      onActivate: (source: SyncSourcePayload) => { this.activate(source); }, onRemove: (source: SyncSourcePayload) => this.removeSource(source),
      onSend: (device: LanDevice) => { this.send(device); }, onQuality: (value: string) => { this.quality = value; this.save(); },
      onStyle: (value: string) => { this.styleName = value; this.save(); }, onMode: (value: string) => { this.mode = value; this.save(); },
      onGrip: (value: boolean) => { this.gripEnabled = value; this.foregroundChanged(); this.save(); },
      onResumeOnStartup: (value: boolean) => { this.resumeOnStartup = value; this.save(); },
      onStartupAnimation: (value: boolean) => { this.startupAnimation = value; if (!value) this.intro = false; this.save(); },
      onOpenSources: () => { this.openSources(); },
      onOffset: (value: number) => { this.lyricOffset = value; this.player.setLyricOffset(value); this.save(); } })
    } else {
      AlignedSettings({ panel: this.settingsPanel, sources: this.sources, activeId: this.activeId, quality: this.quality, mode: this.mode, styleName: this.styleName, stageBgOpacity: this.stageBgOpacity, stageBgCustom: this.stageBgImage.length > 0, appearance: this.appearance,
        startupAnimation: this.startupAnimation, resumeOnStartup: this.resumeOnStartup, gripEnabled: this.gripEnabled,
        allowLandscapeLocked: this.allowLandscapeLocked, mixWithOthers: this.mixWithOthers, refreshAlgoDoubleTap: this.refreshAlgoDoubleTap, lanAutoSync: this.lanAutoSync, lanLocalAddress: this.lanLocalAddress, carDetail: this.carDetail,
        completedDownloads: this.downloadItems.filter((item: MusicDownload) => item.state === 'complete').length, devices: this.devices, lanSsid: this.lanSsid, message: this.message,
        lyrics: this.lyricPrefs, lyricOffset: this.lyricOffset, previewPrimary: lyricPrimary(this.lyricPrefs, this.coverColors), previewSecondary: lyricSecondary(this.lyricPrefs, this.coverColors),
        previewText: this.lyrics.find((line: LyricLine) => line.timeMs <= this.positionMs)?.text || '音乐在这里，与你相遇', contentTop: this.headerHeight(), updateChecking: this.updateChecking,
        isHarmonyPc: isHarmonyPc(), desktopLyrics: this.desktopLyrics, desktopLyricsLocked: this.desktopLyricsLocked, wallpaperMode: this.wallpaperMode, scroller: this.settingsScroller,
        onCheckUpdate: () => { this.checkAppUpdate(false).catch(() => {}); },
        onDesktopLyrics: (value: boolean) => {
          this.desktopLyrics = value;
          this.pcWindow.setDesktopLyrics(value, this.desktopLyricsLocked).catch(() => {});
          if (value) this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
        },
        onDesktopLyricsLocked: (value: boolean) => {
          this.desktopLyricsLocked = value;
          this.pcWindow.setDesktopLyricsLocked(value).catch(() => {});
        },
        onWallpaperMode: (value: boolean) => { this.toggleHarmonyPcWallpaper(value); },
        onScroll: (offset: number) => this.homeScroll(offset), onOpenSources: () => this.openSources(), onPanel: (panel: string) => this.openSettingsPanel(panel),
        onDownloads: () => this.openDownloads('设置'),
        onSend: (device: LanDevice) => this.send(device), onSendDirect: (target: string) => { this.sendDirect(target); },
        onLanAutoSync: (value: boolean) => {
          this.lanAutoSync = value;
          this.syncServer.setAutoSync(value);
          this.discovery?.setAutoSync(value);
          this.save();
          if (value) this.triggerAutoSync();
        },
        onQuality: (value: string) => { this.quality = value; this.save(); },
        onMode: (value: string) => { this.mode = value; this.save(); }, onStyle: (value: string) => { this.styleName = value; this.save(); },
        onStageBgOpacity: (value: number) => { this.stageBgOpacity = Math.max(0, Math.min(1, value)); this.save(); },
        onPickStageBgImage: () => { this.pickStageBgImage().catch(() => {}); },
        onClearStageBgImage: () => { this.clearStageBgImage(); },
        onAppearance: (value: string) => { this.appearance = value; this.save(); },
        onResume: (value: boolean) => { this.resumeOnStartup = value; this.save(); }, onStartup: (value: boolean) => { this.startupAnimation = value; this.save(); },
        onGrip: (value: boolean) => { this.gripEnabled = value; this.foregroundChanged(); this.save(); },
        onAllowLandscapeLocked: (value: boolean) => { this.allowLandscapeLocked = value; this.applyOrientation(this.showPlayer); this.save(); },
        onMixWithOthers: (value: boolean) => { this.mixWithOthers = value; this.player.setMixWithOthers(value); this.save(); },
        onRefreshAlgoDoubleTap: (value: boolean) => { this.refreshAlgoDoubleTap = value; this.save(); },
        onColorMode: (value: string) => { this.lyricPrefs.colorMode = value; this.save(); }, onPrimary: (value: string) => { this.lyricPrefs.primary = value; this.save(); },
        onSecondary: (value: string) => { this.lyricPrefs.secondary = value; this.save(); },
        onTranslation: (value: boolean) => { this.lyricPrefs.showTranslation = value; this.updateStageTranslations(); this.save(); this.reloadLyricExtras(); },
        onRomaji: (value: boolean) => { this.lyricPrefs.showRomaji = value; this.updateStageTranslations(); this.save(); this.reloadLyricExtras(); },
        onScale: (value: number) => {
          const next = Math.max(0.75, Math.min(1.4, Math.round(value * 100) / 100));
          this.lyricPrefs = { colorMode: this.lyricPrefs.colorMode, primary: this.lyricPrefs.primary, secondary: this.lyricPrefs.secondary, showTranslation: this.lyricPrefs.showTranslation, showRomaji: this.lyricPrefs.showRomaji, scale: next };
          this.save();
        },
        onOffset: (value: number) => { this.lyricOffset = value; this.player.setLyricOffset(value); this.save(); } })
    }
  }
  @LocalBuilder private playbackStage(plain: boolean) {
      if (this.stageMounted && (plain ? this.plainStageMounted : this.dynamicStageMounted)) {
        MineRadioStage({ song: this.selected ?? this.stagePlaceholder, audioUrl: this.playbackUrl, lines: this.lyrics, translationLines: this.stageTranslations, lyricColorMode: this.lyricPrefs.colorMode.endsWith('gradient') ? 'custom-gradient' : 'custom-solid', lyricPrimary: lyricPrimary(this.lyricPrefs, this.coverColors), lyricSecondary: lyricSecondary(this.lyricPrefs, this.coverColors), mode: plain ? 'off' : this.dynamicStyle, light: this.stageLight(), bgImage: this.stageBgImage, bgOpacity: this.stageBgOpacity, duration: this.duration, lyricOffset: this.lyricOffset, lyricScale: this.lyricPrefs.scale ?? 1,
          playing: this.playing && this.foreground, positionMs: this.positionMs, topInset: this.statusInset + 72, bottomInset: this.bottomInset + 164,
          visible: this.stageLayerVisible(plain), detail: this.showPlayer,
          interactive: plain ? this.styleName === 'off' || this.dynamicStageFailed : this.styleName !== 'off' && !this.dynamicStageFailed,
          onSeek: (time: number) => this.player.seek(time),
          onVisualReady: () => { if (!plain && this.foreground && this.styleName !== 'off') this.dynamicStageReady = true; },
          onImmersiveToggle: (show: boolean) => this.toggleStageControls(show),
          onDegraded: () => {
            this.dynamicStageReady = false; this.dynamicStageFailed = true; this.dynamicStageMounted = false; this.plainStageMounted = true;
            this.notify('图形资源暂不可用，已临时使用纯文字歌词');
          } })
          .opacity(this.stageLayerVisible(plain) ? plain || this.dynamicStageReady ? 1 : 0.001 : 0)
          .hitTestBehavior(this.stageLayerVisible(plain) ? HitTestMode.Default : HitTestMode.None)
          .onTouch((event: TouchEvent) => {
            const interactive = plain ? this.styleName === 'off' || this.dynamicStageFailed : this.styleName !== 'off' && !this.dynamicStageFailed;
            if (interactive && this.stageLayerVisible(plain)) this.stageGestureTouch(event);
          })
      }
  }
  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (this.showPlayer && !this.commentsOpen) {
        AmbientBackdrop({ playing: this.playing, styleName: this.dynamicStageFailed ? 'off' : this.styleName, coverUrl: this.selected?.coverUrl ?? '', bgImage: this.stageBgImage, bgOpacity: this.stageBgOpacity, colorFirst: this.coverColors.first, colorLast: this.coverColors.last, light: this.stageLight() })
      }
      this.playbackStage(false)
      this.playbackStage(true)
      if (!this.showPlayer) {
        Column().width('100%').height('100%').backgroundColor(INK).hitTestBehavior(HitTestMode.Transparent)
      }
      Navigation() {
        Stack({ alignContent: Alignment.Bottom }) {
          Column() {
            if (this.tab === '发现') { this.discover() }
            else if (this.tab === '资料库') {
              if (this.downloadsOpen) { DownloadsView({ onScroll: (offset: number) => this.homeScroll(offset), items: this.downloadItems, contentTop: this.headerHeight(), onExport: (item: MusicDownload) => { this.exportDownload(item); }, onPlay: (song: Song) => this.playSong(song, this.downloadItems.filter((item: MusicDownload) => item.state === 'complete').map((item: MusicDownload) => item.song)), onCancel: (id: string) => { this.downloads.cancel(id).catch((error: Error) => { this.error = error.message; }); }, onDelete: (id: string) => { this.downloads.remove(id).then(() => this.notify('已删除下载记录')).catch((error: Error) => { this.error = error.message; }); } }) }
              else { this.library() }
            }
            else { this.settingsView() }
          }.width('100%').height('100%').padding({ left: this.tab === '发现' ? (this.searchOpen ? 20 : 0) : (this.wide ? 32 : 20),
            right: this.tab === '发现' ? (this.searchOpen ? 20 : 0) : (this.wide ? 32 : 20), top: 0, bottom: 0 })
        }.width('100%').height('100%')
      }.title({ builder: this.header, height: this.headerHeight() }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).mode(NavigationMode.Stack).hideBackButton(true).hideToolBar(true)
        .width('100%').height('100%').backgroundColor(Color.Transparent).expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .opacity(Math.max(0, 1 - Math.max(this.playerReveal, this.feedDim()))).hitTestBehavior(this.showPlayer ? HitTestMode.BLOCK_DESCENDANTS : HitTestMode.Default)
        .accessibilityLevel(this.showPlayer ? 'no-hide-descendants' : 'auto')
      if (this.tab === '发现' && !this.showPlayer) { this.homeSearchEntry() }
      // 快捷胶囊与旧版四大平台按钮同层同行为：固定在头部下方，玻璃材质，始终可见。
      // feedSection 进入关闭动画时（feedClosing）就允许胶囊挂载，透明度跟随 feedReveal 一起淡入；
      // 否则要等 420ms 关闭定时器把 feedSection 清空，主页置顶胶囊会"过一会才出现"。
      if (this.tab === '发现' && !this.showPlayer && !this.searchOpen && (!this.feedSection || this.feedClosing) && !this.openedPlaylist && this.homeFeed) {
        HomeChips({ active: this.homeChipAnchor, onChip: (anchor: string) => this.onHomeChip(anchor) })
          .width('100%').padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20 })
          // 胶囊在材质宿主内下移 16vp 预留材质上伸空间，宿主上移 16vp 补偿，视觉位置不变。
          .position({ x: 0, y: this.headerHeight() - 8 })
          .opacity(Math.max(0, 1 - Math.max(this.playerReveal, this.feedDim())))
      }
      if (this.error && !this.showSheet) {
        Text(this.error).fontSize(13).fontColor('#FFB4B4').padding(16).width('90%').backgroundColor('#EA202124').borderRadius(16)
          .margin({ bottom: this.selected ? 158 + this.bottomInset : 80 + this.bottomInset }).onClick(() => { this.error = ''; })
      }
      if (this.selected && (this.showPlayer || this.playerReveal > 0.01)) {
        NativePlayer({ song: this.selected, colorFirst: this.coverColors.first, colorLast: this.coverColors.last, audioUrl: this.playbackUrl, wide: this.wide, availableWidth: this.viewportWidth, playing: this.playing, busy: this.resolving, positionMs: this.positionMs, duration: this.duration,
          lines: this.lyrics, styleName: this.styleName, quality: this.quality, lyricOffset: this.lyricOffset,
          statusInset: this.statusInset, bottomInset: this.bottomInset, gripSide: this.gripSide, stageVisible: this.showPlayer, landscape: this.landscape,
          onClose: () => { this.showPlayer = false; }, onToggle: () => this.toggle(), onImmersive: () => this.toggleStageControls(false),
          onSeek: (time: number) => this.player.seek(time), onSelectStyle: (value: string) => { this.styleName = value; this.save(); },
          onQuality: (value: string) => { this.quality = value; this.save(); }, onCast: () => { this.openCast(); }, onShare: () => { this.shareCurrent(); },
          onComments: () => { this.commentsOpen = true; } })
          .opacity(this.stageControlsVisible ? this.playerReveal : 0)
          .scale({ x: 0.94 + 0.06 * this.playerReveal, y: 0.94 + 0.06 * this.playerReveal })
          .translate({ y: (1 - this.playerReveal) * Math.min(180, this.viewportHeight * 0.22) + (this.stageControlsVisible ? 0 : -12) })
          .enabled(this.showPlayer && this.stageControlsVisible)
          .hitTestBehavior(this.stageControlsVisible ? HitTestMode.None : HitTestMode.BLOCK_DESCENDANTS)
          .accessibilityLevel(this.showPlayer && this.stageControlsVisible ? 'auto' : 'no-hide-descendants')
          .animation({ duration: 280, curve: curves.cubicBezierCurve(0.2, 0.8, 0.2, 1) })
      }
      if (!this.showPlayer) { this.feedOverlay() }
      DockLayer({ song: this.selected, tab: this.tab, gripSide: this.gripSide, playing: this.playing, busy: this.resolving,
        availableWidth: this.viewportWidth, landscape: this.landscape, searchOpen: this.searchOpen, secondary: this.secondaryDock(),
        detail: this.showPlayer, compact: this.dockCollapsed || this.viewportHeight < 500, mode: this.mode, liked: this.selected ? this.liked(this.selected) : false,
        positionMs: this.positionMs, duration: this.duration, colorFirst: this.coverColors.first, colorLast: this.coverColors.last,
        onTab: (tab: string) => this.navigateTab(tab),
        onPlayer: () => { if (this.selected) this.showPlayer = true; else { this.tab = '发现'; this.searchOpen = true; this.discoveryCompact = false; } },
        onToggle: () => this.toggle(), onNext: (step: number) => this.advance(step), onQueue: () => this.openSheet('播放队列'),
        onMode: () => this.cycle('mode'), onDownload: () => { if (this.selected) this.downloadSong(this.selected); },
        onLike: () => { if (this.selected) this.like(this.selected); }, onExpand: () => this.expandDock(),
        onSeek: (time: number) => this.player.seek(time) })
        .width('100%').margin({ bottom: this.bottomInset + 8 })
        .opacity(!this.showPlayer || this.stageControlsVisible ? 1 : 0)
        .translate({ y: !this.showPlayer || this.stageControlsVisible ? 0 : 24 })
        .hitTestBehavior(!this.showPlayer || this.stageControlsVisible ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS)
        .enabled(!this.showPlayer || this.stageControlsVisible)
        .accessibilityLevel(!this.showPlayer || this.stageControlsVisible ? 'auto' : 'no-hide-descendants')
        .animation({ duration: 280, curve: curves.cubicBezierCurve(0.2, 0.8, 0.2, 1) })
      if (this.commentsOpen) {
        CommentsPanel({ song: this.selected, wide: this.wide, statusInset: this.statusInset, bottomInset: this.bottomInset, onClose: () => { this.commentsOpen = false; } })
          .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 26 })).animation({ curve: curves.springMotion(0.46, 0.84) }))
      }
      if (this.scanOpen) {
        LocalScanDialog({ items: this.scanItems, wide: this.wide, statusInset: this.statusInset, bottomInset: this.bottomInset,
          onCancel: () => this.closeScanDialog(), onConfirm: (uris: string[]) => this.confirmScan(uris) })
          .transition(TransitionEffect.OPACITY.animation({ curve: curves.springMotion(0.4, 0.9) }))
      }
      if (this.orderOpen) {
        SongOrderDialog({ songs: this.orderSongs, wide: this.wide, statusInset: this.statusInset, bottomInset: this.bottomInset,
          onCancel: () => { this.orderOpen = false; }, onDone: (keys: string[]) => this.applyManualOrder(keys) })
          .transition(TransitionEffect.OPACITY.animation({ curve: curves.springMotion(0.4, 0.9) }))
      }
      if (this.editPlaylistOpen && this.openedPlaylist) {
        PlaylistEditDialog({ initialName: this.openedPlaylist.name, songs: this.openedPlaylist.songs ?? [],
          wide: this.wide, statusInset: this.statusInset, bottomInset: this.bottomInset,
          onCancel: () => { this.editPlaylistOpen = false; },
          onSave: (nextName: string, remainingSongs: Song[]) => this.saveEditedPlaylist(nextName, remainingSongs),
          onBatchDownload: (chosen: Song[]) => { this.downloadBatch(chosen); } })
          .transition(TransitionEffect.OPACITY.animation({ curve: curves.springMotion(0.4, 0.9) }))
      }
      if (this.switchTargetScope === 'playlist' && this.switchTargetSong !== null) {
        PlatformSwitchDialog({
          song: this.switchTargetSong,
          contextLabel: this.openedPlaylist?.name ?? '歌单',
          statusInset: this.statusInset,
          bottomInset: this.bottomInset,
          host: this.host,
          onSelect: (replacement: Song) => this.applyPlatformSwitch(replacement),
          onClose: () => { this.switchTargetSong = null; this.switchTargetScope = ''; }
        }).transition(TransitionEffect.OPACITY.animation({ curve: curves.springMotion(0.4, 0.9) }))
      }
      if (this.updateDialogOpen) {
        UpdateDialog({
          info: this.updateInfo,
          errorText: this.updateError,
          downloading: this.updateDownloading,
          progress: this.updateProgress,
          downloadedPath: this.updateDownloadedPath,
          statusInset: this.statusInset,
          bottomInset: this.bottomInset,
          wide: this.wide,
          onDismiss: () => this.dismissUpdateDialog(),
          onRetryCheck: () => { this.dismissUpdateDialog(); this.checkAppUpdate(false).catch(() => {}); },
          onStartDownload: () => { this.startUpdateHapDownload().catch(() => {}); },
          onCancelDownload: () => { cancelHarmonyUpdateDownload(); this.updateDownloading = false; },
          onSaveToLocation: () => { this.saveUpdateHapToLocation().catch(() => {}); },
          onOpenInvite: () => { this.openUpdateInviteLink().catch(() => {}); }
        }).transition(TransitionEffect.OPACITY.animation({ curve: curves.springMotion(0.4, 0.9) }))
      }
      Web({ src: $rawfile('lx-runtime/index.html'), controller: this.controller }).width(1).height(1).opacity(0).javaScriptAccess(true)
        .javaScriptProxy({ object: this.host, name: '__lxNative', methodList: ['onInited', 'onResult', 'httpRequest'], controller: this.controller })
        .onPageEnd(() => { this.host.attach(this.controller); this.hostReady = true; this.restorePlaybackIfReady(); this.restoreSource(); this.consumeSharedPlaylist(); this.refreshHomeFeed().catch(()=>{}); setTimeout(() => { if (!this.disposed) this.checkAppUpdate(true).catch(() => {}); }, 5500); })
    }.width('100%').height('100%').backgroundColor(INK).expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .onAreaChange((oldArea: Area, area: Area) => {
        this.viewportWidth = Number(area.width); this.viewportHeight = Number(area.height); this.wide = this.viewportWidth >= 700;
        const nextLandscape = this.viewportWidth > this.viewportHeight;
        if (!this.dockReady) { this.dockReady = true; this.landscape = nextLandscape; }
        else if (nextLandscape !== this.landscape) {
          this.getUIContext().animateTo({ curve: curves.springMotion(0.46, 0.82) }, () => { this.landscape = nextLandscape; });
        }
        this.syncStageControls();
        if (this.viewportHeight < 500) this.searchMorph = 1;
        else if (!this.discoveryCompact) this.searchMorph = 0;
        this.configureWindow();
      })
      .onTouch((event: TouchEvent) => this.stageGestureTouch(event))
      .bindSheet($$this.showSheet, this.sheetContent(), { height: this.sheet === '播放队列' ? SheetSize.LARGE : SheetSize.FIT_CONTENT,
        width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
        showClose: false, dragBar: true, systemMaterial: musicMenuMaterial() })
  }
}
