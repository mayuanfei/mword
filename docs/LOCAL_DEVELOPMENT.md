# 本机持久化体验

在项目根目录执行：

```sh
python3 tools/dev.py --check
python3 tools/dev.py
```

脚本启动仅监听本机的文件H2后台与Vite开发页面。默认后台端口18083，页面为 [http://127.0.0.1:5173/mword/](http://127.0.0.1:5173/mword/)。端口已占用时会退出并提示，不终止已有程序。可用 `--api-port 18084 --web-port 5174` 改端口。原来的18081内存联调服务独立保留，这两个数据库不自动迁移。

首次运行需要已安装Node、npm、Maven、JDK 21，以及 `mword-client` 中执行过 `npm ci`。后台构建脚本在macOS选择已安装JDK 21，依赖使用项目独立Maven Central配置。首次依赖下载可能需要等待；日志分别保存在 `.cache/local/backend.log` 和 `.cache/local/web.log`。

终端按Ctrl+C结束本次启动的后台和页面进程。再次执行同一命令，账号、学习资料、记录和额度都会保留。数据库在 `.cache/local/database/`，随机密钥和数据库口令在 `.cache/local/config.json`；必须一起备份。目录权限为700，配置文件为600，不提交代码，也不进入发布包。丢失配置后不要删除数据库再生成配置，应先恢复备份，避免失去已加密模型配置。

这是本机开发环境，生产仍使用MySQL。H2依赖与 `application-local.yml` 只在test classpath使用，正式JAR不包含它们。本机Cookie为HTTP联调关闭Secure，后台仅绑定127.0.0.1，不能用此方式向公网部署。

## 管理员与真实AI

脚本不提供默认管理员密码。需要本机管理账号时，在自己的终端设置以下两个环境变量，再启动；密码不要提交或发送到聊天中：

```sh
export MW_ADMIN_USERNAME='你选择的管理员账号'
export MW_ADMIN_PASSWORD='你自己设置的强密码'
python3 tools/dev.py
```

账号使用3–40位字母、数字或下划线；管理员密码至少12字符，最多72个UTF-8字节。这是服务端启动初始化，不会把已存在的普通账号静默提升为管理员，也不会自动重置已有账号密码。

AI worker默认关闭，可以先查看页面、词库、样文、回忆和同步。录入本机供应商后，按Ctrl+C停止，再执行：

```sh
python3 tools/dev.py --enable-ai
```

此时才处理队列并实际调用已配置模型，可能产生供应商费用。模型Key在后台页面维护，不读取merchant-copilot的配置或Key。数据库中的Key由本机随机主密钥加密；不要把本机主密钥或测试配置用于服务器。

## 联调检查

服务启动后在另一个终端执行：

```sh
python3 tools/smoke_test.py http://127.0.0.1:18083/mword-api
```

脚本会创建随机测试账号，验证登录、资料、词库、阅读、记录幂等和双设备同步。它假定AI尚未配置，不能在启用真实模型的环境直接作为无费用验证使用。需要清理测试数据时优先使用独立测试数据库，勿删除已有学习数据库。
