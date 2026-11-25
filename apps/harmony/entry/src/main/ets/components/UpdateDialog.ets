import { musicButtonPress } from './MaterialControls';
import { TEXT, MUTED, ACCENT, ON_ACCENT } from './Theme';
import { AppUpdateInfo, UpdateProgress } from '../services/AppUpdater';

@CustomDialog
export struct UpdateDialog {
  controller?: CustomDialogController;
  @Link info: AppUpdateInfo | null;
  @Link errorText: string;
  @Link downloading: boolean;
  @Link progress: UpdateProgress;
  @Link downloadedPath: string;
  onDismiss: () => void = () => {};
  onRetryCheck: () => void = () => {};
  onStartDownload: () => void = () => {};
  onCancelDownload: () => void = () => {};
  onSaveToLocation: () => void = () => {};
  onOpenInvite: () => void = () => {};

  private titleText(): string {
    if (this.info && this.info.hasUpdate) return `发现新版本 v${this.info.latestVersion}`;
    if (this.info) return '已是最新版本';
    return '检查更新失败';
  }

  private subtitleText(): string {
    if (this.info && this.info.hasUpdate) {
      const sizeStr = this.info.asset && this.info.asset.size > 0
        ? ` · ${(this.info.asset.size / 1048576).toFixed(1)} MB` : '';
      const dateStr = this.info.publishedAt ? ` · ${this.info.publishedAt.slice(0, 10)}` : '';
      return `v${this.info.currentVersion} → v${this.info.latestVersion}${sizeStr}${dateStr}`;
    }
    if (this.info) return `当前版本 v${this.info.currentVersion} 已是最新，无需更新。`;
    return this.errorText || '无法连接更新服务器，请检查网络后重试。';
  }

  private defaultNotes(): string {
    return '包含最新功能优化与问题修复，点击下方按钮将通过国内加速镜像下载 HAP 安装包并保存到您指定的位置。';
  }

  build() {
    Column({ space: 12 }) {
      Text(this.titleText())
        .fontSize(20).fontWeight(FontWeight.Bold).fontColor(TEXT).width('100%')
      Text(this.subtitleText())
        .fontSize(13).fontColor(MUTED).lineHeight(19).width('100%')

      if (this.info && this.info.hasUpdate) {
        Scroll() {
          Text(this.info.notes || this.defaultNotes())
            .fontSize(13).fontColor(TEXT).lineHeight(19).width('100%')
        }
        .width('100%').constraintSize({ maxHeight: 160 }).align(Alignment.TopStart).scrollBar(BarState.Off).fadingEdge(false)
        .padding(12).borderRadius(14).backgroundColor('#12FFFFFF')
      }

      if (this.downloading) {
        Column({ space: 6 }) {
          Progress({ value: this.progress.percent, total: 100, type: ProgressType.Linear })
            .width('100%').color(ACCENT)
          Text(`${this.progress.mirror ? '[' + this.progress.mirror + '] ' : ''}已下载 ${this.progress.percent}%（${(this.progress.received / 1048576).toFixed(1)} MB${this.progress.total > 0 ? ' / ' + (this.progress.total / 1048576).toFixed(1) + ' MB' : ''}）`)
            .fontSize(12).fontColor(ACCENT).width('100%')
        }.width('100%')
      } else if (this.downloadedPath) {
        Text('HAP 安装包已下载完成，可点击下方按钮保存到指定位置。')
          .fontSize(12).fontColor(ACCENT).width('100%')
      } else if (this.errorText && this.info) {
        Text(this.errorText)
          .fontSize(12).fontColor('#FF8E9B').width('100%')
      }

      Row({ space: 10 }) {
        Blank()
        Button(this.downloading ? '取消下载' : (this.info && this.info.hasUpdate ? '稍后再说' : '知道了'))
          .attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.NORMAL)
          .height(40).padding({ left: 16, right: 16 }).fontSize(14).fontColor(TEXT)
          .backgroundColor('#1AFFFFFF').borderRadius(20)
          .onClick(() => {
            if (this.downloading) this.onCancelDownload();
            else this.onDismiss();
          })

        if (!this.info) {
          Button('重试')
            .attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.NORMAL)
            .height(40).padding({ left: 18, right: 18 }).fontSize(14).fontColor(ON_ACCENT)
            .backgroundColor(ACCENT).borderRadius(20)
            .onClick(() => this.onRetryCheck())
        } else if (this.info.hasUpdate && !this.downloading) {
          Button(this.downloadedPath ? '保存到指定位置' : '下载 HAP 到指定位置')
            .attributeModifier(musicButtonPress).buttonStyle(ButtonStyleMode.NORMAL)
            .height(40).padding({ left: 18, right: 18 }).fontSize(14).fontColor(ON_ACCENT)
            .backgroundColor(ACCENT).borderRadius(20)
            .onClick(() => {
              if (this.downloadedPath) this.onSaveToLocation();
              else this.onStartDownload();
            })
        }
      }.width('100%').padding({ top: 4 })
    }
    .width('100%')
    .padding(24)
  }
}
