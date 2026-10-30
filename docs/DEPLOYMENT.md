# 部署到 mayuanfei.com

前端使用 `/mword/`，后端使用 `/mword-api`。这两个路径可与既有 `/copilot` 应用并存。使用独立数据库、进程、环境变量和日志目录。

## 1. 后台配置

创建使用InnoDB、utf8mb4及二进制排序规则的 MySQL 数据库 `mword` 和专用数据库用户。新库可用 `CREATE DATABASE mword CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`，已有库先检查实际表结构及迁移历史，不重复初始化。二进制排序规则让事件和请求编号区分大小写，保持客户端幂等约定。按 `mword-server/.env.example` 设置数据库连接、管理员初始化信息和密钥加密材料。生产必须设置 `MW_SECURE_COOKIE=true`，管理员密码至少 12 位。

使用已构建发布包时，环境示例位于 `server/configuration.example`，Web产物位于 `web/`，JAR位于 `server/`，无需在服务器重新构建。包内所有凭证字段为空，需自行填写；布局及校验方式见 `RELEASE_PACKAGE.md`。

`MW_KEY_ENCRYPTION_SECRET` 是 32 字节随机密钥的 Base64，可用 `openssl rand -base64 32` 生成。妥善备份数据库和这份密钥；更换密钥后，旧的模型密钥密文无法解开，需重新录入。不要将真实 `.env` 或密钥提交到代码库。

在项目根目录构建后端资源（Maven 会读取 `data/books`）：

```sh
cd mword-server
sh build.sh clean package
java -jar target/mword-server-0.1.0.jar
```

示例 systemd 单元见 `deploy/mword.service`。环境文件存放在服务器 `/etc/mword/mword.env`，由服务账号读取；设置权限 `600`。默认监听端口 `18081`，无需向公网直接开放。

## 2. 前端构建

```sh
cd mword-client
npm ci
npm run build
```

把 `dist` 内容放到 `/var/www/mword/`。合并 `deploy/nginx-mword.conf` 的两个 location 到既有域名的 HTTPS server 中，然后执行 `nginx -t`。这是合并片段，不要用它覆盖整份站点配置。

`/mword/` 下的 HTML 和 service worker 应及时更新，带哈希的静态资源可长缓存。API 不能被 CDN、service worker 或反向代理缓存。前端 service worker 仅缓存应用外壳，学习记录按账号存入 IndexedDB。

## 3. 初始化模型与额度

通过管理员账号登录“我的空间 → 后台管理”。录入支持 OpenAI 兼容 chat completions 接口的服务商 URL、模型和 API Key，分配难词讲解、记忆辅助、新语境、文章的使用场景。新服务商域名需在 `MW_PROVIDER_HOSTS` 中显式允许。

管理员页面不回显密钥；编辑时留空会保留现有密钥。确认小额测试请求成功后，再调整用户额度。额度和 token 使用记录由服务器记账，第一版没有充值入口。

## 4. 上线前实测

用两个账号核对数据隔离，用同一账号在两个浏览器和手机之间核对同步。测试断网学习、重连补传、模型超时与额度释放、重复提交幂等，并执行 MySQL 备份恢复。迁移执行成功和单元测试通过不能代替这些实际环境验证。

服务器回退到旧备份时，客户端按原设备分别重新上传保留的学习事件。文章需要同时从备份恢复；若备份缺少某篇文章，客户端会保留其正文和阅读记录，并隔离相关阅读记录，其余阅读及单词回忆可继续补传。文章在服务器恢复后，点击同步会继续提交保留的记录。首版没有自动重建丢失文章的恢复接口。

暂未接入邮箱找回密码、账号注销、实际支付及商店内购。公开上架前需要补齐账号服务、用户协议、隐私政策，以及实际使用模型服务商的信息与数据处理说明。
