# 首版验证报告

验证更新日期：2026-10-12。本文记录当前工作区实际执行的结果，不代表已部署或已上架。

## 自动验证结果

| 项目 | 命令或方式 | 结果 |
| --- | --- | --- |
| 客户端回归 | `cd mword-client && npm test` | 7 个测试文件、29 条测试通过 |
| Web 构建 | `npm run build` | TypeScript 与 Vite 构建通过，产物 `mword-client/dist` |
| 原生页面构建与同步 | `npm run cap:sync` | 构建通过并复制到 Android、iOS；5 个插件识别成功 |
| 后端测试与打包 | `cd mword-server && sh build.sh test package -q` | 15 条测试通过，可执行 Boot JAR 约 32 MB |
| JAR 内容 | 检查 manifest、资源、依赖 | Boot 启动器及三套词库齐全；无 H2、local 或 test profile |
| 词库校验 | `python3 data/tools/validate_vocabularies.py` | 6,160 个共享稳定词 ID、来源成员和授权文件通过 |
| iOS 工程格式 | `plutil -lint` | 工程文件、隐私清单语法通过 |
| 后台 HTTP | `python3 tools/smoke_test.py` | 实际 Tomcat + H2 服务全流程通过 |
| Web 代理 HTTP | `python3 tools/smoke_test.py http://127.0.0.1:4173/mword-api` | 同一流程经 Vite 代理通过 |
| 静态资源 HTTP | 请求页面及 SW 列出的全部资源 | 页面、脚本、样式、授权文件全部可达；原生包不含 SW |
| 持久化本机启动 | `python3 tools/dev.py`，停止后重新启动 | 账号、资料、文章、回忆及阅读完成记录保留；文件库位于 `.cache/local/database` |
| 本机端口及实例保护 | 已占用端口与第二实例检查 | 拒绝占用现有端口；同一数据库仅允许一个启动脚本 |
| 发布打包 | `python3 tools/package_release.py` | 逐文件与归档内容校验，通过生产JAR/授权/配置空值检查；同一输入可复现 |
| 云MySQL接入 | 专用账号启动正式JAR并执行Flyway | MySQL 8.0.27、TLS连接、InnoDB、utf8mb4_bin；V1成功建立9张业务表及迁移历史表 |
| 云MySQL HTTP与额度并发 | `python3 tools/verify_mysql_http.py --allow-queued-tests` | 登录/同步/隔离通过；20同ID请求只预占1次；2点余额下5请求恰好2成功、3个402；重复取消只退款1次 |

客户端回归涵盖：同步请求在途时继续离线学习、写入失败不虚增回忆或阅读、不把旧账号异步结果发布到新账号、非JSON响应拒绝、额度及AI未知网络失败复用请求ID、离线启动保留最新设置，以及跨设备历史分组重放。服务器缺少文章时，相关阅读单独保留，有效记录继续同步，本机正文保留；原文章ID恢复后能续传。

本轮另有8条目标词选择回归：已有文章覆盖后下一篇轮换、先过滤其他词书再取到期词、重复完成阅读去重、查词曝光不产生复习状态、缺释义词仍参与覆盖、长文目标词最多30且正文保留。读后可进入本篇目标词批次，只有实际保存回忆或新语境练习才进入复习；跳过不计入完成回忆。

后端回归涵盖：认证和Cookie注销、账号隔离、重复事件冲突、迟到事件重算、提示与曝光区别、任务幂等、额度预占/结算/释放、成功与取消/超时竞争、内容验证失败保留供应商token、资料与模型快照、缓存复用、Key加密，以及响应头已到达而body停滞时的总截止。AI HTTP直接JSON请求省略 `regenerate` 的路径另有回归，避免只用Java DTO构造测试漏掉真实客户端行为。

文件H2回归实际启动应用两次，验证账号、会话、个人资料、单词与阅读事件、游标、排队任务、预占额度以及加密供应商配置恢复。根目录一键启动也完成实际停止重启检查，不仅验证profile文件存在。主密钥及数据库口令随机生成并限制文件权限，worker默认关闭。

云MySQL实际使用REPEATABLE-READ完成HTTP联调，确认大小写不同事件编号可分别保存。队列并发检查时worker关闭，只临时配置无效测试Key，不调用模型；数据库中核对3个测试任务恰好对应3条RESERVE、3条RELEASE。验证后以记录的确切用户/供应商ID清理测试账号、文章、事件、任务和流水，保留管理员账号；没有禁用其他供应商或清空整库。临时数据库root凭据文件已删除，程序仍使用专用账号。

HTTP脚本创建随机临时账号，通过Cookie操作实际服务，验证三套词库、资料、私人文章、阅读确认、双设备合并、账号隔离、普通用户无管理员权限、AI未配置时不扣额度及只注销当前设备。它仅允许本机HTTP地址，不读取真实账号或供应商Key。

## 本机体验

已接入云MySQL的页面为 [mword 云库版本](http://127.0.0.1:5174/mword/)，通过 `python3 tools/run_mysql.py --web` 启动正式JAR，配置与管理账号说明见 `MYSQL_CONNECTION.md`。下面5173仍为独立H2体验。

推荐当前持久化体验：[mword 本地页面](http://127.0.0.1:5173/mword/)，对应后台 `127.0.0.1:18083`。在项目根目录执行 `python3 tools/dev.py`，按Ctrl+C停止，重新启动后记录保留，详见 `LOCAL_DEVELOPMENT.md`。可在页面自行注册，选择词书和兴趣，阅读样例或导入文章，完成回忆并查看同步状态。未配置真实供应商时，AI功能会提示尚未配置。

原来的临时验证使用后台 `127.0.0.1:18081` 和Web预览 `127.0.0.1:4173`；这是独立内存数据库，停止会清空，不与新文件库自动迁移。以下命令仅用于临时测试：

重新启动临时后台：

```sh
cd /Users/mayuanfei/Desktop/AI-workspace/mword/mword-server
sh build.sh test-compile spring-boot:test-run -Dspring-boot.run.profiles=test
```

另一个终端启动页面：

```sh
cd /Users/mayuanfei/Desktop/AI-workspace/mword/mword-client
npm run build
npm run preview
```

H2数据只在内存中，停止后台后账号和服务器记录清空；这是临时联调环境。测试profile关闭AI worker，不用于实际模型能力验收。正式运行使用MySQL、随机密钥加密材料，并通过环境变量初始化管理员和模型配置，见 `DEPLOYMENT.md`。不要将测试profile、全零测试密钥或测试Cookie设置用于公开服务。

## 尚未验证或尚未交付的部分

- 已连接授权云MySQL并完成迁移与程序启动；仍未执行云数据库备份恢复或线上Nginx验证，也没有部署到 mayuanfei.com。云库启动方式见 `MYSQL_CONNECTION.md`。
- 没有调用实际国内模型，不能据此确认供应商响应契约、费用或教学内容质量；模型说明和记忆联想仍需实测校对。
- 未进行浏览器视觉及交互走查：本次浏览器界面访问被拒绝，未用其他浏览器工具绕过。HTTP和数据层测试不能代替页面操作。
- 本机没有完整Xcode和Android SDK，尚未编译、签名APK/IPA或安装到两台手机。Capacitor同步和工程语法检查不代表原生编译、SQLite、Keychain/Keystore、通知、TTS真机通过。步骤见 `MOBILE_BUILD.md`。
- 预设词书为可追溯来源词表，不宣称最新官方完整大纲。四级3,849词、六级5,407词、考研4,801词；缺失释义已由ECDICT简明释义清洗回填（释义覆盖率100%），部分释义仍属待校对草稿，详情见 `VOCABULARY_SOURCES.md`。
- 第一版未接真实支付、密码找回、账号注销和商店发布。公开使用前仍需补齐账号服务、隐私政策、用户协议和供应商数据处理说明。

复习采用明确版本的基础间隔规则 `interval-v1`，不是FSRS。曝光、回忆和新语境练习分别记录；跳过词条不计入完成回忆，页面统计不承诺用户已经掌握单词。
