import { UIAbility,ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
export default class NativeMenuAbility extends UIAbility {
  onCreate():void{this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_DARK);}
  async onWindowStageCreate(stage: window.WindowStage): Promise<void> {
    const main=stage.getMainWindowSync();await main.setWindowLayoutFullScreen(true);await main.setPreferredOrientation(window.Orientation.PORTRAIT);
    await stage.loadContent('pages/NativeMenuLab');
  }
}
