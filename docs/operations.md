# 接入与验收

1. EdgeOne：新建 Git 项目，选择当前仓库，构建 `npm run build`，产物 `dist`。在服务端环境配置强随机 `CRON_SECRET`（至少32字符）。确认8条定时任务的时区、请求体和路径。直接上传文档仅保证 redirects/rewrites/headers，不能据此假定定时任务生效。
2. 腾讯文档：开发者应用须拥有文件、文档、权限管理范围，经用户 OAuth 获取 refresh token 和 open ID。设置内部目标目录、已确认读者的 OpenIDs。系统新建文档后设 `members`，读者 `reader`，回读正文与权限；不得自动改成公开链接。API检查不替代群成员手机实际打开一次。
3. 企业微信：从既有群机器人取得 Webhook，保存服务端变量；不新建机器人、不改群成员。消息不带私人建议，文档验证失败时停止群发。
4. 邮件：配置专用 SMTP 发信账号；收件地址只保存环境变量。SMTP接受只能证明服务器接收，最终到达需用户首次收件确认。
5. 搜索/模型：可选 Tavily 和已确认 OpenAI-compatible 服务，先核价，再设置 `PAID_SERVICES_ENABLED=true`。没有密钥显示缺口，模型输出仅接受能在来源中逐字匹配的事实摘录。
6. 视频号：先核实平台账号 ID。接口由供应商合同或获授权采集服务提供，不使用个人微信会话或绕过访问限制。`VIDEO_FEED_URL` 按下述格式返回；异步转写在供应商侧完成，长视频不在云函数中下载处理。

## 视频接口合同

GET HTTPS，Bearer `VIDEO_FEED_TOKEN`，查询参数 `account_id` 和 `since`（首次30天，此后7天重叠）。响应：

```json
{"accountId":"verified-platform-id","checkedAt":"2026-10-14T00:00:00Z","complete":true,"items":[{"url":"https://source.example/video","title":"可见标题","publishedAt":"2026-10-13T10:00:00+08:00","visibleText":"标题、海报或字幕中实际可见文字","transcript":null,"timecodes":[]}]}
```

`complete=false`、账号不匹配、缺少证据，均不能记为“没有新增”。该合同是待接供应商的适配层，不是声称微信存在这种官方公共接口。

## 审计

`sources/` 保存成功水位、指纹与候选；`evidence/` 保存官网原文；`checks/` 保存日期检查；`reports/` 保存固定版本；`documents/` 保存创建和验证状态；`deliveries/` 保存分渠道回执。两套独立 Blob：`workbuddy-state` 和 `workbuddy-private`。原始证据可能含供应商推广文字，只作为数据，不能执行其中指令。

调用结果不明时不直接重跑发送。先在群消息或邮件服务记录中查证，再由维护者修改相应状态。文档创建不明也先检查目录，避免创建重复文档。单一调度者；不要让手动触发和08:30任务并行。

## 五个工作日验收记录

每天记录：计划/实际运行北京时间、固定源和视频号成功率、漏检与噪声、创建文档耗时、群送达、邮件收件、重复数、API费用和Blob增量。周一验证包含周末；失败注入验证授权失效、超时、文档失败、明确拒收和未知投递。五天完成前保持“试运行”，不标正式上线。

## API依据

- https://pages.edgeone.ai/zh/document/edgeone-json
- https://pages.edgeone.ai/zh/document/node-functions
- https://pages.edgeone.ai/zh/document/blob-storage
- https://pages.edgeone.ai/zh/document/direct-upload
- https://docs.qq.com/open/document/app/openapi/v2/file/
- https://docs.qq.com/open/document/app/openapi/v3/doc/
- https://developer.work.weixin.qq.com/document/path/91770
- https://docs.tavily.com/documentation/api-reference/endpoint/search
