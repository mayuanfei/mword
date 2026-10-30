# Android 与 iOS 构建

两端复用 `mword-client/src` 页面。Web 构建 base 为 `/mword/`；原生构建为 `/`，页面随安装包分发。原生工程没有配置远程 `server.url`，页面加载不会依赖网站可用性。

## 公共步骤

```sh
cd mword-client
npm ci
npm run cap:sync
```

需要变更服务器时，在 `.env` 中设置 `VITE_API_URL=https://www.mayuanfei.com/mword-api` 后重新构建和同步。正式应用使用 HTTPS。

## Android

安装 Android Studio、SDK 和 JDK 21，运行 `npm run cap:android`。在 Android Studio 的 SDK Manager 安装项目 `android/variables.gradle` 指定的 SDK。

调试 APK 可用 Gradle 构建：

```sh
cd android
./gradlew assembleDebug
```

产物在 `app/build/outputs/apk/debug/`，安装到安卓手机进行调试。发布时通过 Android Studio 创建正式签名并生成 AAB/APK，妥善保存签名材料。项目禁用系统备份；登录 token 使用 Android Keystore 加密后保存在私有文件中，学习数据使用 SQLite。

## iOS

需要完整 Xcode，按 [Capacitor 环境要求](https://capacitorjs.com/docs/getting-started/environment-setup) 安装当前版本要求的工具；仅 Command Line Tools 不足以打包 iPhone 应用。运行 `npm run cap:ios`，打开 Xcode 项目后等待 Swift Package Manager 解析 Capacitor、SQLite 等依赖。

在 Signing & Capabilities 选择自己的 Apple 开发团队，连接 iPhone 并运行。正式分发可通过 Xcode Archive 上传到 App Store Connect，再使用 TestFlight 测试。开发团队、证书和商店账号不包含在仓库中。

`MwordSessionPlugin` 在 Keychain 中保存登录会话；`MwordViewController` 注册这个本地插件。`PrivacyInfo.xcprivacy` 已加入项目资源，声明本地偏好和文件时间戳用途以及账号/学习数据；正式发布前用 Xcode 生成隐私报告，核对实际依赖和 App Store 填报。参见 [Apple 隐私清单说明](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)。

## 真机验证

首次联网注册后缓存词库与文章，断网重启，确认 SQLite 中的记录仍在。完成新回忆后重连，确认 Web 上能看到同步记录。分别检查系统英语语音是否可用、朗读按钮、通知权限、复习提醒、返回前台自动同步，以及切换账号后的内容隔离。

当前工作机缺少完整 Xcode 和 Android SDK，已经生成双端工程并验证网页产物同步，尚未进行原生编译、安装和真机测试。
