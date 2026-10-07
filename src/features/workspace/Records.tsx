import { useState } from 'react'
import type {
  Account,
  FinanceData,
  RecurringPayment,
  Transaction,
} from '../../types/finance'
import {
  accountTypes,
  categories,
  formatMoney,
  frequencies,
  localDate,
  monthlyRecurringCents,
  isRecurringActive,
  upcomingRecurringDate,
  summarizeAccounts,
  transactionsCsv,
  transactionTypes,
} from '../../lib/finance'
import { Icon } from '../../components/Icon'

export function TransactionTable({
  transactions,
  accounts,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[]
  accounts: Account[]
  onEdit: (t: Transaction) => void
  onDelete?: (t: Transaction) => void
}) {
  if (!transactions.length)
    return (
      <div className="empty-state">
        <Icon name="transactions" size={32} />
        <p>还没有符合条件的记录</p>
        <span>添加一笔收入或消费，开始整理你的财务。</span>
      </div>
    )
  return (
    <div className="table-scroll">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>名称 / 分类</th>
            <th>日期</th>
            <th>账户</th>
            <th className="amount-cell">金额</th>
            <th>
              <span className="sr-only">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const category = categories.find((c) => c.id === t.category)
            const incoming = t.type === 'income' || t.type === 'refund'
            return (
              <tr key={t.id}>
                <td>
                  <div className="merchant-cell">
                    <span
                      className={`transaction-symbol ${incoming ? 'incoming' : ''}`}
                    >
                      {t.type === 'transfer' ? '⇄' : incoming ? '↙' : '↗'}
                    </span>
                    <span>
                      <strong>{t.merchant}</strong>
                      <small>
                        {transactionTypes[t.type]} ·{' '}
                        {category?.label ?? t.category}
                        {t.source === 'recurring' && ' · 自动记账'}
                        {t.source === 'pdf' && ' · PDF 导入'}
                        {t.note && <span title={t.note}> · {t.note}</span>}
                      </small>
                    </span>
                  </div>
                </td>
                <td className="nowrap">{t.date}</td>
                <td>
                  {accounts.find((a) => a.id === t.accountId)?.name ??
                    (t.accountId ? '已移除账户' : '未指定')}
                </td>
                <td className={`amount-cell ${incoming ? 'positive' : ''}`}>
                  {t.type === 'transfer' ? '' : incoming ? '+' : '−'}
                  {formatMoney(t.amountCents)}
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`编辑 ${t.merchant}`}
                      onClick={() => onEdit(t)}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    {onDelete && (
                      <button
                        className="icon-button danger-hover"
                        aria-label={`删除 ${t.merchant}`}
                        onClick={() => onDelete(t)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Transactions({
  data,
  month,
  onEdit,
  onDelete,
  onImport,
}: {
  data: FinanceData
  month: string
  onEdit: (t: Transaction) => void
  onDelete: (t: Transaction) => void
  onImport: () => void
}) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [category, setCategory] = useState('all')
  const records = data.transactions
    .filter(
      (t) =>
        t.date.startsWith(month) &&
        (type === 'all' || t.type === type) &&
        (category === 'all' || t.category === category) &&
        `${t.merchant} ${t.note}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )
  function download() {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', transactionsCsv(records)], { type: 'text/csv;charset=utf-8' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-summary-${month}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="panel records-panel">
      <div className="filters">
        <button className="button button-primary" onClick={onImport}>导入 Chase PDF</button>
        <input
          className="search-input"
          aria-label="搜索收支"
          placeholder="搜索商户或备注…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="筛选类型"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">全部类型</option>
          {Object.entries(transactionTypes).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="筛选分类"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          className="button button-quiet"
          onClick={download}
          disabled={!records.length}
        >
          <Icon name="download" size={16} />
          导出 CSV
        </button>
      </div>
      <div className="records-count">
        {month} · {records.length} 笔记录<span>金额均为 USD</span>
      </div>
      <TransactionTable
        transactions={records}
        accounts={data.accounts}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <p className="panel-footnote">
        转账与信用卡还款请选择「转账」；退款请选择「退款（收入）」，会计入收入。
      </p>
    </section>
  )
}

export function Accounts({
  data,
  onEdit,
  onDelete,
}: {
  data: FinanceData
  onEdit: (a: Account) => void
  onDelete: (a: Account) => void
}) {
  const summary = summarizeAccounts(data.accounts)
  return (
    <>
      <div className="balance-strip">
        <div>
          <span>资产总额</span>
          <strong>{formatMoney(summary.assetsCents)}</strong>
        </div>
        <div>
          <span>负债总额</span>
          <strong>{formatMoney(summary.liabilitiesCents)}</strong>
        </div>
        <div>
          <span>当前净资产</span>
          <strong className="positive">
            {formatMoney(summary.netWorthCents)}
          </strong>
        </div>
      </div>
      <div className="info-note">
        <Icon name="accounts" size={18} />
        <span>
          手动记录、导入和自动收入不会改变余额；固定支出开启自动扣账后会更新余额。信用卡和贷款请输入尚欠金额。
        </span>
      </div>
      {data.accounts.length ? (
        <div className="accounts-grid">
          {data.accounts.map((a) => (
            <article
              className={`panel account-card ${a.type === 'credit' || a.type === 'loan' ? 'debt-card' : ''}`}
              key={a.id}
            >
              <div className="panel-heading">
                <span className="account-symbol">
                  <Icon name="accounts" size={24} />
                </span>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={`编辑 ${a.name}`}
                    onClick={() => onEdit(a)}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="icon-button danger-hover"
                    aria-label={`删除 ${a.name}`}
                    onClick={() => onDelete(a)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
              <h2>{a.name}</h2>
              <p className="subtle">{accountTypes[a.type]} · USD</p>
              <strong className="account-balance">
                {formatMoney(a.balanceCents)}
              </strong>
              <p className="field-note">
                {a.type === 'credit' || a.type === 'loan'
                  ? '待偿还余额'
                  : '账户余额'}{' '}
                · 更新于 {new Date(a.updatedAt).toLocaleDateString('zh-CN')}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel empty-state">
          <Icon name="accounts" size={36} />
          <p>建立你的资产全景</p>
          <span>添加银行、储蓄、投资账户，以及信用卡或贷款负债。</span>
        </section>
      )}
    </>
  )
}

export function Recurring({
  data,
  onEdit,
  onDelete,
}: {
  data: FinanceData
  onEdit: (p: RecurringPayment) => void
  onDelete: (p: RecurringPayment) => void
}) {
  const today = localDate()
  const payments = [...data.recurringPayments].sort(
    (a, b) =>
      Number(isRecurringActive(b, today)) - Number(isRecurringActive(a, today)) ||
      (upcomingRecurringDate(a, today) ?? '9999').localeCompare(upcomingRecurringDate(b, today) ?? '9999'),
  )
  return (
    <>
      <div className="recurring-banner">
        <div>
          <p className="eyebrow">PLAN AHEAD</p>
          <h2>让固定收支，心中有数。</h2>
          <p>工资、房租、车贷和订阅，每一笔都有安排。</p>
        </div>
        <div>
          <span>预计每月收入</span>
          <strong>{formatMoney(monthlyRecurringCents(payments, today, 'income'))}</strong>
          <span>预计每月支出</span>
          <strong>{formatMoney(monthlyRecurringCents(payments, today, 'expense'))}</strong>
          <small>按频率换算月均；实际收支请看收支明细。</small>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>固定收支计划</h2>
          <span className="small-tag">
            {payments.filter((p) => isRecurringActive(p, today)).length} 项启用
          </span>
        </div>
        {payments.length ? (
          <div className="payment-list">
            {payments.map((p) => (
              <article
                className={`payment-row ${isRecurringActive(p, today) ? '' : 'paused'}`}
                key={p.id}
              >
                <span className="payment-symbol">
                  <Icon name="recurring" size={22} />
                </span>
                <div className="payment-name">
                  <strong>{p.name}</strong>
                  <small>
                    {categories.find((c) => c.id === p.category)?.label ??
                      p.category}{' '}
                    · {p.frequency === 'monthly' ? `每月 ${Number(p.nextDueDate.slice(8))} 号` : frequencies[p.frequency]}
                    {' · '}{(p.type ?? 'expense') === 'income' ? '收入' : '支出'}
                    {p.autoPost ? ((p.type ?? 'expense') === 'income' ? ' · 自动记账' : ' · 自动扣账并记账') : p.autoPay ? ' · 银行自动付款标记' : ''}
                  </small>
                </div>
                <div className="payment-date">
                  <span>{upcomingRecurringDate(p, today) ?? '—'}</span>
                  <small>
                    {p.endDate && p.endDate < today
                      ? '已结束'
                      : !p.active ? '已暂停'
                        : upcomingRecurringDate(p, today) ? '下次计划日期' : '结束前无后续记录'}
                  </small>
                  <small>{p.endDate ? `结束于 ${p.endDate}` : '长期持续'}</small>
                </div>
                <strong className="payment-amount">
                  {formatMoney(p.amountCents)}
                </strong>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={`编辑 ${p.name}`}
                    onClick={() => onEdit(p)}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="icon-button danger-hover"
                    aria-label={`删除 ${p.name}`}
                    onClick={() => onDelete(p)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Icon name="recurring" size={32} />
            <p>还没有固定收支计划</p>
            <span>从每月工资或房租开始。</span>
          </div>
        )}
        <p className="panel-footnote">
          打开或刷新账本会补记到期的自动收支。自动支出扣减现金余额或增加信用卡欠款；仅有银行自动付款标记的计划不会自动记账。
        </p>
      </section>
    </>
  )
}
