# LxMine Windows 构建

在原目录 D:\Lxlia 使用 PowerShell 7：

```powershell
npm --prefix apps/desktop ci
npm start
npm run build:win:dir
npm run build:win
```

构建目标产物：apps/desktop/dist/win-unpacked/LxMine.exe 与 apps/desktop/dist/LxMine-0.1.0-Setup.exe。是否已有可用产物以实际构建结果为准。

安装标识保留 com.lxlia.player，程序、窗口、快捷方式与安装包显示名为 LxMine。原 MineRadio 发布与更新源已关闭，新应用不从上游下载覆盖包。

当前是重建过程，旧 Folia 版本的测试记录不能作为本版本的测试结果。
