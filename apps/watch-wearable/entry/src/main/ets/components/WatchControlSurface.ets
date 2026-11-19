import { uiMaterial } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';

export const CONTROL_SURFACE = '#24252A';

export class WatchControlSurface implements AttributeModifier<RowAttribute> {
  private material: uiMaterial.ImmersiveMaterial | undefined;

  initialize(): boolean {
    if (!canIUse('SystemCapability.ArkUI.ArkUI.Full')) {
      return false;
    }
    if (deviceInfo.apiAvailable('26.0.0')) {
      try {
        if (uiMaterial.isImmersiveMaterialSupported()) {
          this.material = new uiMaterial.ImmersiveMaterial({
            style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
            materialColor: Color.Transparent,
            interactive: true,
            applyShadow: false,
            lightEffect: { color: '#FFFFFF' },
          });
        }
      } catch {
        console.warn('LxMine Watch: immersive material unavailable');
      }
    }
    return this.material !== undefined;
  }

  applyNormalAttribute(instance: RowAttribute): void {
    if (deviceInfo.apiAvailable('26.0.0')) {
      if (this.material) {
        instance.backgroundColor(Color.Transparent).systemMaterial(this.material);
        return;
      }
    }
    instance.backgroundColor(CONTROL_SURFACE);
  }
}
