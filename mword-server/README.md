# mword 服务端

JDK 21、Spring Boot 4.1.1、MyBatis-Plus 3.5.17、MySQL 8.4。服务默认监听 `18081`，接口前缀 `/mword-api`。

## 构建与测试

需要 Maven 3.6.3+ 和 JDK 21。项目 `maven-settings.xml` 仅访问官方 Maven Central，依赖保存在本项目 `.mvn/repository/`，不读取其他项目凭据或依赖开发机私有仓库。

```sh
cd mword-server
sh build.sh test package
```

macOS 自动选择已安装的 JDK 21；其他系统可指定 `MW_JAVA_HOME=/path/to/jdk-21 sh build.sh test package`。构建将根目录 `data/books/*.json` 打包到 classpath `books/`，应从完整 mword checkout 构建。

测试使用 H2 MySQL 兼容模式和模拟 AI 响应，涵盖重复同步、迟到事件、账号隔离、跨端确定性复习、阅读确认、提示/曝光区分、并发任务幂等、额度预占/结算/释放、超时恢复、无额度缓存复用、题目/文章检查与 Key 加密。测试不连接真实模型或生产数据库。

## 本地 H2 联调

H2 只在测试依赖及测试 profile 中存在，不打进生产 JAR。数据存在内存中，停服务后清空；worker 默认关闭，避免联调误调用真实模型。

```sh
sh build.sh test-compile spring-boot:test-run \
  -Dspring-boot.run.profiles=test
```

浏览器本地联调 cookie `Secure=false`，仅测试 profile 生效。可通过环境变量显式初始化临时管理员：`MW_ADMIN_USERNAME`、`MW_ADMIN_PASSWORD`。用户名需符合 `[a-zA-Z0-9_]{3,40}`，管理员密码至少12字符且最多72 UTF-8字节。不提供默认生产管理员密码。

测试 profile 的全零加密参数只用于临时H2测试，不可用于生产；真实环境必须设置随机 `MW_KEY_ENCRYPTION_SECRET`。

## 本机持久化开发环境

日常本机使用 `local` profile：同样通过测试classpath加载H2，但数据库写入文件，停服务和重启后账号、会话、设置、学习事件、AI任务与加密供应商配置仍保留。它只监听 `127.0.0.1`，不作为公开服务或手机联网部署方式。生产默认数据库仍是MySQL，生产JAR不包含H2、`application-local.yml`或测试加密参数。

```sh
sh build.sh test-compile spring-boot:test-run -Dspring-boot.run.profiles=local
```

启动前需注入环境：

- `MW_LOCAL_DB_PASSWORD`：必填随机数据库密码，无默认密码。
- `MW_KEY_ENCRYPTION_SECRET`：必填随机32字节Base64密钥，无默认测试零密钥。必须与数据库一起保留，改变它会导致原供应商Key无法解密。
- `MW_LOCAL_DB_URL`：建议由根目录本机launcher设置为项目内的绝对路径；未提供时为 `jdbc:h2:file:./.local/mword;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_ON_EXIT=FALSE`，相对 `mword-server`。
- `MW_AI_WORKER_ENABLED`：local默认 `false`；只有明确设为 `true` 才执行已配置的真实模型请求。
- `MW_ADMIN_USERNAME`、`MW_ADMIN_PASSWORD`：需要管理员时显式设置，没有默认管理员密码。
- `MW_PORT`：默认 `18081`；若已有其他mword服务，换一个未占用端口。

可以用 `openssl rand -base64 32` 分别生成数据库密码和Key加密密钥，并由本机launcher安全保存、每次启动注入。不要把真实值写进此示例、源码或日志。数据库密码及加密密钥应保持一致，不要在每次启动时重新生成。数据库文件关闭时才进行文件备份，勿运行中复制或让两个进程同时打开同一H2文件。

本机cookie明确 `Secure=false`，便于HTTP localhost使用。`local` 与 `test` profile用途不同：`test`内存库退出即清空；`local`文件库用于保留数据。请勿把local profile发布到公网。

## MySQL 部署

创建空的 `mword` 数据库及仅有该库权限的应用用户，通过环境注入 `.env.example` 所列参数。Spring 不自动读取 `.env`；由部署工具、systemd 或 Docker 环境注入。首次启动 Flyway 自动迁移表结构，后续迁移保留用户记录。

```sh
java -jar target/mword-server-0.1.0.jar
```

生产 cookie 默认 `Secure=true`；HTTPS 反向代理必须保留 `/mword-api/` 路径并转发至 `http://127.0.0.1:18081/mword-api/`，不要再次添加或剥离接口前缀。只开放 `/mword-api` 所需端点。API 对响应设置 `Cache-Control: no-store`。CORS 是精确来源名单，使用 `MW_ALLOWED_ORIGINS` 修改；不要设置通配符。

账号密码由 BCrypt 散列保存，随机 opaque session token 只以 SHA-256 保存服务端。Web 使用 HttpOnly、SameSite=Strict cookie；原生使用 Bearer。服务端不接受离线缓存账号作为身份凭证。登录和注册每来源IP窗口限制30次/10分钟，代理前公网限流建议由网关提供（服务不信任任意客户端的 X-Forwarded-For）。

## AI 与额度

供应商配置仅在管理员接口维护。新配置必须提供 API Key；更新留空 Key 保留已加密值。Key 使用 AES-256-GCM，providerId 作为认证附加数据；加密主密钥用 `openssl rand -base64 32` 生成并安全独立保存，轮换需先迁移已存 Key。

供应商 baseUrl 是 OpenAI兼容API基础路径（例如 `https://api.deepseek.com/v1`），客户端自动追加 `/chat/completions`。只允许 HTTPS、443端口与 `MW_PROVIDER_HOSTS` 精确白名单，不跟随重定向。支持按场景选择 enabled、priority最高的配置。模型Key不会返回学习用户或后台配置查询接口。

初始额度默认30点，可配置；EXPLAIN/MEMORY/CONTEXT 默认1点，ARTICLE 默认3点。这些是内部学习额度，非人民币价格。任务创建事务预占，只有结果验证并保存成功才结算；失败/取消/中断超时释放。可用余额与已预占分别展示。管理员额度调整按 requestId 幂等记账。

同 requestId 重试返回原任务，不再次扣额度。EXPLAIN/MEMORY 同账号、上下文、目标词、难度、资料设置的成功结果可缓存复用，即使当前无额度或供应商停用仍可打开；`regenerate=true` 明确重新生成。CONTEXT 每个新 requestId 产生新任务，防止重复原题当作新语境测试。

任务持久化到 MySQL；worker受控串行执行，正常 QUEUED 最长保留24小时，RUNNING 3分钟租期超时释放。重启后 QUEUED 会续跑；中断的 RUNNING 到租期后失败释放，不盲目重复可能已发送的付费模型调用。任务保存创建时的个人资料和选定model快照；排队期间修改兴趣或model不改变这次任务及其cache键。请求使用sendAsync与Future总截止（默认55秒）并在超时时取消，覆盖响应头后body停滞；网络连接超时10秒。模型返回 token 在内容验证前保存，非法结果也保留已报告用量并释放用户预占。网络失败无响应时无法得知供应商实际token或计费，记录0表示未收到报告，不能认为供应商未收费。

AI结果检查JSON结构、字段长度、题目4个不同选项/答案范围以及目标词原形覆盖。尚不能自动证明释义、义项和题目语义完全正确，页面需明确AI辅助并允许用户反馈。系统不让AI修改学习状态。

## 同步与复习

上传事件按账号+eventId去重，冲突的同编号内容返回409；同一账号写事务通过用户行锁保护游标与事件。RECALL/CONTEXT 与 EXPOSURE 分开，曝光不排期。服务端返回账号全量事件历史供客户端重算，cursor为已确认的账号版本。首期不是节省传输的全量历史分页协议，大量长期事件需要后续增加历史快照与分页。

复习规则 `interval-v1` 与客户端一致：按 UTC毫秒与eventId排序，迟到事件加入全量重算；未来超过5分钟的设备时间拒绝，保留队列待校准后重试。用过提示最高按rating2计算；忘记10分钟后重试，困难1天，正常间隔乘2.5，轻松乘3.5，最大365天。该基础规则不冒称FSRS，也不据此宣称已掌握。

## 验证边界

自动测试包含后端集成、排序调度、真实HTTP响应体停滞截止与local文件库两次应用启动的持久化回归；直接JSON请求验证可省略 `regenerate` 并默认 `false`。H2测试profile实际启动后，已通过完整HTTP联调：登录、真实词库、资料保存、阅读确认、重复重放、双设备事件合并、账号隔离、管理员权限、未配置AI不扣额度、单设备退出。运行方式与全部验证边界见根目录 `docs/VALIDATION.md`。

额度终态在user行锁后以task `SELECT FOR UPDATE`重新读取，确保MySQL RR中不会以旧快照同时结算和退款；H2测试覆盖成功、取消、超时释放并发且不破坏其他任务的预占。

自动测试不能替代真实MySQL锁/事务与部署验证、供应商模型契约和教学质量、两台手机离线存储与跨端同步真机验证。项目未读取merchant-copilot的实际Key、未启动或修改该服务，未发布到用户服务器。
