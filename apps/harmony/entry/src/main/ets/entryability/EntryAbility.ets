import { UIAbility, Configuration, ConfigurationConstant, Want, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { loadPlaybackSnapshot } from '../services/Store';
import { latestPlaybackSnapshot, compactSavedPlaybackJson } from '../services/Continuation';
import { systemShare } from '@kit.ShareKit';
import { webview } from '@kit.ArkWeb';
import { DEBUG } from 'BuildProfile';

export default class EntryAbility extends UIAbility {
  private shareGeneration: number = 0;

  private activateContinueState(): void {
    try {
      this.context.setMissionContinueState(AbilityConstant.ContinueState.ACTIVE).catch(() => {});
    } catch (_) {}
  }

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    try { webview.WebviewController.setWebDebuggingAccess(DEBUG); } catch (_) {}
    AppStorage.setOrCreate('lxliaForeground', true);
    try { this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET); } catch (_) {}
    this.activateContinueState();
    try { this.captureLaunch(want); } catch (_) {}
    if (launchParam && launchParam.launchReason === AbilityConstant.LaunchReason.CONTINUATION) {
      try {
        this.context.restoreWindowStage(new LocalStorage());
      } catch (error) {
        console.warn(`[Continuation] restoreWindowStage in onCreate: ${(error as BusinessError).message}`);
      }
    }
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.activateContinueState();
    try { this.captureLaunch(want); } catch (_) {}
    if (launchParam && launchParam.launchReason === AbilityConstant.LaunchReason.CONTINUATION) {
      try {
        this.context.restoreWindowStage(new LocalStorage());
      } catch (error) {
        console.warn(`[Continuation] restoreWindowStage in onNewWant: ${(error as BusinessError).message}`);
      }
    }
  }

  onForeground(): void {
    AppStorage.setOrCreate('lxliaForeground', true);
    this.activateContinueState();
  }
  onBackground(): void { AppStorage.setOrCreate('lxliaForeground', false); }
  onConfigurationUpdate(configuration: Configuration): void {
    if (configuration.colorMode !== undefined) AppStorage.setOrCreate('lxmineSystemColorMode', configuration.colorMode);
  }
  onMemoryLevel(level: AbilityConstant.MemoryLevel): void {
    if (level >= AbilityConstant.MemoryLevel.MEMORY_LEVEL_LOW) AppStorage.setOrCreate('lxmineStageMemoryPressure', Date.now());
  }

  /** App continuation: hand a compact (<40KB) playback snapshot to the target device. */
  async onContinue(wantParam: Record<string, Object>): Promise<AbilityConstant.OnContinueResult> {
    try {
      let snapshot = latestPlaybackSnapshot();
      if (!snapshot) {
        const persisted = await loadPlaybackSnapshot();
        snapshot = compactSavedPlaybackJson(persisted);
      }
      if (snapshot) wantParam['lxmine_playback'] = snapshot;
    } catch (error) {
      console.warn(`[Continuation] onContinue snapshot error: ${(error as BusinessError).message}`);
    }
    return AbilityConstant.OnContinueResult.AGREE;
  }

  onWindowStageCreate(stage: window.WindowStage): void { this.loadStage(stage); }
  onWindowStageRestore(stage: window.WindowStage): void {
    this.captureLaunch(this.launchWant);
    this.loadStage(stage);
  }

  private captureLaunch(want: Want | undefined): void {
    if (!want) return;
    const generation = ++this.shareGeneration;
    if (want.action === 'ohos.want.action.sendData') {
      systemShare.getSharedData(want).then((data: systemShare.SharedData) => {
        if (generation !== this.shareGeneration) return;
        const content = data.getRecords().map((record: systemShare.SharedRecord) => record.content ?? '').filter((text: string) => text.length > 0).join('\n');
        if (content) AppStorage.setOrCreate('lxmine_shared_playlist', content);
      }).catch((error: BusinessError) => console.warn(`[PlaylistShare] ${error.message}`));
    }
    const uri = want.uri;
    if (typeof uri === 'string' && uri.startsWith('lxmine://')) AppStorage.setOrCreate('lxmine_deep_link', uri);
    const params = want.parameters;
    const continued = params ? params['lxmine_playback'] : undefined;
    if (typeof continued === 'string' && continued.length > 0) {
      AppStorage.setOrCreate('lxmine_continue_playback', continued);
    }
  }
  private loadStage(stage: window.WindowStage): void {
    AppStorage.setOrCreate('lxmine_window_stage', stage);
    // 全面屏沉浸：内容延伸到状态栏与导航条之下
    const main = stage.getMainWindowSync();
    main.setWindowLayoutFullScreen(true).catch(() => {});
    // 手机默认竖屏（仅详情页放开）；平板与车机跟随自动旋转（尊重控制中心锁定）；鸿蒙 PC 窗口自由缩放不调方向锁。
    if (deviceInfo.deviceType !== '2in1') {
      const freeRotate = deviceInfo.deviceType === 'car' || deviceInfo.deviceType === 'tablet';
      main.setPreferredOrientation(freeRotate ? window.Orientation.AUTO_ROTATION_RESTRICTED : window.Orientation.PORTRAIT)
        .catch((error: BusinessError) => console.warn(`[Orientation] ${error.message}`));
    }
    if (deviceInfo.deviceType === '2in1') {
      try {
        main.setWindowLimits({ minWidth: 420, minHeight: 520 }).catch(() => {});
      } catch (_) {}
    }
    stage.loadContent('pages/Index').catch(() => {});
  }
}
