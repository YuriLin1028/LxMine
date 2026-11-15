import { smartMobilityCommon } from '@kit.CarKit';
import { BusinessError } from '@kit.BasicServicesKit';

// Connection awareness does not register the app in the HiCar launcher.
// Launcher eligibility is a separate distribution/allowlist requirement.
export class CarConnectivity {
  private awareness: smartMobilityCommon.SmartMobilityAwareness | null = null;
  private statusListener: ((info: smartMobilityCommon.SmartMobilityInfo) => void) | null = null;
  private eventListener: ((event: smartMobilityCommon.SmartMobilityEvent) => void) | null = null;
  available: boolean = false;
  connected: boolean = false;

  start(onChange: (connected: boolean, detail: string) => void): void {
    if (this.awareness) return;
    try {
      this.awareness = smartMobilityCommon.getSmartMobilityAwareness();
      this.available = true;
      this.statusListener = (info: smartMobilityCommon.SmartMobilityInfo) => {
        this.connected = info.status === smartMobilityCommon.SmartMobilityStatus.RUNNING;
        const detail = this.connected ? '检测到 HiCar 连接 · 入口需在车机确认' : '未连接';
        onChange(this.connected, detail);
        console.info(`[HiCar] status=${info.status} type=${info.type}`);
      };
      this.eventListener = (event: smartMobilityCommon.SmartMobilityEvent) => {
        console.info(`[HiCar] event=${event.eventName}`);
      };
      const types: smartMobilityCommon.SmartMobilityType[] = [smartMobilityCommon.SmartMobilityType.HICAR];
      this.awareness.on('smartMobilityStatus', types, this.statusListener);
      this.awareness.on('smartMobilityEvent', types, this.eventListener);
      onChange(false, '等待 HiCar 连接');
    } catch (error) {
      this.available = false;
      this.connected = false;
      console.info(`[HiCar] unavailable: ${(error as BusinessError).code} ${(error as BusinessError).message}`);
      onChange(false, '当前设备不支持 CarKit');
    }
  }

  stop(): void {
    const types: smartMobilityCommon.SmartMobilityType[] = [smartMobilityCommon.SmartMobilityType.HICAR];
    try { if (this.statusListener) this.awareness?.off('smartMobilityStatus', types, this.statusListener); } catch (_) {}
    try { if (this.eventListener) this.awareness?.off('smartMobilityEvent', types, this.eventListener); } catch (_) {}
    this.statusListener = null;
    this.eventListener = null;
    this.awareness = null;
  }
}
