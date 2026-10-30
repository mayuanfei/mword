# mword 接口约定

接口前缀 `/mword-api`，直接返回 JSON，错误统一 `{code,message}`。
Web 通过 HttpOnly Cookie 恢复登录；原生使用 Bearer Token。模型密钥只出现在管理员提交请求中，任何响应均不返回 Key。

## 登录与基础资料

- `POST /auth/register`、`POST /auth/login`：`{username,password}` → `{token,user,expiresAt}`。
- `POST /auth/logout`；`GET /me`；`PUT /me/profile`。
- `GET /books` → 预设词库及实际数量；`GET /books/{id}/words` → 当前词库词条。
- `GET /articles`；`POST /articles`（用户粘贴）；`GET /articles/{id}`。

## 学习同步

`POST /sync` 请求：`{cursor,deviceId,events,readingEvents}`。
响应：`{cursor,acceptedEventIds,acceptedReadingEventIds,events,readingEvents,states,profile,articles,serverTime,schedulerVersion}`。
客户端上传未确认事件，服务端返回当前账号完整事件投影。未确认事件与服务端记录按 eventId 合并；恢复过程中不得覆盖同步请求之后新产生的本地记录。
首次实现采用明确版本的确定性间隔调度 `interval-v1`，不宣称已经采用 FSRS。客户端和服务端用同一组用例核对结果。

## AI 与额度

- `POST /ai/tasks`：`{requestId,scene,wordId?,senseId?,context?,difficulty?,targetWordIds?,regenerate?}`；省略 `regenerate` 等同 `false`。
- `GET /ai/tasks`、`GET /ai/tasks/{id}`；`GET /ai/quota`。
- `scene`：`EXPLAIN/MEMORY/CONTEXT/ARTICLE`。任务状态：`QUEUED/RUNNING/SUCCEEDED/FAILED`。
- 任务 result 为按场景验证后的 JSON 字符串，ARTICLE 成功后存入文章库。
- 消耗的是后台分配的测试额度，第一版不接实际支付。请求幂等，先预占、成功结算、失败释放。

## 管理端

- `/admin/providers` 列表、创建；`/admin/providers/{id}` 更新、删除。支持场景与优先级配置。
- `/admin/users`；`POST /admin/users/{id}/quota`：`{requestId,amount,reason}`。
- `/admin/usage`、`/admin/tasks`。

完整客户端类型见 `mword-client/src/lib/types.ts`，实施过程中与后端 DTO 联合验证。
