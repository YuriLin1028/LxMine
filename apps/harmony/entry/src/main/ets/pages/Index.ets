import { musicButtonPress } from '../components/MaterialControls';
import { webview } from '@kit.ArkWeb';
import { PRODUCT_NAME } from 'BuildProfile';
import { common, ConfigurationConstant } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { avSession, AVCastPickerStyle } from '@kit.AVSessionKit';
import { ShareService } from '../services/ShareService';
import { deviceInfo } from '@kit.BasicServicesKit';
import { picker, fileIo, fileUri } from '@kit.CoreFileKit';
import { buffer } from '@kit.ArkTS';
import { uiMaterial, window, curves, LengthMetrics, display } from '@kit.ArkUI';
import { hdsMaterial } from '@kit.UIDesignKit';
import { GripService, GripSide, isGripSupportedDevice } from '../services/GripService';
import { MINE_RADIO_MODES, MineRadioMode } from '../model/MineRadioModes';
import { MaterialSurface, MaterialIcon, musicMaterial, musicMenuMaterial, MATERIAL_PRESS_SCALE, EXQUISITE_PRESS_SCALE, HdsExquisiteCapsule, isNativeExquisiteDevice, nativeMaterialLevelLabel, logMaterialCapabilities } from '../components/MaterialControls';
import { Song } from '../model/Song';
import { loadPlaybackSnapshot, savePlaybackSnapshot, loadRecentSongs, saveRecentSongs } from '../services/Store';
import { setLatestPlaybackState } from '../services/Continuation';
import { searchLx, searchAllLx, LxSearchSource } from '../services/SearchApi';
import { CatalogueResults } from '../components/CatalogueResults';
import { CatalogueEntity, searchCatalogue, catalogueTracks, SEARCH_KINDS, SEARCH_KIND_IDS } from '../services/CatalogueApi';
import { LxHost, LxSourceInfo, LxSongInfo, LxHash } from '../services/LxRuntime';
import { PlayerService, SessionLyricLine } from '../services/PlayerService';
import { decodePlaylistFile } from '../services/PlaylistFiles';
import { LyricLine, parseLrc, alignAuxLyricsToMain } from '../services/LyricParser';
import { publicLyricBundle } from '../services/LyricService';
import { initStore, loadAppData, saveAppData, loadDeviceId, loadTrustedDevices, saveTrustedDevices, loadTrustCircleTransitive, saveTrustCircleTransitive, loadPendingVouches, savePendingVouches, saveUiDiagnostics, loadHomeCache, saveHomeCache, AppData } from '../services/Store';
import { LanDiscovery, LanDevice } from '../services/LanDiscovery';
import { LanSyncServer, SyncIncoming, AutoSyncServerReply, PairRespondOptions, VouchHandlerReply } from '../services/LanSyncServer';
import {
  pushBundleDetailed,
  pushDirectDetailed,
  pingDirect,
  pairDirect,
  vouchDirect,
  unpairDirect,
  exchangeAutoPlaylists,
  SyncBundle,
  SyncSourcePayload,
  TrustedDevice,
  PairRequestPayload,
  UnpairRequestPayload,
  LanPushResponse,
  PeerSummary,
  IntroducedPeer,
  PendingVouch,
  VouchRequestPayload,
  PENDING_VOUCH_TTL_MS,
  uniqueSyncSources,
  parseTrustedDevices,
  parsePendingVouches,
  generateTrustToken,
  generatePairCode,
  formatPairCode,
  safeTokenEquals,
} from '../services/LanSyncClient';
import { SourceImportBatch } from '../services/SourceImports';
import { MusicPlaylist, createPlaylist, parsePlaylists, playlistWithSong, playlistWithSongs, playlistWithoutSongs, playlistRenamed, playlistCoverUpdated, playlistReordered, playlistSongReplaced, playlistCoversPatched, mergeSyncPlaylists, computeSyncDigest, songKey } from '../services/MusicLibrary';
import { FeedPlaylist, FeedSongsResult, HomeFeed, FeedSection, loadPlatformSection, loadFeedPlaylistSongs, loadMergedHome, enrichPersonalizedHome, loadMergedChartSongs, platformFeedSongs, hydrateSongCovers, applyCoversToSongs, recordListenHabit } from '../services/HomeFeed';
import { PlatformSwitchDialog } from '../components/PlatformSwitchDialog';
import { UpdateDialog } from '../components/UpdateDialog';
import { AppUpdateInfo, UpdateProgress, isStoreEdition, checkHarmonyUpdate, downloadHapToCache, cancelHarmonyUpdateDownload, saveCachedHapToUserLocation, openAppGalleryInviteTest } from '../services/AppUpdater';
import {
  DesktopLyricBounds,
  DesktopLyricDisplayLine,
  DesktopLyricState,
  HarmonyPcWindowService,
  WallpaperStageState,
  isHarmonyPc
} from '../services/HarmonyPcWindowService';
import { DockLayer, PlaybackClockModel } from '../components/DockLayer';
import { SearchPlaybackBar } from '../components/SearchPlaybackBar';
import { MineHome } from '../components/MineHome';
import { HomeChips } from '../components/HomeChips';
import { FeedSectionPage } from '../components/FeedSectionPage';
import { PageHeader } from '../components/PageHeader';
import { DownloadsView } from '../components/DownloadsView';
import { MusicDownloads, MusicDownload } from '../services/MusicDownloads';
import { CoverPalette, CoverColors, EMPTY_COVER_COLORS } from '../services/CoverPalette';
import { NativePlayer } from '../components/NativePlayer';
import { PlayerMoreSheet, PlayerAudioFxSheet, PlayerSleepTimerSheet } from '../components/PlayerMoreSheet';
import { AutoMixPlan, planAutoMix } from '../services/AutoMixPlanner';
import { AudioFxConfig, defaultAudioFxConfig, normalizeAudioFxConfig } from '../services/AudioFxPresets';
import { SMART_STAGE_MODE_ID, SmartStageCache, selectSmartStageMode } from '../services/SmartStageSelector';
import { EarMonitorService, EarMonitorMode, EarMonitorState } from '../services/EarMonitorService';
import { defaultShortcutBindings, normalizeShortcutBindings, formatKeyEventCombo } from '../services/KeyboardShortcuts';
import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { BatchDownloadSheet } from '../components/BatchDownloadSheet';
import { BatchCollectSheet } from '../components/BatchCollectSheet';
import { PlaylistCoverSheet } from '../components/PlaylistCoverSheet';
import { EarMonitorSheet } from '../components/EarMonitorSheet';
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
import { INK, TEXT, MUTED, ACCENT, platformName, devicePlatformName } from '../components/Theme';

// 应用装配与用户动作；可见界面全部原生。
interface PlaybackSnapshot { explicit?: boolean; song: Song; queue: Song[]; positionMs: number; playing: boolean; }
interface SongListInput { songs: Song[]; scroller: Scroller; playQueue?: Song[]; fromSearch?: boolean; preserveQueue?: boolean; }
interface PlatformOption { id: LxSearchSource; label: string; }
interface SongAssets { coverUrl: string; lyric: string; tlyric: string; romalrc: string; exactIdMatch?: boolean; }
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
  @State private leftInset: number = 0;
  @State private rightInset: number = 0;
  @State private showSheet: boolean = false;
  @State private gripSupported: boolean = isGripSupportedDevice();
  @State private gripEnabled: boolean = false;
  @State private gripSide: GripSide = 'center';
  @State private miniExpanded: boolean = true;
  @State private searchOpen: boolean = false;
  private searchReturnToPlayer: boolean = false;
  private playlistReturnToPlayer: boolean = false;
  private playingFromSearch: boolean = false;
  private searchAddedPlaylistMap: Map<string, string> = new Map<string, string>();
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
  @State @Watch('stageControlsVisibilityChanged') private stageControlsVisible: boolean = true;
  @State private stageControlsReveal: number = 1;
  private chipAnchorTimer: number = -1;
  private arrangedMemoKey: string = '';
  private arrangedMemoRef: Song[] | null = null;
  private arrangedMemoOut: Song[] = [];
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
  @State @Watch('coverColorsChanged') private coverColors: CoverColors = EMPTY_COVER_COLORS;
  @State private queue: Song[] = [];
  @State private playing: boolean = false;
  @State private stageFadingOut: boolean = false;
  @State private playbackUrl: string = '';
  @State private viewportWidth: number = 400;
  @State private resolving: boolean = false;
  @State private positionMs: number = 0;
  @State @Watch('durationChanged') private duration: number = 0;
  @State private stageClockMs: number = 0;
  @State private playbackClock: PlaybackClockModel = new PlaybackClockModel();
  @State private queueOrderOpen: boolean = false;
  @State private moreAudioFxOpen: boolean = false;
  @State private moreSleepOpen: boolean = false;
  private returnSheetAfterSub: string = '';
  @State private lyrics: LyricLine[] = [];
  @State @Watch('playerVisibilityChanged') private showPlayer: boolean = false;
  @State private stageMounted: boolean = false;
  @State private mineStageMounted: boolean = false;
  @State private foliaStageMounted: boolean = false;
  @State private plainStageMounted: boolean = false;
  @State private mineStageReady: boolean = false;
  @State private foliaStageReady: boolean = false;
  @State private dynamicStageReady: boolean = false;
  @State private dynamicStageFailed: boolean = false;
  @State private lastMineStyle: string = 'mine-0';
  @State private lastFoliaStyle: string = 'folia-partita';
  private avoidAreaListening: boolean = false;
  private areaSettleTimer: number = -1;
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
  private playlistReturnSearch: boolean = false;
  private playlistReturnFeedOffset: number = 0;
  private playlistReturnHomeOffset: number = 0;
  @State private sources: SyncSourcePayload[] = [];
  @State private sourcesOpen: boolean = false;
  @State private activeId: string = '';
  @State private sourceReady: boolean = false;
  @State private quality: string = '128k';
  @State private libraryMosaicSeed: number = 0;
  @State @Watch('visualStyleChanged') private styleName: string = 'mine-7';
  @State private resolvedStyleName: string = 'mine-7';
  @State private audioFx: AudioFxConfig = defaultAudioFxConfig();
  @State private autoMixEnabled: boolean = false;
  @State private autoMixPreview: string = '';
  @State private playPauseFadeEnabled: boolean = true;
  @State private stageResetCameraOnSong: boolean = true;
  private autoMixPlan: AutoMixPlan | null = null;
  private autoMixPreloadingKey: string = '';
  private autoMixPreloadToken: number = 0;
  private autoMixPreloadInFlight: boolean = false;
  private autoMixPreloadStartedAt: number = 0;
  private autoMixPreloadAttempts: number = 0;
  private autoMixPreloadRetryAt: number = 0;
  private autoMixFailedUrls: Map<string, string[]> = new Map();
  private autoMixNextLyricsCache: Map<string, LyricLine[]> = new Map();
  private autoMixNextLyricsPending: Set<string> = new Set();
  private autoMixPlanDurationMs: number = 0;
  private autoMixNextSong: Song | null = null;
  private autoMixShuffleForKey: string = '';
  private autoMixShuffleCandidate: Song | null = null;
  private autoMixTriggeredFor: string = '';
  @State private dislikedKeys: string[] = [];
  @State private sleepMode: string = 'off';
  @State private sleepEndAt: number = 0;
  @State private sleepFinishSong: boolean = false;
  @State private sleepPendingStop: boolean = false;
  @State private sleepRemainingText: string = '';
  private sleepTimerHandle: number = -1;
  private smartStageCache: SmartStageCache = { catalogSignature: '', choices: {} };
  private smartStageTimer: number = -1;
  @State private stageBgOpacity: number = 0.78;
  @State private stageBgImage: string = '';
  @State private pageBgOpacity: number = 0.35;
  @State private pageBgImage: string = '';
  @State @Watch('applyAppearance') private appearance: string = 'system';
  private readonly nativeExquisiteMaterial: boolean = isNativeExquisiteDevice();
  @State private boostImmersive: boolean = false;
  @State private bluetoothCarLyricsEnabled: boolean = false;
  @State private bluetoothCarLyricsMode: string = 'title';
  @State private bluetoothAudioConnected: boolean = false;
  @State private mode: string = '列表循环';
  @State private lyricOffset: number = 0;
  @State private devices: LanDevice[] = [];
  @State private trustedDevices: TrustedDevice[] = [];
  @State private trustCircleTransitive: boolean = true;
  private trustedMap: Map<string, TrustedDevice> = new Map();
  private pendingVouches: PendingVouch[] = [];
  private vouchInFlight: Set<string> = new Set();
  private vouchBackoff: Map<string, number> = new Map();
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
  @State private platformSwitchOpen: boolean = false;
  @State private sourcesVisited: boolean = false;
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
  // 必须直接声明在 @Component 属性初始化器中，确保 ets-loader 正确改写 @Link 双向引用，彻底根治点击检测更新闪退。
  private updateDialogController: CustomDialogController = new CustomDialogController({
    builder: UpdateDialog({
      info: this.updateInfo,
      errorText: this.updateError,
      downloading: this.updateDownloading,
      progress: this.updateProgress,
      downloadedPath: this.updateDownloadedPath,
      onDismiss: () => this.dismissUpdateDialog(),
      onRetryCheck: () => { this.dismissUpdateDialog(); this.checkAppUpdate(false).catch(() => {}); },
      onStartDownload: () => { this.startUpdateHapDownload().catch(() => {}); },
      onCancelDownload: () => { cancelHarmonyUpdateDownload(); this.updateDownloading = false; },
      onSaveToLocation: () => { this.saveUpdateHapToLocation().catch(() => {}); },
      onOpenInvite: () => { this.openUpdateInviteLink().catch(() => {}); }
    }),
    alignment: DialogAlignment.Center,
    autoCancel: true,
    customStyle: false,
    systemMaterial: musicMenuMaterial(),
    onWillDismiss: (action: DismissDialogAction) => {
      if (this.updateDownloading) return;
      action.dismiss();
      this.updateDialogOpen = false;
    },
    cancel: () => {
      if (!this.updateDownloading) this.updateDialogOpen = false;
    }
  });
  @State private volume: number = 1.0;
  private preMuteVolume: number = 1.0;
  @State private desktopLyrics: boolean = false;
  @State private desktopLyricsLocked: boolean = false;
  @State private mobileDesktopLyrics: boolean = false;
  @State private mobileDesktopLyricsLocked: boolean = false;
  @State private mobileDesktopLyricsSupported: boolean = false;
  @State private desktopLyricSize: number = 1.0;
  @State private desktopLyricLines: number = 3;
  @State private desktopLyricColorMode: string = 'cover-gradient';
  @State private desktopLyricColor: string = '#7DD3FC';
  @State private desktopLyricColor2: string = '#A5B4FC';
  @State private wallpaperMode: boolean = false;
  @State private wallpaperBgOpacity: number = 0.42;
  @State private wallpaperOverallOpacity: number = 0.95;
  private desktopLyricBounds: DesktopLyricBounds | null = null;
  @State private pcImmersiveHovered: boolean = false;
  @State private spatialSystemActive: boolean = false;
  @State private earMonitorState: EarMonitorState = { mode: 'off', micVolume: 1.0, vocalVolume: 1.0, active: false, statusText: '未开启' };
  @State private colorPickerTarget: string = '';
  @State private colorPickerOpen: boolean = false;
  @State private batchDownloadSongs: Song[] | null = null;
  @State private batchDownloadOpen: boolean = false;
  @State private batchCollectSongs: Song[] | null = null;
  @State private batchCollectTitle: string = '批量收藏歌曲';
  @State private batchCollectOpen: boolean = false;
  private upNextKeys: string[] = [];
  @State private coverPickerPlaylist: MusicPlaylist | null = null;
  @State private coverPickerOpen: boolean = false;
  @State private shortcutsEnabled: boolean = true;
  @State private shortcuts: Record<string, string> = defaultShortcutBindings();
  private earMonitor: EarMonitorService = new EarMonitorService();
  private restoringSettings: boolean = false;
  private preResolveKey: string = '';
  private lastDownloadUiAt: number = 0;
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
  private downloadDirPath: string = '';
  private coverPalette: CoverPalette = new CoverPalette();
  private discovery: LanDiscovery | null = null;
  private syncServer: LanSyncServer = new LanSyncServer();
  private autoSyncReconcileTimer: number = -1;
  private autoSyncInFlight: Set<string> = new Set();
  private autoSyncExchanged: Map<string, string> = new Map();
  private autoSyncBackoff: Map<string, number> = new Map();
  private lastAutoSyncToastAt: number = 0;
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
        this.positionMs = Math.max(0, saved.positionMs); this.livePositionMs = this.positionMs; this.playbackClock.positionMs = this.positionMs; this.stageClockMs = this.positionMs; this.duration = saved.song.durationMs;
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
  private previewRetryCount: number = 0;
  private previewBadUrls: string[] = [];
  private previewBadSourceIds: string[] = [];
  private currentResolvedSourceId: string = '';
  private previewRecovering: boolean = false;
  private consecutiveAutoSkipCount: number = 0;
  private lastStageSyncAt: number = 0;
  private lastStageSyncPos: number = 0;
  private syncTimelineStageDark(): void {
    const eff = this.effectiveStyleName();
    this.playbackClock.stageDark = !this.stageLight() || (eff !== 'off' && !eff.startsWith('folia-') && !this.dynamicStageFailed);
  }
  private coverColorsChanged(): void {
    this.playbackClock.colorFirst = this.coverColors.first;
    this.playbackClock.colorLast = this.coverColors.last;
    this.syncTimelineStageDark();
  }
  private durationChanged(): void {
    this.playbackClock.duration = this.duration;
  }
  private expectedTrackDurationMs(song: Song | null): number {
    const metaDur = song?.durationMs ?? 0;
    if (metaDur >= 45000) return metaDur;
    const lastLyricMs = this.lyrics.length ? this.lyrics[this.lyrics.length - 1].timeMs : 0;
    const lyricFloor = lastLyricMs > 0 ? lastLyricMs + 8000 : 0;
    return Math.max(metaDur, lyricFloor);
  }
  private classifyStreamDurationMismatch(song: Song | null, rawMs: number): string {
    if (!song || song.source === 'local' || this.downloads.offline(song)) return 'ok';
    if (rawMs <= 3000) return 'ok';
    const expectedMs = this.expectedTrackDurationMs(song);
    if (expectedMs >= 45000 && rawMs <= 72000 && rawMs < expectedMs * 0.58) {
      return 'preview';
    }
    const metaDur = song.durationMs ?? 0;
    if (metaDur >= 45000 && Math.abs(rawMs - metaDur) > 8000) {
      return 'wrong';
    }
    return 'ok';
  }
  private recoverVipPreviewOrShortStream(resumeAtMs: number, reason: string = 'preview', onExhausted?: () => void): boolean {
    const cur = this.selected;
    if (!cur || cur.source === 'local' || this.downloads.offline(cur) || this.previewRecovering || this.previewRetryCount >= 3) {
      return false;
    }
    this.previewRecovering = true;
    this.previewRetryKey = songKey(cur);
    if (this.playbackUrl && !this.previewBadUrls.includes(this.playbackUrl)) {
      this.previewBadUrls.push(this.playbackUrl);
    }
    if (this.currentResolvedSourceId && !this.previewBadSourceIds.includes(this.currentResolvedSourceId)) {
      this.previewBadSourceIds.push(this.currentResolvedSourceId);
    }
    const retryToken = this.playToken;
    const safeResume = reason === 'wrong' ? 0 : Math.max(0, Math.round(resumeAtMs));
    const notifyLabel = reason === 'wrong'
      ? '检测到曲目不符，正在自动切换匹配音源…'
      : '检测到试听片段，正在自动切换完整音源…';
    if (this.previewRetryCount === 0) {
      this.notify(notifyLabel, 2000);
    }
    const runAttempts = async (): Promise<void> => {
      while (this.previewRetryCount < 3) {
        if (retryToken !== this.playToken || this.disposed) return;
        const attempt = this.previewRetryCount++;
        const hasOtherSource = this.sources.some((s: SyncSourcePayload) => Boolean(s.id) && !this.previewBadSourceIds.includes(s.id ?? ''));
        if (attempt === 0 && !hasOtherSource) continue;
        const preferCross = attempt >= 1;
        const excludeIds = attempt === 0
          ? this.previewBadSourceIds.slice()
          : (attempt >= 2 ? this.previewBadSourceIds.slice() : []);
        const excludeUrls = this.previewBadUrls.slice();
        try {
          const hit = await this.raceAllSourcesForSong(cur, excludeIds, true, true, preferCross, excludeUrls);
          if (retryToken !== this.playToken || this.disposed) return;
          const nextUrl = hit.url ?? '';
          if (!nextUrl || this.previewBadUrls.includes(nextUrl)) continue;
          if (hit.sourceId && hit.sourceId !== this.activeId) {
            this.activeId = hit.sourceId;
            this.save();
          }
          this.playbackUrl = nextUrl;
          this.currentResolvedSourceId = hit.sourceId ?? '';
          this.previewRecovering = false;
          const nextIntent = this.player.beginSwitch(true);
          await this.player.playUrl(nextUrl, cur, safeResume, true, nextIntent);
          return;
        } catch (_) {}
      }
      if (retryToken !== this.playToken || this.disposed) return;
      this.previewRecovering = false;
      onExhausted?.();
    };
    runAttempts().catch(() => {
      if (retryToken !== this.playToken || this.disposed) return;
      this.previewRecovering = false;
      onExhausted?.();
    });
    return true;
  }

  private async checkAppUpdate(silent: boolean = false): Promise<void> {
    if (isStoreEdition() || this.updateChecking || this.disposed) return;
    this.updateChecking = true;
    if (!silent) this.updateError = '';
    try {
      const info = await checkHarmonyUpdate();
      if (this.disposed) return;
      this.updateInfo = info;
      this.updateError = '';
      this.updateDownloadedPath = '';
      if (info.hasUpdate || !silent) {
        this.openUpdateDialog();
      }
    } catch (error) {
      if (!silent && !this.disposed) {
        this.updateInfo = null;
        this.updateError = (error as Error).message || '无法连接更新服务器';
        this.openUpdateDialog();
      }
    } finally {
      this.updateChecking = false;
    }
  }

  private async startUpdateHapDownload(): Promise<void> {
    if (isStoreEdition()) return;
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
    if (isStoreEdition()) return;
    const cached = this.updateDownloadedPath;
    const asset = this.updateInfo?.asset;
    if (!cached || !asset) return;
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      const saved = await saveCachedHapToUserLocation(ctx, cached, asset.name);
      if (saved) {
        this.closeUpdateDialog();
        this.notify(`已保存 ${asset.name} 到指定位置`, 3200);
      }
    } catch (error) {
      this.updateError = `保存失败：${(error as Error).message}`;
    }
  }

  private async openUpdateInviteLink(): Promise<void> {
    if (isStoreEdition()) return;
    try {
      const ctx = getContext(this) as common.UIAbilityContext;
      await openAppGalleryInviteTest(ctx, this.updateInfo?.releaseUrl);
      this.closeUpdateDialog();
    } catch (error) {
      this.updateError = `无法打开应用市场邀测链接：${(error as Error).message}`;
    }
  }

  private openColorPicker(target: string): void {
    this.colorPickerTarget = target;
    this.colorPickerOpen = true;
  }

  private closeColorPicker(): void {
    this.colorPickerOpen = false;
  }

  private closeBatchDownload(): void {
    this.batchDownloadOpen = false;
  }

  private closeBatchCollect(): void {
    this.batchCollectOpen = false;
  }

  private openCoverPicker(playlist: MusicPlaylist): void {
    this.coverPickerPlaylist = playlist;
    this.coverPickerOpen = true;
  }

  private closeCoverPicker(): void {
    this.coverPickerOpen = false;
  }

  private closePlatformSwitch(returnParent: boolean = false): void {
    this.platformSwitchOpen = false;
    if (returnParent) this.maybeReturnToParentSheet();
  }

  private openUpdateDialog(): void {
    if (isStoreEdition() || this.disposed) return;
    this.updateDialogOpen = true;
    try { this.updateDialogController.open(); } catch (_) {}
  }

  private closeUpdateDialog(): void {
    this.updateDialogOpen = false;
    try { this.updateDialogController.close(); } catch (_) {}
  }

  private dismissUpdateDialog(): void {
    cancelHarmonyUpdateDownload();
    this.updateDownloading = false;
    this.closeUpdateDialog();
  }

  private onPcLyricCmd(): void {
    const cmd = this.pcLyricCmd;
    if (!cmd) return;
    if (cmd.startsWith('close:')) {
      this.applyHarmonyPcDesktopLyrics(false);
    } else if (cmd.startsWith('lock:')) {
      const locked = cmd.startsWith('lock:1:');
      this.applyHarmonyPcDesktopLyricsLocked(locked);
    } else if (cmd.startsWith('prev:')) {
      this.advance(-1);
    } else if (cmd.startsWith('toggle:')) {
      this.toggle();
    } else if (cmd.startsWith('next:')) {
      this.advance(1);
    } else if (cmd.startsWith('wallpaper_exit:')) {
      this.toggleHarmonyPcWallpaper(false);
    }
  }

  private applyHarmonyPcDesktopLyrics(enabled: boolean): void {
    this.desktopLyrics = enabled;
    this.save();
    this.pcWindow.setDesktopLyrics(enabled, this.desktopLyricsLocked, this.desktopLyricBounds, this.desktopLyricLines).catch(() => {});
    if (enabled) this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
  }

  private applyHarmonyPcDesktopLyricsLocked(locked: boolean): void {
    this.desktopLyricsLocked = locked;
    this.save();
    this.pcWindow.setDesktopLyricsLocked(locked).catch(() => {});
    if (this.desktopLyrics) this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
  }

  private applyMobileDesktopLyrics(enabled: boolean): void {
    if (isHarmonyPc()) return;
    this.mobileDesktopLyrics = enabled;
    this.save();
    this.player.setSystemDesktopLyrics(enabled, this.mobileDesktopLyricsLocked).then((ok: boolean) => {
      if (this.disposed) return;
      if (!ok && enabled) {
        this.mobileDesktopLyrics = false;
        this.save();
        this.notify('当前系统暂不支持桌面歌词', 2400);
      } else if (ok) {
        this.notify(enabled ? '桌面歌词已开启（切至桌面即可查看）' : '桌面歌词已关闭', 1800);
      }
    }).catch(() => {});
  }

  private applyMobileDesktopLyricsLocked(locked: boolean): void {
    if (isHarmonyPc()) return;
    this.mobileDesktopLyricsLocked = locked;
    this.save();
    this.player.setSystemDesktopLyricsLocked(locked).catch(() => {});
    this.notify(locked ? '已锁定桌面歌词位置' : '已解锁桌面歌词', 1600);
  }

  private buildDesktopLyricLines(activeIdx: number, count: number): DesktopLyricDisplayLine[] {
    if (!this.lyrics.length) return [];
    const total = Math.max(1, Math.min(5, Math.round(count || 3)));
    const active = Math.max(0, Math.min(this.lyrics.length - 1, activeIdx));
    const before = Math.floor((total - 1) / 2);
    const after = total - 1 - before;
    const start = Math.max(0, active - before);
    const end = Math.min(this.lyrics.length, active + after + 1);
    const out: DesktopLyricDisplayLine[] = [];
    for (let i = start; i < end; i += 1) {
      out.push({ text: this.lyrics[i]?.text || '', active: i === active });
    }
    return out;
  }

  private desktopLyricPrimaryColor(): string {
    return this.desktopLyricColorMode.startsWith('custom') ? this.desktopLyricColor : this.coverColors.first;
  }

  private desktopLyricSecondaryColor(): string {
    if (!this.desktopLyricColorMode.endsWith('gradient')) return this.desktopLyricPrimaryColor();
    return this.desktopLyricColorMode.startsWith('custom') ? this.desktopLyricColor2 : this.coverColors.last;
  }

  private applyVolume(value: number, showToast: boolean = false): void {
    const clamped = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    this.volume = clamped;
    if (clamped > 0.01) this.preMuteVolume = clamped;
    this.player.setVolume(clamped);
    this.scheduleSave();
    if (showToast) {
      this.notify(clamped <= 0 ? '已静音' : `音量：${Math.round(clamped * 100)}%`, 1100);
    }
  }

  private toggleMute(): void {
    if (this.volume > 0.01) {
      this.preMuteVolume = this.volume;
      this.applyVolume(0, true);
    } else {
      this.applyVolume(this.preMuteVolume > 0.05 ? this.preMuteVolume : 0.8, true);
    }
  }

  private applyQuality(value: string, showToast: boolean = false): void {
    if (!['128k', '320k', 'flac'].includes(value)) return;
    const changed = this.quality !== value;
    this.quality = value;
    this.save();
    const label = value === 'flac' ? '无损 FLAC' : (value === '320k' ? '高品质 320k' : '标准 128k');
    if (showToast) this.notify(`已切换音质为 ${label}`, 1600);
    if (changed && this.selected && this.selected.source !== 'local' && !this.downloads.offline(this.selected)) {
      const resumeMs = Math.max(0, this.livePositionMs);
      const q = this.queue.length ? this.queue : [this.selected];
      this.playSong(this.selected, q, resumeMs, this.playing, this.playingFromSearch, false, true).catch(() => {});
    }
  }

  private uniqueDislikedCount(): number {
    if (!this.dislikedKeys.length) return 0;
    const explicit = this.dislikedKeys.filter((k: string) => k.includes(':'));
    return explicit.length > 0 ? explicit.length : this.dislikedKeys.length;
  }

  private dismissTopView(): boolean {
    if (this.incoming) return true;
    if (this.colorPickerOpen) { this.closeColorPicker(); return true; }
    if (this.batchDownloadOpen) { this.closeBatchDownload(); return true; }
    if (this.batchCollectOpen) { this.closeBatchCollect(); return true; }
    if (this.coverPickerOpen) { this.closeCoverPicker(); return true; }
    if (this.platformSwitchOpen) { this.closePlatformSwitch(true); return true; }
    if (this.editPlaylistOpen) { this.editPlaylistOpen = false; return true; }
    if (this.orderOpen) { this.orderOpen = false; return true; }
    if (this.queueOrderOpen) { this.queueOrderOpen = false; this.maybeReturnToParentSheet(); return true; }
    if (this.scanOpen) { this.closeScanDialog(); return true; }
    if (this.moreAudioFxOpen) { this.moreAudioFxOpen = false; this.maybeReturnToParentSheet(); return true; }
    if (this.moreSleepOpen) { this.moreSleepOpen = false; this.maybeReturnToParentSheet(); return true; }
    if (this.showSheet) { this.returnSheetAfterSub = ''; this.showSheet = false; return true; }
    if (this.commentsOpen) { this.commentsOpen = false; return true; }
    if (this.wallpaperMode && this.showPlayer && !this.stageControlsVisible) { this.toggleHarmonyPcWallpaper(false); return true; }
    if (this.showPlayer && !this.stageControlsVisible) { this.stageControlsVisible = true; return true; }
    if (this.showPlayer) { this.showPlayer = false; return true; }
    if (this.sourcesOpen) { this.closeSources(); return true; }
    if (this.settingsPanel !== 'main') { this.openSettingsPanel('main'); return true; }
    if (this.downloadsOpen) { this.closeDownloads(); return true; }
    if (this.feedSection) { this.closeFeedSection(); return true; }
    if (this.openedPlaylist) { this.closeOpenedPlaylist(); return true; }
    if (this.openedEntity) { this.openedEntity = null; return true; }
    if (this.searchOpen) { this.closeSearch(); return true; }
    return false;
  }

  private syncHarmonyPcDesktopLyrics(timeMs: number, force: boolean = false): void {
    if (!this.desktopLyrics || !isHarmonyPc()) return;
    const now = Date.now();
    if (!force && now - this.lastPcLyricPushAt < 180) return;
    this.lastPcLyricPushAt = now;
    const adj = timeMs + this.lyricOffset;
    let mainLine = this.selected ? `${this.selected.name}${this.selected.singer ? ' - ' + this.selected.singer : ''}` : 'LxMine';
    let subLine = '';
    let displayLines: DesktopLyricDisplayLine[] = [];
    const lineCount = [1, 2, 3, 5].includes(this.desktopLyricLines) ? this.desktopLyricLines : 3;
    if (this.lyrics.length) {
      let idx = 0;
      for (let i = 0; i < this.lyrics.length; i += 1) {
        if (this.lyrics[i].timeMs <= adj) idx = i;
        else break;
      }
      mainLine = this.lyrics[idx]?.text || mainLine;
      displayLines = this.buildDesktopLyricLines(idx, lineCount);
      const lineTime = this.lyrics[idx].timeMs;
      const trans = this.stageTranslations.find((line: LyricLine) => Math.abs(line.timeMs - lineTime) <= 520);
      if (trans && trans.text) {
        subLine = trans.text;
      } else if (this.lyricPrefs.showTranslation) {
        const rawTr = this.translatedLyrics.find((line: LyricLine) => Math.abs(line.timeMs - lineTime) <= 520);
        if (rawTr && rawTr.text) subLine = rawTr.text;
      }
    }
    const payload: DesktopLyricState = {
      mainText: mainLine,
      subText: subLine,
      lines: displayLines,
      lineCount,
      primaryColor: this.desktopLyricPrimaryColor(),
      secondaryColor: this.desktopLyricSecondaryColor(),
      gradient: this.desktopLyricColorMode.endsWith('gradient'),
      fontSizeScale: this.desktopLyricSize,
      playing: this.playing,
      locked: this.desktopLyricsLocked
    };
    this.pcWindow.syncLyrics(payload);
  }

  private syncHarmonyPcWallpaperState(): void {
    if (!this.wallpaperMode || !isHarmonyPc()) return;
    const state: WallpaperStageState = {
      song: this.selected ?? this.stagePlaceholder,
      audioUrl: this.playbackUrl,
      mode: this.effectiveStyleName(),
      lines: this.lyrics,
      translationLines: this.stageTranslations,
      lyricColorMode: this.lyricPrefs.colorMode.endsWith('gradient') ? 'custom-gradient' : 'custom-solid',
      lyricPrimary: lyricPrimary(this.lyricPrefs, this.coverColors),
      lyricSecondary: lyricSecondary(this.lyricPrefs, this.coverColors),
      light: this.stageLight(),
      bgImage: this.stageBgImage,
      bgOpacity: this.stageBgOpacity,
      wallpaperBgOpacity: this.wallpaperBgOpacity,
      wallpaperOverallOpacity: this.wallpaperOverallOpacity,
      duration: this.duration,
      lyricOffset: this.lyricOffset,
      lyricScale: this.lyricPrefs.scale ?? 1,
      lyricLineSpacing: this.lyricPrefs.lineSpacing ?? 1.2,
      lyricMaxLines: this.lyricPrefs.maxLines ?? 0,
      resetCameraOnSong: this.stageResetCameraOnSong
    };
    this.pcWindow.syncWallpaperState(state);
    this.pcWindow.syncWallpaperClock(this.livePositionMs, this.playing);
  }

  private toggleHarmonyPcWallpaper(enabled: boolean): void {
    this.wallpaperMode = enabled;
    if (enabled) {
      this.syncHarmonyPcWallpaperState();
    }
    this.pcWindow.setWallpaperMode(enabled).then((independentWin: boolean) => {
      if (this.disposed) return;
      if (enabled && !independentWin) {
        // 子窗口不可用时回退至主窗口沉浸全屏展示
        this.showPlayer = true;
        this.stageControlsVisible = false;
      } else if (!enabled) {
        this.stageControlsVisible = true;
      }
      if (enabled) {
        this.syncHarmonyPcWallpaperState();
        this.notify(independentWin ? '已进入独立壁纸舞台（按 Esc 可随时退出）' : '已进入壁纸沉浸模式', 2400);
      }
    }).catch(() => {});
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
    this.pcWindow.onLyricBoundsChanged = (bounds: DesktopLyricBounds) => {
      this.desktopLyricBounds = bounds;
      this.scheduleSave(320);
    };
    try { display.on('foldStatusChange', this.foldListener); } catch (_) {}
    console.info(`[LxMineMaterial] supported=${uiMaterial.isImmersiveMaterialSupported()} level=${uiMaterial.getGlobalMaterialLevel()}`);
    this.player.initialize(getContext(this) as common.UIAbilityContext);
    this.spatialSystemActive = this.player.isSystemSpatialAudioActive();
    this.player.onSpatialAudioChange((active: boolean) => {
      if (!this.disposed) this.spatialSystemActive = active;
    });
    this.player.onBluetoothAudioChange((connected: boolean) => {
      if (!this.disposed) this.bluetoothAudioConnected = connected;
    });
    this.earMonitor.initialize(getContext(this) as common.UIAbilityContext);
    this.earMonitor.onStateChange((state: EarMonitorState) => {
      if (!this.disposed) {
        this.earMonitorState = state;
        this.syncHarmonyVocalCancel();
      }
    });
    this.earMonitor.onVocalGainChange((_gain: number) => {
      this.syncHarmonyVocalCancel();
    });
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
      let stateChanged = items.length !== this.downloadItems.length;
      for (const item of items) {
        const previous = this.downloadItems.find((old: MusicDownload) => old.id === item.id);
        if (!previous || previous.state !== item.state || previous.exported !== item.exported) stateChanged = true;
        if (item.state === 'complete' && previous && previous.state !== 'complete') this.notify('下载完成：' + item.song.name, 3000);
      }
      const now = Date.now();
      if (stateChanged || now - this.lastDownloadUiAt >= 500) {
        this.lastDownloadUiAt = now;
        this.downloadItems = items;
      }
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
    this.player.onFadeOutChange((fadingOut: boolean) => {
      this.stageFadingOut = fadingOut;
      if (!fadingOut) {
        this.stageClockMs = this.livePositionMs;
        this.lastStageSyncAt = Date.now();
        this.lastStageSyncPos = this.livePositionMs;
      }
    });
    this.player.onDesktopLyricChange((visible: boolean) => {
      if (this.disposed || isHarmonyPc()) return;
      if (this.mobileDesktopLyrics !== visible) {
        this.mobileDesktopLyrics = visible;
        this.scheduleSave();
      }
    }, (locked: boolean) => {
      if (this.disposed || isHarmonyPc()) return;
      if (this.mobileDesktopLyricsLocked !== locked) {
        this.mobileDesktopLyricsLocked = locked;
        this.scheduleSave();
      }
    });
    if (!isHarmonyPc()) {
      this.player.checkDesktopLyricSupported().then((supported: boolean) => {
        if (!this.disposed) this.mobileDesktopLyricsSupported = supported;
      }).catch(() => {});
    }
    this.player.onBeforePreparedPlay((rawMs: number): boolean => {
      const cur = this.selected;
      const mismatch = this.classifyStreamDurationMismatch(cur, rawMs);
      if (mismatch === 'ok') return true;
      const stopExhausted = (): void => {
        this.playing = false;
        this.resolving = false;
        this.player.pause(false).catch(() => {});
        this.notify(
          mismatch === 'wrong'
            ? '检测到音源返回曲目与原曲不符，已拦截，请切换音源或平台'
            : '检测到试听片段且暂无可用完整音源，已停止',
          3200
        );
      };
      const started = this.recoverVipPreviewOrShortStream(0, mismatch, stopExhausted);
      if (!started) {
        stopExhausted();
      }
      return false;
    });
    this.player.onState((state: string) => {
      this.playing = state === 'playing'; this.duration = this.player.durationMs();
      if (isHarmonyPc()) {
        this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
        if (this.wallpaperMode) {
          this.syncHarmonyPcWallpaperState();
        }
      }
      if ((state === 'prepared' || state === 'playing') && this.selected && this.selected.source !== 'local') {
        const rawMs = this.player.rawDurationMs();
        const mismatch = this.classifyStreamDurationMismatch(this.selected, rawMs);
        if (mismatch !== 'ok') {
          this.player.pause(false).catch(() => {});
          const stopExhausted = (): void => {
            this.playing = false;
            this.resolving = false;
            this.player.pause(false).catch(() => {});
            this.notify(
              mismatch === 'wrong'
                ? '检测到音源返回曲目与原曲不符，已拦截，请切换音源或平台'
                : '检测到试听片段且暂无可用完整音源，已停止',
              3200
            );
          };
          const started = this.recoverVipPreviewOrShortStream(0, mismatch, stopExhausted);
          if (!started && !this.previewRecovering) {
            stopExhausted();
          }
          return;
        }
      }
      if (state === 'playing') {
        this.stageClockMs = this.livePositionMs;
        this.lastStageSyncAt = Date.now();
        this.lastStageSyncPos = this.livePositionMs;
        this.syncHarmonyVocalCancel();
        this.setLanKeepAlive(false).catch(() => {});
        if (this.selected) {
          const song = this.selected;
          this.recentSongs = [song, ...this.recentSongs.filter((item: Song) => songKey(item) !== songKey(song))];
          saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
          this.preResolveNextTrack();
        }
      }
      if (state === 'completed') {
        if (this.player.isAutoMixActive() || this.previewRecovering) return;
        const cur = this.selected;
        const expectedMs = this.expectedTrackDurationMs(cur);
        const endedPos = Math.max(this.livePositionMs, this.player.currentPositionMs());
        const isPrematureVip = Boolean(
          cur && cur.source !== 'local' && !this.downloads.offline(cur) &&
          expectedMs >= 75000 && endedPos >= 2500 &&
          endedPos < expectedMs * 0.72 && (expectedMs - endedPos) >= 22000
        );
        if (isPrematureVip) {
          const started = this.recoverVipPreviewOrShortStream(Math.max(0, endedPos - 1200), 'preview', () => {
            if (this.sleepMode === 'song' || this.sleepPendingStop) {
              this.clearSleepTimer();
              this.player.pause().catch(() => {});
              this.notify('定时关闭已生效，播放已暂停', 2600);
            } else {
              this.advance(1, true);
            }
          });
          if (started) return;
        }
        if (this.sleepMode === 'song' || this.sleepPendingStop) {
          this.clearSleepTimer();
          this.player.pause().catch(() => {});
          this.notify('定时关闭已生效，播放已暂停', 2600);
        } else {
          this.advance(1, true);
        }
      }
      if (state === 'playing' || state === 'paused') this.savePlayback(true);
    });
    this.player.onAutoMixCommit((nextSong: Song, nextUrl: string, startPosMs: number) => {
      if (this.disposed) return;
      this.playToken++;
      const token = this.playToken;
      this.selected = nextSong;
      this.playbackUrl = nextUrl;
      this.previewRetryKey = '';
      this.previewRetryCount = 0;
      this.previewBadUrls = [];
      this.previewBadSourceIds = [];
      this.currentResolvedSourceId = '';
      this.previewRecovering = false;
      const actualPos = Math.max(0, startPosMs || 0);
      this.positionMs = actualPos;
      this.livePositionMs = actualPos;
      this.playbackClock.positionMs = actualPos;
      this.stageClockMs = actualPos;
      this.lastStageSyncAt = Date.now();
      this.lastStageSyncPos = actualPos;
      this.lastPositionUiAt = Date.now();
      this.duration = this.player.durationMs() || nextSong.durationMs || 0;
      this.playing = true;
      this.resolving = false;
      this.autoMixPlan = null;
      this.autoMixNextSong = null;
      this.autoMixShuffleForKey = '';
      this.autoMixShuffleCandidate = null;
      this.autoMixPreloadToken++;
      this.autoMixPreloadInFlight = false;
      this.autoMixPreloadAttempts = 0;
      this.autoMixPreloadingKey = '';
      this.autoMixPreloadRetryAt = 0;
      this.autoMixTriggeredFor = '';
      this.shareService.setSong(nextSong);
      this.recentSongs = [nextSong, ...this.recentSongs.filter((item: Song) => songKey(item) !== songKey(nextSong))];
      saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
      this.coverPalette.colors(nextSong.coverUrl).then((colors: CoverColors) => {
        if (token === this.playToken && !this.disposed) {
          this.coverColors = colors;
          this.updateSmartStage(true);
          this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
          this.syncHarmonyPcWallpaperState();
        }
      });
      this.updateSmartStage(false);
      this.loadLyrics(this.songInfo(nextSong), nextSong, token);
      this.refreshAutoMixPlan();
      this.savePlayback(true);
    });
    this.player.onTime((time: number) => {
      // 切歌解析期间忽略旧轨残余进度回调，确保进度条与歌词第一时间归零。
      if (this.resolving) return;
      this.livePositionMs = time;
      // 播放页直接更新轻量 PlaybackClockModel 叶节点，零触发 Index 根组件树重绘以保障 120Hz 满帧。
      const now = Date.now();
      if (now - this.lastPositionUiAt >= (this.showPlayer ? 250 : 1000)) {
        this.lastPositionUiAt = now;
        this.playbackClock.positionMs = time;
        if (!this.showPlayer && this.settingsPanel === 'lyrics') {
          this.positionMs = time;
        }
      }
      if (this.showPlayer || this.vocalCancelEngaged()) {
        const expectedStage = this.lastStageSyncPos + (this.playing ? now - this.lastStageSyncAt : 0);
        if (!this.lastStageSyncAt || Math.abs(time - expectedStage) > 90 || (this.playing && now - this.lastStageSyncAt >= 1000)) {
          this.lastStageSyncAt = now;
          this.lastStageSyncPos = time;
          this.stageClockMs = time;
        }
      }
      this.syncHarmonyPcDesktopLyrics(time, false);
      if (this.wallpaperMode && isHarmonyPc()) {
        this.pcWindow.syncWallpaperClock(time, this.playing);
      }
      const duration = this.player.durationMs();
      if (duration !== this.duration) {
        this.duration = duration;
        if (this.autoMixEnabled && duration > 24000 && Math.abs(duration - this.autoMixPlanDurationMs) > 3500) {
          this.refreshAutoMixPlan();
        }
      }
      this.tickAutoMix(time, duration);
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
      // 容器/解码/网络异常时静默触发跨平台换源，不弹报错横幅干扰听歌
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
          this.playbackUrl = hit.url ?? '';
          this.currentResolvedSourceId = hit.sourceId ?? '';
          const nextIntent = this.player.beginSwitch(true);
          this.player.playUrl(hit.url, cur, 0, true, nextIntent).then(() => {
            if (retryToken === this.playToken) this.playbackUrl = hit.url ?? '';
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      console.warn(`[Player] playback error suppressed: ${message}`);
    });
    this.player.onNext((step: number) => this.advance(step));
    this.initialize().catch((error: Error) => { this.error = `初始化失败：${error.message}`; });
  }
  aboutToDisappear(): void {
    this.savePlayback(true);
    this.grip.stop();
    this.disposed = true; this.playToken++; this.searchToken++;
    clearInterval(this.pollTimer);
    clearTimeout(this.chipAnchorTimer);
    clearTimeout(this.areaSettleTimer);
    clearTimeout(this.feedCloseTimer);
    clearTimeout(this.sourcesCloseTimer);
    clearTimeout(this.homeFeedApplyTimer);
    clearTimeout(this.assetRetryTimer);
    clearTimeout(this.autoSyncTimer);
    clearInterval(this.sleepTimerHandle);
    clearTimeout(this.smartStageTimer);
    clearTimeout(this.saveDebounceTimer);
    clearTimeout(this.areaSettleTimer);
    try { this.mainWindow?.off('avoidAreaChange'); } catch (_) {}
    this.pendingHomeFeed = null;
    for (const timer of this.introTimers) clearTimeout(timer);
    if (this.autoSyncReconcileTimer >= 0) { clearTimeout(this.autoSyncReconcileTimer); this.autoSyncReconcileTimer = -1; }
    this.discovery?.stop(); this.syncServer.stop().catch(() => {});
    this.pcWindow.dispose().catch(() => {});
    try { display.off('foldStatusChange', this.foldListener); } catch (_) {}
    this.car.stop();
    this.shareService.stop();
    this.earMonitor.release().catch(() => {});
    try { this.updateDialogController.close(); } catch (_) {}
    this.host.dispose(); this.player.release().catch(() => {});
  }
  onBackPress(): boolean {
    const now = Date.now();
    if (now < this.backGuardUntil) return true;
    const consume = (): boolean => { this.backGuardUntil = now + 1500; return true; };
    console.info(`[BackPress] player=${this.showPlayer} feed=${this.feedSection} playlist=${!!this.openedPlaylist} search=${this.searchOpen}`);
    if (this.incoming) return consume();
    if (this.colorPickerOpen) { this.closeColorPicker(); return consume(); }
    if (this.batchDownloadOpen) { this.closeBatchDownload(); return consume(); }
    if (this.batchCollectOpen) { this.closeBatchCollect(); return consume(); }
    if (this.coverPickerOpen) { this.closeCoverPicker(); return consume(); }
    if (this.platformSwitchOpen) { this.closePlatformSwitch(true); return consume(); }
    if (this.editPlaylistOpen) { this.editPlaylistOpen = false; return consume(); }
    if (this.orderOpen) { this.orderOpen = false; return consume(); }
    if (this.queueOrderOpen) { this.queueOrderOpen = false; this.maybeReturnToParentSheet(); return consume(); }
    if (this.scanOpen) { this.closeScanDialog(); return consume(); }
    if (this.moreAudioFxOpen) { this.moreAudioFxOpen = false; this.maybeReturnToParentSheet(); return consume(); }
    if (this.moreSleepOpen) { this.moreSleepOpen = false; this.maybeReturnToParentSheet(); return consume(); }
    if (this.showSheet) { this.returnSheetAfterSub = ''; this.showSheet = false; return consume(); }
    if (this.commentsOpen) { this.commentsOpen = false; return consume(); }
    if (this.showPlayer && !this.stageControlsVisible) { this.stageControlsVisible = true; return consume(); }
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
    await this.loadTrustedCircle();
    // Start LAN discovery before the stage/source bundle so a slow renderer
    // cannot delay peer visibility.
    this.syncServer.setIdentity(this.deviceId, this.deviceName);
    this.syncServer.setVerifyTrust((peerId: string, token: string): boolean => this.verifyTrustedPeer(peerId, token));
    this.syncServer.onAcceptVouch((_voucherId: string, introduced: IntroducedPeer): VouchHandlerReply => this.handleIncomingVouch(introduced));
    this.syncServer.onUnpair((peerId: string) => {
      setTimeout(() => {
        if (!this.disposed) this.removeTrustedLocal(peerId);
      }, 0);
    });
    this.syncServer.onAutoPlaylists((peerId: string, peerName: string, peerDigest: string, playlistsJson: string): AutoSyncServerReply => {
      try {
        const beforeJson = JSON.stringify(this.playlists);
        const incomingLists = parsePlaylists(playlistsJson);
        const merged = mergeSyncPlaylists(this.playlists, incomingLists);
        const changed = JSON.stringify(merged) !== beforeJson;
        const postDigest = computeSyncDigest(merged);
        if (peerId) {
          this.autoSyncExchanged.set(peerId, `${postDigest}|${peerDigest}`);
        }
        if (changed) {
          this.suppressAutoSyncUntil = Date.now() + 2500;
          this.playlists = merged;
          this.syncLikedKeysStorage();
          if (this.openedPlaylist) {
            const updated = this.openedPlaylist.isFavorite
              ? merged.find((item: MusicPlaylist) => item.isFavorite)
              : merged.find((item: MusicPlaylist) => item.id === this.openedPlaylist?.id);
            if (updated) this.openedPlaylist = updated;
          }
          this.save();
          this.discovery?.announceNow();
          const now = Date.now();
          if (now - this.lastAutoSyncToastAt >= 2500) {
            this.lastAutoSyncToastAt = now;
            this.notify(peerName ? `已自动合并「${peerName}」的歌单与收藏` : '已自动合并局域网歌单与我的收藏', 1800);
          }
          this.scheduleAutoSyncReconcile(450, false);
        }
        return { accepted: true, changed, syncDigest: postDigest, playlists: merged };
      } catch (_) {
        return { accepted: false, changed: false, syncDigest: computeSyncDigest(this.playlists), playlists: [] };
      }
    });
    this.discovery = new LanDiscovery(this.deviceId, this.deviceName);
    this.discovery.pendingRequests = () => this.syncServer.pullRequests();
    this.discovery.syncDigestProvider = () => computeSyncDigest(this.playlists);
    this.discovery.onDevices((devices: LanDevice[]) => {
      setTimeout(() => {
        if (this.disposed) return;
        this.devices = devices;
        this.syncTrustedDisplayNames(devices);
        this.flushPendingVouches();
        if (this.lanAutoSync && this.storeReady) {
          this.scheduleAutoSyncReconcile(350, false);
        }
      }, 0);
    });
    try {
      const port = await this.syncServer.start();
      this.discovery.setPort(port);
    } catch (error) {
      this.message = `局域网同步启动失败：${(error as Error).message}`;
    }
    this.syncServer.onIncoming((incoming: SyncIncoming) => {
      setTimeout(() => {
        if (this.disposed || this.applying) return;
        this.incoming = this.syncServer.pollIncoming() ?? incoming;
        if (this.incoming && this.incoming.id !== this.promptedIncoming) this.askIncoming();
      }, 0);
    });
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
          this.pendingPlayback = saved; this.selected = saved.song; this.queue = saved.queue; this.shareService.setSong(saved.song); this.positionMs = Math.max(0, saved.positionMs); this.livePositionMs = this.positionMs; this.playbackClock.positionMs = this.positionMs; this.stageClockMs = this.positionMs; this.duration = saved.song.durationMs;
          this.coverPalette.colors(saved.song.coverUrl).then((colors: CoverColors) => {
            if (this.selected?.id === saved.song.id) {
              this.coverColors = colors;
              this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
              this.syncHarmonyPcWallpaperState();
            }
          });
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
    if (!this.playlists.some((item: MusicPlaylist) => item.isFavorite)) this.playlists.unshift(createPlaylist('我的收藏', true));
    this.syncLikedKeysStorage();
    this.sources = uniqueSyncSources(JSON.parse(data.sourcesJson) as SyncSourcePayload[]);
    try { this.recentSongs = JSON.parse(await loadRecentSongs()) as Song[]; } catch (_) { this.recentSongs = []; }
    if (!this.sources.length && data.sourceScript) this.sources = [this.sourceFromScript(data.sourceScript)];
    this.activeId = data.activeSourceId || this.sources[0]?.id || ''; this.storeReady = true; this.save(); this.restorePlaybackIfReady(); this.consumeSharedPlaylist();
    if (this.lanAutoSync) {
      this.discovery?.announceNow();
      this.scheduleAutoSyncReconcile(450, true);
    }
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
      const feed = await enrichPersonalizedHome(baseFeed, this.recentSongs, this.playlists, this.host, seed, this.searchHistory, this.dislikedKeys).catch((): HomeFeed => baseFeed);
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
  private arrangedSongs(songs: Song[], applyQuery: boolean = true): Song[] {
    const q = applyQuery ? this.listQuery : '';
    const mKey = this.listSortMode === 'manual' ? `${this.manualOrder.length}:${this.manualOrder[0] ?? ''}` : '';
    const key = `${this.listSortMode}|${q}|${mKey}|${songs.length}`;
    if (this.arrangedMemoRef === songs && this.arrangedMemoKey === key) {
      return this.arrangedMemoOut;
    }
    const out = orderSongList(songs, this.listSortMode, this.manualOrder, q);
    this.arrangedMemoRef = songs;
    this.arrangedMemoKey = key;
    this.arrangedMemoOut = out;
    return out;
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
    this.playlistReturnTab = '资料库'; this.playlistReturnFeed = ''; this.playlistReturnSearch = false;
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
  private isChartFeedItem(item: FeedPlaylist): boolean {
    if (item.kind === 'chart') return true;
    if (item.parts && item.parts.length > 0) return true;
    if (item.id === 'daily-30') return true;
    if ((this.homeFeed?.charts ?? []).some((c: FeedPlaylist) => c.id === item.id)) return true;
    if ((this.homeFeed?.bannerCharts ?? []).some((c: FeedPlaylist) => c.id === item.id)) return true;
    if (item.name && item.name.includes('榜')) return true;
    return false;
  }
  private async openFeedPlaylist(item: FeedPlaylist, autoplay: boolean = false, feedOffsetArg: number = -1, homeOffsetArg: number = -1): Promise<void> {
    this.resetListTools();
    this.playlistScroller = new Scroller();
    const returnTab = this.tab;
    const returnFeed = this.feedSection;
    const returnSearch = this.searchOpen;
    let feedOffset = feedOffsetArg;
    let homeOffset = homeOffsetArg;
    if (feedOffset < 0) { try { feedOffset = returnFeed ? this.feedScroller.currentOffset().yOffset : 0; } catch (_) { feedOffset = 0; } }
    if (homeOffset < 0) { try { homeOffset = returnFeed ? 0 : this.homeScroller.currentOffset().yOffset; } catch (_) { homeOffset = 0; } }
    if (item.id === 'daily-30') {
      // 每日三十首：进入详细列表（队列已在内存，秒开）；点卡片上的播放键则直接开播。
      const songs = this.homeFeed?.dailySongs ?? this.homeFeed?.newSongs.slice(0, 30) ?? [];
      if (!songs.length) { this.error = '每日推荐还没有内容'; return; }
      this.openedFeedLoading = false;
      const shell: MusicPlaylist = { id: 'daily-30', name: '每日三十首', kind: 'lx', songs, songIds: songs.map((song: Song) => songKey(song)), createdAt: Date.now(), updatedAt: Date.now(), preserveQueue: true };
      this.openedFeedSourceId = 'daily-30';
      this.playlistReturnTab = returnTab;
      this.playlistReturnFeed = returnFeed;
      this.playlistReturnSearch = returnSearch;
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
    const isChart = this.isChartFeedItem(item);
    const shell: MusicPlaylist = { id: `feed-${item.id}`, name: item.name, kind: 'lx', songs: [], songIds: [], customCover: item.cover || '', createdAt: Date.now(), updatedAt: Date.now(), preserveQueue: isChart };
    this.openedFeedSourceId = item.id;
    this.playlistReturnTab = returnTab;
    this.playlistReturnFeed = returnFeed;
    this.playlistReturnSearch = returnSearch;
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
    this.playlistReturnSearch = this.searchOpen;
    this.playlistReturnFeedOffset = 0;
    this.playlistReturnHomeOffset = 0;
    if (this.feedSection) {
      try { this.playlistReturnFeedOffset = this.feedScroller.currentOffset().yOffset; } catch (_) {}
    } else {
      try { this.playlistReturnHomeOffset = this.homeScroller.currentOffset().yOffset; } catch (_) {}
    }
  }
  private restoreSettings(): void {
    this.restoringSettings = true;
    let shouldSaveMosaic = false;
    try {
      const appearance = this.settings['lxmine_appearance'];
      this.appearance = typeof appearance === 'string' && ['dark', 'light', 'system'].includes(appearance) ? appearance : 'system';
      this.applyAppearance();
      this.lyricPrefs = lyricPreferences(JSON.stringify(this.settings['lxmine_lyrics'] ?? {}));
      this.updateStageTranslations();
      this.resumeOnStartup = this.settings['lxmine_resume_on_startup'] === true;
      this.gripEnabled = this.gripSupported && this.settings['lxlia_grip_enabled'] === true;
      this.allowLandscapeLocked = this.settings['lxmine_allow_landscape_locked'] !== false
        && this.settings['lxmine_allow_landscape_when_locked'] !== false;
      this.mixWithOthers = this.settings['lxmine_mix_with_others'] === true;
      this.player.setMixWithOthers(this.mixWithOthers);
      this.refreshAlgoDoubleTap = this.settings['lxmine_refresh_algo_double_tap'] !== false;
      this.lanAutoSync = this.settings['lxmine_lan_auto_sync'] === true;
      this.syncServer.setAutoSync(this.lanAutoSync);
      this.discovery?.setAutoSync(this.lanAutoSync);
      this.applyOrientation(this.showPlayer);
      this.startupAnimation = false;
      this.intro = false;
      const history = this.settings['lxlia_search_history'];
      if (Array.isArray(history)) this.searchHistory = history.filter((term: Object) => typeof term === 'string').map((term: Object) => term as string).slice(0, 10);
      this.foregroundChanged();
      const quality = this.settings['lxlia_audio_quality'];
      if (typeof quality === 'string' && ['128k', '320k', 'flac'].includes(quality)) this.quality = quality;
      const rawSmartCache = this.settings['lxmine_smart_stage_cache'];
      if (rawSmartCache && typeof rawSmartCache === 'object') {
        const parsedCache = rawSmartCache as SmartStageCache;
        if (typeof parsedCache.catalogSignature === 'string' && parsedCache.choices && typeof parsedCache.choices === 'object') {
          this.smartStageCache = parsedCache;
        }
      }
      const style = this.settings['lxlia_native_style'];
      if (typeof style === 'string' && MINE_RADIO_MODES.some((mode: MineRadioMode) => mode.id === style)) this.styleName = style;
      const rawFx = this.settings['lxmine_audio_fx'];
      if (rawFx && typeof rawFx === 'object') {
        this.audioFx = normalizeAudioFxConfig(rawFx as Partial<AudioFxConfig>);
        this.player.setAudioEffect(this.audioFx);
      }
      this.autoMixEnabled = this.settings['lxmine_automix'] === true;
      this.playPauseFadeEnabled = this.settings['lxmine_play_pause_fade'] !== false;
      this.player.setPlayPauseFade(this.playPauseFadeEnabled);
      this.stageResetCameraOnSong = this.settings['lxmine_stage_reset_camera'] !== false;
      this.boostImmersive = !this.nativeExquisiteMaterial && this.settings['lxmine_boost_immersive'] === true;
      AppStorage.setOrCreate('lxmineBoostImmersive', this.boostImmersive);
      logMaterialCapabilities(this.boostImmersive);
      this.bluetoothCarLyricsEnabled = this.settings['lxmine_bt_car_lyrics'] === true;
      const rawBtMode = this.settings['lxmine_bt_car_lyrics_mode'];
      this.bluetoothCarLyricsMode = rawBtMode === 'artist' ? 'artist' : (rawBtMode === 'combined' ? 'combined' : 'title');
      this.player.setBluetoothCarLyrics(this.bluetoothCarLyricsEnabled, this.bluetoothCarLyricsMode);
      const rawDisliked = this.settings['lxmine_disliked_keys'];
      if (Array.isArray(rawDisliked)) {
        this.dislikedKeys = rawDisliked.filter((v: Object) => typeof v === 'string').map((v: Object) => v as string).slice(0, 500);
      }
      this.sleepFinishSong = this.settings['lxmine_sleep_finish_song'] === true;
      const savedVol = this.settings['lxmine_volume'];
      if (typeof savedVol === 'number' && Number.isFinite(savedVol)) {
        this.volume = Math.max(0, Math.min(1, savedVol));
        if (this.volume > 0.01) this.preMuteVolume = this.volume;
        this.player.setVolume(this.volume);
      }
      this.shortcutsEnabled = this.settings['lxmine_shortcuts_enabled'] !== false;
      const rawShortcuts = this.settings['lxmine_shortcuts'];
      if (rawShortcuts && typeof rawShortcuts === 'object') {
        this.shortcuts = normalizeShortcutBindings(rawShortcuts as Record<string, Object>);
      } else {
        this.shortcuts = defaultShortcutBindings();
      }
      const bgOp = this.settings['lxmine_stage_bg_opacity'];
      if (typeof bgOp === 'number' && Number.isFinite(bgOp)) this.stageBgOpacity = Math.max(0, Math.min(1, bgOp));
      const pageBgOp = this.settings['lxmine_page_bg_opacity'];
      if (typeof pageBgOp === 'number' && Number.isFinite(pageBgOp)) this.pageBgOpacity = Math.max(0.1, Math.min(0.85, pageBgOp));
      this.loadCustomStageBgImage();
      this.loadCustomPageBgImage();
      const mode = this.settings['lxlia_play_mode'];
      const platform=this.settings['lxmine_home_platform'];if(typeof platform==='string'&&['wy','tx','kw','kg'].includes(platform))this.homePlatform=platform;
      if (typeof mode === 'string' && ['列表循环', '单曲循环', '随机播放', '顺序播放'].includes(mode)) this.mode = mode;
      const savedDlDir = this.settings['lxmine_download_dir_path'];
      if (typeof savedDlDir === 'string') this.downloadDirPath = savedDlDir;
      this.desktopLyrics = isHarmonyPc() && this.settings['lxmine_desktop_lyrics'] === true;
      this.desktopLyricsLocked = this.settings['lxmine_desktop_lyrics_locked'] === true;
      this.mobileDesktopLyrics = !isHarmonyPc() && this.settings['lxmine_mobile_desktop_lyrics'] === true;
      this.mobileDesktopLyricsLocked = this.settings['lxmine_mobile_desktop_lyrics_locked'] === true;
      const dlSize = this.settings['lxmine_desktop_lyric_size'];
      if (typeof dlSize === 'number' && Number.isFinite(dlSize)) this.desktopLyricSize = Math.max(0.72, Math.min(1.55, dlSize));
      const dlLines = this.settings['lxmine_desktop_lyric_lines'];
      if (typeof dlLines === 'number' && [1, 2, 3, 5].includes(Math.round(dlLines))) this.desktopLyricLines = Math.round(dlLines);
      const dlColorMode = this.settings['lxmine_desktop_lyric_color_mode'];
      if (typeof dlColorMode === 'string' && ['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'].includes(dlColorMode)) {
        this.desktopLyricColorMode = dlColorMode;
      }
      const dlColor = this.settings['lxmine_desktop_lyric_color'];
      if (typeof dlColor === 'string' && /^#[0-9a-f]{6}$/i.test(dlColor)) this.desktopLyricColor = dlColor;
      const dlColor2 = this.settings['lxmine_desktop_lyric_color2'];
      if (typeof dlColor2 === 'string' && /^#[0-9a-f]{6}$/i.test(dlColor2)) this.desktopLyricColor2 = dlColor2;
      const rawBounds = this.settings['lxmine_desktop_lyric_bounds'];
      if (rawBounds && typeof rawBounds === 'object') {
        const b = rawBounds as DesktopLyricBounds;
        if (Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height) && b.width >= 360 && b.height >= 112) {
          this.desktopLyricBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      }
      const wpBgOp = this.settings['lxmine_wallpaper_bg_opacity'];
      if (typeof wpBgOp === 'number' && Number.isFinite(wpBgOp)) this.wallpaperBgOpacity = Math.max(0, Math.min(1, wpBgOp));
      const wpAllOp = this.settings['lxmine_wallpaper_overall_opacity'];
      if (typeof wpAllOp === 'number' && Number.isFinite(wpAllOp)) this.wallpaperOverallOpacity = Math.max(0.25, Math.min(1, wpAllOp));
      const lyricOffset = this.settings['lxlia_lyric_offset'];
      if (typeof lyricOffset === 'number') this.lyricOffset = Math.max(-10000, Math.min(10000, lyricOffset));
      // 曲库拼贴只随机一次：种子落设置，之后每次启动复用同一排列。
      const mosaicSeed = this.settings['lxmine_mosaic_seed'];
      if (typeof mosaicSeed === 'number' && mosaicSeed > 0) this.libraryMosaicSeed = mosaicSeed;
      else {
        this.libraryMosaicSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
        this.settings['lxmine_mosaic_seed'] = this.libraryMosaicSeed;
        shouldSaveMosaic = true;
      }
    } finally {
      this.restoringSettings = false;
    }
    this.updateSmartStage(false);
    const eff = this.effectiveStyleName();
    this.previousStyle = eff;
    this.syncDynamicStageReady();
    if (this.showPlayer) this.mountPlaybackStage();
    this.syncTimelineStageDark();
    if (isHarmonyPc() && this.desktopLyrics) {
      this.pcWindow.setDesktopLyrics(true, this.desktopLyricsLocked, this.desktopLyricBounds, this.desktopLyricLines).catch(() => {});
      this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
    } else if (!isHarmonyPc() && this.mobileDesktopLyrics) {
      this.player.setSystemDesktopLyrics(true, this.mobileDesktopLyricsLocked).catch(() => {});
    }
    if (shouldSaveMosaic && this.storeReady) this.save();
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
    this.settings['lxmine_boost_immersive'] = this.boostImmersive;
    this.settings['lxmine_bt_car_lyrics'] = this.bluetoothCarLyricsEnabled;
    this.settings['lxmine_bt_car_lyrics_mode'] = this.bluetoothCarLyricsMode;
    this.settings['lxlia_grip_enabled'] = this.gripEnabled;
    this.settings['lxlia_startup_animation'] = this.startupAnimation;
    this.settings['lxlia_audio_quality'] = this.quality; this.settings['lxlia_native_style'] = this.styleName;
    this.settings['lxmine_audio_fx'] = this.audioFx;
    this.settings['lxmine_automix'] = this.autoMixEnabled;
    this.settings['lxmine_play_pause_fade'] = this.playPauseFadeEnabled;
    this.settings['lxmine_stage_reset_camera'] = this.stageResetCameraOnSong;
    this.settings['lxmine_disliked_keys'] = this.dislikedKeys;
    this.settings['lxmine_sleep_finish_song'] = this.sleepFinishSong;
    this.settings['lxmine_shortcuts_enabled'] = this.shortcutsEnabled;
    this.settings['lxmine_shortcuts'] = this.shortcuts;
    this.settings['lxmine_smart_stage_cache'] = this.smartStageCache;
    this.settings['lxmine_stage_bg_opacity'] = this.stageBgOpacity;
    this.settings['lxmine_page_bg_opacity'] = this.pageBgOpacity;
    this.settings['lxmine_download_dir_path'] = this.downloadDirPath;
    this.settings['lxmine_desktop_lyrics'] = this.desktopLyrics;
    this.settings['lxmine_desktop_lyrics_locked'] = this.desktopLyricsLocked;
    this.settings['lxmine_mobile_desktop_lyrics'] = this.mobileDesktopLyrics;
    this.settings['lxmine_mobile_desktop_lyrics_locked'] = this.mobileDesktopLyricsLocked;
    this.settings['lxmine_desktop_lyric_size'] = this.desktopLyricSize;
    this.settings['lxmine_desktop_lyric_lines'] = this.desktopLyricLines;
    this.settings['lxmine_desktop_lyric_color_mode'] = this.desktopLyricColorMode;
    this.settings['lxmine_desktop_lyric_color'] = this.desktopLyricColor;
    this.settings['lxmine_desktop_lyric_color2'] = this.desktopLyricColor2;
    this.settings['lxmine_volume'] = this.volume;
    if (this.desktopLyricBounds) this.settings['lxmine_desktop_lyric_bounds'] = this.desktopLyricBounds;
    this.settings['lxmine_wallpaper_bg_opacity'] = this.wallpaperBgOpacity;
    this.settings['lxmine_wallpaper_overall_opacity'] = this.wallpaperOverallOpacity;
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
  private pageBgFilePath(): string {
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext | undefined;
    return ctx ? `${ctx.filesDir}/custom_page_bg.dataurl` : '';
  }
  private loadCustomPageBgImage(): void {
    const path = this.pageBgFilePath();
    if (!path) return;
    try {
      if (fileIo.accessSync(path)) {
        const text = fileIo.readTextSync(path);
        if (text && text.startsWith('data:image/')) this.pageBgImage = text;
      }
    } catch (_) {}
  }
  private async pickPageBgImage(): Promise<void> {
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
      const target = this.pageBgFilePath();
      if (target) {
        const out = fileIo.openSync(target, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
        try { fileIo.writeSync(out.fd, dataUrl); } finally { fileIo.closeSync(out.fd); }
      }
      this.pageBgImage = dataUrl;
      this.notify('已更新非播放页自定义背景');
    } catch (_) {
      this.notify('选择背景图失败');
    } finally {
      if (file) { try { fileIo.closeSync(file.fd); } catch (_) {} }
    }
  }
  private clearPageBgImage(): void {
    const path = this.pageBgFilePath();
    if (path) { try { if (fileIo.accessSync(path)) fileIo.unlinkSync(path); } catch (_) {} }
    this.pageBgImage = '';
    this.notify('已恢复非播放页默认背景');
  }
  private saveDebounceTimer: number = -1;
  private save(): void {
    if (!this.storeReady || this.restoringSettings) return;
    this.persist().catch((error: Error) => { this.error = `保存失败：${error.message}`; });
  }
  private scheduleSave(delayMs: number = 260): void {
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      if (!this.disposed) this.save();
    }, delayMs);
  }
  private sourceFromScript(script: string): SyncSourcePayload {
    const name = script.match(/@name\s+([^\r\n*]+)/)?.[1]?.trim() || '自定义音源';
    return { id: `harmony-source-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, name, script, description: '', author: '', version: '', homepage: '', allowShowUpdateAlert: false, importedAt: Date.now() };
  }
  private restoreSource(): void {
    const active = this.sources.find((source: SyncSourcePayload) => source.id === this.activeId) ?? this.sources[0];
    if (this.hostReady && this.storeReady && active && !this.sourceReady && !this.sourceActivation) {
      this.activate(active, true);
    }
  }
  private sourceActivation: Promise<void> | null = null;
  private activationGeneration: number = 0;
  private activate(source: SyncSourcePayload, silent: boolean = false): Promise<void> {
    const activation = this.activateSource(source, ++this.activationGeneration, silent);
    this.sourceActivation = activation;
    activation.finally(() => { if (this.sourceActivation === activation) this.sourceActivation = null; });
    return activation;
  }
  private async activateSource(source: SyncSourcePayload, generation: number, silent: boolean = false): Promise<void> {
    this.sourceReady = false;
    const queue: SyncSourcePayload[] = silent
      ? [source].concat(this.sources.filter((item: SyncSourcePayload) => item.id !== source.id))
      : [source];
    for (const candidate of queue) {
      if (generation !== this.activationGeneration || this.disposed) return;
      try {
        await this.host.loadSource(candidate.script, { name: candidate.name, description: candidate.description, author: candidate.author, version: candidate.version, homepage: candidate.homepage });
        if (generation !== this.activationGeneration || this.disposed) return;
        this.activeId = candidate.id ?? '';
        this.sourceReady = true;
        this.save();
        if (!silent) this.message = `已启用「${candidate.name}」`;
        this.restorePlaybackIfReady();
        return;
      } catch (error) {
        console.warn(`[ActivateSource] ${candidate.name}: ${(error as Error).message}`);
      }
    }
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
      if (entity.song) { await this.playSong(entity.song, [entity.song], 0, true, true, false); return; }
      this.loading = true;
      this.openedEntity = entity; this.entitySongs = [];
      if (entity.kind === 'songlist') {
        const lists = parsePlaylists(await this.host.importPlaylist(entity.id, entity.source), true);
        if (this.disposed || this.openedEntity?.id !== entity.id) return;
        const songs = lists[0]?.songs ?? [];
        this.entitySongs = songs;
        this.openedEntity = entity;
        this.message = songs.length ? `共 ${songs.length} 首歌曲` : '歌单暂时没有可播放歌曲';
        this.searchScroller.scrollTo({ xOffset: 0, yOffset: 0 });
        if (this.hostReady && songs.some((s: Song) => !s.coverUrl)) {
          hydrateSongCovers(this.host, songs.slice(0, 40)).then((covers: Map<string, string>) => {
            if (this.disposed || this.openedEntity?.id !== entity.id || !covers.size) return;
            this.entitySongs = applyCoversToSongs(this.entitySongs, covers);
          }).catch(() => {});
        }
        return;
      }
      const tracks = await catalogueTracks(this.host, entity, 1, (items: Song[], total: number) => {
        if (this.openedEntity?.id !== entity.id) return;
        this.entitySongs = items; this.message = `已获取 ${items.length} 首，正在自动获取其余歌曲…`;
      }, () => this.disposed || this.openedEntity?.id !== entity.id);
      if (this.disposed || this.openedEntity?.id !== entity.id) return;
      this.entitySongs = tracks.items; this.openedEntity = entity; this.message=tracks.warning||'';this.searchScroller.scrollTo({ xOffset: 0, yOffset: 0 });
    } catch (error) { this.error = (error as Error).message; }
    finally { this.loading = false; }
  }
  private async playSong(song: Song, queue: Song[], startMs: number = 0, autoPlay: boolean = true, fromSearch: boolean = false, playAllSearch: boolean = false, preserveQueue: boolean = false, fromAutoAdvance: boolean = false): Promise<void> {
    if (!fromAutoAdvance) {
      this.consecutiveAutoSkipCount = 0;
    }
    if (this.selected && songKey(this.selected) !== songKey(song) && this.livePositionMs > 1500) {
      recordListenHabit(this.selected, this.livePositionMs, this.duration || this.selected.durationMs, false);
    }
    clearTimeout(this.assetRetryTimer);
    this.pendingPlayback = null;
    const local = (song.source === 'local' ? this.localMusic.pathFor(song) : '') || this.downloads.offline(song);
    if (!local && this.sources.length === 0) { this.tab = '设置'; return; }
    let resolvedQueue = queue;
    let resolvedFromSearch = fromSearch;
    const shouldPreserve = (fromSearch && !playAllSearch) || preserveQueue;
    if (shouldPreserve) {
      const targetKey = songKey(song);
      const mappedPlaylistId = (fromSearch && !playAllSearch) ? this.searchAddedPlaylistMap.get(targetKey) : undefined;
      let switchedToTarget = false;
      if (mappedPlaylistId) {
        const targetList = this.playlists.find((p: MusicPlaylist) => p.id === mappedPlaylistId);
        if (targetList && (targetList.songs ?? []).some((s: Song) => songKey(s) === targetKey)) {
          resolvedQueue = (targetList.songs ?? []).slice();
          resolvedFromSearch = false;
          switchedToTarget = true;
        }
      }
      if (!switchedToTarget) {
        if (this.queue.length > 0) {
          const existingIdx = this.queue.findIndex((s: Song) => songKey(s) === targetKey);
          if (existingIdx >= 0) {
            resolvedQueue = this.queue.slice();
          } else {
            const curKey = this.selected ? songKey(this.selected) : '';
            const curIdx = curKey ? this.queue.findIndex((s: Song) => songKey(s) === curKey) : -1;
            const insertAt = curIdx >= 0 ? curIdx + 1 : 0;
            const merged = this.queue.slice();
            merged.splice(insertAt, 0, song);
            resolvedQueue = merged;
          }
        } else {
          resolvedQueue = [song];
        }
      }
    }
    this.playingFromSearch = resolvedFromSearch;
    const nextSongKey = songKey(song);
    if (resolvedQueue !== this.queue) {
      const queueSet = new Set<string>(resolvedQueue.map((item: Song) => songKey(item)));
      this.upNextKeys = this.upNextKeys.filter((k: string) => k !== nextSongKey && queueSet.has(k));
    } else {
      this.upNextKeys = this.upNextKeys.filter((k: string) => k !== nextSongKey);
    }
    const token = ++this.playToken;
    const intentId = this.player.beginSwitch(autoPlay);
    this.selected = song; this.shareService.setSong(song); this.coverColors = EMPTY_COVER_COLORS;
    this.autoMixPlan = null; this.autoMixNextSong = null; this.autoMixPreloadToken++; this.autoMixPreloadInFlight = false; this.autoMixPreloadAttempts = 0; this.autoMixPreloadingKey = ''; this.autoMixTriggeredFor = '';
    this.coverPalette.colors(song.coverUrl).then((colors: CoverColors) => {
      if (token === this.playToken && !this.disposed) {
        this.coverColors = colors;
        this.updateSmartStage(true);
        if (isHarmonyPc()) {
          this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
          this.syncHarmonyPcWallpaperState();
        }
      }
    });
    this.queue = resolvedQueue; this.positionMs = Math.max(0, startMs); this.livePositionMs = this.positionMs; this.playbackClock.positionMs = this.positionMs; this.stageClockMs = this.positionMs; this.lastStageSyncAt = Date.now(); this.lastStageSyncPos = this.positionMs; this.lastPositionUiAt = 0; this.duration = song.durationMs;
    this.previewRetryKey = ''; this.previewRetryCount = 0; this.previewBadUrls = []; this.previewBadSourceIds = []; this.currentResolvedSourceId = ''; this.previewRecovering = false;
    this.lyrics = []; this.translatedLyrics = []; this.romajiLyrics = []; this.stageTranslations = []; this.resolving = true; this.error = '';
    this.updateSmartStage(false);
    this.refreshAutoMixPlan();
    this.player.setLyricData([], this.lyricOffset);
    if (isHarmonyPc()) {
      this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
      this.syncHarmonyPcWallpaperState();
    }
    this.playbackUrl = '';
    let info = this.songInfo(song);
    // 歌词与音频地址并行加载，消除切歌后歌词慢一拍与进度未归零的问题。
    this.loadLyrics(info, song, token);
    try {
      await this.player.pauseForSwitch();
      if (token !== this.playToken || this.disposed) return;
      await this.setLanKeepAlive(false);
      if (token !== this.playToken || this.disposed) return;
      if (!local) {
        if (this.sources.length === 0) return;
        if (this.sourceActivation) {
          await Promise.race([
            this.sourceActivation.catch(() => {}),
            new Promise<void>((resolve) => setTimeout(resolve, 6500)),
          ]);
          if (token !== this.playToken || this.disposed) return;
        }
        info = await this.resolveSongInfo(song);
      }
      if (token !== this.playToken || this.disposed) return;
      this.previewRetryKey = '';
      if (local) {
        await this.player.playFile(local, song, startMs, autoPlay, intentId);
        if (token === this.playToken) {
          this.playbackUrl = `file://${local}`;
          this.consecutiveAutoSkipCount = 0;
        }
        return;
      }
      let hit: RaceUrlResult;
      try {
        hit = await this.raceAllSourcesForSong(song, [], true);
        if (!hit.url) throw new Error('暂未找到可用完整音源');
      } catch (firstErr) {
        if (token !== this.playToken || this.disposed) return;
        if (!fromAutoAdvance) {
          await new Promise<void>((resolve) => setTimeout(resolve, 420));
          if (token !== this.playToken || this.disposed) return;
          hit = await this.raceAllSourcesForSong(song, [], true, true, true);
        } else {
          throw firstErr as Error;
        }
      }
      if (token !== this.playToken || this.disposed) return;
      const url = hit.url ?? '';
      if (!url) throw new Error('暂未找到可用完整音源');
      if (hit.sourceId && hit.sourceId !== this.activeId) {
        this.activeId = hit.sourceId;
        this.save();
      }
      try {
        this.playbackUrl = url;
        this.currentResolvedSourceId = hit.sourceId ?? '';
        await this.player.playUrl(url, song, startMs, autoPlay, intentId);
      } catch (playErr) {
        if (token !== this.playToken || this.disposed) return;
        const retryHit = await this.raceAllSourcesForSong(song, hit.sourceId ? [hit.sourceId] : [], true, true, true, [url]);
        if (token !== this.playToken || this.disposed) return;
        const retryUrl = retryHit.url ?? '';
        if (!retryUrl) throw playErr as Error;
        hit = retryHit;
        if (retryHit.sourceId && retryHit.sourceId !== this.activeId) {
          this.activeId = retryHit.sourceId;
          this.save();
        }
        this.playbackUrl = retryUrl;
        this.currentResolvedSourceId = retryHit.sourceId ?? '';
        await this.player.playUrl(retryUrl, song, startMs, autoPlay, intentId);
      }
      if (token === this.playToken) {
        this.playbackUrl = hit.url ?? url;
        this.error = '';
        this.consecutiveAutoSkipCount = 0;
        if (hit.switched && hit.sourceName) {
          this.notify(`已自动切换至「${hit.sourceName}」`, 2200);
        }
        if (!this.lyrics.length) this.loadLyrics(info, song, token);
      }
    } catch (error) {
      const message = (error as Error).message;
      console.warn(`[PlaySong] suppressed source error: ${message}`);
      if (token === this.playToken) {
        this.error = '';
        if (fromAutoAdvance && autoPlay && this.queue.length > 1 && this.consecutiveAutoSkipCount < 2) {
          this.consecutiveAutoSkipCount++;
          setTimeout(() => { if (token === this.playToken && !this.disposed) this.advance(1, false, true); }, 220);
        }
      }
    }
    finally { if (token === this.playToken) this.resolving = false; }
  }
  private preResolveTimer: number = -1;
  private preResolveNextTrack(): void {
    const next = this.nextQueueSong();
    if (!next || next.source === 'local' || !this.sourceReady || !this.hostReady || this.disposed) return;
    if (this.downloads.offline(next)) return;
    const nk = songKey(next);
    if (this.preResolveKey === nk) return;
    this.preResolveKey = nk;
    clearTimeout(this.preResolveTimer);
    const token = this.playToken;
    // 延迟 4.5s 再后台静默预解析下一首，避免切歌瞬间与动效/歌词争抢资源。
    this.preResolveTimer = setTimeout(() => {
      if (this.disposed || token !== this.playToken) return;
      this.raceAllSourcesForSong(next, [], true).catch(() => {});
    }, 4500);
  }
  private friendlyPlayError(raw: string): string {
    const msg = (raw ?? '').trim();
    if (!msg) return '暂未找到可用完整音源，请稍后重试';
    if (/^[\x00-\x7F]+$/.test(msg) || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|socket|HTTP \d{3}|timeout|status code/i.test(msg)) {
      return '当前歌曲暂无法获取完整音源，请检查网络或导入更多音源';
    }
    return msg;
  }
  private async raceAllSourcesForSong(
    song: Song,
    excludeSourceIds: string[] = [],
    raceAll: boolean = false,
    forceResolve: boolean = false,
    preferCrossPlatform: boolean = false,
    excludeUrls: string[] = []
  ): Promise<RaceUrlResult> {
    const payload = JSON.stringify({
      sources: this.sources,
      activeId: this.activeId,
      song,
      quality: this.quality,
      excludeSourceIds,
      excludeUrls,
      raceAll,
      forceResolve,
      preferCrossPlatform,
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
    const supported = this.host.supportedSources('musicUrl');
    input.matchSources = supported.length ? supported : ['wy', 'tx', 'kg', 'kw'];
    const matched = JSON.parse(await this.host.catalogue('match-song', JSON.stringify(input))) as Song;
    return this.songInfo(matched);
  }
  private isDownloadDirWritable(dirPath: string): boolean {
    if (!dirPath) return false;
    try {
      if (!fileIo.accessSync(dirPath)) return false;
      const clean = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
      const probe = `${clean}/.lxmine_write_probe_${Date.now()}`;
      const f = fileIo.openSync(probe, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      fileIo.closeSync(f);
      fileIo.unlinkSync(probe);
      return true;
    } catch (_) {
      return false;
    }
  }
  private async ensureDownloadDir(ctx: common.UIAbilityContext): Promise<string> {
    if (this.isDownloadDirWritable(this.downloadDirPath)) {
      return this.downloadDirPath;
    }
    const docPicker = new picker.DocumentViewPicker(ctx);
    const opts = new picker.DocumentSaveOptions();
    opts.pickerMode = picker.DocumentPickerMode.DOWNLOAD;
    const dirUris = await docPicker.save(opts);
    if (!dirUris || !dirUris.length) return '';
    const resolved = new fileUri.FileUri(dirUris[0]).path;
    if (resolved) {
      this.downloadDirPath = resolved;
      this.save();
    }
    return resolved;
  }
  private async downloadSong(song: Song): Promise<void> {
    if (!this.sources.length) { this.tab = '设置'; return; }
    try {
      const ctx = (this.getUIContext().getHostContext() as common.UIAbilityContext | undefined) ?? (getContext(this) as common.UIAbilityContext);
      const info = await this.resolveSongInfo(song);
      const extension = info.type.includes('flac') ? 'flac' : 'mp3';
      const name = `${song.singer} - ${song.name}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').slice(0, 160) || song.name || 'song';
      const fileName = `${name}.${extension}`;
      // 优先使用系统授权的 Download/<应用目录>：在文件管理可见，且应用拥有完整读写与物理删除权限
      let targetDirPath = '';
      let fallbackUri = '';
      try {
        targetDirPath = await this.ensureDownloadDir(ctx);
        if (!targetDirPath) return;
      } catch (_) {
        const uris = await new picker.DocumentViewPicker(ctx).save({ newFileNames: [fileName] });
        if (!uris || !uris.length) return;
        fallbackUri = uris[0];
      }
      this.notify(`正在获取「${song.name}」的下载地址…`, 2000);
      const hit = await this.raceAllSourcesForSong(song, [], true);
      const url = hit.url ?? '';
      if (!url) throw new Error('未获取到有效下载地址');
      const finalExt = (hit.type || info.type).includes('flac') ? 'flac' : 'mp3';
      const finalName = `${name}.${finalExt}`;
      await this.downloads.start(song, hit.type || info.type, url, fallbackUri, targetDirPath, finalName);
      this.message = `开始下载「${song.name}」`;
      this.notify(this.message);
    } catch (error) { this.notify(`下载失败：${(error as Error).message}`, 2600); }
  }
  private openBatchDownloadPicker(songs: Song[]): void {
    if (!this.sources.length) { this.tab = '设置'; return; }
    const online = songs.filter((s: Song) => s && s.source !== 'local');
    if (!online.length) {
      this.notify('当前列表没有可下载的在线歌曲', 2200);
      return;
    }
    this.batchDownloadSongs = online;
    this.batchDownloadOpen = true;
  }
  private async downloadBatch(songs: Song[]): Promise<void> {
    if (!this.sourceReady) { this.error = '先启用音源再批量下载'; this.notify(this.error); this.tab = '设置'; return; }
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext | undefined;
    if (!ctx) return;
    const seen = new Set<string>();
    const targets: Song[] = [];
    let skippedLocal = 0;
    for (const song of songs) {
      const key = songKey(song);
      if (seen.has(key)) continue;
      seen.add(key);
      if (song.source === 'local') { skippedLocal += 1; continue; }
      targets.push(song);
    }
    if (!targets.length) {
      this.notify(skippedLocal > 0 ? '所选歌曲均为本地音频' : '没有可下载的歌曲', 2200);
      return;
    }
    const ext = this.quality.includes('flac') ? 'flac' : 'mp3';
    const usedNames = new Set<string>();
    const fileNames: string[] = targets.map((s: Song, i: number) => {
      const base = `${s.singer} - ${s.name}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\s*-\s*/, '').trim().slice(0, 100) || `track_${i + 1}`;
      let candidate = `${base}.${ext}`;
      let suffix = 2;
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${base}_${suffix++}.${ext}`;
      }
      usedNames.add(candidate.toLowerCase());
      return candidate;
    });
    // 优先直接写入系统授权的 Download/<应用目录>，一次授权长期有效且支持在下载管理中真实删除源文件
    let targetUris: string[] = [];
    let targetDirPath: string = '';
    try {
      targetDirPath = await this.ensureDownloadDir(ctx);
      if (!targetDirPath) return;
    } catch (dirErr) {
      try {
        const docPicker = new picker.DocumentViewPicker(ctx);
        const opts = new picker.DocumentSaveOptions();
        opts.newFileNames = fileNames.slice(0, 40);
        targetUris = await docPicker.save(opts);
        if (!targetUris || !targetUris.length) return;
      } catch (fallbackErr) {
        const msg = (fallbackErr as Error).message || (dirErr as Error).message || '';
        if (!msg.toLowerCase().includes('cancel')) {
          this.error = `未能打开保存目录选择器：${msg}`;
          this.notify(this.error, 3000);
        }
        return;
      }
    }
    this.notify(`开始批量下载（共 ${targets.length} 首）…`, 2400);
    let cursor = 0;
    let started = 0;
    let exportedCached = 0;
    let failed = 0;
    const worker = async (): Promise<void> => {
      while (cursor < targets.length && !this.disposed) {
        const index = cursor++;
        const song = targets[index];
        const uri = targetUris[index] ?? '';
        const name = fileNames[index] ?? '';
        try {
          if (this.downloads.offline(song)) {
            const ok = await this.downloads.exportOfflineSong(song, uri, targetDirPath, name);
            if (ok) { exportedCached += 1; continue; }
          }
          const hit = await this.raceAllSourcesForSong(song, [], true);
          if (!hit.url) throw new Error('无可用音频地址');
          const q = hit.type || this.quality;
          await this.downloads.start(song, q, hit.url, uri, targetDirPath, name);
          started += 1;
        } catch (_) {
          failed += 1;
        }
      }
    };
    const concurrency = Math.min(2, targets.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);
    const parts: string[] = [];
    if (started > 0) parts.push(`已开始下载并导出 ${started} 首`);
    if (exportedCached > 0) parts.push(`直接导出已缓存 ${exportedCached} 首`);
    if (failed > 0) parts.push(`失败 ${failed} 首`);
    this.message = parts.length ? parts.join('，') : '批量下载已完成';
    this.notify(this.message, 3200);
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
  private async exportDownloadsBatch(items: MusicDownload[]): Promise<void> {
    const completed = items.filter((item: MusicDownload) => item.state === 'complete');
    if (!completed.length) return;
    if (completed.length === 1) {
      await this.exportDownload(completed[0]);
      return;
    }
    const ctx = getContext(this) as common.UIAbilityContext;
    const usedNames = new Set<string>();
    const fileNames: string[] = completed.map((item: MusicDownload): string => {
      const ext = item.path.toLowerCase().endsWith('.flac') ? 'flac' : 'mp3';
      const base = `${item.song.singer} - ${item.song.name}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 120) || item.id;
      let candidate = `${base}.${ext}`;
      let seq = 2;
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${base} (${seq++}).${ext}`;
      }
      usedNames.add(candidate.toLowerCase());
      return candidate;
    });
    let targetUris: string[] = [];
    let targetDirPath = '';
    try {
      const docPicker = new picker.DocumentViewPicker(ctx);
      if (completed.length <= 20) {
        const opts = new picker.DocumentSaveOptions();
        opts.newFileNames = fileNames;
        targetUris = await docPicker.save(opts);
        if (!targetUris || !targetUris.length) return;
      } else {
        const opts = new picker.DocumentSaveOptions();
        opts.pickerMode = picker.DocumentPickerMode.DOWNLOAD;
        const dirUris = await docPicker.save(opts);
        if (!dirUris || !dirUris.length) return;
        targetDirPath = new fileUri.FileUri(dirUris[0]).path;
      }
    } catch (_) {
      try {
        const docPicker = new picker.DocumentViewPicker(ctx);
        const opts = new picker.DocumentSaveOptions();
        opts.pickerMode = picker.DocumentPickerMode.DOWNLOAD;
        const dirUris = await docPicker.save(opts);
        if (!dirUris || !dirUris.length) return;
        targetDirPath = new fileUri.FileUri(dirUris[0]).path;
      } catch (err) {
        const msg = (err as Error).message || '';
        if (!msg.toLowerCase().includes('cancel')) this.notify(`打开保存位置失败：${msg}`);
        return;
      }
    }
    let okCount = 0;
    for (let i = 0; i < completed.length; i++) {
      const item = completed[i];
      try {
        if (targetUris[i]) {
          await this.downloads.exportFile(item.id, targetUris[i]);
          okCount += 1;
        } else if (targetDirPath) {
          await this.downloads.exportToDir(item.id, targetDirPath, fileNames[i]);
          okCount += 1;
        }
      } catch (_) {}
    }
    this.notify(okCount > 0 ? `已批量另存 ${okCount} 首歌曲` : '批量另存失败');
  }
  private async deleteDownloads(ids: string[], deleteSourceFile: boolean): Promise<void> {
    if (!ids.length) return;
    try {
      if (deleteSourceFile && this.selected && this.playing) {
        const targets = this.downloads.findByIds(ids);
        const curKey = songKey(this.selected);
        if (targets.some((item: MusicDownload) => songKey(item.song) === curKey)) {
          try { await this.player.pause(); } catch (_) {}
        }
      }
      const res = await this.downloads.removeBatch(ids, deleteSourceFile);
      if (deleteSourceFile && (res.removedPaths.length > 0 || res.removedSongKeys.length > 0)) {
        this.localMusic.removeAdoptedPaths(res.removedPaths, res.removedSongKeys);
        this.localTracks = this.localMusic.songs();
      }
      const label = ids.length > 1 ? `${ids.length} 项下载` : '下载任务';
      if (!deleteSourceFile) {
        this.notify(`已移除${label}记录`);
      } else if (res.failedExportFiles.length > 0) {
        this.notify(`已清理应用内音频，另有 ${res.failedExportFiles.length} 个旧版外部另存文件受系统权限限制，请在文件管理中手动删除`, 3600);
      } else {
        this.notify(`已删除${label}及本地源文件`);
      }
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  private isRawLyricConsistent(raw: string, song: Song): boolean {
    if (!raw) return false;
    const norm = (s: string): string => s.toLowerCase().replace(/[\s\-_()（）【】[\]·.,!?'"`]+/g, '');
    const tiMatch = raw.match(/\[ti\s*:\s*([^\]]+)\]/i);
    const arMatch = raw.match(/\[ar\s*:\s*([^\]]+)\]/i);
    const origSingerTokens = (song.singer || '').split(/[、,&/;，/|]+/).map(norm).filter((t: string) => t.length >= 2 && t !== '未知歌手' && t !== '群星');
    if (arMatch && origSingerTokens.length > 0) {
      const lrcSingerTokens = arMatch[1].split(/[、,&/;，/|]+/).map(norm).filter((t: string) => t.length >= 2 && t !== '未知歌手' && t !== '群星');
      if (lrcSingerTokens.length > 0) {
        const overlap = origSingerTokens.some((a: string) => lrcSingerTokens.some((b: string) => a === b || a.includes(b) || b.includes(a)));
        if (!overlap) return false;
      }
    }
    const origTitle = norm((song.name || '').replace(/\((?:live|现场|原版|正式版|国语|粤语)[^)]*\)/gi, ''));
    if (tiMatch && origTitle.length >= 2) {
      const parts = tiMatch[1].split(/\s*-\s*/).map(norm).filter((p: string) => p.length > 0);
      if (parts.length > 0 && !parts.some((p: string) => p === origTitle || (Math.min(p.length, origTitle.length) >= 3 && (p.includes(origTitle) || origTitle.includes(p))))) {
        return false;
      }
    }
    return true;
  }
  private lyricsLinesMatch(refLines: LyricLine[], candLines: LyricLine[]): boolean {
    if (!refLines.length || !candLines.length) return false;
    const norm = (s: string): string => s.toLowerCase().replace(/[\s\-_()（）【】[\]·.,!?'"`:：]+/g, '');
    const refSet = new Set<string>(refLines.map((l: LyricLine) => norm(l.text)).filter((s: string) => s.length >= 2));
    if (refSet.size === 0) return true;
    const refArr = Array.from(refSet);
    let hits = 0;
    const sample = Math.min(candLines.length, 14);
    for (let i = 0; i < sample; i++) {
      const b = norm(candLines[Math.floor((i * candLines.length) / sample)].text);
      if (b && (refSet.has(b) || refArr.some((r: string) => r.includes(b) || b.includes(r)))) hits++;
    }
    return hits >= Math.max(2, Math.ceil(sample * 0.5));
  }
  private async loadLyrics(info: LxSongInfo, song: Song, token: number, retryCount: number = 0): Promise<void> {
    clearTimeout(this.assetRetryTimer);
    let lines: LyricLine[] = retryCount > 0 ? this.lyrics : [], translation: LyricLine[] = retryCount > 0 ? this.translatedLyrics : [], romaji: LyricLine[] = retryCount > 0 ? this.romajiLyrics : [];
    let lockedExactMatch = false;
    let cover = song.coverUrl;
    let lastPublishedSig = '';
    const publish = (): void => {
      if (token !== this.playToken || this.disposed || !this.selected || songKey(this.selected) !== songKey(song)) return;
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
        this.coverPalette.colors(updated.coverUrl).then((colors: CoverColors) => {
          if (token === this.playToken && !this.disposed) {
            this.coverColors = colors;
            if (isHarmonyPc()) {
              this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
              this.syncHarmonyPcWallpaperState();
            }
          }
        });
      }
      this.lyrics = lines; this.translatedLyrics = translation; this.romajiLyrics = romaji; this.updateStageTranslations();
      const sessionLines: SessionLyricLine[] = lines.map((line: LyricLine) => { return { timeMs: line.timeMs, text: line.text } as SessionLyricLine; });
      this.player.setLyricData(sessionLines, this.lyricOffset);
      this.updateSmartStage(true);
      this.refreshAutoMixPlan();
      if (isHarmonyPc()) {
        this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
        this.syncHarmonyPcWallpaperState();
      }
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
      const isExact = Boolean(full.exactIdMatch && publicLines.length > 0);
      if (isExact) {
        const curHasWords = lines.some((l: LyricLine) => (l.words?.length ?? 0) > 1);
        const pubHasWords = publicLines.some((l: LyricLine) => (l.words?.length ?? 0) > 1);
        if (!(curHasWords && !pubHasWords && this.lyricsLinesMatch(publicLines, lines))) {
          lines = publicLines;
        }
        lockedExactMatch = true;
        const pubTrans = parseLrc(full.tlyric);
        const pubRoma = parseLrc(full.romalrc);
        if (pubTrans.length) translation = pubTrans;
        if (pubRoma.length) romaji = pubRoma;
      } else {
        if (!lockedExactMatch && publicLines.length > lines.length) lines = publicLines;
        if (!translation.length) translation = parseLrc(full.tlyric);
        if (!romaji.length) romaji = parseLrc(full.romalrc);
      }
      cover = full.coverUrl || cover;
      publish();
    }).catch(() => {});
    try {
      const bundle = await Promise.race([
        this.host.requestLyricBundle(info),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('lyric timeout')), 3500))
      ]);
      const rawProvided = bundle.lxlyric || bundle.lyric || '';
      if (this.isRawLyricConsistent(rawProvided, song)) {
        const provided = parseLrc(rawProvided);
        if (provided.length > 0) {
          if (lockedExactMatch) {
            const curHasWords = lines.some((l: LyricLine) => (l.words?.length ?? 0) > 1);
            const provHasWords = provided.some((l: LyricLine) => (l.words?.length ?? 0) > 1);
            if (provHasWords && !curHasWords && this.lyricsLinesMatch(lines, provided)) {
              lines = provided;
            }
          } else if (provided.length >= lines.length) {
            lines = provided;
          }
        }
        const providedTranslation = parseLrc(bundle.tlyric || '');
        const providedRomaji = parseLrc(bundle.romalrc || bundle.rlyric || '');
        if (providedTranslation.length && (!lockedExactMatch || !translation.length)) translation = providedTranslation;
        if (providedRomaji.length && (!lockedExactMatch || !romaji.length)) romaji = providedRomaji;
        publish();
      }
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
    if (retryCount < 2 && token === this.playToken && !this.disposed && (!lines.length || !cover)) {
      const delay = retryCount === 0 ? 1200 : 3200;
      this.assetRetryTimer = setTimeout(() => {
        if (token === this.playToken && !this.disposed && this.selected) this.loadLyrics(info, this.selected, token, retryCount + 1);
      }, delay);
    }
  }
  private toggle(): void {
    if (this.resolving) return;
    this.setLanKeepAlive(false).catch(() => {});
    if (this.playing) this.player.pause().catch((error: Error) => { this.error = error.message; });
    else this.player.resume(this.selected ? songKey(this.selected) : undefined).then((resumed: boolean) => {
      if (!resumed && this.selected) {
        const rawPos = Math.max(this.livePositionMs, this.positionMs, this.pendingPlayback?.positionMs ?? 0);
        const dur = this.duration || this.selected.durationMs || 0;
        const resumePos = (dur > 5000 && rawPos >= dur - 2500) ? 0 : rawPos;
        this.playSong(this.selected, this.queue, resumePos, true, this.playingFromSearch);
      }
    }).catch((error: Error) => { this.error = error.message; });
  }
  private resolveUpNextIndex(excludeKey: string, consume: boolean): number {
    if (!this.upNextKeys.length || !this.queue.length) return -1;
    for (let i = 0; i < this.upNextKeys.length; i += 1) {
      const key = this.upNextKeys[i];
      if (!key || key === excludeKey) continue;
      const idx = this.queue.findIndex((item: Song) => songKey(item) === key);
      if (idx >= 0) {
        if (consume) {
          this.upNextKeys = this.upNextKeys.slice(i + 1);
        }
        return idx;
      }
    }
    if (consume) this.upNextKeys = [];
    return -1;
  }
  private playNext(song: Song): void {
    const targetKey = songKey(song);
    if (!this.selected || !this.queue.length) {
      this.playSong(song, [song]).catch(() => {});
      return;
    }
    const curKey = songKey(this.selected);
    if (curKey === targetKey) {
      this.notify('当前正在播放这首歌曲', 1600);
      return;
    }
    const nextQueue = this.queue.filter((item: Song) => songKey(item) !== targetKey);
    const curIdx = nextQueue.findIndex((item: Song) => songKey(item) === curKey);
    const insertAt = curIdx >= 0 ? curIdx + 1 : 0;
    nextQueue.splice(insertAt, 0, song);
    this.queue = nextQueue;
    this.upNextKeys = [targetKey].concat(this.upNextKeys.filter((k: string) => k !== targetKey));
    this.autoMixShuffleForKey = '';
    this.autoMixShuffleCandidate = null;
    this.autoMixPreloadToken++;
    this.autoMixPreloadInFlight = false;
    this.autoMixPreloadAttempts = 0;
    this.autoMixPreloadingKey = '';
    this.autoMixPreloadRetryAt = 0;
    this.autoMixTriggeredFor = '';
    this.player.cancelAutoMix();
    this.refreshAutoMixPlan();
    this.savePlayback(true);
    this.notify(`已将「${song.name}」设为下一首播放`, 1600);
  }
  private advance(step: number, completed: boolean = false, fromAutoAdvance: boolean = false): void {
    if (!this.queue.length || !this.selected) return;
    if (completed) {
      recordListenHabit(this.selected, this.duration || this.selected.durationMs, this.duration || this.selected.durationMs, true);
    }
    const curKey = songKey(this.selected);
    const index = this.queue.findIndex((song: Song) => songKey(song) === curKey);
    let next = -1;
    if (step > 0 && !(completed && this.mode === '单曲循环')) {
      next = this.resolveUpNextIndex(curKey, true);
    }
    if (next < 0) {
      if (completed && this.mode === '顺序播放' && index >= this.queue.length - 1) return;
      next = (index + step + this.queue.length) % this.queue.length;
      if (completed && this.mode === '单曲循环') next = Math.max(0, index);
      else if (this.mode === '随机播放' && this.queue.length > 1) {
        if (step > 0 && this.autoMixShuffleCandidate && this.autoMixShuffleForKey === curKey) {
          const picked = this.queue.findIndex((song: Song) => songKey(song) === songKey(this.autoMixShuffleCandidate!));
          next = picked >= 0 ? picked : (Math.max(0, index) + 1 + Math.floor(Math.random() * (this.queue.length - 1))) % this.queue.length;
        } else {
          next = (Math.max(0, index) + 1 + Math.floor(Math.random() * (this.queue.length - 1))) % this.queue.length;
        }
      }
    }
    this.autoMixShuffleForKey = '';
    this.autoMixShuffleCandidate = null;
    this.playSong(this.queue[next], this.queue, 0, true, false, false, false, completed || fromAutoAdvance);
  }
  private removeFromQueue(song: Song): void {
    const targetKey = songKey(song);
    const idx = this.queue.findIndex((item: Song) => songKey(item) === targetKey);
    if (idx < 0) return;
    const wasCurrent = !!this.selected && songKey(this.selected) === targetKey;
    const nextQueue = this.queue.filter((_item: Song, i: number) => i !== idx);
    this.queue = nextQueue;
    this.upNextKeys = this.upNextKeys.filter((k: string) => k !== targetKey);
    this.autoMixShuffleForKey = '';
    this.autoMixShuffleCandidate = null;
    this.autoMixPreloadToken++;
    this.autoMixPreloadInFlight = false;
    this.autoMixPreloadAttempts = 0;
    this.autoMixPreloadingKey = '';
    this.autoMixPreloadRetryAt = 0;
    this.autoMixTriggeredFor = '';
    this.player.cancelAutoMix();
    if (!nextQueue.length) {
      this.player.pause().catch(() => {});
      this.selected = null;
      this.playing = false;
      this.positionMs = 0;
      this.livePositionMs = 0;
      this.playbackClock.positionMs = 0;
      this.stageClockMs = 0;
      this.duration = 0;
    } else if (wasCurrent) {
      const nextIdx = Math.min(idx, nextQueue.length - 1);
      this.playSong(nextQueue[nextIdx], nextQueue, 0, this.playing).catch(() => {});
    } else {
      this.refreshAutoMixPlan();
      this.savePlayback(true);
    }
    this.notify(`已从播放队列移除「${song.name}」`, 1600);
  }
  private applyQueueOrder(keys: string[]): void {
    this.queueOrderOpen = false;
    this.maybeReturnToParentSheet();
    if (this.queue.length <= 1 || !keys.length) return;
    const rank = new Map<string, number>();
    for (let i = 0; i < keys.length; i += 1) {
      if (!rank.has(keys[i])) rank.set(keys[i], i);
    }
    const sorted = this.queue.slice().sort((a: Song, b: Song) => {
      const ra = rank.has(songKey(a)) ? rank.get(songKey(a))! : 999999;
      const rb = rank.has(songKey(b)) ? rank.get(songKey(b))! : 999999;
      return ra - rb;
    });
    this.queue = sorted;
    this.autoMixShuffleForKey = '';
    this.autoMixShuffleCandidate = null;
    this.autoMixPreloadToken++;
    this.autoMixPreloadInFlight = false;
    this.autoMixPreloadAttempts = 0;
    this.autoMixPreloadingKey = '';
    this.autoMixPreloadRetryAt = 0;
    this.autoMixTriggeredFor = '';
    this.player.cancelAutoMix();
    this.refreshAutoMixPlan();
    this.savePlayback(true);
    this.notify('已更新播放队列顺序', 1600);
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
  private switchSearchQueueToPlaylist(song: Song, target: MusicPlaylist): boolean {
    const k = songKey(song);
    if (this.searchOpen) this.searchAddedPlaylistMap.set(k, target.id);
    if (this.playingFromSearch && this.selected && songKey(this.selected) === k && (target.songs ?? []).length > 0) {
      this.queue = (target.songs ?? []).slice();
      this.playingFromSearch = false;
      this.refreshAutoMixPlan();
      this.savePlayback(true);
      return true;
    }
    return false;
  }
  private like(song: Song): void {
    let favorite = this.playlists.find((list: MusicPlaylist) => list.isFavorite);
    if (!favorite) { favorite = createPlaylist('我的收藏', true); this.playlists = this.playlists.concat(favorite); }
    const wasLiked = this.liked(song);
    const next = playlistWithSong(favorite, song, wasLiked);
    this.playlists = this.playlists.map((list: MusicPlaylist) => list.id === next.id ? next : list);
    if (this.openedPlaylist?.id === next.id) this.openedPlaylist = next;
    this.syncLikedKeysStorage();
    if (!wasLiked && this.switchSearchQueueToPlaylist(song, next)) {
      this.notify('已收藏，后续播放已切换为「我的收藏」', 2200);
    }
    this.save();
    this.triggerAutoSync();
  }
  private openBatchCollectPicker(songs: Song[], title: string = '批量收藏歌曲'): void {
    const valid = songs.filter((item: Song) => Boolean(item && songKey(item)));
    if (!valid.length) {
      this.notify('当前列表没有可收藏的歌曲', 1800);
      return;
    }
    this.batchCollectTitle = title;
    this.batchCollectSongs = valid;
    this.batchCollectOpen = true;
  }
  private collectSongsToPlaylist(songs: Song[], targetPlaylistId: string, newPlaylistName: string): void {
    const valid = songs.filter((item: Song) => Boolean(item && songKey(item)));
    if (!valid.length) return;
    let target: MusicPlaylist | undefined;
    let createdNew = false;
    if (targetPlaylistId === '__new__') {
      const cleanName = newPlaylistName.trim() || `歌单 ${this.playlists.length + 1}`;
      const created = createPlaylist(cleanName, false);
      const res = playlistWithSongs(created, valid);
      target = res.playlist;
      this.playlists = this.playlists.concat([target]);
      createdNew = true;
      this.syncLikedKeysStorage();
      this.save();
      this.triggerAutoSync();
      this.notify(`已新建「${target.name}」并收藏 ${res.added} 首歌曲`, 2200);
      return;
    }
    if (targetPlaylistId === '__favorite__') {
      target = this.playlists.find((list: MusicPlaylist) => list.isFavorite);
      if (!target) {
        target = createPlaylist('我的收藏', true);
        this.playlists = [target].concat(this.playlists);
      }
    } else {
      target = this.playlists.find((list: MusicPlaylist) => list.id === targetPlaylistId);
    }
    if (!target) {
      this.notify('未找到目标歌单', 1800);
      return;
    }
    const res = playlistWithSongs(target, valid);
    if (res.added <= 0 && !createdNew) {
      this.notify(`所选歌曲均已在「${target.isFavorite ? '我的收藏' : target.name}」中`, 2000);
      return;
    }
    this.playlists = this.playlists.map((list: MusicPlaylist) => list.id === res.playlist.id ? res.playlist : list);
    if (this.openedPlaylist?.id === res.playlist.id) this.openedPlaylist = res.playlist;
    this.syncLikedKeysStorage();
    this.save();
    this.triggerAutoSync();
    const skipped = valid.length - res.added;
    const targetName = res.playlist.isFavorite ? '我的收藏' : res.playlist.name;
    this.notify(
      skipped > 0
        ? `已向「${targetName}」收藏 ${res.added} 首（跳过 ${skipped} 首重复）`
        : `已向「${targetName}」收藏 ${res.added} 首歌曲`,
      2200,
    );
  }
  private collectSongsBatch(songs: Song[]): void {
    this.collectSongsToPlaylist(songs, '__favorite__', '');
  }
  private addToPlaylist(song: Song): void {
    this.getUIContext().showAlertDialog({ title: '添加到歌单', message: song.name, systemMaterial: musicMenuMaterial(), buttons: this.playlists.filter((list: MusicPlaylist) => list.kind === 'lx').map((list: MusicPlaylist) => {
      return { value: list.name, action: () => {
        const next = playlistWithSong(list, song);
        this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === next.id ? next : item);
        if (this.openedPlaylist?.id === next.id) this.openedPlaylist = next;
        const switched = this.switchSearchQueueToPlaylist(song, next);
        this.save();
        this.triggerAutoSync();
        this.message = switched ? `已添加到「${list.name}」，后续播放已切换为该歌单` : `已添加到「${list.name}」`;
        if (switched) this.notify(this.message, 2200);
      } } as AlertDialogButtonOptions;
    }) });
  }
  private isCollectionSavedToLibrary(name: string, songs: Song[]): boolean {
    const clean = (name || '').trim();
    if (!clean) return false;
    return this.playlists.some((p: MusicPlaylist) => !p.isFavorite && p.kind === 'lx' && p.name.trim() === clean && (p.songs?.length ?? 0) === songs.length);
  }
  private canCollectOpenedPlaylist(): boolean {
    const list = this.openedPlaylist;
    if (!list || !(list.songs?.length)) return false;
    if (list.kind === 'local' || list.kind === 'recent') return false;
    return !this.playlists.some((p: MusicPlaylist) => p.id === list.id);
  }
  private collectToLibrary(name: string, songs: Song[], cover: string = ''): void {
    const valid = songs.filter((s: Song) => !!s && !!s.id);
    if (!valid.length) { this.notify('当前列表暂无可收藏的歌曲'); return; }
    const cleanName = (name || '收藏歌单').trim();
    if (this.isCollectionSavedToLibrary(cleanName, valid)) {
      this.notify(`「${cleanName}」已在你的曲库中`, 1800);
      return;
    }
    const created = createPlaylist(cleanName, false);
    const firstCover = (cover || '').trim() || (valid.find((s: Song) => !!(s.coverUrl || '').trim())?.coverUrl ?? '');
    created.songs = valid.slice();
    created.songIds = valid.map(songKey);
    created.customCover = firstCover;
    created.updatedAt = Date.now();
    this.playlists = this.playlists.concat([created]);
    this.save();
    this.triggerAutoSync();
    this.notify(`已收藏「${cleanName}」（${valid.length} 首）到曲库`, 2200);
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
    this.platformSwitchOpen = true;
  }
  private applyPlatformSwitch(replacement: Song): void {
    const target = this.switchTargetSong;
    const scope = this.switchTargetScope;
    this.platformSwitchOpen = false;
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
    if (scope === 'queue' || scope === 'player' || this.queue.some((item: Song) => songKey(item) === targetKey)) {
      this.queue = replaceInArray(this.queue);
    }
    if (wasSelected || scope === 'player') {
      this.playSong(replacement, this.queue.length ? this.queue : [replacement], 0, this.playing);
    }
    this.notify(`已切换至 ${platformName(replacement.source ?? '')} 版本`, 1800);
  }
  private canRemoveFromOpenedPlaylist(): boolean {
    const opened = this.openedPlaylist;
    if (!opened) return false;
    return this.canDeleteOpenedPlaylist() || !!opened.isFavorite || opened.kind === 'recent';
  }
  private removeSongFromOpenedPlaylist(song: Song): void {
    const opened = this.openedPlaylist;
    if (!opened || !this.canRemoveFromOpenedPlaylist()) return;
    if (opened.kind === 'recent') {
      const target = songKey(song);
      this.recentSongs = this.recentSongs.filter((item: Song) => songKey(item) !== target);
      this.openedPlaylist = { id: opened.id, name: opened.name, kind: 'recent', songs: this.recentSongs, createdAt: 0, updatedAt: Date.now() };
      saveRecentSongs(JSON.stringify(this.recentSongs)).catch(() => {});
      this.notify(`已从最近播放移除「${song.name}」`, 1600);
      return;
    }
    if (opened.isFavorite) {
      this.like(song);
      this.notify(`已取消收藏「${song.name}」`, 1600);
      return;
    }
    const updated = playlistWithoutSongs(opened, new Set<string>([songKey(song)]));
    this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
    this.openedPlaylist = updated;
    this.save();
    this.triggerAutoSync();
    this.notify(`已从歌单移除「${song.name}」`, 1600);
  }
  private clearRecentSongs(): void {
    if (!this.recentSongs.length) return;
    this.getUIContext().showAlertDialog({
      title: '清空最近播放',
      message: `确定清空全部 ${this.recentSongs.length} 条最近播放记录？`,
      systemMaterial: musicMenuMaterial(),
      primaryButton: { value: '取消', action: () => {} },
      secondaryButton: {
        value: '清空',
        action: () => {
          this.recentSongs = [];
          if (this.openedPlaylist?.kind === 'recent') {
            this.openedPlaylist = { id: this.openedPlaylist.id, name: this.openedPlaylist.name, kind: 'recent', songs: [], createdAt: 0, updatedAt: Date.now() };
          }
          saveRecentSongs('[]').catch(() => {});
          this.notify('已清空最近播放', 1800);
        }
      }
    });
  }
  private isSongInUserLibrary(song: Song | null): boolean {
    if (!song) return true;
    if (song.source === 'local') return true;
    if (this.downloads.offline(song)) return true;
    if (this.liked(song)) return true;
    const key = songKey(song);
    for (const pl of this.playlists) {
      if ((pl.songs ?? []).some((item: Song) => songKey(item) === key)) return true;
    }
    return false;
  }
  private dislikeCurrentSong(): void {
    const song = this.selected;
    if (!song) return;
    const key = songKey(song);
    const canonical = `${(song.name || '').trim().toLowerCase()}|${(song.singer || '').split(/[\/、,&;，]+/)[0].trim().toLowerCase()}`;
    const next = new Set<string>(this.dislikedKeys);
    next.add(key);
    if (canonical.length > 2) next.add(canonical);
    this.dislikedKeys = Array.from(next).slice(0, 500);
    this.save();
    if (this.homeFeed) {
      const f = this.homeFeed;
      const keep = (s: Song): boolean => !next.has(songKey(s)) && !next.has(`${(s.name || '').trim().toLowerCase()}|${(s.singer || '').split(/[\/、,&;，]+/)[0].trim().toLowerCase()}`);
      this.homeFeed = {
        source: f.source, sections: f.sections, playlists: f.playlists, charts: f.charts, bannerCharts: f.bannerCharts,
        newSongs: f.newSongs.filter(keep), similar: f.similar.filter(keep),
        forYou: f.forYou ? f.forYou.filter(keep) : undefined,
        personalized: f.personalized, topArtists: f.topArtists, daily: f.daily,
        dailySongs: f.dailySongs ? f.dailySongs.filter(keep) : undefined
      };
    }
    this.showSheet = false;
    this.notify('已标记不感兴趣，将减少此类推荐', 2000);
    const curIdx = this.queue.findIndex((s: Song) => songKey(s) === key);
    if (curIdx >= 0 && this.queue.length > 1) {
      const nextQueue = this.queue.filter((_: Song, idx: number) => idx !== curIdx);
      const nextIdx = curIdx >= nextQueue.length ? 0 : curIdx;
      this.queue = nextQueue;
      this.playSong(nextQueue[nextIdx], nextQueue, 0, true).catch(() => {});
    } else if (this.queue.length > 1) {
      this.advance(1);
    } else {
      this.queue = [];
      this.player.pause().catch(() => {});
    }
  }
  private viewCurrentArtist(): void {
    const song = this.selected;
    if (!song) return;
    const artist = (song.singer || '').split(/[\/、,&;，]+/)[0].trim();
    if (!artist || artist === '未知歌手') { this.notify('当前歌曲无艺人信息'); return; }
    const fromPlayer = this.showPlayer;
    this.showSheet = false;
    this.showPlayer = false;
    this.searchReturnToPlayer = fromPlayer;
    this.tab = '发现';
    this.openedPlaylist = null;
    this.feedSection = '';
    this.searchOpen = true;
    this.discoveryCompact = false;
    this.searchMorph = 0;
    this.searchKind = 'artist';
    this.keyword = artist;
    this.search(false).catch(() => {});
  }
  private viewCurrentAlbum(): void {
    const song = this.selected;
    if (!song) return;
    const album = (song.albumName || song.name || '').trim();
    if (!album) { this.notify('当前歌曲无专辑信息'); return; }
    const fromPlayer = this.showPlayer;
    this.showSheet = false;
    this.showPlayer = false;
    this.searchReturnToPlayer = fromPlayer;
    this.tab = '发现';
    this.openedPlaylist = null;
    this.feedSection = '';
    this.searchOpen = true;
    this.discoveryCompact = false;
    this.searchMorph = 0;
    this.searchKind = song.albumName ? 'album' : 'music';
    this.keyword = album;
    this.search(false).catch(() => {});
  }
  private async openSimilarSongs(): Promise<void> {
    const song = this.selected;
    if (!song || !this.hostReady) return;
    const fromPlayer = this.showPlayer;
    this.showSheet = false;
    this.notify('正在寻找相似歌曲…', 1500);
    try {
      const raw = await this.host.catalogue('similar-songs', JSON.stringify(song));
      const parsed = JSON.parse(raw) as FeedSongsResult;
      const dislikedSet = new Set<string>(this.dislikedKeys);
      const seen = new Set<string>([songKey(song)]);
      const list: Song[] = [];
      const pushSong = (s: Song): void => {
        const k = songKey(s);
        if (seen.has(k) || dislikedSet.has(k)) return;
        const can = `${(s.name || '').trim().toLowerCase()}|${(s.singer || '').split(/[\/、,&;，]+/)[0].trim().toLowerCase()}`;
        if (dislikedSet.has(can)) return;
        seen.add(k);
        list.push(s);
      };
      for (const s of (parsed.items ?? [])) pushSong(s);
      if (list.length < 8) {
        const artist = (song.singer || '').split(/[\/、,&;，]+/)[0].trim();
        if (artist && artist !== '未知歌手') {
          try {
            const extra = await searchLx('all', artist, 1, 30);
            for (const s of extra.items) {
              if (list.length >= 24) break;
              pushSong(s);
            }
          } catch (_) {}
        }
      }
      if (!list.length) { this.notify('暂未找到更多相似歌曲'); return; }
      this.rememberPlaylistContext();
      this.showPlayer = false;
      this.playlistReturnToPlayer = fromPlayer;
      this.tab = '资料库';
      this.openedPlaylist = {
        id: `similar-${song.source}-${song.id}`,
        name: `相似歌曲 · ${song.name}`,
        kind: 'similar',
        songs: list,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preserveQueue: true
      };
      this.hydrateOpenedListCovers().catch(() => {});
    } catch (error) {
      this.notify(`相似歌曲加载失败：${(error as Error).message}`);
    }
  }
  private formatRemaining(ms: number): string {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  private clearSleepTimer(): void {
    clearInterval(this.sleepTimerHandle);
    this.sleepTimerHandle = -1;
    this.sleepMode = 'off';
    this.sleepEndAt = 0;
    this.sleepPendingStop = false;
    this.sleepRemainingText = '';
  }
  private setSleepTimer(mode: string, minutes: number): void {
    clearInterval(this.sleepTimerHandle);
    this.sleepTimerHandle = -1;
    this.sleepPendingStop = false;
    if (mode === 'off' || minutes === 0) {
      this.clearSleepTimer();
      this.notify('已关闭定时关闭', 1500);
      return;
    }
    if (mode === 'song' || minutes < 0) {
      this.sleepMode = 'song';
      this.sleepEndAt = 0;
      this.sleepRemainingText = '播完本首';
      this.notify('已设定：播完本首后自动暂停', 1800);
      return;
    }
    const mins = Math.max(1, Math.min(480, Math.round(minutes)));
    this.sleepMode = mode;
    this.sleepEndAt = Date.now() + mins * 60000;
    this.sleepRemainingText = this.formatRemaining(this.sleepEndAt - Date.now());
    this.notify(`已设定定时关闭：${mins} 分钟`, 1800);
    this.sleepTimerHandle = setInterval(() => {
      if (this.disposed || this.sleepMode === 'off' || this.sleepMode === 'song') {
        clearInterval(this.sleepTimerHandle);
        this.sleepTimerHandle = -1;
        return;
      }
      const left = this.sleepEndAt - Date.now();
      if (left <= 0) {
        clearInterval(this.sleepTimerHandle);
        this.sleepTimerHandle = -1;
        if (this.sleepFinishSong && this.playing) {
          this.sleepPendingStop = true;
          this.sleepRemainingText = '播完本首';
          this.notify('定时时间已到，将在本首播完后暂停', 2600);
        } else {
          this.clearSleepTimer();
          this.player.fadeOutAndPause(1500).catch(() => {});
          this.notify('定时关闭已生效，播放已暂停', 2600);
        }
      } else if (this.moreSleepOpen || (this.showSheet && this.sheet === '更多')) {
        const nextText = this.formatRemaining(left);
        if (nextText !== this.sleepRemainingText) this.sleepRemainingText = nextText;
      }
    }, 1000);
  }
  private nextQueueSong(): Song | null {
    if (!this.selected || this.queue.length <= 1) return null;
    if (this.mode === '单曲循环') return null;
    const curKey = songKey(this.selected);
    const upNextIdx = this.resolveUpNextIndex(curKey, false);
    if (upNextIdx >= 0) return this.queue[upNextIdx];
    const idx = this.queue.findIndex((s: Song) => songKey(s) === curKey);
    if (idx < 0) return null;
    if (this.mode === '顺序播放' && idx >= this.queue.length - 1) return null;
    if (this.mode === '随机播放') {
      if (this.autoMixShuffleForKey === curKey && this.autoMixShuffleCandidate) {
        const stillExists = this.queue.some((s: Song) => songKey(s) === songKey(this.autoMixShuffleCandidate!));
        if (stillExists && songKey(this.autoMixShuffleCandidate) !== curKey) return this.autoMixShuffleCandidate;
      }
      const pickedIdx = (idx + 1 + Math.floor(Math.random() * (this.queue.length - 1))) % this.queue.length;
      this.autoMixShuffleForKey = curKey;
      this.autoMixShuffleCandidate = this.queue[pickedIdx];
      return this.autoMixShuffleCandidate;
    }
    for (let offset = 1; offset < this.queue.length; offset += 1) {
      const cand = this.queue[(idx + offset) % this.queue.length];
      if (songKey(cand) !== curKey) return cand;
    }
    return this.queue[(idx + 1) % this.queue.length];
  }
  private vocalCancelEngaged(): boolean {
    return this.earMonitorState.active
      && Math.abs(this.earMonitorState.vocalVolume - 1.0) > 0.02
      && this.playbackUrl.length > 0
      && this.stageMounted;
  }
  private syncHarmonyVocalCancel(): void {
    this.player.setMusicMonitorGain(this.vocalCancelEngaged() ? 0.0 : 1.0);
  }
  private topBlurStops(zoneHeight: number): Array<FractionStop> {
    const h = Math.max(320, this.viewportHeight);
    const z = Math.max(72, Math.min(h * 0.36, zoneHeight));
    const s1 = Number(Math.min(0.18, (z * 0.42) / h).toFixed(4));
    const s2 = Number(Math.min(0.28, (z * 0.82) / h).toFixed(4));
    const s3 = Number(Math.min(0.38, (z * 1.18) / h).toFixed(4));
    return [[1.0, 0.0], [0.82, s1], [0.26, s2], [0.0, s3]];
  }
  private topBlurZoneHeight(): number {
    const hasHomeChips = this.tab === '发现' && !this.searchOpen && (!this.feedSection || this.feedClosing) && !this.openedPlaylist && this.homeFeed !== null;
    return this.headerHeight() + (hasHomeChips ? 34 : 18);
  }
  private ensureAutoMixPreload(forceRetry: boolean = false): void {
    if (!this.autoMixEnabled || !this.selected || this.resolving || this.disposed) return;
    if (this.sleepMode === 'song' || this.sleepPendingStop || this.player.isAutoMixActive()) return;
    const plan = this.autoMixPlan;
    const next = this.autoMixNextSong;
    if (!plan || !plan.enabled || !next) return;
    const curKey = songKey(this.selected);
    const nextKey = songKey(next);
    const pairKey = `${curKey}->${nextKey}`;
    const now = Date.now();
    if (this.player.isPreloadedFor(next)) {
      this.autoMixPreloadingKey = pairKey;
      this.autoMixPreloadInFlight = false;
      this.autoMixPreloadRetryAt = 0;
      return;
    }
    if (!forceRetry && this.autoMixPreloadInFlight && this.autoMixPreloadingKey === pairKey && (now - this.autoMixPreloadStartedAt) < 12000) {
      return;
    }
    if (!forceRetry && this.autoMixPreloadingKey === pairKey && now < this.autoMixPreloadRetryAt) {
      return;
    }
    if (this.autoMixPreloadingKey !== pairKey) {
      this.autoMixPreloadAttempts = 0;
    }
    if (this.autoMixPreloadAttempts >= 3 && !forceRetry) return;
    const attempt = this.autoMixPreloadAttempts;
    this.autoMixPreloadAttempts++;
    const token = ++this.autoMixPreloadToken;
    this.autoMixPreloadingKey = pairKey;
    this.autoMixPreloadInFlight = true;
    this.autoMixPreloadStartedAt = now;
    this.autoMixPreloadRetryAt = now + 12000;
    const onPreloadDone = (ok: boolean, usedUrl: string): void => {
      if (token !== this.autoMixPreloadToken || this.disposed) return;
      this.autoMixPreloadInFlight = false;
      if (ok) {
        this.autoMixPreloadRetryAt = 0;
        if (this.playing && !this.player.isAutoMixActive() && this.selected && songKey(this.selected) === curKey) {
          this.tickAutoMix(this.positionMs, this.duration);
        }
        return;
      }
      if (usedUrl) {
        const prevBad = this.autoMixFailedUrls.get(nextKey) ?? [];
        if (!prevBad.includes(usedUrl)) {
          prevBad.push(usedUrl);
          this.autoMixFailedUrls.set(nextKey, prevBad.slice(-4));
        }
      }
      this.autoMixPreloadRetryAt = Date.now() + 2500;
      if (this.autoMixPreloadAttempts < 3) {
        setTimeout(() => {
          if (token === this.autoMixPreloadToken && this.autoMixEnabled && !this.disposed) {
            this.ensureAutoMixPreload(true);
          }
        }, 1200);
      }
    };
    const rawLocal = (next.source === 'local' ? this.localMusic.pathFor(next) : '') || this.downloads.offline(next);
    const localPath = rawLocal.startsWith('file://') ? decodeURIComponent(rawLocal.slice(7)) : rawLocal;
    if (localPath) {
      this.player.preloadNext(next, localPath, true, plan.nextEntryMs)
        .then((ok: boolean) => onPreloadDone(ok, ''))
        .catch(() => onPreloadDone(false, ''));
      return;
    }
    if (!this.sourceReady) {
      this.autoMixPreloadInFlight = false;
      this.autoMixPreloadRetryAt = Date.now() + 3000;
      return;
    }
    const excludeUrls = (this.autoMixFailedUrls.get(nextKey) ?? []).slice();
    const forceFresh = attempt > 0;
    const preferCross = attempt >= 1;
    const resolveNext = next.source === 'qishui'
      ? this.resolveSongInfo(next).then((matchedInfo: LxSongInfo) => {
        const matchedSong: Song = {
          source: matchedInfo.source || next.source,
          id: matchedInfo.songmid || next.id,
          name: matchedInfo.name || next.name,
          singer: matchedInfo.singer || next.singer,
          albumName: matchedInfo.albumName || next.albumName,
          albumId: matchedInfo.albumId || next.albumId,
          durationMs: next.durationMs,
          qualitys: next.qualitys,
          coverUrl: next.coverUrl,
          hash: matchedInfo.hash || next.hash,
          strMediaMid: matchedInfo.strMediaMid || next.strMediaMid,
          songId: matchedInfo.songId || next.songId
        };
        return this.raceAllSourcesForSong(matchedSong, [], true, forceFresh, preferCross, excludeUrls);
      })
      : this.raceAllSourcesForSong(next, [], true, forceFresh, preferCross, excludeUrls);
    resolveNext.then((hit: RaceUrlResult) => {
      if (token !== this.autoMixPreloadToken || this.disposed) return;
      if (hit.url && this.autoMixNextSong && songKey(this.autoMixNextSong) === nextKey) {
        this.player.preloadNext(next, hit.url, false, plan.nextEntryMs)
          .then((ok: boolean) => onPreloadDone(ok, hit.url ?? ''))
          .catch(() => onPreloadDone(false, hit.url ?? ''));
      } else {
        onPreloadDone(false, hit.url ?? '');
      }
    }).catch(() => onPreloadDone(false, ''));
  }
  private prefetchNextLyricsForAutoMix(next: Song): void {
    const key = songKey(next);
    if (this.autoMixNextLyricsCache.has(key) || this.autoMixNextLyricsPending.has(key)) return;
    if (next.source === 'local') {
      const localLines = parseLrc(this.localMusic.lyricFor(next));
      this.autoMixNextLyricsCache.set(key, localLines);
      return;
    }
    if (!this.hostReady || !next.name) return;
    this.autoMixNextLyricsPending.add(key);
    this.host.catalogue('song-assets', JSON.stringify(next)).then((json: string) => {
      this.autoMixNextLyricsPending.delete(key);
      let parsed: LyricLine[] = [];
      try {
        const full = JSON.parse(json) as SongAssets;
        parsed = parseLrc(full.lyric || '');
      } catch (_) {}
      this.autoMixNextLyricsCache.set(key, parsed);
      if (this.autoMixNextLyricsCache.size > 24) {
        const firstKey = this.autoMixNextLyricsCache.keys().next().value as string | undefined;
        if (firstKey) this.autoMixNextLyricsCache.delete(firstKey);
      }
      if (!this.disposed && this.autoMixEnabled && !this.player.isAutoMixActive()
        && this.autoMixNextSong && songKey(this.autoMixNextSong) === key) {
        this.refreshAutoMixPlan();
      }
    }).catch(() => {
      this.autoMixNextLyricsPending.delete(key);
    });
  }
  private refreshAutoMixPlan(): void {
    if (!this.autoMixEnabled || !this.selected) {
      this.autoMixPlan = null;
      this.autoMixPreview = '';
      this.autoMixNextSong = null;
      this.autoMixPlanDurationMs = 0;
      return;
    }
    const prevNextKey = this.autoMixNextSong ? songKey(this.autoMixNextSong) : '';
    const next = this.nextQueueSong();
    this.autoMixNextSong = next;
    if (!next) {
      this.autoMixPlan = null;
      this.autoMixPreview = this.mode === '单曲循环' ? '单曲循环模式下不混音' : '队列末尾无下一首';
      this.autoMixPlanDurationMs = 0;
      return;
    }
    const nextKey = songKey(next);
    const curKey = songKey(this.selected);
    const pairKey = `${curKey}->${nextKey}`;
    if (this.autoMixTriggeredFor && this.autoMixTriggeredFor !== pairKey) this.autoMixTriggeredFor = '';
    if (prevNextKey && prevNextKey !== nextKey && !this.player.isAutoMixActive()) {
      this.autoMixPreloadToken++;
      this.autoMixPreloadInFlight = false;
      this.autoMixPreloadingKey = '';
      this.autoMixPreloadRetryAt = 0;
      this.autoMixPreloadAttempts = 0;
    }
    const realDur = this.player.durationMs();
    const dur = realDur > 15000 ? realDur : (this.duration > 15000 ? this.duration : (this.selected.durationMs || 0));
    this.autoMixPlanDurationMs = dur;
    const cachedNextLyrics = this.autoMixNextLyricsCache.get(nextKey) ?? [];
    if (!this.autoMixNextLyricsCache.has(nextKey)) {
      this.prefetchNextLyricsForAutoMix(next);
    }
    const plan = planAutoMix(this.selected, dur, this.lyrics, next, cachedNextLyrics);
    this.autoMixPlan = plan;
    this.autoMixPreview = plan.enabled ? `${plan.summary} → ${next.name}` : plan.summary;
    // 主动式提前预载：规划就绪后立即后台预热副轨，不再等到最后 40 秒
    if (plan.enabled && this.playing && !this.resolving && !this.player.isAutoMixActive()) {
      this.ensureAutoMixPreload(false);
    }
  }
  private tickAutoMix(positionMs: number, durationMs: number): void {
    if (!this.autoMixEnabled || !this.playing || !this.selected || this.resolving) return;
    if (this.sleepMode === 'song' || this.sleepPendingStop) return;
    if (this.player.isAutoMixActive()) return;
    const realDur = this.player.durationMs();
    const effDur = realDur > 15000 ? realDur : (durationMs > 15000 ? durationMs : (this.selected.durationMs || 0));
    if (!this.autoMixPlan || !this.autoMixNextSong || (effDur > 24000 && Math.abs(effDur - this.autoMixPlanDurationMs) > 2500)) {
      if (effDur > 24000) this.refreshAutoMixPlan();
      if (!this.autoMixPlan || !this.autoMixNextSong) return;
    }
    const plan = this.autoMixPlan;
    const next = this.autoMixNextSong;
    if (!plan.enabled || effDur < 24000) return;
    const curKey = songKey(this.selected);
    const nextKey = songKey(next);
    const pairKey = `${curKey}->${nextKey}`;
    // 播放满 2 秒起就主动保持副轨处于已预加载状态（换歌单/拖进度/网络抖动均自动补齐）
    if (positionMs >= 2000) {
      this.ensureAutoMixPreload(false);
    }
    // 到达混音触发点（或副轨稍晚就绪且剩余时长 >= 1.8s），按真实剩余时长启动双轨无缝过渡！
    const remainingMs = Math.max(0, effDur - positionMs);
    if (positionMs >= plan.mixStartMs && remainingMs >= 1600 && this.autoMixTriggeredFor !== pairKey && this.player.isPreloadedFor(next)) {
      this.autoMixTriggeredFor = pairKey;
      const effCrossfade = Math.max(1600, Math.min(plan.crossfadeMs, remainingMs - 250));
      this.player.startAutoMix(effCrossfade, plan.strategy).then((started: boolean) => {
        if (!started) this.autoMixPreloadRetryAt = Date.now() + 10000;
      }).catch(() => {
        this.autoMixPreloadRetryAt = Date.now() + 10000;
      });
    }
  }
  private effectiveStyleName(): string {
    return this.styleName === SMART_STAGE_MODE_ID ? this.resolvedStyleName : this.styleName;
  }
  private resolvedStyleLabel(): string {
    const found = MINE_RADIO_MODES.find((m: MineRadioMode) => m.id === this.resolvedStyleName);
    return found ? found.label : '';
  }
  private updateSmartStage(forceCommit: boolean = false): void {
    if (this.styleName !== SMART_STAGE_MODE_ID) {
      this.resolvedStyleName = this.styleName;
      if (this.styleName !== 'off') {
        if (this.styleName.startsWith('folia-')) this.lastFoliaStyle = this.styleName;
        else this.lastMineStyle = this.styleName;
      }
      this.syncTimelineStageDark();
      return;
    }
    const decision = selectSmartStageMode(
      this.selected ?? undefined,
      this.lyrics,
      this.coverColors.first,
      this.coverColors.last,
      this.smartStageCache,
      forceCommit
    );
    const prevEffective = this.resolvedStyleName;
    this.resolvedStyleName = decision.modeId;
    if (decision.modeId !== 'off') {
      if (decision.modeId.startsWith('folia-')) this.lastFoliaStyle = decision.modeId;
      else this.lastMineStyle = decision.modeId;
    }
    if (decision.ready && !decision.cached && this.selected) {
      if (this.smartStageCache.catalogSignature !== decision.catalogSignature) {
        this.smartStageCache = { catalogSignature: decision.catalogSignature, choices: {} };
      }
      if (this.smartStageCache.choices[decision.songKey] !== decision.modeId) {
        this.smartStageCache.choices[decision.songKey] = decision.modeId;
        const keys = Object.keys(this.smartStageCache.choices);
        if (keys.length > 500) {
          const nextChoices: Record<string, string> = {};
          const start = keys.length - 500;
          for (let i = start; i < keys.length; i++) {
            nextChoices[keys[i]] = this.smartStageCache.choices[keys[i]];
          }
          this.smartStageCache.choices = nextChoices;
        }
        if (this.storeReady && !this.restoringSettings) this.scheduleSave(360);
      }
    }
    if (prevEffective !== decision.modeId) {
      this.dynamicStageFailed = false;
      this.syncDynamicStageReady();
      if (this.showPlayer) this.mountPlaybackStage();
      this.syncHarmonyPcWallpaperState();
    }
    this.syncTimelineStageDark();
  }
  private canCustomizeOpenedPlaylistCover(): boolean {
    const opened = this.openedPlaylist;
    if (!opened || opened.kind !== 'lx') return false;
    return this.playlists.some((item: MusicPlaylist) => item.id === opened.id);
  }
  private applyPlaylistCover(playlist: MusicPlaylist, cover: string): void {
    const updated = playlistCoverUpdated(playlist, cover);
    this.playlists = this.playlists.map((item: MusicPlaylist) => item.id === updated.id ? updated : item);
    if (this.openedPlaylist?.id === updated.id) this.openedPlaylist = updated;
    this.closeCoverPicker();
    this.save();
    this.triggerAutoSync();
    this.notify(cover ? '已更新歌单封面' : '已恢复默认歌单封面', 1800);
  }
  private async pickLocalPlaylistCover(playlist: MusicPlaylist): Promise<void> {
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
      const ext = lower.endsWith('.png') ? 'png' : (lower.endsWith('.webp') ? 'webp' : 'jpg');
      const safeId = playlist.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const target = `${ctx.filesDir}/playlist_cover_${safeId}_${Date.now()}.${ext}`;
      const out = fileIo.openSync(target, fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC | fileIo.OpenMode.WRITE_ONLY);
      try { fileIo.writeSync(out.fd, bytes); } finally { fileIo.closeSync(out.fd); }
      this.applyPlaylistCover(playlist, `file://${target}`);
    } catch (_) {
      this.notify('选择封面图片失败');
    } finally {
      if (file) { try { fileIo.closeSync(file.fd); } catch (_) {} }
    }
  }
  private handleKeyShortcut(event: KeyEvent): void {
    if (event.type !== KeyType.Down) return;
    // 全局 Esc 退栈（壁纸模式 -> 沉浸模式 -> 弹窗/抽屉 -> 评论 -> 播放页 -> 二级页），不经 1500ms 滑动节流
    if (event.keyCode === 2070 && this.settingsPanel !== 'shortcuts') {
      if (this.wallpaperMode) {
        this.toggleHarmonyPcWallpaper(false);
        return;
      }
      this.dismissTopView();
      return;
    }
    if (!this.shortcutsEnabled) return;
    if (this.searchOpen || this.listSearchOpen || this.settingsPanel === 'shortcuts' || this.colorPickerOpen || this.editPlaylistOpen) return;
    const combo = formatKeyEventCombo(event);
    if (!combo) return;
    // 在可能存在文本输入的设置页，屏蔽无修饰键的单键（如 Space）以防打断输入
    const hasModifier = combo.includes('+');
    if (!hasModifier && (this.settingsPanel === 'sync' || this.settingsPanel === 'lyrics')) return;
    let matchedAction = '';
    const keys = Object.keys(this.shortcuts);
    for (const id of keys) {
      if (this.shortcuts[id] === combo) {
        matchedAction = id;
        break;
      }
    }
    if (!matchedAction) return;
    if (this.showSheet && !(matchedAction === 'toggleEarMonitor' && this.sheet === '耳返监听')) return;
    if (matchedAction === 'playPause') { this.toggle(); }
    else if (matchedAction === 'prevTrack') { this.advance(-1); }
    else if (matchedAction === 'nextTrack') { this.advance(1); }
    else if (matchedAction === 'volUp') { this.applyVolume(this.volume + 0.05, true); }
    else if (matchedAction === 'volDown') { this.applyVolume(this.volume - 0.05, true); }
    else if (matchedAction === 'mute') { this.toggleMute(); }
    else if (matchedAction === 'toggleLike') { if (this.selected) this.like(this.selected); }
    else if (matchedAction === 'openDetail') { if (this.selected) this.showPlayer = !this.showPlayer; }
    else if (matchedAction === 'toggleImmersive') {
      if (this.showPlayer) {
        this.stageControlsVisible = !this.stageControlsVisible;
      } else if (this.selected) {
        this.showPlayer = true;
        this.stageControlsVisible = false;
      }
    }
    else if (matchedAction === 'openSearch') { this.showPlayer = false; this.tab = '发现'; this.openSearch(); }
    else if (matchedAction === 'toggleDesktopLyrics') {
      if (isHarmonyPc()) {
        this.applyHarmonyPcDesktopLyrics(!this.desktopLyrics);
      }
    } else if (matchedAction === 'lockDesktopLyrics') {
      if (isHarmonyPc()) {
        this.applyHarmonyPcDesktopLyricsLocked(!this.desktopLyricsLocked);
        this.notify(this.desktopLyricsLocked ? '已锁定桌面歌词（鼠标穿透）' : '已解锁桌面歌词', 1600);
      }
    } else if (matchedAction === 'toggleWallpaper') {
      if (isHarmonyPc()) {
        this.toggleHarmonyPcWallpaper(!this.wallpaperMode);
      }
    } else if (matchedAction === 'toggleEarMonitor') {
      if (this.showSheet && this.sheet === '耳返监听') this.showSheet = false;
      else this.openSheet('耳返监听');
    } else if (matchedAction === 'cycleMode') {
      this.cycle('mode');
      this.notify(`播放顺序：${this.mode}`, 1400);
    }
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
  private openSubSheetFromSheet(fromSheet: string, openFn: () => void): void {
    this.returnSheetAfterSub = fromSheet;
    this.showSheet = false;
    setTimeout(() => {
      if (!this.disposed) openFn();
    }, 180);
  }
  private maybeReturnToParentSheet(): void {
    const ret = this.returnSheetAfterSub;
    this.returnSheetAfterSub = '';
    if (!ret) return;
    setTimeout(() => {
      if (!this.disposed && !this.moreAudioFxOpen && !this.moreSleepOpen && !this.queueOrderOpen && !this.platformSwitchOpen) {
        this.openSheet(ret);
      }
    }, 180);
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
        const favoriteIds = new Set<string>(this.playlists.filter((list: MusicPlaylist) => Boolean(list.isFavorite)).map((list: MusicPlaylist) => list.id));
        const lists = parsePlaylists(await this.host.importPlaylist(this.draft.trim(), this.platform === 'all' ? 'wy' : this.platform), true)
          .map((item: MusicPlaylist, index: number): MusicPlaylist => {
            if (!favoriteIds.has(item.id)) return item;
            return {
              id: `lx-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
              name: item.name,
              kind: item.kind ?? 'lx',
              songs: item.songs,
              songIds: item.songIds,
              pcTracks: item.pcTracks,
              customCover: item.customCover ?? '',
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              isFavorite: false,
              warning: item.warning,
            };
          });
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
      this.getUIContext().showAlertDialog({ title: '音源导入结果', message: batch.report(), systemMaterial: musicMenuMaterial(),
        confirm: { value: '完成', action: () => {} } });
    } catch (error) { this.error = `导入失败：${(error as Error).message}`; }
    finally { this.busy = false; this.consumeSharedPlaylist(); }
  }
  private removeSource(source: SyncSourcePayload): void {
    this.getUIContext().showAlertDialog({ title: '移除音源', message: `移除「${source.name}」？`, systemMaterial: musicMenuMaterial(), primaryButton: { value: '取消', action: () => {} }, secondaryButton: { value: '移除', action: () => {
      this.sources = this.sources.filter((item: SyncSourcePayload) => item.id !== source.id);
      if (source.id === this.activeId) { this.activeId = ''; this.sourceReady = false; }
      this.save();
    } } });
  }
  private async loadTrustedCircle(): Promise<void> {
    const raw = await loadTrustedDevices();
    const loaded = parseTrustedDevices(raw);
    this.trustedMap.clear();
    for (const item of loaded) this.trustedMap.set(item.id, item);
    this.trustedDevices = Array.from(this.trustedMap.values()).sort((a: TrustedDevice, b: TrustedDevice) => b.trustedAt - a.trustedAt);
    this.trustCircleTransitive = await loadTrustCircleTransitive();
    this.pendingVouches = parsePendingVouches(await loadPendingVouches());
  }
  private setTrustCircleTransitive(value: boolean): void {
    this.trustCircleTransitive = value;
    saveTrustCircleTransitive(value).catch(() => {});
    this.notify(value ? '已开启信任圈成员互通' : '已关闭信任圈成员互通（仅拉入当前配对设备）', 2000);
  }
  private persistPendingVouches(): void {
    savePendingVouches(JSON.stringify(this.pendingVouches.slice(-64))).catch(() => {});
  }
  private queuePendingVouch(targetId: string, introduced: IntroducedPeer): void {
    const tid = targetId.trim();
    if (!tid || !introduced.id || tid === this.deviceId || introduced.id === this.deviceId || tid === introduced.id) return;
    if (!this.trustedMap.has(tid) || introduced.token.length < 16) return;
    const now = Date.now();
    this.pendingVouches = this.pendingVouches.filter((v: PendingVouch) =>
      (now - v.createdAt <= PENDING_VOUCH_TTL_MS) && !(v.targetId === tid && v.introduced.id === introduced.id)
    );
    const entry: PendingVouch = { targetId: tid, introduced, createdAt: now };
    this.pendingVouches.push(entry);
    if (this.pendingVouches.length > 64) this.pendingVouches = this.pendingVouches.slice(-64);
    this.persistPendingVouches();
    this.vouchBackoff.delete(`${tid}|${introduced.id}`);
    this.flushPendingVouches();
  }
  private flushPendingVouches(): void {
    if (!this.pendingVouches.length || this.disposed) return;
    const now = Date.now();
    const before = this.pendingVouches.length;
    this.pendingVouches = this.pendingVouches.filter((v: PendingVouch) =>
      (now - v.createdAt <= PENDING_VOUCH_TTL_MS) && this.trustedMap.has(v.targetId)
    );
    if (this.pendingVouches.length !== before) this.persistPendingVouches();
    if (!this.pendingVouches.length) return;
    const onlineById = new Map<string, LanDevice>();
    for (const d of this.devices) onlineById.set(d.id, d);
    const snapshot = this.pendingVouches.slice();
    for (const item of snapshot) {
      const key = `${item.targetId}|${item.introduced.id}`;
      if (this.vouchInFlight.has(key)) continue;
      const until = this.vouchBackoff.get(key) ?? 0;
      if (Date.now() < until) continue;
      const targetOnline = onlineById.get(item.targetId);
      const trustedTarget = this.trustedMap.get(item.targetId);
      if (!targetOnline || !trustedTarget) continue;
      this.vouchInFlight.add(key);
      this.deliverPendingVouch(item, targetOnline, trustedTarget, key).catch(() => {});
    }
  }
  private async deliverPendingVouch(item: PendingVouch, targetOnline: LanDevice, trustedTarget: TrustedDevice, key: string): Promise<void> {
    try {
      const payload: VouchRequestPayload = {
        protocol: 'lxlia-lansync/1',
        version: 1,
        type: 'vouch',
        device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        trustToken: trustedTarget.token,
        introduced: item.introduced,
      };
      let res: LanPushResponse;
      if (targetOnline.receiveMode === 'pull') {
        const p = this.syncServer.offerVouch(targetOnline.id, JSON.stringify(payload));
        this.discovery?.announceNow();
        res = await p;
      } else {
        res = await vouchDirect(targetOnline.address, targetOnline.port, payload);
      }
      if (res.accepted || res.code === 'TRANSITIVE_DISABLED' || res.code === 'UNTRUSTED') {
        this.pendingVouches = this.pendingVouches.filter((v: PendingVouch) =>
          !(v.targetId === item.targetId && v.introduced.id === item.introduced.id)
        );
        this.persistPendingVouches();
        this.vouchBackoff.delete(key);
      } else {
        this.vouchBackoff.set(key, Date.now() + 5000);
      }
    } catch (_) {
      this.vouchBackoff.set(key, Date.now() + 5000);
    } finally {
      this.vouchInFlight.delete(key);
    }
  }
  private handleIncomingVouch(introduced: IntroducedPeer): VouchHandlerReply {
    if (!this.trustCircleTransitive) {
      return { accepted: false, code: 'TRANSITIVE_DISABLED', message: '对方未开启信任圈成员互通' };
    }
    if (!introduced.id || introduced.id === this.deviceId || introduced.token.length < 16) {
      return { accepted: false, code: 'INVALID', message: 'invalid vouch' };
    }
    setTimeout(() => {
      if (!this.disposed) this.addTrustedDevice(introduced.id, introduced.name, introduced.platform, introduced.token);
    }, 0);
    return { accepted: true, code: '', message: '' };
  }
  private verifyTrustedPeer(peerId: string, token: string): boolean {
    const entry = this.trustedMap.get(peerId);
    if (!entry) return false;
    return safeTokenEquals(entry.token, token);
  }
  private persistTrustedCircle(): void {
    const sorted = Array.from(this.trustedMap.values()).sort((a: TrustedDevice, b: TrustedDevice) => b.trustedAt - a.trustedAt);
    this.trustedDevices = sorted;
    saveTrustedDevices(JSON.stringify(sorted)).catch(() => {});
  }
  private addTrustedDevice(peerId: string, peerName: string, platform: string, token: string): void {
    if (!peerId || peerId === this.deviceId || token.length < 16) return;
    this.trustedMap.set(peerId, {
      id: peerId,
      name: peerName || 'LxMine',
      platform: platform || 'unknown',
      token,
      trustedAt: Date.now(),
    });
    this.persistTrustedCircle();
    this.autoSyncBackoff.delete(peerId);
    this.autoSyncExchanged.delete(peerId);
    if (this.lanAutoSync && this.storeReady) {
      this.discovery?.announceNow();
      this.scheduleAutoSyncReconcile(250, true);
    }
  }
  private syncTrustedDisplayNames(onlineDevices: LanDevice[]): void {
    let changed = false;
    for (const dev of onlineDevices) {
      const existing = this.trustedMap.get(dev.id);
      if (existing && dev.name && existing.name !== dev.name) {
        this.trustedMap.set(dev.id, {
          id: existing.id,
          name: dev.name,
          platform: existing.platform,
          token: existing.token,
          trustedAt: existing.trustedAt,
        });
        changed = true;
      }
    }
    if (changed) this.persistTrustedCircle();
  }
  private removeTrustedLocal(peerId: string): TrustedDevice | null {
    const removed = this.trustedMap.get(peerId) ?? null;
    if (!removed) return null;
    this.trustedMap.delete(peerId);
    this.pendingVouches = this.pendingVouches.filter((v: PendingVouch) => v.targetId !== peerId && v.introduced.id !== peerId);
    this.persistPendingVouches();
    this.persistTrustedCircle();
    this.autoSyncBackoff.delete(peerId);
    this.autoSyncExchanged.delete(peerId);
    return removed;
  }
  private removeTrustedDevice(peerId: string): void {
    const removed = this.removeTrustedLocal(peerId);
    if (!removed) return;
    this.message = `已将「${removed.name}」移出信任圈`;
    this.notify(this.message, 1800);
    const online = this.devices.find((item: LanDevice) => item.id === removed.id);
    if (online && online.receiveMode !== 'pull' && online.port > 0) {
      const payload: UnpairRequestPayload = {
        protocol: 'lxlia-lansync/1',
        version: 1,
        type: 'unpair',
        device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        trustToken: removed.token,
      };
      unpairDirect(online.address, online.port, payload).catch(() => {});
    }
  }
  private async pairDevice(device: LanDevice): Promise<void> {
    if (this.busy) return;
    const code = generatePairCode();
    const token = generateTrustToken();
    const ownPeers: PeerSummary[] = [];
    const preIntroduced: IntroducedPeer[] = [];
    if (this.trustCircleTransitive) {
      for (const item of this.trustedMap.values()) {
        if (item.id === device.id) continue;
        ownPeers.push({ id: item.id, name: item.name, platform: item.platform });
        if (device.receiveMode === 'pull') {
          preIntroduced.push({ id: item.id, name: item.name, platform: item.platform, token: generateTrustToken() });
        }
        if (ownPeers.length >= 32) break;
      }
    }
    this.busy = true;
    this.message = `等待「${device.name}」确认加入信任圈（核对验证码：${formatPairCode(code)}）…`;
    try {
      const payload: PairRequestPayload = {
        protocol: 'lxlia-lansync/1',
        version: 1,
        type: 'pair',
        code,
        token,
        transitive: this.trustCircleTransitive,
        peers: ownPeers,
        introducedPeers: preIntroduced.length > 0 ? preIntroduced : undefined,
        device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
      };
      let res: LanPushResponse;
      if (device.receiveMode === 'pull') {
        const confirmation = this.syncServer.offerPair(device.id, JSON.stringify(payload));
        this.discovery?.announceNow();
        res = await confirmation;
      } else {
        res = await pairDirect(device.address, device.port, payload);
      }
      if (res.accepted) {
        const peerId = res.peerId || device.id;
        const peerName = res.peerName || device.name;
        const peerPlatform = res.peerPlatform || device.platform;
        this.addTrustedDevice(peerId, peerName, peerPlatform, token);
        let extraCount = 0;
        if (this.trustCircleTransitive && res.transitive === true) {
          if (device.receiveMode === 'pull' && preIntroduced.length > 0) {
            const accIds = new Set<string>(res.acceptedIntroducedIds ?? []);
            for (const pre of preIntroduced) {
              if (accIds.size === 0 || accIds.has(pre.id)) {
                this.queuePendingVouch(pre.id, { id: peerId, name: peerName, platform: peerPlatform, token: pre.token });
              }
            }
          }
          for (const intro of (res.introducedPeers ?? [])) {
            if (!intro || !intro.id || intro.id === this.deviceId || intro.id === peerId || intro.token.length < 16) continue;
            if (this.trustedMap.has(intro.id)) continue;
            this.addTrustedDevice(intro.id, intro.name, intro.platform, intro.token);
            extraCount += 1;
          }
          for (const rv of (res.reverseVouches ?? [])) {
            if (!rv || !rv.id || rv.id === this.deviceId || rv.token.length < 16 || !this.trustedMap.has(rv.id)) continue;
            this.queuePendingVouch(rv.id, { id: peerId, name: peerName, platform: peerPlatform, token: rv.token });
          }
        }
        const suffix = extraCount > 0 ? `（并同步加入对方信任圈内 ${extraCount} 台设备）` : '';
        this.message = `已将「${peerName}」加入设备信任圈${suffix}`;
      } else {
        this.message = res.message ? `对方未接受：${res.message}` : '对方拒绝了信任请求';
      }
      this.notify(this.message, 2400);
    } catch (error) {
      this.message = `加入信任圈失败：${(error as Error).message}`;
      this.notify(this.message, 3000);
    } finally {
      this.busy = false;
    }
  }
  private async send(device: LanDevice): Promise<void> {
    if (this.busy) return;
    const trusted = this.trustedMap.get(device.id);
    if (!trusted) {
      await this.pairDevice(device);
      return;
    }
    this.busy = true; this.message = `等待「${device.name}」确认接收…`;
    try {
      await this.persist();
      const bundle: SyncBundle = { protocol: 'lxlia-lansync/1', version: 1, createdAt: Date.now(), device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        trustToken: trusted.token, settings: this.settings, playlists: this.playlists, sources: this.sources, activeSourceId: this.activeId };
      let res: LanPushResponse;
      if (device.receiveMode === 'pull') {
        const confirmation = this.syncServer.offerPushDetailed(device.id, JSON.stringify(bundle));
        this.discovery?.announceNow();
        res = await confirmation;
      } else res = await pushBundleDetailed(device, bundle);
      if (res.accepted) {
        this.message = `已同步到「${device.name}」`;
      } else if (res.code === 'UNTRUSTED') {
        this.message = `「${device.name}」已将本机移出信任圈，请先移除再重新加入信任圈`;
      } else {
        this.message = res.message ? `对方未接受：${res.message}` : '对方未接受同步';
      }
      this.notify(this.message, 2200);
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
    const pairCode = generatePairCode();
    const pairToken = generateTrustToken();
    this.busy = true;
    this.message = `正在连接 ${address}:${port}（若未信任将请求加入信任圈，验证码：${formatPairCode(pairCode)}）…`;
    try {
      await this.persist();
      const pingInfo = await pingDirect(address, port, 5000);
      if (!pingInfo || !pingInfo.id) {
        throw new Error('无法连接目标设备，请检查 IP、端口和 Wi-Fi');
      }
      if (pingInfo.id === this.deviceId) {
        throw new Error('不能向本机自身发送同步');
      }
      const peerName = pingInfo.name || `${address}:${port}`;
      const peerPlatform = pingInfo.platform || 'unknown';
      const trusted = this.trustedMap.get(pingInfo.id);
      if (!trusted) {
        const ownPeers: PeerSummary[] = [];
        if (this.trustCircleTransitive) {
          for (const item of this.trustedMap.values()) {
            if (item.id === pingInfo.id) continue;
            ownPeers.push({ id: item.id, name: item.name, platform: item.platform });
            if (ownPeers.length >= 32) break;
          }
        }
        const pairPayload: PairRequestPayload = {
          protocol: 'lxlia-lansync/1',
          version: 1,
          type: 'pair',
          code: pairCode,
          token: pairToken,
          transitive: this.trustCircleTransitive,
          peers: ownPeers,
          device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        };
        const pairRes = await pairDirect(address, port, pairPayload);
        if (pairRes.accepted) {
          const finalId = pairRes.peerId || pingInfo.id;
          const finalName = pairRes.peerName || peerName;
          const finalPlatform = pairRes.peerPlatform || peerPlatform;
          this.addTrustedDevice(finalId, finalName, finalPlatform, pairToken);
          let extraCount = 0;
          if (this.trustCircleTransitive && pairRes.transitive === true) {
            for (const intro of (pairRes.introducedPeers ?? [])) {
              if (!intro || !intro.id || intro.id === this.deviceId || intro.id === finalId || intro.token.length < 16) continue;
              if (this.trustedMap.has(intro.id)) continue;
              this.addTrustedDevice(intro.id, intro.name, intro.platform, intro.token);
              extraCount += 1;
            }
            for (const rv of (pairRes.reverseVouches ?? [])) {
              if (!rv || !rv.id || rv.id === this.deviceId || rv.token.length < 16 || !this.trustedMap.has(rv.id)) continue;
              this.queuePendingVouch(rv.id, { id: finalId, name: finalName, platform: finalPlatform, token: rv.token });
            }
          }
          const suffix = extraCount > 0 ? `（并同步加入对方信任圈内 ${extraCount} 台设备）` : '';
          this.message = `已将「${finalName}」加入信任圈${suffix}，再次点击即可发送或自动同步`;
        } else {
          this.message = pairRes.message ? `对方未接受信任请求：${pairRes.message}` : '对方拒绝了信任请求';
        }
        this.notify(this.message, 2600);
        return;
      }
      const bundle: SyncBundle = { protocol: 'lxlia-lansync/1', version: 1, createdAt: Date.now(), device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
        trustToken: trusted.token, settings: this.settings, playlists: this.playlists, sources: this.sources, activeSourceId: this.activeId };
      const res = await pushDirectDetailed(address, port, bundle, '/lxlia-sync/push', 130000);
      if (res.accepted) {
        this.message = `已直连同步到「${peerName}」`;
      } else if (res.code === 'UNTRUSTED') {
        this.message = `「${peerName}」已将本机移出信任圈，请先移除再重新加入信任圈`;
      } else {
        this.message = res.message ? `对方未接受：${res.message}` : '对方未接受同步';
      }
      this.notify(this.message, 2600);
    } catch (error) {
      this.message = `直连失败：${(error as Error).message}`;
      this.notify(this.message, 3000);
    } finally { this.busy = false; }
  }
  private scheduleAutoSyncReconcile(delayMs: number = 350, forceLocalPush: boolean = false): void {
    if (!this.lanAutoSync || !this.storeReady || this.disposed || this.trustedMap.size === 0) return;
    if (this.autoSyncReconcileTimer >= 0) clearTimeout(this.autoSyncReconcileTimer);
    this.autoSyncReconcileTimer = setTimeout(() => {
      this.autoSyncReconcileTimer = -1;
      this.reconcileAutoSyncPeers(forceLocalPush).catch(() => {});
    }, delayMs);
  }
  private async reconcileAutoSyncPeers(forceLocalPush: boolean = false): Promise<void> {
    if (!this.lanAutoSync || !this.storeReady || this.disposed || this.trustedMap.size === 0) return;
    const effectiveForce = forceLocalPush && Date.now() >= this.suppressAutoSyncUntil;
    const myDigest = computeSyncDigest(this.playlists);
    const now = Date.now();
    const candidates = this.devices.filter((peer: LanDevice) => {
      if (peer.autoSyncPlaylists !== true || peer.port <= 0) return false;
      if (!this.trustedMap.has(peer.id)) return false;
      if (this.autoSyncInFlight.has(peer.id)) return false;
      const backoff = this.autoSyncBackoff.get(peer.id) ?? 0;
      if (now < backoff) return false;
      const peerDigest = peer.syncDigest ?? '';
      if (peerDigest && peerDigest === myDigest) {
        this.autoSyncBackoff.delete(peer.id);
        return false;
      }
      const pairKey = `${myDigest}|${peerDigest}`;
      if (!effectiveForce && this.autoSyncExchanged.get(peer.id) === pairKey) return false;
      if (peer.receiveMode === 'pull') {
        return effectiveForce;
      }
      return effectiveForce || this.deviceId < peer.id || !peerDigest;
    });
    if (!candidates.length) return;
    let mergedLocally = false;
    await Promise.allSettled(candidates.map(async (peer: LanDevice) => {
      const trusted = this.trustedMap.get(peer.id);
      if (!trusted) return;
      this.autoSyncInFlight.add(peer.id);
      try {
        const bundle: SyncBundle = {
          protocol: 'lxlia-lansync/1',
          version: 1,
          createdAt: Date.now(),
          device: { id: this.deviceId, name: this.deviceName, platform: 'harmony' },
          trustToken: trusted.token,
          syncDigest: myDigest,
          settings: {},
          playlists: this.playlists,
          sources: [],
          activeSourceId: '',
        };
        const timeoutMs = peer.receiveMode === 'pull' ? 3500 : 10000;
        const res = await exchangeAutoPlaylists(peer.address, peer.port, bundle, timeoutMs);
        if (res.code === 'UNTRUSTED') {
          this.autoSyncBackoff.set(peer.id, Date.now() + 30000);
          return;
        }
        if (!res.accepted) {
          this.autoSyncBackoff.set(peer.id, Date.now() + 5000);
          return;
        }
        this.autoSyncBackoff.delete(peer.id);
        let postDigest = computeSyncDigest(this.playlists);
        if (res.playlists.length > 0 && !this.disposed) {
          try {
            const beforeJson = JSON.stringify(this.playlists);
            const remoteLists = parsePlaylists(JSON.stringify(res.playlists));
            const merged = mergeSyncPlaylists(this.playlists, remoteLists);
            postDigest = computeSyncDigest(merged);
            if (JSON.stringify(merged) !== beforeJson) {
              mergedLocally = true;
              this.suppressAutoSyncUntil = Date.now() + 2500;
              this.playlists = merged;
              this.syncLikedKeysStorage();
              if (this.openedPlaylist) {
                const updated = this.openedPlaylist.isFavorite
                  ? merged.find((item: MusicPlaylist) => item.isFavorite)
                  : merged.find((item: MusicPlaylist) => item.id === this.openedPlaylist?.id);
                if (updated) this.openedPlaylist = updated;
              }
              this.save();
            }
          } catch (_) {}
        }
        const remoteDigest = res.syncDigest || (peer.syncDigest ?? '');
        this.autoSyncExchanged.set(peer.id, `${postDigest}|${remoteDigest}`);
      } catch (_) {
        this.autoSyncBackoff.set(peer.id, Date.now() + 5000);
      } finally {
        this.autoSyncInFlight.delete(peer.id);
      }
    }));
    if (mergedLocally && !this.disposed) {
      this.discovery?.announceNow();
      const toastNow = Date.now();
      if (toastNow - this.lastAutoSyncToastAt >= 2500) {
        this.lastAutoSyncToastAt = toastNow;
        this.notify('已自动合并局域网歌单与我的收藏', 1800);
      }
      this.scheduleAutoSyncReconcile(450, false);
    }
  }
  private triggerAutoSync(): void {
    if (!this.lanAutoSync || this.trustedMap.size === 0 || Date.now() < this.suppressAutoSyncUntil || this.disposed) return;
    this.discovery?.announceNow();
    if (this.autoSyncTimer >= 0) clearTimeout(this.autoSyncTimer);
    this.autoSyncTimer = setTimeout(() => {
      this.autoSyncTimer = -1;
      this.reconcileAutoSyncPeers(true).catch(() => {});
    }, 650);
  }
  /** 用户确认后校验全部数据，再持久化，最后回执；失败保留原数据。 */
  private async respond(accepted: boolean): Promise<void> {
    const incoming = this.incoming;
    if (!incoming || this.applying) return;
    this.applying = true;
    try {
      if (incoming.kind === 'pair') {
        const pairOpts: PairRespondOptions = { transitive: false, introducedPeers: [], reverseVouches: [] };
        if (accepted && incoming.peerId && incoming.pairToken) {
          const existingBefore: TrustedDevice[] = [];
          for (const item of this.trustedMap.values()) {
            if (item.id !== incoming.peerId) existingBefore.push(item);
          }
          this.addTrustedDevice(incoming.peerId, incoming.peerName, incoming.platform, incoming.pairToken);
          let extraCount = 0;
          if (this.trustCircleTransitive && incoming.transitive === true) {
            pairOpts.transitive = true;
            const initiatorKnown = new Set<string>();
            for (const p of (incoming.peers ?? [])) initiatorKnown.add(p.id);
            for (const p of existingBefore) {
              if (initiatorKnown.has(p.id)) continue;
              const freshToken = generateTrustToken();
              pairOpts.introducedPeers.push({ id: p.id, name: p.name, platform: p.platform, token: freshToken });
              this.queuePendingVouch(p.id, {
                id: incoming.peerId,
                name: incoming.peerName,
                platform: incoming.platform,
                token: freshToken,
              });
            }
            for (const q of (incoming.peers ?? [])) {
              if (!q.id || q.id === this.deviceId || q.id === incoming.peerId || this.trustedMap.has(q.id)) continue;
              const revToken = generateTrustToken();
              this.addTrustedDevice(q.id, q.name, q.platform, revToken);
              pairOpts.reverseVouches.push({ id: q.id, name: q.name, platform: q.platform, token: revToken });
              extraCount += 1;
            }
          }
          const suffix = extraCount > 0 ? `（并同步加入对方信任圈内 ${extraCount} 台设备）` : '';
          this.message = `已将「${incoming.peerName}」加入设备信任圈${suffix}`;
          this.notify(this.message, 2200);
        }
        await this.syncServer.respond(incoming.id, accepted, '', pairOpts); this.incoming = null;
        return;
      }
      if (accepted) {
        const bundle = JSON.parse(incoming.bundleJson) as SyncBundle;
        const playlists = parsePlaylists(JSON.stringify(bundle.playlists));
        if (!playlists.some((item: MusicPlaylist) => item.isFavorite)) {
          playlists.unshift(createPlaylist('我的收藏', true));
        }
        for (const source of bundle.sources) if (typeof source.script !== 'string' || typeof source.id !== 'string' || typeof source.name !== 'string') throw new Error('音源格式错误');
        bundle.sources = uniqueSyncSources(bundle.sources);
        const activeId = bundle.activeSourceId && bundle.sources.some((source: SyncSourcePayload) => source.id === bundle.activeSourceId) ? bundle.activeSourceId : '';
        const data: AppData = { sourceScript: '', sourcesJson: JSON.stringify(bundle.sources), activeSourceId: activeId, settingsJson: JSON.stringify(bundle.settings), playlistsJson: JSON.stringify(playlists) };
        await saveAppData(data);
        this.sources = bundle.sources; this.activeId = activeId; this.sourceReady = false;
        this.settings = bundle.settings; this.restoreSettings(); this.playlists = playlists; this.openedPlaylist = null;
        this.syncLikedKeysStorage();
        this.restoreSource(); this.message = `已接收「${incoming.peerName}」的数据`;
      }
      await this.syncServer.respond(incoming.id, accepted); this.incoming = null;
    } catch (error) {
      this.error = `同步失败：${(error as Error).message}`;
      await this.syncServer.respond(incoming.id, false, this.error); this.incoming = null;
    } finally { this.applying = false; }
  }
  private refreshAvoidInsets(win: window.Window): void {
    try {
      const ui = this.getUIContext();
      const sys = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      let topPx = sys.topRect.height;
      let bottomPx = sys.bottomRect.height;
      let leftPx = sys.leftRect.width;
      let rightPx = sys.rightRect.width;
      try {
        const nav = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
        bottomPx = Math.max(bottomPx, nav.bottomRect.height);
      } catch (_) {}
      try {
        const cut = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);
        topPx = Math.max(topPx, cut.topRect.height);
        leftPx = Math.max(leftPx, cut.leftRect.width);
        rightPx = Math.max(rightPx, cut.rightRect.width);
      } catch (_) {}
      const nextTop = ui.px2vp(topPx);
      const nextBottom = Math.max(12, ui.px2vp(bottomPx));
      const nextLeft = Math.max(0, ui.px2vp(leftPx));
      const nextRight = Math.max(0, ui.px2vp(rightPx));
      if (Math.abs(nextTop - this.statusInset) >= 1) this.statusInset = nextTop;
      if (Math.abs(nextBottom - this.bottomInset) >= 1) this.bottomInset = nextBottom;
      if (Math.abs(nextLeft - this.leftInset) >= 1) this.leftInset = nextLeft;
      if (Math.abs(nextRight - this.rightInset) >= 1) this.rightInset = nextRight;
    } catch (_) {}
  }
  private async configureWindow(): Promise<void> {
    try {
      const win = this.mainWindow ?? await window.getLastWindow(getContext(this) as common.UIAbilityContext);
      if (!this.mainWindow) {
        this.mainWindow = win;
        await win.setWindowLayoutFullScreen(true);
      }
      this.refreshAvoidInsets(win);
      if (!this.avoidAreaListening) {
        this.avoidAreaListening = true;
        try {
          win.on('avoidAreaChange', () => {
            if (!this.disposed && this.mainWindow) this.refreshAvoidInsets(this.mainWindow);
          });
        } catch (_) {}
      }
      this.applyOrientation(this.showPlayer);
      this.updateSystemBars();
    } catch (_) {}
  }
  /** 只有播放详情页允许旋转；其余页面锁竖屏，平板与车机不锁方向，鸿蒙 PC 窗口自由缩放不调方向锁。 */
  private applyOrientation(detail: boolean): void {
    if (deviceInfo.deviceType === '2in1') return;
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
    if (!this.showPlayer && (!this.stageControlsVisible || this.stageControlsReveal !== 1)) {
      this.stageControlsVisible = true;
      this.stageControlsReveal = 1;
    }
  }
  private stageControlsVisibilityChanged(): void {
    const target = this.stageControlsVisible ? 1 : 0;
    if (this.stageControlsReveal === target) return;
    if (!this.showPlayer) {
      this.stageControlsReveal = target;
      return;
    }
    this.getUIContext().animateTo(
      { duration: 240, curve: curves.cubicBezierCurve(0.2, 0.8, 0.2, 1) },
      () => { this.stageControlsReveal = target; }
    );
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
    if (this.foreground && this.gripEnabled && this.gripSupported && !this.disposed) {
      this.grip.start(getContext(this) as common.UIAbilityContext, (side: GripSide) => {
        this.getUIContext().animateTo({ curve: curves.springMotion(0.44, 0.85) }, () => { this.gripSide = side; });
      }).then((available: boolean | null) => {
        if (available === false && this.foreground && this.gripEnabled) {
          this.gripEnabled = false;
          this.gripSupported = false;
          this.save();
        }
      });
    }
  }
  private askIncoming(): void {
    const request = this.incoming; if (!request) return;
    this.promptedIncoming = request.id;
    if (request.kind === 'pair') {
      const codeText = formatPairCode(request.pairCode ?? '');
      const transitiveNote = request.transitive
        ? '\n\n对方已开启「信任圈成员互通」：若本机也开启此开关，确认后双方信任圈内已有设备将自动互相加入。'
        : '';
      this.getUIContext().showAlertDialog({
        title: '信任圈加入请求',
        message: `「${request.peerName}」（${devicePlatformName(request.platform)}）请求加入您的设备信任圈。\n\n核对验证码：${codeText}\n\n确认加入后，双方可互相发送整份数据并自动同步歌单。${transitiveNote}`,
        autoCancel: false,
        systemMaterial: musicMenuMaterial(),
        primaryButton: { value: '拒绝', action: () => { this.respond(false); } },
        secondaryButton: { value: '信任此设备', action: () => { this.respond(true); } }
      });
      return;
    }
    this.getUIContext().showAlertDialog({ title: '接收同步',
      message: `已信任设备「${request.peerName}」将发送 ${request.summary.playlists} 个歌单、${request.summary.sources} 个音源及 ${request.summary.settings} 项设置。接收后覆盖本机对应数据。`,
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
            wide: this.wide,
            showDelete: this.canDeleteOpenedPlaylist() || (this.openedPlaylist.kind === 'recent' && $$.songs.length > 0),
            deleteLabel: this.openedPlaylist.kind === 'recent' ? '清空' : '删除歌单',
            showEdit: this.canDeleteOpenedPlaylist(),
            showCustomCover: this.canCustomizeOpenedPlaylistCover(),
            showBatchCollect: $$.songs.length > 0,
            showBatchDownload: $$.songs.length > 0 && this.openedPlaylist.kind !== 'local',
            showCollect: this.canCollectOpenedPlaylist(),
            collected: this.isCollectionSavedToLibrary(this.openedPlaylist.name, this.openedPlaylist.songs ?? []),
            collectLabel: '收藏到曲库',
            onPlayAll: () => { const q = $$.playQueue ?? $$.songs; if (q.length) this.playSong(q[0], q); },
            onSort: (mode: string) => { this.listSortMode = mode; },
            onManual: () => this.openManualOrder(),
            onDelete: () => {
              if (this.openedPlaylist?.kind === 'recent') this.clearRecentSongs();
              else this.deleteOpenedPlaylist();
            },
            onRename: () => this.openSheet('重命名歌单'),
            onCustomCover: () => { if (this.openedPlaylist) this.openCoverPicker(this.openedPlaylist); },
            onBatchDelete: () => { this.editPlaylistOpen = true; },
            onBatchCollect: () => { this.openBatchCollectPicker($$.songs, `批量收藏 · ${this.openedPlaylist?.name ?? '歌单'}`); },
            onBatchDownload: () => { this.openBatchDownloadPicker($$.songs); },
            onCollect: () => {
              if (this.openedPlaylist) {
                this.collectToLibrary(this.openedPlaylist.name, this.openedPlaylist.songs ?? [], this.openedPlaylist.customCover ?? '');
              }
            } })
        }
      }
      if ($$.scroller === this.searchScroller && this.searchOpen) {
        ListItem() {
          SongListTools({ countText: `${$$.songs.length} 首歌曲`, disabled: !$$.songs.length,
            wide: this.wide,
            showBatchCollect: $$.songs.length > 0,
            showBatchDownload: $$.songs.length > 0,
            showCollect: !!this.openedEntity && $$.songs.length > 0,
            collected: this.openedEntity ? this.isCollectionSavedToLibrary(this.openedEntity.name, this.entitySongs) : false,
            collectLabel: this.openedEntity?.kind === 'album' ? '收藏专辑' : '收藏到曲库',
            onPlayAll: () => { if ($$.songs.length) this.playSong($$.songs[0], $$.songs, 0, true, !!$$.fromSearch, !!$$.fromSearch); },
            onSort: (mode: string) => { this.listSortMode = mode; },
            onManual: () => this.openManualOrderFor(this.openedEntity ? this.entitySongs : this.results),
            onBatchCollect: () => { this.openBatchCollectPicker($$.songs, this.openedEntity ? `批量收藏 · ${this.openedEntity.name}` : '批量收藏搜索结果'); },
            onBatchDownload: () => { this.openBatchDownloadPicker($$.songs); },
            onCollect: () => {
              if (this.openedEntity) {
                this.collectToLibrary(this.openedEntity.name, this.entitySongs, this.openedEntity.cover ?? '');
              }
            } })
        }
      }
  }
  @Builder private songList($$: SongListInput) {
    SongListView({ songs: $$.songs, scroller: $$.scroller, wide: this.wide,
      selectedKey: this.selected ? songKey(this.selected) : '',
      likedSignature: this.likedSignature(),
      contentTop: $$.scroller === this.queueScroller ? 72 : this.headerHeight(),
      contentBottom: $$.scroller === this.queueScroller ? 28 : this.searchOpen ? 150 : 180,
      showRemove: $$.scroller === this.queueScroller || ($$.scroller === this.playlistScroller && this.canRemoveFromOpenedPlaylist()),
      showSwitchPlatform: $$.scroller === this.queueScroller || ($$.scroller === this.playlistScroller && this.canSwitchInOpenedPlaylist()),
      showPlayNext: true,
      hidePlayNextOnActive: $$.scroller === this.queueScroller,
      removeLabel: $$.scroller === this.queueScroller ? '从队列移除' : (this.openedPlaylist?.isFavorite ? '取消收藏' : (this.openedPlaylist?.kind === 'recent' ? '从最近播放移除' : '从歌单移除')),
      header: () => { this.songListHeader($$); }, likedSong: (song: Song) => this.liked(song),
      onPlay: (song: Song, context: Song[]) => {
        const queueToUse = ($$.playQueue && $$.playQueue.length > 0) ? $$.playQueue : context;
        this.playSong(song, queueToUse, 0, true, !!$$.fromSearch, false, !!$$.preserveQueue);
      },
      onPlayNext: (song: Song) => this.playNext(song),
      onLike: (song: Song) => this.like(song), onMore: (song: Song) => this.addToPlaylist(song),
      onDownload: (song: Song) => this.downloadSong(song),
      onRemove: (song: Song) => { if ($$.scroller === this.queueScroller) this.removeFromQueue(song); else this.removeSongFromOpenedPlaylist(song); },
      onSwitchPlatform: (song: Song) => {
        if ($$.scroller === this.queueScroller) {
          this.openSubSheetFromSheet('播放队列', () => { this.openSwitchPlatform(song, 'queue'); });
        } else {
          this.openSwitchPlatform(song, 'playlist');
        }
      },
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
    this.sourcesVisited = true;
    this.sourcesClosing = false;
    this.sourcesReveal = 1;
    this.sourcesOpen = true;
    this.discoveryCompact = false;
  }
  private closeSources(): void {
    clearTimeout(this.sourcesCloseTimer);
    this.sourcesClosing = false;
    this.sourcesOpen = false;
    this.sourcesReveal = 1;
    const targetOffset = this.settingsRestoreOffset;
    setTimeout(() => { try { this.settingsScroller.scrollTo({ xOffset: 0, yOffset: targetOffset }); } catch (_) {} }, 32);
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
    this.hydrateDownloadCovers().catch(() => {});
  }
  private async hydrateDownloadCovers(): Promise<void> {
    const missing = this.downloadItems.filter((item: MusicDownload) => !item.song.coverUrl && item.song.name);
    if (!missing.length) return;
    const found = new Map<string, string>();
    const known = new Map<string, string>();
    for (const pl of this.playlists) {
      for (const s of (pl.songs ?? [])) if (s.coverUrl) known.set(songKey(s), s.coverUrl);
    }
    for (const s of this.recentSongs) if (s.coverUrl) known.set(songKey(s), s.coverUrl);
    for (const s of this.queue) if (s.coverUrl) known.set(songKey(s), s.coverUrl);
    const needRemote: Song[] = [];
    for (const item of missing) {
      const k = songKey(item.song);
      const hit = known.get(k);
      if (hit) found.set(k, hit);
      else needRemote.push(item.song);
    }
    if (needRemote.length && this.hostReady) {
      try {
        const remote = await hydrateSongCovers(this.host, needRemote.slice(0, 30));
        remote.forEach((url: string, key: string) => {
          if (url) found.set(key, url);
        });
      } catch (_) {}
    }
    if (found.size > 0) this.downloads.updateCovers(found);
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
    const returnSearch = this.playlistReturnSearch;
    const feedOffset = this.playlistReturnFeedOffset;
    const homeOffset = this.playlistReturnHomeOffset;
    const returnToPlayer = this.playlistReturnToPlayer;
    this.openedPlaylist = null; this.openedFeedSourceId = '';
    this.playlistReturnFeed = '';
    this.playlistReturnSearch = false;
    this.playlistReturnToPlayer = false;
    if (returnSearch) {
      this.tab = '发现';
      this.searchOpen = true;
      this.discoveryCompact = false;
    } else if (returnFeed) {
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
    } else {
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
    if (returnToPlayer && this.selected) {
      this.showPlayer = true;
    }
  }
  private feedSectionChanged(): void {
    if (this.feedSection && !this.feedOpening && !this.feedClosing && this.feedReveal === 0) this.feedReveal = 1;
  }
  private feedDim(): number { return this.feedSection ? this.feedReveal : 0; }
  @LocalBuilder private feedOverlay() {
    if (this.feedSection) {
      Stack({ alignContent: Alignment.TopStart }) {
        Column() {
          FeedSectionPage({ playlists: this.feedSectionPlaylists(), songs: this.feedSectionSongs(), localPlaylists: this.feedSectionLocal(),
            wide: this.wide, contentTop: this.statusInset + 82, scroller: this.feedScroller, emptyText: '这里还没有内容',
            sectionLoading: this.feedSectionLoading,
            selectedKey: this.selected ? songKey(this.selected) : '',
            likedSignature: this.likedSignature(),
            likedSong: (song: Song) => this.liked(song), onLikeSong: (song: Song) => this.like(song),
            onAddToPlaylist: (song: Song) => this.addToPlaylist(song), onDownloadSong: (song: Song) => this.downloadSong(song),
            onPlayNextSong: (song: Song) => this.playNext(song),
            onBatchCollectSongs: (songs: Song[]) => this.openBatchCollectPicker(songs, `批量收藏 · ${this.feedSectionTitle()}`),
            onBatchDownloadSongs: (songs: Song[]) => this.openBatchDownloadPicker(songs),
            onOpenFeed: (item: FeedPlaylist) => { if (Date.now() < this.feedReadyAt) return; let offset = 0; try { offset = this.feedScroller.currentOffset().yOffset; } catch (_) {} this.openFeedPlaylist(item, false, offset).catch(() => {}); },
            onPlaySong: (song: Song, queue: Song[]) => { if (Date.now() < this.feedReadyAt) return; this.playSong(song, queue, 0, true, false, false, true).catch(() => {}); },
            onPlaySongs: (songs: Song[]) => { if (Date.now() < this.feedReadyAt) return; if (songs.length) this.playSong(songs[0], songs).catch(() => {}); },
            statusInset: this.statusInset, bottomInset: this.bottomInset,
            onOpenLocal: (playlist: MusicPlaylist) => { if (Date.now() < this.feedReadyAt) return; this.rememberPlaylistContext(); this.openedPlaylist = playlist; this.tab = '资料库'; this.feedSection = ''; this.discoveryCompact = false; this.hydrateOpenedListCovers().catch(() => {}); },
            onScroll: (offset: number) => {} })
        }
          .width('100%').height('100%')
          .linearGradientBlur(28, { fractionStops: this.topBlurStops(this.statusInset + 96), direction: GradientDirection.Bottom })
        Column()
          .width('100%').height(this.statusInset + 96)
          .linearGradient({
            direction: GradientDirection.Bottom,
            colors: this.stageLight()
              ? [['#D8EEF1F6', 0.0], ['#64EEF1F6', 0.56], ['#00EEF1F6', 1.0]]
              : [['#C80D0F14', 0.0], ['#5E0D0F14', 0.56], ['#000D0F14', 1.0]]
          })
          .hitTestBehavior(HitTestMode.None)
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
    if (this.settingsPanel === 'playback') return '播放与音效';
    if (this.settingsPanel === 'appearance') return '外观与背景';
    if (this.settingsPanel === 'lyrics') return '歌词设置';
    if (this.settingsPanel === 'general') return '通用与交互';
    if (this.settingsPanel === 'shortcuts') return '快捷键管理';
    if (this.settingsPanel === 'sync') return '局域网同步';
    if (this.settingsPanel === 'car') return 'HiCar';
    if (this.tab === '发现' && this.searchOpen) return this.openedEntity?.name ?? '搜索';
    return 'LxMine';
  }
  private secondarySubtitle(): string {
    if (this.openedPlaylist) return this.openedFeedLoading && !(this.openedPlaylist.songs?.length) ? '' : `${this.openedPlaylist.songs?.length ?? 0} 首歌曲`;
    if (this.downloadsOpen) return this.downloadItems.length ? `${this.downloadItems.length} 个下载` : '';
    if (this.sourcesOpen) return `${this.sources.length} 个音源`;
    if (this.tab === '发现' && this.searchOpen && this.openedEntity) return this.entitySongs.length ? `${this.entitySongs.length} 首歌曲` : (this.loading ? '正在读取…' : '');
    if (this.tab === '发现' && this.searchOpen && !this.openedEntity) return '公共音乐检索';
    return '';
  }
  private secondaryBackLabel(): string {
    if (this.downloadsOpen) return this.downloadsReturnTab === '设置' ? '返回设置' : '返回曲库';
    if (this.sourcesOpen || this.settingsPanel !== 'main') return '返回设置';
    if (this.tab === '发现' && this.searchOpen) return this.openedEntity ? '返回搜索' : (this.searchReturnToPlayer ? '返回播放' : '返回首页');
    if (this.openedPlaylist && this.playlistReturnToPlayer) return '返回播放';
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
      Column()
        .width('100%').height(this.headerHeight() + 26)
        .linearGradient({
          direction: GradientDirection.Bottom,
          colors: this.stageLight()
            ? [['#D8EEF1F6', 0.0], ['#64EEF1F6', 0.56], ['#00EEF1F6', 1.0]]
            : [['#C80D0F14', 0.0], ['#5E0D0F14', 0.56], ['#000D0F14', 1.0]]
        })
        .hitTestBehavior(HitTestMode.None)
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
                Stack({ alignContent: Alignment.Center }) {
                  if (this.boostImmersive) {
                    HdsExquisiteCapsule({ pillWidth: 0, pillHeight: 36 })
                  }
                  Select(this.platforms.map((platform: PlatformOption) => { return { value: platform.label } as SelectOption; }))
                    .value(platformName(this.platform)).selected(this.platforms.findIndex((p: PlatformOption) => p.id === this.platform)).width('100%').height(36)
                    .font({ size: 13 }).backgroundColor(Color.Transparent).systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicMaterial()).menuSystemMaterial(musicMenuMaterial()).onSelect((index: number) => {
                      this.platform = this.platforms[index].id; this.searchToken++; this.loading = false; this.results = []; this.entities = []; this.openedEntity = null; this.hasMore = false;
                      if (this.keyword.trim()) this.search();
                    })
                }.layoutWeight(1).height(36).clip(false)
              }.layoutWeight(1).alignItems(VerticalAlign.Center)
              Row({ space: 6 }) {
                Text('类型').fontSize(12).fontColor(MUTED)
                Stack({ alignContent: Alignment.Center }) {
                  if (this.boostImmersive) {
                    HdsExquisiteCapsule({ pillWidth: 0, pillHeight: 36 })
                  }
                  Select(SEARCH_KINDS.map((value: string) => { return { value } as SelectOption; }))
                    .selected(SEARCH_KIND_IDS.indexOf(this.searchKind)).value(SEARCH_KINDS[SEARCH_KIND_IDS.indexOf(this.searchKind)]).width('100%').height(36)
                    .font({ size: 13 }).backgroundColor(Color.Transparent).systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicMaterial()).menuSystemMaterial(musicMenuMaterial()).onSelect((index: number) => {
                      this.searchKind = SEARCH_KIND_IDS[index]; this.searchToken++; this.loading = false; this.results = []; this.entities = []; this.hasMore = false;
                      if (this.keyword.trim()) this.search();
                    })
                }.layoutWeight(1).height(36).clip(false)
              }.layoutWeight(1).alignItems(VerticalAlign.Center)
            }.width('100%').height(36).padding({ left: this.wide ? 34 : 22, right: this.wide ? 34 : 22 })
          }
        }.width('100%').transition(TransitionEffect.OPACITY.animation({ duration: 200, curve: Curve.EaseOut }))
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
          .transition(TransitionEffect.OPACITY.animation({ duration: 200, curve: Curve.EaseOut }))
      }
      if (this.secondaryHeader() && this.openedPlaylist?.kind === 'local') {
        // 本地音乐页顶栏右上角动作；直接作为标题层覆盖，和 PageHeader 的 38vp 球同高。
        Row({ space: 8 }) {
          MaterialIcon({ icon: $r('app.media.ic_sparkle'), label: isHarmonyPc() ? '智能识别电脑里的音频' : '智能识别手机里的音频', diameter: 38, raw: true, tint: false,
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
    Stack({ alignContent: Alignment.Center }) {
      if (this.boostImmersive) {
        HdsExquisiteCapsule({ pillWidth: this.searchEntryWidth(), pillHeight: this.searchEntryHeight() })
      }
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
        .systemMaterial(this.boostImmersive ? uiMaterial.Material.empty : musicMaterial()).clip(true)
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) this.searchPressed = true;
          else if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.searchPressed = false;
        })
        .onClick(() => this.openSearch())
    }
      .width('100%').height('100%').clip(false)
      .scale({
        x: this.searchPressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1,
        y: this.searchPressed ? (this.boostImmersive ? EXQUISITE_PRESS_SCALE : MATERIAL_PRESS_SCALE) : 1
      })
      .animation({ curve: this.boostImmersive ? curves.springMotion(0.30, 0.72) : curves.springMotion(0.36, 0.9) })
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
          onEdge: (edge: Edge) => { this.homeAtBottom = edge === Edge.Bottom; this.scheduleHomeChipAnchorUpdate(24); },
          feed: this.homeFeed, onOpenFeed: (playlist: FeedPlaylist) => { let offset = 0; try { offset = this.homeScroller.currentOffset().yOffset; } catch (_) {} this.openFeedPlaylist(playlist, false, -1, offset).catch(() => {}); },
          onPlayBanner: (playlist: FeedPlaylist) => this.playFeedFromHome(playlist),
          onPlayFeedSong: (song: Song, queue: Song[]) => { this.playSong(song, queue.length ? queue : [song], 0, true, false, false, true); },
          onPlaySongs: (songs: Song[]) => { if (songs.length) this.playSong(songs[0], songs); },
          statusInset: this.statusInset, bottomInset: this.bottomInset,
          likedSignature: this.likedSignature(),
          likedSong: (song: Song) => this.liked(song), onLikeSong: (song: Song) => this.like(song),
          onAddToPlaylist: (song: Song) => this.addToPlaylist(song), onDownloadSong: (song: Song) => this.downloadSong(song),
          onPlayNextSong: (song: Song) => this.playNext(song),
          onBatchCollectSongs: (songs: Song[]) => this.openBatchCollectPicker(songs, '批量收藏 · 新歌速递'),
          onBatchDownloadSongs: (songs: Song[]) => this.openBatchDownloadPicker(songs),
          activeAnchor: this.homeChipAnchor, onChip: (anchor: string) => this.onHomeChip(anchor),
          activeFeedId: this.openedFeedSourceId,
          playing: this.playing, selectedKey: this.selected ? songKey(this.selected) : '',
          activePlaylistId: this.openedPlaylist?.id ?? '',
          onMore: (section: string, x: number, y: number, size: number) => this.openFeedSection(section, x, y, size),
          onSearch: () => this.openSearch(), onSources: () => { this.navigateTab('设置'); },
          onPlayer: () => { this.showPlayer = true; }, onOpen: (playlist: MusicPlaylist) => { this.libraryRestoreOffset = 0; this.rememberPlaylistContext(); this.openedPlaylist = playlist; this.tab = '资料库'; this.discoveryCompact = false; this.hydrateOpenedListCovers().catch(() => {}); },
          onScroll: (offset: number) => this.homeScroll(offset) })
      } else if (this.openedEntity) {
        this.songList({ songs: this.arrangedSongs(this.entitySongs), playQueue: this.arrangedSongs(this.entitySongs, false), scroller: this.searchScroller })
      } else if (this.entities.length) {
        CatalogueResults({ onScroll: (offset: number) => this.homeScroll(offset), items: this.entities, scroller: this.searchScroller, contentTop: this.headerHeight(), loading: this.loading, hasMore: this.hasMore,
          onOpen: (item: CatalogueEntity) => { this.openEntity(item); }, onDownload: (item: CatalogueEntity) => { if (item.song) this.downloadSong(item.song); }, onMore: () => { this.search(true); } })
      } else if (this.results.length) {
        this.songList({ songs: this.arrangedSongs(this.results), scroller: this.searchScroller, fromSearch: true })
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
  }
  @Builder private library() {
    if (this.openedPlaylist) {
      if (this.openedPlaylist.kind === 'local') {
        LocalMusicView({ songs: this.arrangedSongs(this.localTracks), wide: this.wide, contentTop: this.headerHeight(),
          searchOpen: this.listSearchOpen, searchQuery: this.listQuery,
          selectedKey: this.selected ? songKey(this.selected) : '',
          likedSignature: this.likedSignature(),
          scroller: this.localScroller, likedSong: (song: Song) => this.liked(song),
          onPlay: (song: Song) => this.playSong(song, this.arrangedSongs(this.localTracks, false)),
          onPlayNext: (song: Song) => this.playNext(song),
          onLike: (song: Song) => this.like(song), onMore: (song: Song) => this.addToPlaylist(song),
          onBatchCollect: (songs: Song[]) => this.openBatchCollectPicker(songs, '批量收藏 · 本地音乐'),
          onPlayAll: () => { const list = this.arrangedSongs(this.localTracks, false); if (list.length) this.playSong(list[0], list); },
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
          else if (this.openedPlaylist.songs?.length) {
            this.songList({
              songs: this.arrangedSongs(this.openedPlaylist.songs),
              playQueue: this.arrangedSongs(this.openedPlaylist.songs, false),
              scroller: this.playlistScroller,
              preserveQueue: !!this.openedPlaylist.preserveQueue
            })
          }
          else {
            Column({ space: 14 }) {
              Text(this.openedPlaylist.kind === 'recent' ? '还没有最近播放记录' : (this.openedPlaylist.kind === 'lx' ? '从歌曲行内操作添加到此歌单' : '暂无歌曲')).fontSize(14).fontColor(MUTED)
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
          this.playlistReturnTab = '资料库'; this.playlistReturnFeed = ''; this.playlistReturnSearch = false;
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
    this.searchReturnToPlayer = false; this.playlistReturnToPlayer = false; this.playlistReturnSearch = false;
    this.searchAddedPlaylistMap.clear();
    this.settingsPanel = 'main'; this.tab = tab; this.openedPlaylist = null; this.openedFeedSourceId = ''; this.downloadsOpen = false; this.sourcesOpen = false; this.sourcesClosing = false; this.sourcesVisited = false; this.searchOpen = false; this.feedSection = ''; this.error = '';
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
    if (this.searchOpen && this.tab === '发现' && !this.openedPlaylist) return;
    this.resetListTools();
    this.searchReturnToPlayer = false;
    this.searchAddedPlaylistMap.clear();
    this.searchWasCompact = this.compactHeader();
    this.tab = '发现';
    this.openedPlaylist = null;
    this.downloadsOpen = false;
    this.feedSection = '';
    this.keyword = ''; this.submitted = ''; this.results = []; this.entities = []; this.openedEntity = null; this.loading = false; this.hasMore = false; this.page = 1;
    this.getUIContext().animateTo({ curve: curves.springMotion(0.46, 0.8) }, () => { this.searchOpen = true; this.discoveryCompact = false; this.searchMorph = 0; });
  }
  private closeSearch(): void {
    this.searchToken++;
    this.loading = false;
    const returnToPlayer = this.searchReturnToPlayer;
    this.searchReturnToPlayer = false;
    this.searchAddedPlaylistMap.clear();
    this.getUIContext().animateTo({ curve: curves.springMotion(0.46, 0.8) }, () => {
      this.searchOpen = false;
      this.discoveryCompact = this.searchWasCompact;
      this.searchMorph = this.searchWasCompact || this.viewportHeight < 500 ? 1 : 0;
    });
    if (returnToPlayer && this.selected) {
      this.showPlayer = true;
    }
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
    if (this.tab === '发现' && !this.searchOpen && !this.feedSection && !this.openedPlaylist) {
      this.lastHomeScrollAt = Date.now();
      this.scheduleHomeChipAnchorUpdate(140);
    }
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
  private scheduleHomeChipAnchorUpdate(delayMs: number = 140): void {
    clearTimeout(this.chipAnchorTimer);
    this.chipAnchorTimer = setTimeout(() => {
      this.chipAnchorTimer = -1;
      this.updateHomeChipAnchor();
    }, delayMs);
  }
  /** 胶囊高亮跟随：仅在滚动后防抖测量一次，静止时零轮询开销。 */
  private updateHomeChipAnchor(): void {
    if (!this.foreground || this.tab !== '发现' || this.searchOpen || this.showPlayer || this.feedSection || this.openedPlaylist || this.applying || this.disposed) return;
    try {
      const offset = this.homeScroller.currentOffset().yOffset;
      const topMorph = this.viewportHeight < 500 ? 1 : 0;
      if (offset <= 4 && (this.discoveryCompact || this.searchMorph !== topMorph)) {
        this.getUIContext().animateTo({ curve: curves.springMotion(0.42, 0.9) }, () => {
          this.discoveryCompact = false; this.searchMorph = topMorph;
        });
      }
      if (offset > this.maxScrollSeen + 2) this.maxScrollSeen = offset;
      if (Date.now() <= this.chipAnchorHoldUntil) return;
      let active = 'banner';
      if (this.homeAtBottom) {
        active = 'category';
      } else {
        const barLine = this.headerHeight() + 150;
        for (const anchor of ['banner', 'newSongs', 'playlists', 'charts', 'hot', 'category']) {
          try {
            const rect = this.getUIContext().getComponentUtils().getRectangleById('section-' + anchor);
            if (this.getUIContext().px2vp(rect.windowOffset.y) <= barLine) active = anchor;
            else break;
          } catch (_) {}
        }
      }
      if (active !== this.homeChipAnchor) this.homeChipAnchor = active;
    } catch (_) {}
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
  private seekToPosition(time: number): void {
    const maxDur = Math.max(0, this.duration || this.player.durationMs());
    const target = Math.max(0, Math.min(Math.round(time), maxDur));
    this.livePositionMs = target;
    this.playbackClock.positionMs = target;
    this.stageClockMs = target;
    this.lastStageSyncAt = Date.now();
    this.lastStageSyncPos = target;
    this.lastPositionUiAt = Date.now();
    this.autoMixTriggeredFor = '';
    this.autoMixPreloadRetryAt = 0;
    this.player.seek(target);
  }
  private async shareCurrent(): Promise<void> {
    try {
      if (!this.shareService.getSong() && this.selected) {
        this.shareService.setSong(this.selected);
      }
      await this.shareService.show(getContext(this) as common.UIAbilityContext);
    } catch (error) {
      const msg = `分享失败：${(error as Error).message}`;
      this.message = msg;
      this.notify(msg, 2400);
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
    this.stageControlsReveal = 1;
    this.twoFingerActive = false; this.twoFingerStartY = -1; this.twoFingerLastY = -1;
    if (this.showPlayer) { this.stageMounted = true; this.mountPlaybackStage(); }
    this.updateSystemBars();
    // 打开详情页时立刻放行下一帧进度状态，避免沿用首页 1s 节流造成进度延迟。
    if (this.showPlayer) {
      this.lastPositionUiAt = 0;
      this.playbackClock.positionMs = this.livePositionMs;
      this.stageClockMs = this.livePositionMs;
      this.lastStageSyncAt = Date.now();
      this.lastStageSyncPos = this.livePositionMs;
    }
    // 返回/关闭与方向切换同步执行，避免"先保持横屏再转竖屏"的延迟。
    this.applyOrientation(this.showPlayer);
    this.syncStageControls();
    this.getUIContext().animateTo(
      { curve: curves.springMotion(0.62, 0.74) },
      () => { this.playerReveal = this.showPlayer ? 1 : 0; }
    );
  }
  private syncDynamicStageReady(): void {
    const eff = this.effectiveStyleName();
    if (eff === 'off' || this.dynamicStageFailed) {
      this.dynamicStageReady = false;
      return;
    }
    this.dynamicStageReady = eff.startsWith('folia-') ? this.foliaStageReady : this.mineStageReady;
  }
  private visualStyleChanged(): void {
    if (this.restoringSettings) return;
    this.twoFingerActive = false; this.twoFingerStartY = -1; this.twoFingerLastY = -1;
    this.dynamicStageFailed = false;
    this.updateSmartStage(true);
    const eff = this.effectiveStyleName();
    this.previousStyle = eff;
    if (eff !== 'off') {
      if (eff.startsWith('folia-')) this.lastFoliaStyle = eff;
      else this.lastMineStyle = eff;
    }
    this.syncDynamicStageReady();
    if (this.showPlayer) this.mountPlaybackStage();
    this.syncTimelineStageDark();
  }
  private mountPlaybackStage(): void {
    this.stageMounted = true;
    const eff = this.effectiveStyleName();
    if (eff === 'off' || this.dynamicStageFailed) {
      this.plainStageMounted = true;
    } else if (eff.startsWith('folia-')) {
      this.foliaStageMounted = true;
    } else {
      this.mineStageMounted = true;
    }
  }
  private prewarmStages(): void {
    if (this.disposed || !this.foreground) return;
    const eff = this.effectiveStyleName();
    if (eff !== 'off') {
      if (eff.startsWith('folia-')) this.lastFoliaStyle = eff;
      else this.lastMineStyle = eff;
    }
    // 仅预热当前已选动效对应的单个舞台槽位，节省 2 个空闲 ArkWeb 实例与 ~150MB 内存。
    this.mountPlaybackStage();
    this.syncDynamicStageReady();
  }
  private releaseStageCache(): void {
    if (this.showPlayer && this.foreground) return;
    this.stageMounted = false; this.mineStageMounted = false; this.foliaStageMounted = false; this.plainStageMounted = false;
    this.mineStageReady = false; this.foliaStageReady = false; this.dynamicStageReady = false;
    MineRadioStage.clearRawAssetCache();
  }
  private stageSlotVisible(slot: string): boolean {
    if (!this.foreground || !this.showPlayer || this.commentsOpen) return false;
    const eff = this.effectiveStyleName();
    const isFolia = eff.startsWith('folia-');
    if (slot === 'plain') {
      return eff === 'off' || this.dynamicStageFailed || (!this.dynamicStageReady && this.plainStageMounted);
    }
    if (eff === 'off' || this.dynamicStageFailed) return false;
    return slot === 'folia' ? isFolia : !isFolia;
  }
  private applyAppearance(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const mode = this.appearance === 'dark' ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK
      : this.appearance === 'light' ? ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT : ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET;
    context.getApplicationContext().setColorMode(mode);
    this.syncTimelineStageDark();
    setTimeout(() => { this.updateSystemBars(); this.syncTimelineStageDark(); }, 50);
  }
  private stageLight(): boolean {
    if (this.appearance === 'light') return true;
    if (this.appearance === 'dark') return false;
    if (this.systemColorMode === ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT) return true;
    if (this.systemColorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK) return false;
    return (this.getUIContext().getHostContext()!.resourceManager.getColorSync($r('app.color.page_background').id) & 0xFF) > 127;
  }
  private updateSystemBars(): void {
    if (deviceInfo.deviceType === '2in1') return;
    try {
      const foreground = this.getUIContext().getHostContext()!.resourceManager.getColorSync($r('app.color.text_primary').id);
      const color = `#${(foreground >>> 0).toString(16).padStart(8, '0')}`;
      this.mainWindow?.setWindowSystemBarProperties({ statusBarColor: '#00000000', navigationBarColor: '#00000000', statusBarContentColor: color, navigationBarContentColor: color }).catch(() => {});
    } catch (_) {}
  }
  private systemThemeChanged(): void { this.syncTimelineStageDark(); setTimeout(() => { this.updateSystemBars(); this.syncTimelineStageDark(); }, 50); }
  @LocalBuilder private sheetContent() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (this.sheet === '播放队列' || this.sheet === '更多' || this.sheet === '耳返监听') {
        Stack({ alignContent: Alignment.TopStart }) {
          if (this.sheet === '播放队列') {
            Column() {
              this.songList({ songs: this.queue, scroller: this.queueScroller })
            }
              .width('100%').height('100%').padding({ left: 16, right: 16 })
              .linearGradientBlur(24, { fractionStops: [[1.0, 0.0], [0.84, 0.06], [0.24, 0.12], [0.0, 0.17]], direction: GradientDirection.Bottom })
          } else if (this.sheet === '耳返监听') {
            Scroll() {
              Column() {
                EarMonitorSheet({
                  state: this.earMonitorState,
                  onSelectMode: (mode: EarMonitorMode) => { this.earMonitor.setMode(mode).catch(() => {}); },
                  onMicVolume: (value: number) => { this.earMonitor.setMicVolume(value).catch(() => {}); },
                  onVocalVolume: (value: number) => { this.earMonitor.setVocalVolume(value); }
                })
              }.width('100%').padding({ left: 24, right: 24, top: 72, bottom: 28 })
            }
              .width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
              .linearGradientBlur(24, { fractionStops: [[1.0, 0.0], [0.84, 0.06], [0.24, 0.12], [0.0, 0.17]], direction: GradientDirection.Bottom })
          } else {
            Scroll() {
              Column() {
                PlayerMoreSheet({
                  song: this.selected ?? this.stagePlaceholder,
                  liked: this.selected ? this.liked(this.selected) : false,
                  quality: this.quality,
                  audioFx: this.audioFx,
                  autoMixEnabled: this.autoMixEnabled,
                  autoMixPreview: this.autoMixPreview,
                  playPauseFadeEnabled: this.playPauseFadeEnabled,
                  inUserLibrary: this.isSongInUserLibrary(this.selected),
                  sleepMode: this.sleepMode,
                  sleepRemainingText: this.sleepRemainingText,
                  isHarmonyPc: isHarmonyPc(),
                  volume: this.volume,
                  desktopLyrics: isHarmonyPc() ? this.desktopLyrics : this.mobileDesktopLyrics,
                  desktopLyricsLocked: isHarmonyPc() ? this.desktopLyricsLocked : this.mobileDesktopLyricsLocked,
                  mobileDesktopLyricsSupported: this.mobileDesktopLyricsSupported,
                  wallpaperMode: this.wallpaperMode,
                  onAddToPlaylist: () => { if (this.selected) { this.showSheet = false; this.addToPlaylist(this.selected); } },
                  onSwitchPlatform: () => { if (this.selected) { this.showSheet = false; this.openSwitchPlatform(this.selected, 'player'); } },
                  onComments: () => { this.showSheet = false; this.commentsOpen = true; },
                  onLike: () => { if (this.selected) this.like(this.selected); },
                  onDownload: () => { if (this.selected) { this.showSheet = false; this.downloadSong(this.selected); } },
                  onSelectQuality: (value: string) => {
                    this.applyQuality(value, true);
                  },
                  onOpenAudioFx: () => { this.openSubSheetFromSheet('更多', () => { this.moreAudioFxOpen = true; }); },
                  onViewArtist: () => this.viewCurrentArtist(),
                  onViewAlbum: () => this.viewCurrentAlbum(),
                  onToggleAutoMix: (enabled: boolean) => { this.autoMixEnabled = enabled; if (!enabled) this.player.cancelAutoMix(); this.refreshAutoMixPlan(); this.save(); },
                  onTogglePlayPauseFade: (enabled: boolean) => { this.playPauseFadeEnabled = enabled; this.player.setPlayPauseFade(enabled); this.save(); },
                  onDislike: () => this.dislikeCurrentSong(),
                  onSimilarSongs: () => { this.openSimilarSongs().catch(() => {}); },
                  onOpenSleepTimer: () => {
            if (this.sleepEndAt > Date.now() && this.sleepMode !== 'off' && this.sleepMode !== 'song') {
              this.sleepRemainingText = this.formatRemaining(this.sleepEndAt - Date.now());
            }
            this.openSubSheetFromSheet('更多', () => { this.moreSleepOpen = true; });
          },
                  onVolume: (value: number) => { this.applyVolume(value); },
                  onToggleDesktopLyrics: () => {
                    if (isHarmonyPc()) this.applyHarmonyPcDesktopLyrics(!this.desktopLyrics);
                    else this.applyMobileDesktopLyrics(!this.mobileDesktopLyrics);
                  },
                  onToggleDesktopLyricsLocked: () => {
                    if (isHarmonyPc()) this.applyHarmonyPcDesktopLyricsLocked(!this.desktopLyricsLocked);
                    else this.applyMobileDesktopLyricsLocked(!this.mobileDesktopLyricsLocked);
                  },
                  onToggleWallpaperMode: () => { this.toggleHarmonyPcWallpaper(!this.wallpaperMode); }
                })
              }.width('100%').padding({ left: 24, right: 24, top: 72, bottom: 28 })
            }
              .width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Off).edgeEffect(EdgeEffect.Spring).fadingEdge(false)
              .linearGradientBlur(24, { fractionStops: [[1.0, 0.0], [0.84, 0.06], [0.24, 0.12], [0.0, 0.17]], direction: GradientDirection.Bottom })
          }
          Row({ space: 8 }) {
            Row({ space: 8 }) {
              Text(this.sheet).fontSize(24).fontWeight(FontWeight.Bold).fontColor(TEXT)
                .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              if (this.sheet === '耳返监听') {
                Text('Beta')
                  .fontSize(11).fontWeight(FontWeight.Bold).fontColor(ACCENT)
                  .padding({ left: 8, right: 8, top: 3, bottom: 3 })
                  .borderRadius(10).backgroundColor('#2464D2FF')
              }
            }.layoutWeight(1)
            if (this.sheet === '播放队列' && this.queue.length > 1) {
              Button('排序').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL)
                .backgroundColor(Color.Transparent).systemMaterial(uiMaterial.Material.empty).focusable(false).fontColor(TEXT)
                .onClick(() => { this.openSubSheetFromSheet('播放队列', () => { this.queueOrderOpen = true; }); })
            }
            Button('完成').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL)
              .backgroundColor(Color.Transparent).systemMaterial(uiMaterial.Material.empty).focusable(false).fontColor(ACCENT).enabled(!this.busy)
              .onClick(() => { this.returnSheetAfterSub = ''; this.platformSwitchOpen = false; this.queueOrderOpen = false; this.moreAudioFxOpen = false; this.moreSleepOpen = false; this.showSheet = false; })
          }.width('100%').padding({ left: 24, right: 24, top: 20, bottom: 10 }).hitTestBehavior(HitTestMode.Default)
        }.width('100%').height('100%')
      } else {
        Column({ space: 18 }) {
          Row({ space: 12 }) {
            Text(this.sheet).fontSize(24).fontWeight(FontWeight.Bold).fontColor(TEXT)
              .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
            Button('取消').attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.TEXTUAL)
              .backgroundColor(Color.Transparent).systemMaterial(uiMaterial.Material.empty).focusable(false).fontColor(MUTED).enabled(!this.busy).onClick(() => { this.showSheet = false; })
            Button(this.busy ? '处理中…' : this.sheet === '新建歌单' ? '创建' : this.sheet === '重命名歌单' ? '保存' : this.sheet === '导入歌单' ? '导入' : '添加').attributeModifier(musicButtonPress)
              .buttonStyle(ButtonStyleMode.TEXTUAL).backgroundColor(Color.Transparent).systemMaterial(uiMaterial.Material.empty).focusable(false).fontColor(ACCENT).enabled(!this.busy && !!this.draft.trim())
              .onClick(() => { this.submitSheet(); })
          }.width('100%')
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
        }.width('100%').padding(24)
      }
    }.width('100%').height((this.sheet === '播放队列' || this.sheet === '更多' || this.sheet === '耳返监听') ? '100%' : 'auto')
  }
  @LocalBuilder private moreAudioFxSheet() {
    PlayerAudioFxSheet({
      audioFx: this.audioFx,
      spatialSystemActive: this.spatialSystemActive,
      onSelectAudioFx: (value: AudioFxConfig) => {
        this.audioFx = value;
        this.player.setAudioEffect(value);
        this.scheduleSave();
      },
      onDone: () => { this.moreAudioFxOpen = false; this.maybeReturnToParentSheet(); }
    })
  }
  @LocalBuilder private moreSleepSheet() {
    PlayerSleepTimerSheet({
      sleepMode: this.sleepMode,
      sleepRemainingText: this.sleepRemainingText,
      sleepFinishSong: this.sleepFinishSong,
      onSetSleepTimer: (mode: string, minutes: number) => this.setSleepTimer(mode, minutes),
      onToggleSleepFinishSong: (enabled: boolean) => { this.sleepFinishSong = enabled; this.save(); },
      onDone: () => { this.moreSleepOpen = false; this.maybeReturnToParentSheet(); }
    })
  }
  @LocalBuilder private queueOrderSheet() {
    SongOrderDialog({
      title: '播放队列排序',
      songs: this.queue,
      wide: this.wide,
      statusInset: 0,
      bottomInset: 8,
      onCancel: () => { this.queueOrderOpen = false; this.maybeReturnToParentSheet(); },
      onDone: (keys: string[]) => this.applyQueueOrder(keys)
    })
  }
  @LocalBuilder private scanSheet() {
    LocalScanDialog({
      items: this.scanItems,
      wide: this.wide,
      statusInset: 0,
      bottomInset: 8,
      onCancel: () => this.closeScanDialog(),
      onConfirm: (uris: string[]) => this.confirmScan(uris)
    })
  }
  @LocalBuilder private orderSheet() {
    SongOrderDialog({
      songs: this.orderSongs,
      wide: this.wide,
      statusInset: 0,
      bottomInset: 8,
      onCancel: () => { this.orderOpen = false; },
      onDone: (keys: string[]) => this.applyManualOrder(keys)
    })
  }
  @LocalBuilder private editPlaylistSheet() {
    if (this.openedPlaylist) {
      PlaylistEditDialog({
        initialName: this.openedPlaylist.name,
        songs: this.openedPlaylist.songs ?? [],
        wide: this.wide,
        allowBatchCollect: !this.openedPlaylist.isFavorite,
        statusInset: 0,
        bottomInset: 8,
        onCancel: () => { this.editPlaylistOpen = false; },
        onSave: (nextName: string, remainingSongs: Song[]) => this.saveEditedPlaylist(nextName, remainingSongs),
        onBatchDownload: (chosen: Song[]) => { this.downloadBatch(chosen); },
        onBatchCollect: (chosen: Song[]) => { this.collectSongsBatch(chosen); }
      })
    }
  }
  @LocalBuilder private platformSwitchSheet() {
    if (this.switchTargetSong !== null) {
      PlatformSwitchDialog({
        song: this.switchTargetSong,
        contextLabel: this.switchTargetScope === 'queue' ? '播放队列' : this.switchTargetScope === 'player' ? '当前播放' : (this.openedPlaylist?.name ?? '歌单'),
        statusInset: 0,
        bottomInset: 8,
        host: this.host,
        onSelect: (replacement: Song) => { this.applyPlatformSwitch(replacement); this.maybeReturnToParentSheet(); },
        onClose: () => { this.closePlatformSwitch(true); }
      })
    }
  }
  @LocalBuilder private colorPickerSheet() {
    ColorPickerSheet({
      title: this.colorPickerTarget === 'primary'
        ? '选择歌词主色'
        : (this.colorPickerTarget === 'secondary'
          ? '选择歌词辅色'
          : (this.colorPickerTarget === 'desktop-primary' ? '选择桌面歌词主色' : '选择桌面歌词辅色')),
      initialColor: this.colorPickerTarget === 'primary'
        ? this.lyricPrefs.primary
        : (this.colorPickerTarget === 'secondary'
          ? this.lyricPrefs.secondary
          : (this.colorPickerTarget === 'desktop-primary' ? this.desktopLyricColor : this.desktopLyricColor2)),
      wide: this.wide,
      statusInset: 0,
      bottomInset: 8,
      onCancel: () => { this.closeColorPicker(); },
      onConfirm: (hex: string) => {
        if (this.colorPickerTarget === 'primary') {
          this.lyricPrefs = { colorMode: this.lyricPrefs.colorMode, primary: hex, secondary: this.lyricPrefs.secondary, showTranslation: this.lyricPrefs.showTranslation, showRomaji: this.lyricPrefs.showRomaji, scale: this.lyricPrefs.scale ?? 1, lineSpacing: this.lyricPrefs.lineSpacing ?? 1.2, maxLines: this.lyricPrefs.maxLines ?? 0 };
        } else if (this.colorPickerTarget === 'secondary') {
          this.lyricPrefs = { colorMode: this.lyricPrefs.colorMode, primary: this.lyricPrefs.primary, secondary: hex, showTranslation: this.lyricPrefs.showTranslation, showRomaji: this.lyricPrefs.showRomaji, scale: this.lyricPrefs.scale ?? 1, lineSpacing: this.lyricPrefs.lineSpacing ?? 1.2, maxLines: this.lyricPrefs.maxLines ?? 0 };
        } else if (this.colorPickerTarget === 'desktop-primary') {
          this.desktopLyricColor = hex;
        } else {
          this.desktopLyricColor2 = hex;
        }
        this.closeColorPicker();
        this.save();
        this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
        this.syncHarmonyPcWallpaperState();
      }
    })
  }
  @LocalBuilder private batchDownloadSheet() {
    if (this.batchDownloadSongs !== null) {
      BatchDownloadSheet({
        title: this.openedPlaylist ? `批量下载 · ${this.openedPlaylist.name}` : '批量下载歌曲',
        songs: this.batchDownloadSongs,
        qualityLabel: this.quality === 'flac' ? '无损 FLAC' : (this.quality === '320k' ? '高品质 320k' : '标准 128k'),
        wide: this.wide,
        statusInset: 0,
        bottomInset: 8,
        onCancel: () => { this.closeBatchDownload(); },
        onConfirm: (chosen: Song[]) => {
          this.closeBatchDownload();
          this.downloadBatch(chosen).catch(() => {});
        }
      })
    }
  }
  @LocalBuilder private batchCollectSheet() {
    if (this.batchCollectSongs !== null) {
      BatchCollectSheet({
        title: this.batchCollectTitle,
        songs: this.batchCollectSongs,
        playlists: this.playlists,
        wide: this.wide,
        statusInset: 0,
        bottomInset: 8,
        onCancel: () => { this.closeBatchCollect(); },
        onConfirm: (chosen: Song[], targetPlaylistId: string, newPlaylistName: string) => {
          this.closeBatchCollect();
          this.collectSongsToPlaylist(chosen, targetPlaylistId, newPlaylistName);
        }
      })
    }
  }
  @LocalBuilder private coverPickerSheet() {
    if (this.coverPickerPlaylist !== null) {
      PlaylistCoverSheet({
        playlist: this.coverPickerPlaylist,
        wide: this.wide,
        statusInset: 0,
        bottomInset: 8,
        onCancel: () => { this.closeCoverPicker(); },
        onPickLocal: () => {
          const target = this.coverPickerPlaylist;
          if (target) this.pickLocalPlaylistCover(target).catch(() => {});
        },
        onSelectCover: (cover: string) => {
          const target = this.coverPickerPlaylist;
          if (target) this.applyPlaylistCover(target, cover);
        },
        onResetDefault: () => {
          const target = this.coverPickerPlaylist;
          if (target) this.applyPlaylistCover(target, '');
        }
      })
    }
  }
  private openSettingsPanel(panel: string): void {
    if (this.settingsPanel === 'main' && panel !== 'main') {
      try { this.settingsRestoreOffset = this.settingsScroller.currentOffset().yOffset; } catch (_) {}
    }
    this.settingsPanel = panel;
    if (panel === 'main') {
      const targetOffset = this.settingsRestoreOffset;
      setTimeout(() => { try { this.settingsScroller.scrollTo({ xOffset: 0, yOffset: targetOffset }); } catch (_) {} }, 32);
    }
  }
  private reloadLyricExtras(): void { if (this.selected && this.sourceReady) this.loadLyrics(this.songInfo(this.selected), this.selected, this.playToken); }
  private updateStageTranslations(): void {
    const grouped = new Map<number, string[]>();
    const lines: LyricLine[] = [];
    if (this.lyricPrefs.showTranslation) lines.push(...alignAuxLyricsToMain(this.lyrics, this.translatedLyrics));
    if (this.lyricPrefs.showRomaji) lines.push(...alignAuxLyricsToMain(this.lyrics, this.romajiLyrics));
    for (const line of lines) {
      const clean = (line.text || '').trim();
      if (!clean || /^[\/\\\-—–_~·•\s]+$/.test(clean)) continue;
      const values = grouped.get(line.timeMs) ?? [];
      if (!values.includes(clean)) values.push(clean);
      grouped.set(line.timeMs, values);
    }
    const result: LyricLine[] = []; grouped.forEach((values: string[], time: number) => result.push({ timeMs: time, text: values.join('\n'), words: [] }));
    this.stageTranslations = result.sort((a: LyricLine, b: LyricLine) => a.timeMs - b.timeMs);
  }
  @Builder private settingsView() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.sourcesOpen) {
        NativeSettings({ onScroll: (offset: number) => this.homeScroll(offset), sources: this.sources, activeId: this.activeId, devices: this.devices, deviceName: this.deviceName, lanSsid: this.lanSsid, quality: this.quality,
          styleName: this.styleName, mode: this.mode, lyricOffset: this.lyricOffset, message: this.message, gripEnabled: this.gripEnabled, gripSupported: this.gripSupported, startupAnimation: this.startupAnimation, resumeOnStartup: this.resumeOnStartup, sourcesOnly: this.sourcesOpen, sourcesReveal: this.sourcesReveal, scroller: this.settingsScroller, contentTop: this.headerHeight(),
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
          .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ x: 42 })).animation({ curve: curves.springMotion(0.46, 0.84) }))
      } else {
        AlignedSettings({ panel: this.settingsPanel, sources: this.sources, activeId: this.activeId, quality: this.quality, mode: this.mode, styleName: this.styleName, resolvedStyleLabel: this.resolvedStyleLabel(), audioFx: this.audioFx, autoMixEnabled: this.autoMixEnabled, playPauseFadeEnabled: this.playPauseFadeEnabled, stageResetCameraOnSong: this.stageResetCameraOnSong, stageBgOpacity: this.stageBgOpacity, stageBgCustom: this.stageBgImage.length > 0, pageBgOpacity: this.pageBgOpacity, pageBgCustom: this.pageBgImage.length > 0, appearance: this.appearance,
        showBoostImmersive: !this.nativeExquisiteMaterial, boostImmersive: this.boostImmersive, materialLevelLabel: nativeMaterialLevelLabel(),
        bluetoothCarLyricsEnabled: this.bluetoothCarLyricsEnabled, bluetoothCarLyricsMode: this.bluetoothCarLyricsMode, bluetoothAudioConnected: this.bluetoothAudioConnected,
        startupAnimation: this.startupAnimation, resumeOnStartup: this.resumeOnStartup, gripEnabled: this.gripEnabled, gripSupported: this.gripSupported,
        allowLandscapeLocked: this.allowLandscapeLocked, mixWithOthers: this.mixWithOthers, refreshAlgoDoubleTap: this.refreshAlgoDoubleTap, lanAutoSync: this.lanAutoSync, trustCircleTransitive: this.trustCircleTransitive, lanLocalAddress: this.lanLocalAddress, carDetail: this.carDetail,
        completedDownloads: this.downloadItems.filter((item: MusicDownload) => item.state === 'complete').length, dislikedCount: this.uniqueDislikedCount(), devices: this.devices, trustedDevices: this.trustedDevices, lanSsid: this.lanSsid, message: this.message,
        lyrics: this.lyricPrefs, lyricOffset: this.lyricOffset, previewPrimary: lyricPrimary(this.lyricPrefs, this.coverColors), previewSecondary: lyricSecondary(this.lyricPrefs, this.coverColors),
        previewText: this.lyrics.find((line: LyricLine) => line.timeMs <= this.positionMs)?.text || '音乐在这里，与你相遇', contentTop: this.headerHeight(), updateChecking: this.updateChecking,
        isHarmonyPc: isHarmonyPc(), volume: this.volume, desktopLyrics: this.desktopLyrics, desktopLyricsLocked: this.desktopLyricsLocked,
        mobileDesktopLyrics: this.mobileDesktopLyrics, mobileDesktopLyricsLocked: this.mobileDesktopLyricsLocked, mobileDesktopLyricsSupported: this.mobileDesktopLyricsSupported,
        desktopLyricSize: this.desktopLyricSize, desktopLyricLines: this.desktopLyricLines,
        desktopLyricColorMode: this.desktopLyricColorMode, desktopLyricColor: this.desktopLyricColor, desktopLyricColor2: this.desktopLyricColor2,
        desktopPreviewPrimary: this.desktopLyricPrimaryColor(), desktopPreviewSecondary: this.desktopLyricSecondaryColor(),
        wallpaperMode: this.wallpaperMode, wallpaperBgOpacity: this.wallpaperBgOpacity, wallpaperOverallOpacity: this.wallpaperOverallOpacity, spatialSystemActive: this.spatialSystemActive, shortcutsEnabled: this.shortcutsEnabled, shortcuts: this.shortcuts, scroller: this.settingsScroller,
        onCheckUpdate: () => { if (!isStoreEdition()) this.checkAppUpdate(false).catch(() => {}); },
        onVolume: (value: number) => { this.applyVolume(value); },
        onBoostImmersive: (value: boolean) => {
          this.boostImmersive = !this.nativeExquisiteMaterial && value;
          AppStorage.setOrCreate('lxmineBoostImmersive', this.boostImmersive);
          logMaterialCapabilities(this.boostImmersive);
          this.persist().catch(() => {});
          this.notify(this.boostImmersive ? '已开启强化沉浸光感（EXQUISITE 满血材质）' : '已恢复设备默认沉浸材质', 2200);
        },
        onBluetoothCarLyrics: (value: boolean) => {
          this.bluetoothCarLyricsEnabled = value;
          this.player.setBluetoothCarLyrics(value, this.bluetoothCarLyricsMode);
          this.save();
          this.notify(
            value
              ? (this.bluetoothAudioConnected
                ? '蓝牙车载歌词已开启（已检测到蓝牙音频，播放时自动同步）'
                : '蓝牙车载歌词已开启（连接车载蓝牙后自动同步）')
              : '蓝牙车载歌词已关闭',
            2400,
          );
        },
        onBluetoothCarLyricsMode: (value: string) => {
          this.bluetoothCarLyricsMode = (value === 'artist' || value === 'combined') ? value : 'title';
          this.player.setBluetoothCarLyrics(this.bluetoothCarLyricsEnabled, this.bluetoothCarLyricsMode);
          this.save();
        },
        onPickPrimaryColor: () => { this.openColorPicker('primary'); },
        onPickSecondaryColor: () => { this.openColorPicker('secondary'); },
        onShortcutsEnabled: (value: boolean) => { this.shortcutsEnabled = value; this.save(); },
        onShortcutChange: (actionId: string, combo: string) => {
          const next: Record<string, string> = {};
          const ks = Object.keys(this.shortcuts);
          for (const k of ks) next[k] = this.shortcuts[k];
          next[actionId] = combo;
          this.shortcuts = next;
          this.save();
        },
        onResetShortcuts: () => { this.shortcuts = defaultShortcutBindings(); this.save(); this.notify('已恢复默认快捷键', 1500); },
        onDesktopLyrics: (value: boolean) => {
          this.applyHarmonyPcDesktopLyrics(value);
        },
        onDesktopLyricsLocked: (value: boolean) => {
          this.applyHarmonyPcDesktopLyricsLocked(value);
        },
        onMobileDesktopLyrics: (value: boolean) => {
          this.applyMobileDesktopLyrics(value);
        },
        onMobileDesktopLyricsLocked: (value: boolean) => {
          this.applyMobileDesktopLyricsLocked(value);
        },
        onDesktopLyricSize: (value: number) => {
          this.desktopLyricSize = Math.max(0.72, Math.min(1.55, Math.round(value * 100) / 100));
          this.scheduleSave();
          this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
        },
        onDesktopLyricLines: (value: number) => {
          this.desktopLyricLines = [1, 2, 3, 5].includes(Math.round(value)) ? Math.round(value) : 3;
          this.save();
          if (this.desktopLyrics && !this.desktopLyricBounds) {
            this.pcWindow.resizeDesktopLyricsForLines(this.desktopLyricLines).catch(() => {});
          }
          this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
        },
        onDesktopLyricColorMode: (value: string) => {
          if (['cover-solid', 'cover-gradient', 'custom-solid', 'custom-gradient'].includes(value)) {
            this.desktopLyricColorMode = value;
            this.save();
            this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true);
          }
        },
        onPickDesktopPrimaryColor: () => { this.openColorPicker('desktop-primary'); },
        onPickDesktopSecondaryColor: () => { this.openColorPicker('desktop-secondary'); },
        onWallpaperMode: (value: boolean) => { this.toggleHarmonyPcWallpaper(value); },
        onWallpaperBgOpacity: (value: number) => {
          this.wallpaperBgOpacity = Math.max(0, Math.min(1, value));
          this.scheduleSave();
          this.syncHarmonyPcWallpaperState();
        },
        onWallpaperOverallOpacity: (value: number) => {
          this.wallpaperOverallOpacity = Math.max(0.25, Math.min(1, value));
          this.scheduleSave();
          this.syncHarmonyPcWallpaperState();
        },
        onScroll: (offset: number) => this.homeScroll(offset), onOpenSources: () => this.openSources(), onPanel: (panel: string) => this.openSettingsPanel(panel),
        onDownloads: () => this.openDownloads('设置'),
        onSend: (device: LanDevice) => this.send(device), onPair: (device: LanDevice) => { this.pairDevice(device); }, onRemoveTrusted: (id: string) => { this.removeTrustedDevice(id); }, onSendDirect: (target: string) => { this.sendDirect(target); },
        onLanAutoSync: (value: boolean) => {
          this.lanAutoSync = value;
          this.syncServer.setAutoSync(value);
          this.discovery?.setAutoSync(value);
          this.save();
          if (value) {
            this.autoSyncExchanged.clear();
            this.discovery?.announceNow();
            this.scheduleAutoSyncReconcile(250, true);
          }
        },
        onTrustCircleTransitive: (value: boolean) => {
          this.setTrustCircleTransitive(value);
        },
        onQuality: (value: string) => { this.applyQuality(value, true); },
        onMode: (value: string) => { this.mode = value; this.refreshAutoMixPlan(); this.save(); },
        onStyle: (value: string) => { this.styleName = value; this.save(); this.syncHarmonyPcWallpaperState(); },
        onAudioFx: (value: AudioFxConfig) => { this.audioFx = value; this.player.setAudioEffect(value); this.scheduleSave(); },
        onAutoMix: (value: boolean) => { this.autoMixEnabled = value; if (!value) this.player.cancelAutoMix(); this.refreshAutoMixPlan(); this.save(); },
        onPlayPauseFade: (value: boolean) => { this.playPauseFadeEnabled = value; this.player.setPlayPauseFade(value); this.save(); },
        onStageResetCameraOnSong: (value: boolean) => { this.stageResetCameraOnSong = value; this.save(); this.syncHarmonyPcWallpaperState(); },
        onStageBgOpacity: (value: number) => { this.stageBgOpacity = Math.max(0, Math.min(1, value)); this.scheduleSave(); this.syncHarmonyPcWallpaperState(); },
        onPickStageBgImage: () => { this.pickStageBgImage().then(() => this.syncHarmonyPcWallpaperState()).catch(() => {}); },
        onClearStageBgImage: () => { this.clearStageBgImage(); this.syncHarmonyPcWallpaperState(); },
        onPageBgOpacity: (value: number) => { this.pageBgOpacity = Math.max(0.1, Math.min(0.85, value)); this.scheduleSave(); },
        onPickPageBgImage: () => { this.pickPageBgImage().catch(() => {}); },
        onClearPageBgImage: () => { this.clearPageBgImage(); },
        onAppearance: (value: string) => { this.appearance = value; this.save(); this.syncHarmonyPcWallpaperState(); },
        onResume: (value: boolean) => { this.resumeOnStartup = value; this.save(); }, onStartup: (value: boolean) => { this.startupAnimation = value; this.save(); },
        onGrip: (value: boolean) => { this.gripEnabled = value; this.foregroundChanged(); this.save(); },
        onAllowLandscapeLocked: (value: boolean) => { this.allowLandscapeLocked = value; this.applyOrientation(this.showPlayer); this.save(); },
        onMixWithOthers: (value: boolean) => { this.mixWithOthers = value; this.player.setMixWithOthers(value); this.save(); },
        onRefreshAlgoDoubleTap: (value: boolean) => { this.refreshAlgoDoubleTap = value; this.save(); },
        onClearDisliked: () => { this.dislikedKeys = []; this.save(); this.notify('已清空不感兴趣屏蔽列表', 1800); },
        onColorMode: (value: string) => { this.lyricPrefs.colorMode = value; this.save(); this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true); this.syncHarmonyPcWallpaperState(); }, onPrimary: (value: string) => { this.lyricPrefs.primary = value; this.save(); this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true); this.syncHarmonyPcWallpaperState(); },
        onSecondary: (value: string) => { this.lyricPrefs.secondary = value; this.save(); this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true); this.syncHarmonyPcWallpaperState(); },
        onTranslation: (value: boolean) => { this.lyricPrefs.showTranslation = value; this.updateStageTranslations(); this.save(); this.reloadLyricExtras(); this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true); this.syncHarmonyPcWallpaperState(); },
        onRomaji: (value: boolean) => { this.lyricPrefs.showRomaji = value; this.updateStageTranslations(); this.save(); this.reloadLyricExtras(); this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true); this.syncHarmonyPcWallpaperState(); },
        onScale: (value: number) => {
          const next = Math.max(0.55, Math.min(1.5, Math.round(value * 100) / 100));
          this.lyricPrefs = { colorMode: this.lyricPrefs.colorMode, primary: this.lyricPrefs.primary, secondary: this.lyricPrefs.secondary, showTranslation: this.lyricPrefs.showTranslation, showRomaji: this.lyricPrefs.showRomaji, scale: next, lineSpacing: this.lyricPrefs.lineSpacing ?? 1.2, maxLines: this.lyricPrefs.maxLines ?? 0 };
          this.scheduleSave();
          this.syncHarmonyPcWallpaperState();
        },
        onLineSpacing: (value: number) => {
          const next = Math.max(0.85, Math.min(1.8, Math.round(value * 100) / 100));
          this.lyricPrefs = { colorMode: this.lyricPrefs.colorMode, primary: this.lyricPrefs.primary, secondary: this.lyricPrefs.secondary, showTranslation: this.lyricPrefs.showTranslation, showRomaji: this.lyricPrefs.showRomaji, scale: this.lyricPrefs.scale ?? 1, lineSpacing: next, maxLines: this.lyricPrefs.maxLines ?? 0 };
          this.scheduleSave();
          this.syncHarmonyPcWallpaperState();
        },
        onMaxLines: (value: number) => {
          const next = Math.max(0, Math.min(10, Math.round(value)));
          this.lyricPrefs = { colorMode: this.lyricPrefs.colorMode, primary: this.lyricPrefs.primary, secondary: this.lyricPrefs.secondary, showTranslation: this.lyricPrefs.showTranslation, showRomaji: this.lyricPrefs.showRomaji, scale: this.lyricPrefs.scale ?? 1, lineSpacing: this.lyricPrefs.lineSpacing ?? 1.2, maxLines: next };
          this.save();
          this.syncHarmonyPcWallpaperState();
        },
        onOffset: (value: number) => { this.lyricOffset = value; this.player.setLyricOffset(value); this.scheduleSave(); this.syncHarmonyPcDesktopLyrics(this.livePositionMs, true); this.syncHarmonyPcWallpaperState(); } })
          .transition(this.sourcesVisited
            ? TransitionEffect.OPACITY.combine(TransitionEffect.translate({ x: -24 })).animation({ curve: curves.springMotion(0.46, 0.84) })
            : TransitionEffect.IDENTITY)
      }
    }.width('100%').height('100%')
  }
  @LocalBuilder private playbackStage(slot: string) {
      if (this.stageMounted && (slot === 'plain' ? this.plainStageMounted : (slot === 'folia' ? this.foliaStageMounted : this.mineStageMounted))) {
        MineRadioStage({
          song: this.selected ?? this.stagePlaceholder,
          audioUrl: this.playbackUrl,
          lines: this.lyrics,
          translationLines: this.stageTranslations,
          lyricColorMode: this.lyricPrefs.colorMode.endsWith('gradient') ? 'custom-gradient' : 'custom-solid',
          lyricPrimary: lyricPrimary(this.lyricPrefs, this.coverColors),
          lyricSecondary: lyricSecondary(this.lyricPrefs, this.coverColors),
          mode: slot === 'plain' ? 'off' : (slot === 'folia' ? this.lastFoliaStyle : this.lastMineStyle),
          light: this.stageLight(),
          bgImage: this.stageBgImage,
          bgOpacity: this.stageBgOpacity,
          duration: this.duration,
          lyricOffset: this.lyricOffset,
          lyricScale: this.lyricPrefs.scale ?? 1,
          lyricLineSpacing: this.lyricPrefs.lineSpacing ?? 1.2,
          lyricMaxLines: this.lyricPrefs.maxLines ?? 0,
          resetCameraOnSong: this.stageResetCameraOnSong,
          playing: (this.playing || this.stageFadingOut) && this.foreground,
          positionMs: this.stageClockMs,
          getLivePositionMs: () => this.livePositionMs,
          topInset: Math.min(this.statusInset + 72, Math.round(this.viewportHeight * 0.22)),
          bottomInset: Math.min(this.bottomInset + 164, Math.round(this.viewportHeight * 0.34)),
          visible: this.stageSlotVisible(slot),
          detail: this.showPlayer,
          wide: this.wide,
          vocalCancelActive: this.vocalCancelEngaged() && (
            slot === 'plain'
              ? (this.effectiveStyleName() === 'off' || this.dynamicStageFailed)
              : (this.effectiveStyleName() !== 'off' && !this.dynamicStageFailed && (slot === 'folia') === this.effectiveStyleName().startsWith('folia-'))
          ),
          vocalGain: this.earMonitorState.vocalVolume,
          interactive: this.stageSlotVisible(slot),
          onSeek: (time: number) => this.seekToPosition(time),
          onVisualReady: () => {
            if (slot === 'mine') this.mineStageReady = true;
            else if (slot === 'folia') this.foliaStageReady = true;
            this.syncDynamicStageReady();
          },
          onImmersiveToggle: (show: boolean) => this.toggleStageControls(show),
          onDegraded: () => {
            this.mineStageReady = false; this.foliaStageReady = false; this.dynamicStageReady = false;
            this.dynamicStageFailed = true; this.mineStageMounted = false; this.foliaStageMounted = false; this.plainStageMounted = true;
            this.syncTimelineStageDark();
            this.notify('图形资源暂不可用，已临时使用纯文字歌词');
          }
        })
          .opacity(this.stageSlotVisible(slot) ? (slot === 'plain' || (slot === 'folia' ? this.foliaStageReady : this.mineStageReady) ? 1 : 0.001) : 0)
          .hitTestBehavior(this.stageSlotVisible(slot) ? HitTestMode.Default : HitTestMode.None)
          .onTouch((event: TouchEvent) => {
            if (this.stageSlotVisible(slot)) this.stageGestureTouch(event);
          })
      }
  }
  @LocalBuilder private rootTabContent() {
    Stack({ alignContent: Alignment.Bottom }) {
      Stack({ alignContent: Alignment.TopStart }) {
        if (this.tab === '发现') {
          Column() { this.discover() }
            .width('100%').height('100%')
            .padding({ left: this.searchOpen ? 20 : 0, right: this.searchOpen ? 20 : 0 })
            .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 16 })).animation({ curve: curves.springMotion(0.46, 0.8) }))
        } else if (this.tab === '资料库') {
          Stack({ alignContent: Alignment.TopStart }) {
            if (this.downloadsOpen) {
              DownloadsView({
                onScroll: (offset: number) => this.homeScroll(offset),
                items: this.downloadItems,
                contentTop: this.headerHeight(),
                onExport: (item: MusicDownload) => { this.exportDownload(item); },
                onBatchExport: (items: MusicDownload[]) => { this.exportDownloadsBatch(items); },
                onPlay: (song: Song) => this.playSong(song, this.downloadItems.filter((item: MusicDownload) => item.state === 'complete').map((item: MusicDownload) => item.song)),
                onCancel: (id: string) => { this.downloads.cancel(id).catch((error: Error) => { this.error = error.message; }); },
                onDelete: (ids: string[], deleteSourceFile: boolean) => { this.deleteDownloads(ids, deleteSourceFile); }
              })
                .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ x: 42 })).animation({ curve: curves.springMotion(0.46, 0.84) }))
            } else {
              this.library()
            }
          }
            .width('100%').height('100%')
            .padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20 })
            .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })).animation({ curve: curves.springMotion(0.46, 0.82) }))
        } else {
          Column() { this.settingsView() }
            .width('100%').height('100%')
            .padding({ left: this.wide ? 32 : 20, right: this.wide ? 32 : 20 })
            .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 18 })).animation({ curve: curves.springMotion(0.46, 0.82) }))
        }
      }.width('100%').height('100%')
        .linearGradientBlur(28, { fractionStops: this.topBlurStops(this.topBlurZoneHeight()), direction: GradientDirection.Bottom })
    }.width('100%').height('100%')
  }
  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (this.showPlayer && !this.commentsOpen && !((this.effectiveStyleName() === 'sonic-workshop' || this.effectiveStyleName().startsWith('folia-')) && this.dynamicStageReady && this.playerReveal >= 0.99)) {
        AmbientBackdrop({ playing: this.playing, styleName: this.dynamicStageFailed ? 'off' : this.effectiveStyleName(), coverUrl: this.selected?.coverUrl ?? '', bgImage: this.stageBgImage, bgOpacity: this.stageBgOpacity, colorFirst: this.coverColors.first, colorLast: this.coverColors.last, light: this.stageLight() })
      }
      this.playbackStage('mine')
      this.playbackStage('folia')
      this.playbackStage('plain')
      if (!this.showPlayer) {
        Stack() {
          Column().width('100%').height('100%').backgroundColor(INK)
          if (this.pageBgImage) {
            Image(this.pageBgImage).sourceSize({ width: 1080, height: 1920 }).autoResize(true).width('100%').height('100%').objectFit(ImageFit.Cover).opacity(this.pageBgOpacity)
            // 深浅色自适应蒙层：浅色模式柔和亮雾保护深字，深色模式沉稳暗纱保护浅字
            Column().width('100%').height('100%')
              .backgroundColor(this.stageLight() ? '#B8F4F6FA' : '#96090B10')
          }
        }.width('100%').height('100%').hitTestBehavior(HitTestMode.Transparent)
      }
      Navigation() {
        this.rootTabContent()
      }.title({ builder: this.header, height: this.headerHeight() }, { barStyle: BarStyle.STACK, backgroundColor: Color.Transparent, backgroundBlurStyle: BlurStyle.NONE })
        .titleMode(NavigationTitleMode.Mini).mode(NavigationMode.Stack).hideBackButton(true).hideToolBar(true)
        .width('100%').height('100%').backgroundColor(Color.Transparent).expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .visibility(this.playerReveal >= 0.99 ? Visibility.None : Visibility.Visible)
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
        NativePlayer({ song: this.selected, colorFirst: this.coverColors.first, colorLast: this.coverColors.last, audioUrl: this.playbackUrl, wide: this.wide, availableWidth: this.viewportWidth, playing: this.playing, busy: this.resolving, duration: this.duration,
          lines: this.lyrics, styleName: this.styleName, resolvedStyleLabel: this.resolvedStyleLabel(), quality: this.quality, lyricOffset: this.lyricOffset,
          statusInset: this.statusInset, bottomInset: this.bottomInset, leftInset: this.leftInset, rightInset: this.rightInset, gripSide: this.gripSide, stageVisible: this.showPlayer, landscape: this.landscape,
          earMonitorActive: this.earMonitorState.active,
          onClose: () => { this.showPlayer = false; }, onToggle: () => this.toggle(), onImmersive: () => this.toggleStageControls(false),
          onEarMonitor: () => this.openSheet('耳返监听'),
          onSeek: (time: number) => this.seekToPosition(time), onSelectStyle: (value: string) => { this.styleName = value; this.save(); this.syncHarmonyPcWallpaperState(); },
          onCast: () => { this.openCast(); }, onShare: () => { this.shareCurrent(); } })
          .opacity(this.playerReveal * this.stageControlsReveal)
          .scale({ x: 0.94 + 0.06 * this.playerReveal, y: 0.94 + 0.06 * this.playerReveal })
          .translate({ y: (1 - this.playerReveal) * Math.min(180, this.viewportHeight * 0.22) + (1 - this.stageControlsReveal) * -12 })
          .enabled(this.showPlayer && this.stageControlsVisible)
          .hitTestBehavior(this.stageControlsVisible ? HitTestMode.None : HitTestMode.BLOCK_DESCENDANTS)
          .accessibilityLevel(this.showPlayer && this.stageControlsVisible ? 'auto' : 'no-hide-descendants')
      }
      if (isHarmonyPc() && this.showPlayer && !this.stageControlsVisible) {
        Stack({ alignContent: Alignment.TopEnd }) {
          Button(this.wallpaperMode ? '退出壁纸模式 (Esc)' : '退出沉浸模式 (Esc)')
            .attributeModifier(musicButtonPress)
            .height(34)
            .padding({ left: 14, right: 14 })
            .margin({ top: this.statusInset + 14, right: 20 })
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor('#FFFFFF')
            .backgroundColor('#B810141C')
            .border({ width: 1, color: '#38FFFFFF' })
            .borderRadius(17)
            .opacity(this.pcImmersiveHovered ? 0.96 : 0.22)
            .animation({ duration: 200, curve: Curve.EaseOut })
            .onHover((isHover: boolean) => { this.pcImmersiveHovered = isHover; })
            .onClick(() => {
              if (this.wallpaperMode) this.toggleHarmonyPcWallpaper(false);
              else this.stageControlsVisible = true;
            })
        }
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.Transparent)
      }
      if (!this.showPlayer) { this.feedOverlay() }
      DockLayer({ song: this.selected, tab: this.tab, gripSide: this.gripSide, playing: this.playing, busy: this.resolving,
        availableWidth: this.viewportWidth, landscape: this.landscape, searchOpen: this.searchOpen, secondary: this.secondaryDock(),
        detail: this.showPlayer, compact: this.dockCollapsed || this.viewportHeight < 500, mode: this.mode, liked: this.selected ? this.liked(this.selected) : false,
        clock: this.playbackClock,
        onTab: (tab: string) => this.navigateTab(tab),
        onPlayer: () => { if (this.selected) this.showPlayer = true; else { this.tab = '发现'; this.searchOpen = true; this.discoveryCompact = false; } },
        onToggle: () => this.toggle(), onNext: (step: number) => this.advance(step), onQueue: () => this.openSheet('播放队列'),
        onMode: () => this.cycle('mode'), onMore: () => {
          if (this.sleepEndAt > Date.now() && this.sleepMode !== 'off' && this.sleepMode !== 'song') {
            this.sleepRemainingText = this.formatRemaining(this.sleepEndAt - Date.now());
          }
          this.openSheet('更多');
        },
        onExpand: () => this.expandDock(),
        onSeek: (time: number) => this.seekToPosition(time) })
        .width('100%').margin({ bottom: this.bottomInset + 8 })
        .opacity(!this.showPlayer ? 1 : this.stageControlsReveal)
        .translate({ y: !this.showPlayer ? 0 : (1 - this.stageControlsReveal) * 24 })
        .hitTestBehavior(!this.showPlayer || this.stageControlsVisible ? HitTestMode.Default : HitTestMode.BLOCK_DESCENDANTS)
        .enabled(!this.showPlayer || this.stageControlsVisible)
        .accessibilityLevel(!this.showPlayer || this.stageControlsVisible ? 'auto' : 'no-hide-descendants')
      if (this.commentsOpen) {
        CommentsPanel({ song: this.selected, wide: this.wide, light: this.stageLight(), statusInset: this.statusInset, bottomInset: this.bottomInset, onClose: () => { this.commentsOpen = false; } })
          .transition(TransitionEffect.OPACITY.combine(TransitionEffect.translate({ y: 26 })).animation({ curve: curves.springMotion(0.46, 0.84) }))
      }
      // 全部功能独立窗口统一走鸿蒙原生 bindSheet / CustomDialogController（自带全屏遮罩、原生动效与沉浸材质）
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.scanOpen, this.scanSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.closeScanDialog(); action.dismiss(); },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.orderOpen, this.orderSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.orderOpen = false; action.dismiss(); },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.editPlaylistOpen, this.editPlaylistSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.editPlaylistOpen = false; action.dismiss(); },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.platformSwitchOpen, this.platformSwitchSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.platformSwitchOpen = false; action.dismiss(); this.maybeReturnToParentSheet(); },
          onDisappear: () => { if (!this.platformSwitchOpen) { this.switchTargetSong = null; this.switchTargetScope = ''; } },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.queueOrderOpen, this.queueOrderSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.queueOrderOpen = false; action.dismiss(); this.maybeReturnToParentSheet(); },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.moreAudioFxOpen, this.moreAudioFxSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 560 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.moreAudioFxOpen = false; action.dismiss(); this.maybeReturnToParentSheet(); },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.moreSleepOpen, this.moreSleepSheet(), {
          height: SheetSize.FIT_CONTENT, width: this.wide ? 480 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.moreSleepOpen = false; action.dismiss(); this.maybeReturnToParentSheet(); },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.colorPickerOpen, this.colorPickerSheet(), {
          height: SheetSize.FIT_CONTENT, width: this.wide ? 480 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.colorPickerOpen = false; action.dismiss(); },
          onDisappear: () => { if (!this.colorPickerOpen) this.colorPickerTarget = ''; },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.batchDownloadOpen, this.batchDownloadSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.batchDownloadOpen = false; action.dismiss(); },
          onDisappear: () => { if (!this.batchDownloadOpen) this.batchDownloadSongs = null; },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.batchCollectOpen, this.batchCollectSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.batchCollectOpen = false; action.dismiss(); },
          onDisappear: () => { if (!this.batchCollectOpen) this.batchCollectSongs = null; },
          systemMaterial: musicMenuMaterial()
        })
      Row().width(0).height(0).hitTestBehavior(HitTestMode.None)
        .bindSheet($$this.coverPickerOpen, this.coverPickerSheet(), {
          height: SheetSize.LARGE, width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
          showClose: false, dragBar: true,
          onWillDismiss: (action: DismissSheetAction) => { this.coverPickerOpen = false; action.dismiss(); },
          onDisappear: () => { if (!this.coverPickerOpen) this.coverPickerPlaylist = null; },
          systemMaterial: musicMenuMaterial()
        })
      Web({ src: $rawfile('lx-runtime/index.html'), controller: this.controller }).width(1).height(1).opacity(0).javaScriptAccess(true)
        .javaScriptProxy({ object: this.host, name: '__lxNative', methodList: ['onInited', 'onResult', 'httpRequest'], controller: this.controller })
        .onPageEnd(() => { this.host.attach(this.controller); this.hostReady = true; this.restorePlaybackIfReady(); this.restoreSource(); this.consumeSharedPlaylist(); this.refreshHomeFeed().catch(()=>{}); if (!isStoreEdition()) { setTimeout(() => { if (!this.disposed) this.checkAppUpdate(true).catch(() => {}); }, 5500); } })
    }.width('100%').height('100%').backgroundColor(INK).expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .onAreaChange((_oldArea: Area, area: Area) => {
        const nextW = Number(area.width);
        const nextH = Number(area.height);
        if (nextW <= 0 || nextH <= 0) return;
        const nextWide = nextW >= 700;
        const nextLandscape = nextW > nextH;
        // 原子同步宽窄/横竖屏/安全区，消除 64ms 拆帧错位与旋转弹簧滞后。
        this.dockReady = true;
        if (nextWide !== this.wide) this.wide = nextWide;
        if (nextLandscape !== this.landscape) this.landscape = nextLandscape;
        if (Math.abs(this.viewportWidth - nextW) >= 1) this.viewportWidth = nextW;
        if (Math.abs(this.viewportHeight - nextH) >= 1) this.viewportHeight = nextH;
        if (this.mainWindow) this.refreshAvoidInsets(this.mainWindow);
        this.syncStageControls();
        if (nextH < 500) this.searchMorph = 1;
        else if (!this.discoveryCompact) this.searchMorph = 0;
        if (!this.mainWindow) this.configureWindow();
      })
      .onTouch((event: TouchEvent) => this.stageGestureTouch(event))
      .onKeyEvent((event: KeyEvent) => this.handleKeyShortcut(event))
      .onMouse((event: MouseEvent) => {
        if (event.action === MouseAction.Release && event.button === MouseButton.Back) {
          this.dismissTopView();
        }
      })
      .bindSheet($$this.showSheet, this.sheetContent(), { height: (this.sheet === '播放队列' || this.sheet === '更多' || this.sheet === '耳返监听') ? SheetSize.LARGE : SheetSize.FIT_CONTENT,
        width: this.wide ? 580 : '100%', preferType: this.wide ? SheetType.CENTER : SheetType.BOTTOM,
        showClose: false, dragBar: true,
        onWillDismiss: (action: DismissSheetAction) => { this.returnSheetAfterSub = ''; action.dismiss(); },
        systemMaterial: musicMenuMaterial() })
  }
}
