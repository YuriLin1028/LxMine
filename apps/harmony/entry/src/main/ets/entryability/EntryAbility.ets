import { UIAbility, ConfigurationConstant, Want, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { loadPlaybackSnapshot } from '../services/Store';
import { latestPlaybackSnapshot } from '../services/Continuation';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    AppStorage.setOrCreate('lxliaForeground', true);
    this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
    this.captureLaunch(want);
  }
  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.captureLaunch(want);
  }
  onForeground(): void { AppStorage.setOrCreate('lxliaForeground', true); }
  onBackground(): void { AppStorage.setOrCreate('lxliaForeground', false); }

  /** App continuation: hand the current playback snapshot to the target device. */
  async onContinue(wantParam: Record<string, Object>): Promise<AbilityConstant.OnContinueResult> {
    try {
      // 优先用页面每秒刷新的内存快照（进度与当前播放一致），兜底用持久化快照。
      let snapshot = latestPlaybackSnapshot();
      if (!snapshot) snapshot = await loadPlaybackSnapshot();
      if (snapshot) wantParam['lxmine_playback'] = snapshot;
    } catch (_) {}
    return AbilityConstant.OnContinueResult.AGREE;
  }

  onWindowStageCreate(stage: window.WindowStage): void { this.loadStage(stage); }
  onWindowStageRestore(stage: window.WindowStage): void {
    this.captureLaunch(this.launchWant);
    this.loadStage(stage);
  }

  private captureLaunch(want: Want | undefined): void {
    if (!want) return;
    const uri = want.uri;
    if (typeof uri === 'string' && uri.length) AppStorage.setOrCreate('lxmine_deep_link', uri);
    const params = want.parameters;
    const continued = params ? params['lxmine_playback'] : undefined;
    if (typeof continued === 'string') AppStorage.setOrCreate('lxmine_continue_playback', continued);
  }
  private loadStage(stage: window.WindowStage): void {
    // 全面屏沉浸：内容延伸到状态栏与导航条之下
    const main = stage.getMainWindowSync();
    main.setWindowLayoutFullScreen(true).catch(() => {});
    // 手机默认竖屏（仅详情页放开）；平板与车机不锁方向。
    const freeRotate = deviceInfo.deviceType === 'car' || deviceInfo.deviceType === 'tablet';
    main.setPreferredOrientation(freeRotate ? window.Orientation.AUTO_ROTATION : window.Orientation.PORTRAIT)
      .catch((error: BusinessError) => console.warn(`[Orientation] ${error.message}`));
    stage.loadContent('pages/Index').catch(() => {});
  }
}
