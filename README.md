# mword

以难词理解和主动回忆为核心的英语学习应用。React 前端同时用于 Web、Android 和 iOS；Spring Boot 服务负责账号、同步、预设词库、AI 任务及额度管理。

## 目录

```text
mword-client/     React + TypeScript + Tailwind；android/、ios/ 是 Capacitor 原生工程
mword-server/     Spring Boot + MyBatis-Plus + MySQL
data/             预设词库、来源授权与可复现构建工具
docs/             产品约定、接口、部署和验证说明
```

## 本地开发

已接入授权云MySQL时，可执行 `python3 tools/run_mysql.py --web` 运行正式JAR，页面为 [127.0.0.1:5174/mword/](http://127.0.0.1:5174/mword/)。程序使用专用数据库账号，受保护配置位于 `.cache/mysql/config.json`，详情见 [云MySQL接入](docs/MYSQL_CONNECTION.md)。

想直接体验并在重启后保留学习记录，可在项目根目录执行 `python3 tools/dev.py`。页面默认 [127.0.0.1:5173/mword/](http://127.0.0.1:5173/mword/)，后台使用独立的文件H2开发库；详细说明见 [本机持久化体验](docs/LOCAL_DEVELOPMENT.md)。正式服务仍使用MySQL。

需要 Node.js 22 或更新版本、JDK 21、Maven、MySQL。先根据 `mword-server/.env.example` 配置服务环境变量，并创建独立的 `mword` 数据库。服务启动时 Flyway 执行迁移。环境变量由终端或部署工具注入，Spring 不自动读取 `.env` 文件。

```sh
cd mword-server
sh build.sh spring-boot:run
```

在另一个终端启动前端：

```sh
cd mword-client
npm ci
npm run dev
```

打开 [本地学习页面](http://127.0.0.1:5173/mword/)。开发服务器把 `/mword-api` 请求转发至 `127.0.0.1:18081`。本机 HTTP 联调需设置 `MW_SECURE_COOKIE=false`；正式 HTTPS 保持 `true`。注册后选择词书、兴趣和初始难度；管理员账号通过服务端环境变量初始化。

不准备 MySQL 也可以使用 [服务端说明](mword-server/README.md) 中的 H2 临时联调方式。`build.sh` 会选择 JDK 21 并使用项目独立 Maven Central 配置，避免本机默认 JDK 8 或其他项目私有镜像影响构建。

## 构建和验证

```sh
cd mword-client
npm test
npm run build
npm run cap:sync
```

```sh
cd mword-server
sh build.sh test package
```

Web 产物在 `mword-client/dist`，手机页面产物在 `dist-native`。手机 API 默认为 `https://www.mayuanfei.com/mword-api`，可通过 `mword-client/.env` 的 `VITE_API_URL` 在构建前调整。

部署路径和环境变量见 [部署说明](docs/DEPLOYMENT.md)，Android、iOS 安装步骤见 [手机构建说明](docs/MOBILE_BUILD.md)。实际验证结果记录在 [验证报告](docs/VALIDATION.md)。

已构建Web和后台可执行 `python3 tools/package_release.py` 打成独立发布包，附文件清单和SHA-256校验；它不包含真实配置或学习数据库。具体布局见 [发布包说明](docs/RELEASE_PACKAGE.md)。

## 第一版能力与边界

支持真实服务端登录、选择预设词库、粘贴及阅读文章、点词查义、后台 AI 难词讲解与记忆辅助、隐藏答案回忆、新语境练习、按账号同步、AI 任务和额度管理。AI 模型密钥只由管理员在后台维护，用户不填写密钥。没有配置模型时会明确提示，不产生伪造的 AI 结果。

手机使用 SQLite；Web 使用 IndexedDB 和应用外壳缓存。只有已下载的内容可以离线使用，第一次登录、新文章和新 AI 请求需要联网。登录凭证在 Web 使用 HttpOnly Cookie，在手机使用 Keychain 或 Android Keystore。复习使用明确版本的 `interval-v1` 规则，后续可依据实际学习数据升级调度。

AI 支付尚未接入，当前消耗的是管理员分配的学习额度。预设四级 3,849 词、六级 5,407 词、考研 4,801 词；不是最新官方完整考试大纲，部分释义仍需校对。覆盖范围、授权与待校对项目见 [词库来源](docs/VOCABULARY_SOURCES.md)。这是一套可继续迭代的首版实现；生产数据库、真实模型、手机真机和商店发布需要独立验证。
