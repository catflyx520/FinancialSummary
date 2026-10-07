# Financial Summary

用 React + TypeScript + Firebase 构建的个人财务网站。现在可以直接使用本地账本，也可以配置 Firebase 后登录并使用独立的云端账本。

## 已实现

- 按月查看收入、支出、结余，以及最近六个月趋势和支出分类。
- 收支记录新增、编辑、删除、分类筛选、搜索和 CSV 导出。
- 退款计入收入；转账和信用卡还款不重复计入收入/支出。
- 银行、储蓄、投资、退休、信用卡和贷款账户；显示资产、负债和净资产。
- 工资、房租、车贷、保险与订阅等固定收支计划，支持周付/月付/季付/年付；按首次日期自动计算下一次日期，可设置结束日期。收入计划可开启自动记账；支出计划可开启「自动扣账并记账」：打开或刷新账本后补记到期收支，每期一次。自动支出扣减所选现金账户余额，信用卡增加欠款；现金余额不足、账户缺失或贷款账户不会写入。旧计划的自动付款标记不触发记账，需手动开启新选项。已有自动记录的计划可以修改金额，类型、频率和首次日期锁定；如需调整这些设置，停用旧计划并新建计划。
- Google 登录，Firestore 数据订阅和读写，限定个人 UID 的访问规则。
- 独立本地、演示、云端工作区。演示数据是虚构数据，仅保留在内存。
- 中文界面，支持桌面和手机布局。

所有金额以 **USD 整数美分**保存。本地数据只存当前浏览器，不会自动同步或迁移至 Firebase。账户余额是当前快照，手动记录、PDF 导入和自动收入不修改余额；固定支出开启自动扣账后，同次保存支出记录、账户余额与计划进度。未开启自动记账的计划需自行记录。修改或删除已生成的支出记录不反向调整余额。

## 本地运行

要求 Node.js 20.19+（当前环境为 20.20.2）。

```sh
npm install
npm run dev
```

打开终端显示的本地地址。未配置 Firebase 时直接进入本地账本。点击「查看演示」可预览虚构示例；返回时不会把示例写入账本。

## 接入 Firebase

具体步骤见 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)。前端只需公开的 Web 应用配置，填入 `.env.local`：

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

另需开启 Google 登录、创建 Firestore 数据库，在受保护的 `config/access` 文档中设置自己的 `ownerUid`，并发布本项目的 `firestore.rules`。修改环境变量后重启开发服务器。

当前功能不依赖 Firebase Storage。**不要把服务账号 JSON、Admin SDK 私钥或第三方私钥放进前端。** `.env.local` 已加入忽略列表。Firestore rules must be deployed separately for the Firebase project you configure.

## 验证命令

```sh
npm test -- --run
npm run build
npm run lint
npm run test:rules # 使用本地 Firestore 模拟器，需要 Java 21+
```

## 下一阶段

Chase 文字型信用卡 PDF 导入已实现：收支明细 → 导入 Chase PDF → 选择信用卡账户 → 核对并修正 → 确认导入。可编辑日期、名称、类型、分类、金额并排除交易；已导入记录跳过，疑似手动重复默认不选中。每笔按交易日期归入月份，账户余额不会自动修改。退款计入收入，还款记为转账。PDF 在浏览器本地读取，仅确认后的交易入库，不上传原始 PDF。支持单份非加密月结账单，最多 20 MB / 40 页；目前非零费用、利息、现金预借、余额转移或无法对账的账单会阻止导入。扫描 PDF/OCR、云端原文件保存、月末净资产历史和本地/云端数据迁移均未包含在当前版本。

数据结构与规则说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
