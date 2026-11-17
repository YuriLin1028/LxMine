# 鸿蒙底栏回归

在已安装当前 HiCar 包的鸿蒙模拟器中，以浅色模式运行：

```powershell
$env:LM_HARMONY_DEVICE = '127.0.0.1:5555'
node qa/harmony/dock-material.cjs
```

脚本仅接受模拟器地址，需要 HDC 与 ffmpeg。它通过本地歌曲 URI 创建无需音源的界面测试内容，注入真实触摸，读取原生组件树并截图，核验：

- 首页、播放详情、返回、三个主页面的底栏原生节点编号相同。
- 栏内按钮触点在首页与播放页均产生可见的官方流光，整栏按压只轻微放大。
- 拖动时材质轮廓与图标像素跟随移动。
- 音源页两个按钮的按压边界完整可见。

结果保存在 `qa/harmony/artifacts/dock-material/`。脚本会重启模拟器中的测试应用；启动页结束后才开始输入，结束时停止应用。

原生接口依据：[华为沉浸光感交互说明](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-common-capability/)。隐藏子树的命中处理还参考了 [OpenHarmony 原生事件分发实现](https://github.com/openharmony/arkui_ace_engine/blob/master/frameworks/core/common/event_manager.cpp)，其中一次触摸仅分发给命中链上首个材质交互接收者。
