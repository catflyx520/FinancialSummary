import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  accountTypes,
  categories,
  formatMoney,
  frequencies,
  localDate,
  MAX_RECORD_AMOUNT_CENTS,
  parseMoney,
  transactionTypes,
} from '../../lib/finance'
import type {
  Account,
  AccountType,
  RecurringFrequency,
  RecurringPayment,
  Transaction,
  TransactionType,
} from '../../types/finance'

interface SharedFormProps<T> {
  initial?: T
  onSave: (value: T) => Promise<void>
  onCancel: () => void
}

interface AccountChoiceProps {
  accounts: Account[]
  value: string
  label: string
  onChange: (value: string) => void
  disabled?: boolean
}

function AccountChoice({
  accounts,
  value,
  label,
  onChange,
  disabled = false,
}: AccountChoiceProps) {
  const selectedAccountExists = !value || accounts.some(({ id }) => id === value)

  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">未指定账户</option>
        {!selectedAccountExists && (
          <option value={value}>原账户（已不可用）</option>
        )}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  )
}

function SaveActions({
  saving,
  onCancel,
}: {
  saving: boolean
  onCancel: () => void
}) {
  return (
    <div className="form-actions">
      <button
        className="button button-quiet"
        type="button"
        onClick={onCancel}
        disabled={saving}
      >
        取消
      </button>
      <button className="button button-primary" type="submit" disabled={saving}>
        {saving ? '保存中…' : '保存'}
      </button>
    </div>
  )
}

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function parseAmount(value: string, allowZero: boolean) {
  const trimmed = value.trim()
  let amount: number
  try {
    amount = parseMoney(trimmed)
  } catch {
    throw new Error('请输入有效金额，最多保留两位小数。')
  }

  if (!Number.isSafeInteger(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new Error(allowZero ? '金额不能小于 0。' : '金额必须大于 0。')
  }
  if (amount > MAX_RECORD_AMOUNT_CENTS) {
    throw new Error(
      `单笔金额不能超过 ${formatMoney(MAX_RECORD_AMOUNT_CENTS)}。`,
    )
  }
  return amount
}

function requiredName(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`请输入${label}。`)
  if (trimmed.length > 120) throw new Error(`${label}不能超过 120 个字符。`)
  return trimmed
}

function moneyInput(cents: number | undefined) {
  if (cents === undefined) return ''
  return (cents / 100).toFixed(2)
}

function errorText(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : '保存失败，请稍后重试。'
}

interface TransactionFormProps extends SharedFormProps<Transaction> {
  accounts: Account[]
  date: string
}

export function TransactionForm({
  initial,
  accounts,
  date,
  onSave,
  onCancel,
}: TransactionFormProps) {
  const [merchant, setMerchant] = useState(initial?.merchant ?? '')
  const [transactionDate, setTransactionDate] = useState(initial?.date ?? date)
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(moneyInput(initial?.amountCents))
  const [category, setCategory] = useState(
    initial?.category ?? categories[0]?.id ?? '',
  )
  const [accountId, setAccountId] = useState(initial?.accountId ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const cleanMerchant = requiredName(merchant, '名称 / 商户')
      if (!isValidDate(transactionDate)) throw new Error('请输入有效日期。')
      const amountCents = parseAmount(amount, false)
      if (!category) throw new Error('请选择分类。')
      if (note.length > 500) throw new Error('备注不能超过 500 个字符。')

      const now = new Date().toISOString()
      const value: Transaction = {
        id: initial?.id ?? crypto.randomUUID(),
        merchant: cleanMerchant,
        date: transactionDate,
        type,
        amountCents,
        category,
        accountId,
        note,
        source: initial?.source ?? 'manual',
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
      }

      setSaving(true)
      await onSave(value)
    } catch (caught) {
      setError(errorText(caught))
      setSaving(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit} aria-busy={saving}>
      <label className="field field-wide">
        <span>名称 / 商户</span>
        <input
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          maxLength={120}
          autoComplete="organization"
          required
        />
      </label>

      <label className="field">
        <span>日期</span>
        <input
          type="date"
          value={transactionDate}
          onChange={(event) => setTransactionDate(event.target.value)}
          required
        />
      </label>

      <label className="field">
        <span>类型</span>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as TransactionType)}
        >
          {Object.entries(transactionTypes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>金额（USD）</span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          required
        />
      </label>

      <label className="field">
        <span>分类</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <AccountChoice
        accounts={accounts}
        value={accountId}
        label="账户"
        onChange={setAccountId}
      />

      <label className="field field-wide">
        <span>备注</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={3}
        />
        <small className="field-note">最多 500 个字符</small>
      </label>

      {initial?.source === 'recurring' && initial.type === 'expense' && (
        <p className="field-wide subtle">这笔记录已经自动扣账。修改记录不会调整已扣款的账户余额；如需更正扣款，请同时手动修改账户余额。</p>
      )}

      <ErrorMessage message={error} />
      <SaveActions saving={saving} onCancel={onCancel} />
    </form>
  )
}

export function AccountForm({
  initial,
  onSave,
  onCancel,
}: SharedFormProps<Account>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? 'checking')
  const [balance, setBalance] = useState(moneyInput(initial?.balanceCents) || '0.00')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const cleanName = requiredName(name, '账户名称')
      const balanceCents = parseAmount(balance, true)
      const value: Account = {
        id: initial?.id ?? crypto.randomUUID(),
        name: cleanName,
        type,
        balanceCents,
        currency: 'USD',
        updatedAt: new Date().toISOString(),
      }

      setSaving(true)
      await onSave(value)
    } catch (caught) {
      setError(errorText(caught))
      setSaving(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit} aria-busy={saving}>
      <label className="field field-wide">
        <span>名称</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="off"
          required
        />
      </label>

      <label className="field">
        <span>类型</span>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as AccountType)}
        >
          {Object.entries(accountTypes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span id="account-balance-label">金额（USD）</span>
        <input
          type="text"
          inputMode="decimal"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          placeholder="0.00"
          aria-labelledby="account-balance-label"
          aria-describedby="account-balance-note"
          required
        />
        <small className="field-note" id="account-balance-note">
          信用卡和贷款请输入当前欠款额
        </small>
      </label>

      <ErrorMessage message={error} />
      <SaveActions saving={saving} onCancel={onCancel} />
    </form>
  )
}

interface RecurringFormProps extends SharedFormProps<RecurringPayment> {
  accounts: Account[]
}

export function RecurringForm({
  initial,
  accounts,
  onSave,
  onCancel,
}: RecurringFormProps) {
  const [type, setType] = useState<'income' | 'expense'>(initial?.type ?? 'expense')
  const [autoPost, setAutoPost] = useState(initial?.autoPost ?? false)
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(
    initial?.category ?? categories[0]?.id ?? '',
  )
  const [amount, setAmount] = useState(moneyInput(initial?.amountCents))
  const [frequency, setFrequency] = useState<RecurringFrequency>(
    initial?.frequency ?? 'monthly',
  )
  const [nextDueDate, setNextDueDate] = useState(initial?.nextDueDate ?? localDate())
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? '')
  const [autoPay, setAutoPay] = useState(initial?.autoPay ?? false)
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    try {
      const cleanName = requiredName(name, '计划名称')
      const amountCents = parseAmount(amount, false)
      if (!category) throw new Error('请选择分类。')
      if (!isValidDate(nextDueDate)) throw new Error('请输入有效的首次收支日。')
      if (endDate && (!isValidDate(endDate) || endDate < nextDueDate)) {
        throw new Error('结束日期不能早于首次收支日。')
      }
      if (type === 'expense' && autoPost) {
        const debit = accounts.find(account => account.id === accountId)
        if (!debit) throw new Error('自动扣账请选择有效的扣款账户。')
        if (debit.type === 'loan') throw new Error('贷款账户不能作为扣款账户，请选择实际付款的现金账户。')
      }

      const now = new Date().toISOString()
      const value: RecurringPayment = {
        id: initial?.id ?? crypto.randomUUID(),
        name: cleanName,
        type,
        autoPost,
        ...(initial?.lastPostedDate ? { lastPostedDate: initial.lastPostedDate } : {}),
        category,
        amountCents,
        frequency,
        nextDueDate,
        endDate,
        accountId,
        autoPay,
        active,
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
      }

      setSaving(true)
      await onSave(value)
    } catch (caught) {
      setError(errorText(caught))
      setSaving(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit} aria-busy={saving}>
      <label className="field field-wide">
        <span>名称</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="off"
          required
        />
      </label>

      <label className="field">
        <span>类型</span>
        <select value={type} disabled={Boolean(initial?.lastPostedDate)} onChange={(event) => {
          const next = event.target.value as 'income' | 'expense'
          setType(next)
          setAutoPost(next === 'income')
          if (next === 'income') setAutoPay(false)
          setCategory(next === 'income' ? 'income' : 'housing')
        }}>
          <option value="income">收入</option>
          <option value="expense">支出</option>
        </select>
      </label>

      <label className="field">
        <span>分类</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>金额（USD）</span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          required
        />
      </label>

      <label className="field">
        <span>频率</span>
        <select
          value={frequency}
          disabled={Boolean(initial?.lastPostedDate)}
          onChange={(event) =>
            setFrequency(event.target.value as RecurringFrequency)
          }
        >
          {Object.entries(frequencies).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>首次收支日</span>
        <input
          type="date"
          value={nextDueDate}
          disabled={Boolean(initial?.lastPostedDate)}
          onChange={(event) => setNextDueDate(event.target.value)}
          required
        />
      </label>

      <label className="field">
        <span>结束日期（可选）</span>
        <input type="date" value={endDate} min={nextDueDate}
          onChange={(event) => setEndDate(event.target.value)} />
      </label>
      <p className="field-wide subtle">
        {frequency === 'monthly' && isValidDate(nextDueDate)
          ? `从 ${nextDueDate} 开始，每月 ${Number(nextDueDate.slice(8))} 号${type === 'income' ? '计入收入' : '付款'}；当月没有这一天时按月末计算。`
          : `从首次收支日开始，按所选频率重复计算下一次${type === 'income' ? '收入' : '付款'}日期。`}
        {' '}结束日期留空表示长期持续，结束当天仍有效。{autoPost
          ? type === 'income'
            ? '开启自动记账后，到日期打开账本会生成收入记录；首次日期在过去时会补记至今。'
            : '到期打开或刷新账本，会生成支出记录并扣减现金账户余额；信用卡会增加欠款。首次日期在过去时会补记至今；余额不足时停止未完成的补记，已经完成的扣账保留。'
          : '关闭自动记账时，计划仅用于预算和提醒。'}
        {initial?.lastPostedDate ? ' 已有自动记录后，如需修改类型、频率或首次日期，请停用旧计划并新建计划。' : ''}
      </p>

      <AccountChoice
        accounts={accounts}
        value={accountId}
        label={type === 'income' ? '入账账户' : '扣款账户'}
        onChange={setAccountId}
      />

      <label className="checkbox-field">
        <input type="checkbox" checked={autoPost}
          onChange={(event) => setAutoPost(event.target.checked)} />
        <span>{type === 'income' ? '自动记账' : '自动扣账并记账'}</span>
      </label>

      {type === 'expense' && <label className="checkbox-field">
        <input
          type="checkbox"
          checked={autoPay}
          onChange={(event) => setAutoPay(event.target.checked)}
        />
        <span>银行自动付款（仅标记）</span>
      </label>}

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        <span>启用计划</span>
      </label>

      <ErrorMessage message={error} />
      <SaveActions saving={saving} onCancel={onCancel} />
    </form>
  )
}
