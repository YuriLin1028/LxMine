import { motion } from '@kit.MultimodalAwarenessKit';
import { abilityAccessCtrl, common } from '@kit.AbilityKit';

export type GripSide = 'left' | 'right' | 'center';
// 使用系统握持事件；不根据点击位置猜测。只在前台订阅，切后台及时释放。
export class GripService {
  private subscribed: boolean = false;
  private generation: number = 0;
  private pending: number = -1;
  private receive: ((side: GripSide) => void) | null = null;
  private callback = (status: motion.HoldingHandStatus): void => {
    const side: GripSide = status === motion.HoldingHandStatus.LEFT_HAND_HELD ? 'left' :
      status === motion.HoldingHandStatus.RIGHT_HAND_HELD ? 'right' : 'center';
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.receive?.(side), 280);
  };
  async start(context: common.UIAbilityContext, receive: (side: GripSide) => void): Promise<boolean | null> {
    this.stop(); const generation = this.generation; this.receive = receive;
    if (!canIUse('SystemCapability.MultimodalAwareness.Motion')) return false;
    try {
      const manager = abilityAccessCtrl.createAtManager();
      const permission = await manager.requestPermissionsFromUser(context, ['ohos.permission.DETECT_GESTURE']);
      if (generation !== this.generation) return null;
      if (permission.authResults[0] !== 0) return false;
      motion.on('holdingHandChanged', this.callback); this.subscribed = true;
      console.info('[LxMineGrip] subscribed'); return true;
    } catch (error) { console.info(`[LxMineGrip] unavailable: ${(error as Error).message}`); return false; }
  }
  stop(): void {
    this.generation++; clearTimeout(this.pending);
    if (this.subscribed) { try { motion.off('holdingHandChanged', this.callback); } catch (_) {} }
    this.subscribed = false; this.receive = null;
  }
}
