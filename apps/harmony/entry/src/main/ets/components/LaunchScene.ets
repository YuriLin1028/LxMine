import { webview } from '@kit.ArkWeb';
import { displaySync } from '@kit.ArkGraphics2D';
import { curves } from '@kit.ArkUI';

class StartupHost {
  onFinish: () => void = () => {};
  done(): void { setTimeout(() => this.onFinish(), 0); }
}

@Component
export struct LaunchScene {
  onFinish: () => void = () => {};
  private controller: webview.WebviewController = new webview.WebviewController();
  private host: StartupHost = new StartupHost();
  private timeout: number = -1;
  private frameSync: displaySync.DisplaySync | null = null;
  private finished: boolean = false;
  @State private revealOpacity: number = 1;

  private complete(): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timeout);
    this.getUIContext().animateTo({ duration: 280, curve: curves.cubicBezierCurve(0.22, 1, 0.36, 1) }, () => {
      this.revealOpacity = 0;
    });
    setTimeout(() => {
      this.stopHighRefresh();
      this.onFinish();
    }, 280);
  }

  private startHighRefresh(): void {
    try {
      const sync = displaySync.create();
      sync.setExpectedFrameRateRange({ min: 120, max: 120, expected: 120 });
      sync.on('frame', () => {});
      sync.start();
      this.frameSync = sync;
    } catch (_) {}
  }

  private stopHighRefresh(): void {
    if (!this.frameSync) return;
    try {
      this.frameSync.stop();
      this.frameSync.off('frame');
    } catch (_) {}
    this.frameSync = null;
  }

  aboutToAppear(): void {
    this.startHighRefresh();
    this.host.onFinish = () => this.complete();
    this.timeout = setTimeout(() => this.complete(), 5500);
  }

  aboutToDisappear(): void {
    clearTimeout(this.timeout);
    this.stopHighRefresh();
  }

  build() {
    Web({ src: $rawfile('mine-stage/startup.html'), controller: this.controller })
      .javaScriptAccess(true).backgroundColor('#05070B').width('100%').height('100%')
      .opacity(this.revealOpacity)
      .javaScriptProxy({ object: this.host, name: '__lxStartup', methodList: ['done'], controller: this.controller })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
