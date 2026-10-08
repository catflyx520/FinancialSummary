import { tr } from '../../lib/i18n'
import { useEffect, useState } from 'react'
import type { Account, Transaction, TransactionType } from '../../types/finance'
import type { ImportResult } from '../../lib/repository'
import { categories, formatMoney, parseMoney, transactionTypes, validateFinanceData } from '../../lib/finance'
import { parseChaseStatement, reviewRows } from './chase'
import type { ChaseStatement, ReviewRow } from './chase'
import { readStatementPdf } from './pdf'

interface EditableRow extends ReviewRow {
  selected: boolean
  touched: boolean
  editDate: string
  editMerchant: string
  editAmount: string
  editType: TransactionType
  editCategory: string
}

export function StatementImport({ accounts, transactions, onImport, onCancel, onBusyChange, onCreateAccount }: {
  accounts: Account[]
  transactions: Transaction[]
  onImport: (records: Transaction[]) => Promise<ImportResult>
  onCancel: () => void
  onBusyChange?: (busy: boolean) => void
  onCreateAccount?: () => void
}) {
  const [statement, setStatement] = useState<ChaseStatement | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [accountId, setAccountId] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const creditAccounts = accounts.filter(a => a.type === 'credit')
  const busy = loading || saving
  const chosenAccount = creditAccounts.find(a => a.id === accountId)

  useEffect(() => {
    if (!statement) return
    let disposed = false
    async function refresh() {
      setReviewing(true)
      try {
        const reviewed = await reviewRows(statement!, transactions, accountId)
        if (!disposed) setRows(current => {
          const previous = new Map(current.map(row => [row.id, row]))
          return reviewed.map(row => {
            const prior = previous.get(row.id)
            return { ...row, touched: prior?.touched ?? false,
              selected: row.status !== 'imported' && (prior?.touched ? prior.selected : row.status === 'new'),
              editDate: prior?.editDate ?? row.date, editMerchant: prior?.editMerchant ?? row.merchant.slice(0, 120),
              editAmount: prior?.editAmount ?? (row.amountCents / 100).toFixed(2),
              editType: prior?.editType ?? row.type, editCategory: prior?.editCategory ?? row.category }
          })
        })
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : tr("重复记录核对失败。"))
      } finally {
        if (!disposed) setReviewing(false)
      }
    }
    void refresh()
    return () => { disposed = true }
  }, [statement, transactions, accountId])

  async function load(file?: File) {
    if (!file) return
    setError(''); setResult(null); setStatement(null); setRows([]); setFileName(file.name)
    setLoading(true); onBusyChange?.(true)
    try { setStatement(parseChaseStatement(await readStatementPdf(file))) }
    catch (caught) { setError(caught instanceof Error ? caught.message : tr("无法解析这个 PDF。")) }
    finally { setLoading(false); onBusyChange?.(false) }
  }
  const selected = rows.filter(row => row.selected && row.status !== 'imported')
  function edit(id: string, changes: Partial<EditableRow>) {
    setRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row))
  }
  async function confirm() {
    if (!statement?.reconciled || !chosenAccount || reviewing || busy || result || !selected.length) return
    setError(''); setSaving(true); onBusyChange?.(true)
    try {
      const now = new Date().toISOString()
      let records: Transaction[]
      try {
        records = selected.map(row => ({
          id: row.id, date: row.editDate, merchant: row.editMerchant.trim(), amountCents: parseMoney(row.editAmount),
          type: row.editType, category: row.editCategory, accountId,
          note: tr("Chase 账单 {0}，第 {1} 页。原始：{2}", [statement.closingDate, row.pageNumber, row.merchant]).slice(0, 500),
          source: 'pdf', createdAt: now, updatedAt: now,
        }))
        validateFinanceData({ transactions: records, accounts: [], recurringPayments: [] })
      }
      catch { throw new Error(tr("请检查所选交易：日期必须有效，名称不能为空，金额必须为大于零的 USD 数值（最多两位小数）。")) }
      setResult(await onImport(records))
      setRows(current => current.map(row => selected.some(s => s.id === row.id)
        ? { ...row, selected: false, status: 'imported' } : row))
    } catch (caught) { setError(caught instanceof Error ? caught.message : tr("导入失败，可以重试。")) }
    finally { setSaving(false); onBusyChange?.(false) }
  }
  return <div className="statement-import" aria-busy={busy}>
    <p className="subtle">{tr("选择 Chase 文字型信用卡月结账单，核对明细后再入账。退款计入收入，还款不计入收支。")}</p>
    <label className="field import-file"><span>{tr("选择 Chase PDF")}</span>
      <input type="file" accept="application/pdf,.pdf" aria-label={tr("选择 Chase PDF")} disabled={busy}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void load(file) }} />
    </label>
    <small className="field-note">{tr("PDF 在浏览器本地读取，仅确认后的交易保存到当前账本。最多 20 MB / 40 页。")}</small>
    {loading && <p role="status">{tr("正在读取和核对账单…")}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!creditAccounts.length && <div className="info-note">{tr("请先添加一个信用卡账户，再选择账单。")}{onCreateAccount && <button type="button" className="text-button" disabled={busy} onClick={onCreateAccount}>{tr("先添加信用卡账户")}</button>}
    </div>}
    {statement && <>
      <div className="import-heading">
        <div><strong>{tr("Chase · 尾号 ")}{statement.last4}</strong><p>{statement.openingDate}{tr(" 至 ")}{statement.closingDate} · {fileName}</p></div>
        <span className={`small-tag ${statement.reconciled ? 'positive' : ''}`}>{statement.reconciled ? tr("核对通过") : tr("核对未通过")}</span>
      </div>
      <div className="import-totals">
        <div><small>{tr("消费 · 支出 · ")}{statement.rows.filter(row => row.type === 'expense').length}{tr(" 笔")}</small><strong>{formatMoney(statement.totals.expenseCents)}</strong></div>
        <div><small>{tr("退款 · 收入 · ")}{statement.rows.filter(row => row.type === 'refund').length}{tr(" 笔")}</small><strong className="positive">{formatMoney(statement.totals.refundCents)}</strong></div>
        <div><small>{tr("信用卡还款 · 转账 · ")}{statement.rows.filter(row => row.type === 'transfer').length}{tr(" 笔")}</small><strong>{formatMoney(statement.totals.transferCents)}</strong></div>
      </div>
      {!statement.reconciled && <div className="form-error" role="alert"><strong>{tr("当前无法确认导入")}</strong>
        <ul>{statement.issues.map((issue, n) => <li key={n}>{issue}</li>)}</ul></div>}
      <label className="field"><span>{tr("导入到信用卡账户")}</span>
        <select value={accountId} disabled={busy || !!result} onChange={event => setAccountId(event.target.value)}>
          <option value="">{tr("请选择信用卡账户")}</option>
          {creditAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <p className="field-note">{tr("按原始交易日期归入对应月份；账户余额不会自动修改。分类为建议，请核对后修改。")}</p>
      <div className="import-review-heading"><strong>{rows.length}{tr(" 笔识别 · ")}{selected.length}{tr(" 笔选中")}</strong>
        <span>{reviewing ? tr("正在检查重复…") : tr("已导入记录跳过；疑似手动重复默认不选中。")}</span></div>
      <div className="import-table-scroll">
        <table className="import-table"><thead><tr><th>{tr("导入")}</th><th>{tr("日期 / 原始")}</th><th>{tr("名称 / 商户")}</th><th>{tr("类型")}</th><th>{tr("分类")}</th><th>{tr("金额 USD")}</th></tr></thead>
          <tbody>{rows.map((row, n) => {
            const disabled = busy || row.status === 'imported' || !!result
            return <tr key={row.id} className={row.status === 'imported' ? 'import-skipped' : ''}>
              <td><input type="checkbox" aria-label={tr("选择交易 {0}", [n + 1])} checked={row.selected} disabled={disabled}
                onChange={event => edit(row.id, { selected: event.target.checked, touched: true })} />
                <small>{row.status === 'imported' ? tr("已导入") : row.status === 'possible' ? tr("疑似重复") : tr("新记录")}</small>
                {row.status === 'imported' && row.existingAccountId && row.existingAccountId !== accountId &&
                  <small>{tr("归属：")}{accounts.find(a => a.id === row.existingAccountId)?.name ?? tr("原账户")}</small>}
              </td>
              <td><input type="date" aria-label={tr("交易 {0} 日期", [n + 1])} value={row.editDate} disabled={disabled}
                onChange={event => edit(row.id, { editDate: event.target.value })} /><small>{tr("第 ")}{row.pageNumber}{tr(" 页")}</small></td>
              <td><input aria-label={tr("交易 {0} 名称", [n + 1])} value={row.editMerchant} maxLength={120} disabled={disabled}
                onChange={event => edit(row.id, { editMerchant: event.target.value })} /><small title={row.merchant}>{row.merchant}</small></td>
              <td><select aria-label={tr("交易 {0} 类型", [n + 1])} value={row.editType} disabled={disabled}
                onChange={event => edit(row.id, { editType: event.target.value as TransactionType })}>
                {Object.entries(transactionTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select></td>
              <td><select aria-label={tr("交易 {0} 分类", [n + 1])} value={row.editCategory} disabled={disabled}
                onChange={event => edit(row.id, { editCategory: event.target.value })}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></td>
              <td><input aria-label={tr("交易 {0} 金额", [n + 1])} value={row.editAmount} inputMode="decimal" disabled={disabled}
                onChange={event => edit(row.id, { editAmount: event.target.value })} /></td>
            </tr>
          })}</tbody></table>
      </div>
      {result && <p className="import-success" role="status">{tr("导入完成：新增 ")}{result.inserted}{tr(" 笔，跳过 ")}{result.skipped}{tr(" 笔。可在收支明细按交易月份查看。")}</p>}
      <div className="form-actions">
        <button type="button" className="button button-quiet" disabled={busy} onClick={onCancel}>{result ? tr("完成") : tr("取消")}</button>
        <button type="button" className="button button-primary" onClick={() => void confirm()}
          disabled={busy || reviewing || !statement.reconciled || !chosenAccount || !selected.length || !!result}>
          {saving ? tr("正在导入…") : tr("确认导入 {0} 笔", [selected.length])}
        </button>
      </div>
    </>}
  </div>
}
