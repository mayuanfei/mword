# mword 首版发布包

此包包含可部署的Web静态页面、Spring Boot可执行JAR、配置示例和来源授权。它不包含数据库、模型Key、用户数据、手机签名或APK/IPA，打包成功不代表已经部署。

## 目录与校验

```text
web/                        放到 /var/www/mword/ 的页面内容
server/mword-server-0.1.0.jar JDK 21 可执行后台，正式运行使用MySQL
server/configuration.example 所有敏感字段为空的环境配置示例
deploy/                     Nginx片段与systemd模板
docs/                       产品、接口、部署、验证与手机构建说明
data/                       词库、质量说明和授权文件
manifest.json               文件版本、大小、SHA-256及产物检查结果
SHA256SUMS                  逐文件校验和
```

解压后进入包目录，Linux执行 `sha256sum -c SHA256SUMS`，macOS执行 `shasum -a 256 -c SHA256SUMS`。传输归档另有 `.tar.gz.sha256`，可核对整包是否完整。manifest不包含真实凭据或开发机配置。

## 部署

1. 在服务器安装JDK 21和MySQL，创建独立mword数据库及专用用户；数据库使用InnoDB、utf8mb4及 `utf8mb4_bin`，保持事件编号区分大小写。
2. 将 `server/mword-server-0.1.0.jar` 放到 `/opt/mword/mword-server-0.1.0.jar`，使用专用mword服务账号。
3. 参考 `server/configuration.example` 创建 `/etc/mword/mword.env`，填入服务器数据库、随机32字节Base64加密主密钥及管理员初始化信息。文件权限600，仅服务账号读取；这不是完整配置，不填敏感字段不能正常启动。按systemd EnvironmentFile格式填写，不把未经引号处理的示例文件直接当shell脚本执行。
4. 将 `web/` 内容放到 `/var/www/mword/`，页面访问路径 `/mword/`，后台路径 `/mword-api`。
5. 合并 `deploy/nginx-mword.conf` 到既有域名HTTPS站点，先执行 `nginx -t`；勿覆盖 `/copilot` 或整个站点配置。按实际服务器路径检查systemd模板后安装和启动。
6. 登录管理员后台录入供应商，先验证小额请求、额度结算和同步，再开放用户注册。

更详细的环境变量、备份及验证边界见 `docs/DEPLOYMENT.md` 和 `docs/VALIDATION.md`。数据与加密主密钥必须一起备份，发布包中的词库数据不能代替用户数据库备份。

## 从源码生成此包

在完整源码项目根目录执行：

```sh
cd mword-client
npm run build
cd ../mword-server
sh build.sh test package
cd ..
python3 tools/package_release.py --dry-run
python3 tools/package_release.py
```

输出为 `.cache/releases/mword-0.1.0.tar.gz`。脚本只打包白名单产物；正式JAR含H2、本机/test profile、示例含真实密码、产物缺失或词库不一致时会拒绝。它不调用服务器、不上传、不自动安装或修改Nginx。

Android与iOS工程在源码 `mword-client/android`、`mword-client/ios` 中，通过Capacitor共用页面；本发布包只交付Web和后台产物。完整SDK、签名和真机安装仍按 `docs/MOBILE_BUILD.md` 独立完成。
