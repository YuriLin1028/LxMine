import { webview } from '@kit.ArkWeb';
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
  aboutToAppear(): void {
    this.host.onFinish = () => this.onFinish();
    this.timeout = setTimeout(() => this.onFinish(), 12000);
  }
  aboutToDisappear(): void { clearTimeout(this.timeout); }
  build() {
    // Only the original splash renderer is bundled here; the full MineRadio app
    // is no longer parsed during launch.
    Web({ src: $rawfile('mine-stage/startup.html'), controller: this.controller })
      .javaScriptAccess(true).backgroundColor('#000000').width('100%').height('100%')
      .javaScriptProxy({ object: this.host, name: '__lxStartup', methodList: ['done'], controller: this.controller })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
