# Financial Summary 当前架构

## 目标与技术

React 19 + TypeScript + Vite 的个人收支与资产网站，Firebase Auth 负责 Google 登录，Cloud Firestore 保存个人账本。中文界面，默认 USD。

## 三个独立工作区

- **本地**：浏览器 localStorage；首次为空，刷新后保留。清除站点数据会删除本地账本。
- **演示**：虚构示例只保存于内存，离开即丢弃修改，不触碰其他工作区。
- **云端**：登录后访问当前用户路径；错误会显示，不会退回本地或自动迁移数据。

`FinanceRepository` 统一提供订阅、保存、删除与导入接口。React 在工作区或 UID 改变时卸载旧工作区并清理订阅，异步过期回调被忽略。

## 已实现的数据模型

完整类型位于 `src/types/finance.ts`。

```text
users/{uid}/transactions/{id}
  id, date, merchant, amountCents, type, category,
  accountId, note, source, createdAt, updatedAt

users/{uid}/accounts/{id}
  id, name, type, balanceCents, currency, updatedAt

users/{uid}/recurring_payments/{id}
  id, name, category, amountCents, frequency, nextDueDate,
  endDate?, type?, autoPost?, lastPostedDate?,
  accountId, autoPay, active, createdAt, updatedAt

config/access
  ownerUid  （仅由控制台管理员设置）
```

金额是整数美分；交易/计划金额为正数，账户余额非负，信用卡/贷款的正余额代表负债。日期是本地日历 `YYYY-MM-DD`，创建/更新时间为 ISO UTC 字符串。UID 和文档字段均由服务端规则校验；管理员配置文档对客户端不可读写。

交易类型为 `income`、`expense`、`refund`、`transfer`。`source` 支持 `manual` / `csv` / `recurring` / `pdf`，分别标记手动录入、预留的 CSV 来源、固定收入自动生成或 Chase PDF 导入；当前界面支持 CSV 导出，CSV 导入尚未实现。`accountId` 可以为空，表示未指定。删除被记录或计划引用的账户会被阻止，需先更改引用。

## 汇总口径

- 按交易发生日期所在的日历月汇总。
- 收入合计 `income + refund`；支出只合计 `expense`；结余为收入减支出。退款保留独立类型，方便筛选。
- 转账和信用卡还款选择 `transfer`，不重复进入收支统计。
- 资产合计非信用卡/贷款账户的当前余额；负债合计信用卡/贷款；净资产为资产减负债。
- 手动交易、导入与自动收入不更新账户余额。固定支出显式开启 autoPost 后更新余额；主页仅显示月度收支和结余，净资产保留在账户页。
- 固定收入与支出计划分开计算预计月均：月付 + 周付×52/12 + 季付/3 + 年付/12，汇总后取整数美分。旧计划缺失 `type` 时按支出读取。
- 计划日期按首次日期与频率自动向前计算；月付保留原始几号，目标月没有该日则使用月末。未开启 autoPost 的计划仍需手动记账；旧 autoPay 只表示银行自动付款标记。
- 固定收入计划 `autoPost=true` 时，客户端打开账本会补记截至今天的到期收入。每期使用计划 ID 与日期生成固定交易 ID；本地保存一次更新记录及计划进度，Firestore 使用事务同时写入。`lastPostedDate` 记录已处理到的最后一期，因此删除某月自动交易不会再生。每轮最多处理 8 期并持续补记至今；保存计划时使用最新的进度，避免旧表单覆盖。编辑计划金额只影响未来生成的月份，已生成交易保持原值；已有自动记录后锁定类型、频率和首次日期，调整日程需停用旧计划并新建。
- 为兼容旧数据，`nextDueDate` 字段保留名称，语义为固定的首次收支日；可选 `endDate` 缺失或空字符串表示长期持续。结束当天有效，之后从预算和待付款中排除，保留计划用于查看和编辑。预算为当前启用且未结束计划的平均月预算（包含尚未开始的计划），不随总览历史月份切换。

汇总从原始记录即时计算。本版暂不写入 `monthly_summaries` 缓存和 `net_worth_history` 快照，避免客户端缓存与明细不同步。

## 访问边界

Firestore 仅允许以下条件全部成立的请求：已登录、路径 UID 与登录 UID 相同、登录 UID 等于 `config/access.ownerUid`。客户端不能创建或修改 owner 配置。规则拒绝未知集合、未知字段、无效金额与枚举等。

云端写入等待 Firebase 确认。订阅等待三个集合都获得有效快照后展示，未确认写入不会先被展示成已保存。SDK 缓存不使用持久化磁盘缓存。

Firebase Web 配置是公开应用配置；不使用 Admin SDK 或服务账号私钥。文件中的规则需部署至用户项目才会生效。用户项目已经创建、个人账号绑定并发布规则；固定收入与 PDF 来源校验的云端规则已在个人账号控制台发布。

## Chase PDF 导入

PDF.js 在浏览器读取文字与坐标并重建行，纯解析器识别账期、卡号末四位及活动明细，再用消费和付款/退款摘要核对总额。货币换算注释、年内累计及利息表不作为额外交易。缺页、无法核对、扫描、加密及非零费用/利息/现金预借/余额转移账单拒绝导入。文件限制为 20 MB、40 页。

预览可修改日期、商户、类型、分类和金额，以及逐条排除；必须明确选择信用卡账户再确认。原始日期决定记录月份，退款计入收入，还款为转账，账户余额不变。仅确认后的明细保存，原 PDF、全文及原始账号不上传；交易备注保留结账日、来源页和原商户。

去重 ID 为卡号末四位、结账日、原始交易日期、规范化商户、带符号金额及相同交易出现序号的 SHA-256。重命名文件和预览编辑不改变 ID；已有 ID 跨账户跳过且保留原记录修改。与非 PDF 记录精确匹配的疑似重复默认不选中，用户可选择保留。

本地导入单次更新全部新增记录。Firestore 按每批 8 笔事务读取存在性后仅写入缺失记录；失败提示已完成批次的新增/跳过数量，可按相同 ID 重试。未上传原 PDF，因此不需要 Storage、AI 服务或新密钥。

## 模块

- `src/lib/finance.ts`：纯财务计算、导出和数据校验。
- `src/lib/repository.ts`：本地、内存、Firestore 存取。
- `src/lib/firebase.ts`：公开配置与按需 SDK 初始化。
- `src/features/auth/useAuth.ts`：Google 登录状态。
- `src/features/import/`：PDF 文字重建、Chase 对账、稳定去重与预览确认。
- `src/features/workspace/`：总览、记录/账户/计划、表单与连接设置。
- `src/app/App.tsx`：工作区生命周期、导航、交互协调。
- `firestore.rules`：个人所有者访问与数据形状校验。

本地设置见 `README.md`，Firebase 接入步骤见 `FIREBASE_SETUP.md`。

## 本地多标签页

保存时重新读取最新数据，在支持 Web Locks 的现代浏览器中串行写入；storage 事件触发重新读取，避免延迟事件覆盖较新的显示。无 Web Locks 的旧浏览器仅能做写前冲突检查，不保证同时写入的原子性，应只使用一个标签页。

每条金额上限为 100,000,000,000 美分（10 亿美元），并对整个工作区的绝对金额及周期计划年化总额做整数安全范围校验，避免溢出导致页面崩溃。

## 固定支出自动扣账（2026-09-29）

收入和支出共用到期日期与进度计算，postDueRecurring 每轮每项最多补记 8 期。expense + autoPost=true 必须指定扣款账户：现金余额减去本轮新增记录金额；credit 欠款增加；loan 不允许作为扣款账户。既有记录通过确定 ID 跳过，不再次扣账；结束日期包含当天、停用不执行。每项计划的记录、账户与 lastPostedDate 一起提交；资金不足时本轮该项补记全部不执行，已完成的历史批次保留；错误携带本轮成功处理的期数，客户端持续处理尚未完成的其他计划，直至无进展。自动扣账失败独立于账本读取错误显示，用户仍可编辑账户或停用计划。账户表单保存携带打开时的余额，本地锁/云端事务会拒绝覆盖已变更的余额。删除或修改已扣账的记录不自动反向调整余额。客户端打开、刷新或数据变化时检查；无后台定时服务，也不连接真实银行付款。
