# WorkBuddy 官方与竞对监测

Node.js 20 云函数，部署至 EdgeOne Makers，Blob 持久化。包含官网采集、候选证据、日报、腾讯文档发布、企业微信群推送及独立邮件建议。源码和公开样稿可放 GitHub；密钥、接收地址、原始采集库和私人建议不进仓库。

## 本地验证

```sh
pnpm install
cp .env.example .env
pnpm test
pnpm collect
pnpm report
pnpm doctor
pnpm build
```

`collect/report` 不发消息；本地结果在 `.local/`，共享样稿在 `deliverables/`，私人样稿在忽略目录 `deliverables/private/`。没有模型配置时保守摘录公开业务原文，重点竞对的相关 AI 业务单独标识，不能自动补足缺失日期。最新人工核对样稿为 `deliverables/2026-10-14-preview.html`。

## 云端接入

Git 仓库部署：构建命令 `npm run build`，输出目录 `dist`，Node.js 20。服务端环境变量参见 `.env.example`。`SEND_ENABLED` 默认 false；腾讯文档权限和内容验证通过后才允许群发。私人建议使用另一个 Blob 命名空间。

函数源文件位于根目录 `cloud-functions/`，由 EdgeOne 编译。`dist/` 只含不敏感的服务说明页，不能放服务器配置、源文件或日报。`/api/status` 需要调度凭据，仅返回覆盖与配置缺口，不返回凭据或私人正文。

每日北京时间 07:00—07:03 分四批采集；周一至周五 07:40 补查和整理、08:10 文档发布、08:30 两渠道发送、08:40 检查。定时配置由构建读取 `CRON_SECRET` 生成；必须在控制台确认定时任务被识别，未验证前不得认为云端已开始监测。

详见 [接入与运维](docs/operations.md)、[来源与账号核验](docs/sources.md)、[视频号数据源评估](docs/video-providers.md)。

## 当前边界

视频号账号 ID 和合法数据接口、公众号文章入口、全国搜索 API、腾讯文档 OAuth 和成员权限、企微 Webhook、发信服务均需实际接通并验收；配置缺失会显示“尚未接通”。首轮官网抓取不是完整的近30天历史回填。付费服务默认关闭，无自动采购。五工作日试运行需要真实连续执行记录。

## 发送一致性

以日期、渠道、版本记录发送前状态；确认成功不重复，明确拒绝可补发，超时或中断标记未知并人工核查。Blob 强一致读取不等于原子锁：同一发送任务必须只有一个调度者，不能并行手动调用。若需要跨实例严格一次投递，应另接支持原子事务的状态库；目前不得声称具备该保证。
