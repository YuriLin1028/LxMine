import { UIAbility, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

// Injected only by build-native-reference.ps1; never part of the normal HAP.
export default class MaterialTierAbility extends UIAbility {
  onCreate(): void {
    this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
  }
  async onWindowStageCreate(stage: window.WindowStage): Promise<void> {
    const main = stage.getMainWindowSync();
    await main.setWindowLayoutFullScreen(true);
    await main.setWindowSystemBarEnable([]);
    await main.setPreferredOrientation(window.Orientation.PORTRAIT);
    await stage.loadContent('pages/MaterialTierLab');
  }
}
