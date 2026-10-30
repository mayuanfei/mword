# 云 MySQL 接入

2026-10-12，已在用户授权的云MySQL中创建独立 `mword` 数据库，通过正式JAR的Flyway初始化表结构。数据库版本为MySQL 8.0.27，使用InnoDB、utf8mb4及 `utf8mb4_bin`，保持事件编号、请求编号等精确区分大小写。

运行账号为 `mword_app`，仅授予 `mword.*` 的 SELECT、INSERT、UPDATE、DELETE、CREATE、ALTER、INDEX、REFERENCES，不授予全局权限或GRANT OPTION。账号要求SSL，JDBC使用 `sslMode=REQUIRED`；实际连接确认协商TLS。建库时临时使用数据库root，程序运行不使用root。

## 启动程序

在项目根目录执行：

```sh
python3 tools/run_mysql.py --check
python3 tools/run_mysql.py --web
```

云库版本页面：[http://127.0.0.1:5174/mword/](http://127.0.0.1:5174/mword/)，后台端口18084。这是本机运行、数据写入云MySQL的程序，还没有部署到域名。

配置位于 `.cache/mysql/config.json`，目录权限700、文件权限600，不进入代码库或发布包。配置包含数据库地址、专用程序用户口令、模型Key加密主密钥和应用管理员初始化信息。管理员账号为 `mword_admin`；密码在这份受保护文件的 `adminPassword` 字段，不在文档、源码或日志中回显。

AI worker默认关闭。配置真实模型后，如需处理AI任务可用 `python3 tools/run_mysql.py --web --enable-ai` 启动，可能产生供应商费用。按Ctrl+C、SIGTERM或SIGHUP仅停止本次启动的进程，云数据库数据保留。启动器不会加载H2的local/test profile，也不会停止旧的本机开发服务。

原来的 `python3 tools/dev.py` 和5173页面仍使用独立的本机H2库。它们的已有学习记录保留，首版没有从H2自动迁入云MySQL的工具。需要云库时使用本页的命令和5174地址。

## 当前表结构

| 表 | 用途 |
| --- | --- |
| mw_user | 账号、个人资料、学习额度与同步游标 |
| mw_session | 登录会话 |
| mw_review_event | 回忆、语境练习和查词事件 |
| mw_reading_event | 阅读进度及完成事件 |
| mw_article | 用户文章和AI生成文章 |
| mw_ai_provider | 服务商配置及加密模型Key |
| mw_ai_task | 持久化AI任务与用量 |
| mw_ai_request | AI请求幂等映射 |
| mw_quota_ledger | 额度预占、结算、释放及调整流水 |
| flyway_schema_history | 表结构迁移历史 |

三套预设词书目前是可追溯来源的只读JSON资源，随JAR发布，不额外建立词库管理表。

## 实际验证

云库已通过真实HTTP验证：Cookie登录、三套词库、资料保存、文章隔离、阅读与单词事件同步、重复重放、跨设备恢复及单设备注销。20个并发同requestId请求只建立1个任务并预占1点；剩余2点时5个不同请求恰好2个成功、3个返回额度不足；并发重复取消只释放一次。数据库流水核对通过。

这些检查使用确切标记的临时账号与无效测试Key，worker关闭，没有实际模型调用。检查后临时账号、任务、文章、事件、流水和假供应商均精确清理，管理员保留。临时root凭据文件已删除，程序只保留受保护的专用账号配置。

验证脚本 `tools/verify_mysql_http.py` 是操作者使用的检查工具，必须显式选择 `--basic-only` 或 `--allow-queued-tests`。它不会自行清理数据库，会记录确切测试ID供独立清理；不要在开始承载真实用户的服务中未经隔离重跑队列测试，也不要把整套H2集成测试直接指向云库。

## 后续服务器部署

创建库和当前本机接入不需要SSH。将Web和后台部署到 `mayuanfei.com` 时，需要服务器SSH地址、端口、登录用户及认证方式，以及当前Nginx站点配置/应用目录。届时使用同一专用数据库账号和同一加密主密钥，通过服务器受保护环境文件注入；不能重新生成主密钥替换已经用于加密供应商Key的值。

本机启动器的HTTP Cookie设置仅用于本机联调。服务器HTTPS部署保持 `MW_SECURE_COOKIE=true`，采用 `DEPLOYMENT.md` 的反向代理配置，勿直接暴露本机开发服务器。
