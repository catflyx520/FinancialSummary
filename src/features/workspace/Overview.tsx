import { tr, locale } from '../../lib/i18n'
import type { FinanceData } from '../../types/finance'
import {
  formatMoney,
  summarizeMonth,
  monthlyRecurringCents,
  frequencies,
  upcomingRecurringDate,
} from '../../lib/finance'
import { Icon } from '../../components/Icon'
import { SpendingChart } from './SpendingChart'

export function Overview({
  data,
  month,
  onTransactions,
  onRecurring,
}: {
  data: FinanceData
  month: string
  onTransactions: () => void
  onRecurring: () => void
}) {
  const total = summarizeMonth(data.transactions, month)
  const months = Array.from({ length: 6 }, (_, index) => {
    const [year, mon] = month.split('-').map(Number)
    const d = new Date(year, mon - 6 + index, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return {
      month: key,
      label: d.toLocaleDateString(locale(), { month: 'short' }),
      ...summarizeMonth(data.transactions, key),
    }
  })
  const peak = Math.max(
    ...months.flatMap((item) => [
      item.incomeCents,
      Math.abs(item.expenseCents),
    ]),
    100,
  )
  const upcoming = data.recurringPayments
    .map((p) => ({ ...p, dueDate: upcomingRecurringDate(p) }))
    .filter((p): p is typeof p & { dueDate: string } => p.dueDate !== null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4)
  return (
    <>
      <section className="metrics" aria-label={tr("财务摘要")}>
        <article className="metric">
          <div className="metric-label">
            <span>{tr("当月收入")}</span>
            <span className="metric-icon positive">↗</span>
          </div>
          <strong data-testid="income-total">
            {formatMoney(total.incomeCents)}
          </strong>
          <p>{tr("含实际收入与退款")}</p>
        </article>
        <article className="metric">
          <div className="metric-label">
            <span>{tr("当月支出")}</span>
            <span className="metric-icon">↘</span>
          </div>
          <strong data-testid="expense-total">
            {formatMoney(total.expenseCents)}
          </strong>
          <p>{tr("消费支出合计")}</p>
        </article>
        <article className="metric">
          <div className="metric-label">
            <span>{tr("当月结余")}</span>
            <span className="metric-icon">≈</span>
          </div>
          <strong className={total.netCents < 0 ? 'negative' : 'positive'}>
            {formatMoney(total.netCents)}
          </strong>
          <p>{tr("收入 − 支出")}</p>
        </article>
      </section>
      <div className="overview-grid">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CASH FLOW</p>
              <h2>{tr("收支趋势")}</h2>
            </div>
            <div className="chart-legend">
              <span>
                <i className="income-dot" />{tr("收入")}</span>
              <span>
                <i className="expense-dot" />{tr("支出")}</span>
            </div>
          </div>
          <p className="subtle">{tr("最近六个月，截至 {0}", [month])}</p>
          <div
            className="bar-chart"
            role="img"
            aria-label={months
              .map(
                (item) =>
                  tr("{0} 收入 {1} 支出 {2}", [item.month, formatMoney(item.incomeCents), formatMoney(item.expenseCents)]),
              )
              .join('；')}
          >
            <div className="chart-grid">
              <span>{formatMoney(peak)}</span>
              <span>{formatMoney(Math.round(peak / 2))}</span>
              <span>$0</span>
            </div>
            <div className="chart-columns">
              {months.map((item) => (
                <div
                  className={`chart-column ${item.month === month ? 'current' : ''}`}
                  key={item.month}
                >
                  <div
                    className="bar-pair"
                    title={tr("{0} 收入 {1} · 支出 {2}", [item.month, formatMoney(item.incomeCents), formatMoney(item.expenseCents)])}
                  >
                    <div
                      className="chart-bar income-bar"
                      style={{
                        height: `${(Math.max(0, item.incomeCents) / peak) * 100}%`,
                      }}
                    >
                      <span className="bar-value">{formatMoney(item.incomeCents)}</span>
                    </div>
                    <div
                      className="chart-bar expense-bar"
                      style={{
                        height: `${(Math.abs(item.expenseCents) / peak) * 100}%`,
                      }}
                    >
                      <span className="bar-value">{formatMoney(item.expenseCents)}</span>
                    </div>
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-caption">
            <span className="caption-mark">
              <Icon name="leaf" size={16} />
            </span>
            <span>
              {total.transactionCount
                ? tr("本月共 {0} 笔记录，转账和还款不计入收支。", [total.transactionCount])
                : tr("记下第一笔收支，让每个月的变化清晰起来。")}
            </span>
          </div>
        </section>
        <section className="panel recurring-preview">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ON YOUR CALENDAR</p>
              <h2>{tr("固定收支计划")}</h2>
            </div>
            <button
              className="icon-button"
              aria-label={tr("管理固定收支")}
              onClick={onRecurring}
            >
              <Icon name="arrow" size={18} />
            </button>
          </div>
          <div className="recurring-equivalent">
            <span>{tr("预计每月收入")}</span>
            <strong>{formatMoney(monthlyRecurringCents(data.recurringPayments, undefined, 'income'))}</strong>
            <span>{tr("预计每月支出")}</span>
            <strong>{formatMoney(monthlyRecurringCents(data.recurringPayments))}</strong>
          </div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.map((p) => (
                <div className="upcoming-row" key={p.id}>
                  <span className="date-tile">
                    <small>{Number(p.dueDate.slice(5, 7))}{tr("月")}</small>
                    {Number(p.dueDate.slice(8, 10))}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {frequencies[p.frequency]} ·{' '}
                      {(p.type ?? 'expense') === 'income' ? (p.autoPost ? tr("自动记账收入") : tr("计划收入")) : (p.autoPost ? tr("自动扣账支出") : tr("计划支出"))}
                    </small>
                  </div>
                  <b>{formatMoney(p.amountCents)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle schedule-empty">{tr("把工资、房租和订阅放进同一份计划。")}</p>
          )}
          <p className="panel-footnote">{tr("开启自动记账的计划到期会生成记录；自动支出同步更新所选账户余额。")}</p>
        </section>
        <section className="panel category-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SPENDING</p>
              <h2>{tr("钱都花在哪里")}</h2>
            </div>
            <button className="text-button" onClick={onTransactions}>{tr("查看收支明细 ")}<Icon name="arrow" size={16} />
            </button>
          </div>
          <SpendingChart items={total.categories} totalCents={total.expenseCents} />
        </section>
      </div>
    </>
  )
}
