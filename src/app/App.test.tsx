import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: false,
  getFirebaseServices: async () => ({ app: null, auth: null, db: null }),
}))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

it('finishes healthy catch-up beyond eight periods even when another plan has insufficient funds', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 29, 12))
  const timestamp = '2026-09-01T00:00:00.000Z'
  const plan = { type: 'expense', autoPost: true, category: 'housing', amountCents: 100000,
    frequency: 'monthly', nextDueDate: '2026-01-01', accountId: 'boa', autoPay: false,
    active: true, createdAt: timestamp, updatedAt: timestamp }
  localStorage.setItem('financial-summary:v1:data', JSON.stringify({
    accounts: [{ id: 'boa', name: 'BOA测试', type: 'checking', balanceCents: 0, currency: 'USD', updatedAt: timestamp }],
    transactions: [],
    recurringPayments: [{ ...plan, id: 'rent', name: '欠款测试' },
      { ...plan, id: 'salary', name: '工资补记测试', type: 'income', category: 'income' }],
  }))
  try {
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('income-total')).toHaveTextContent('$1,000.00'))
    expect(screen.getByRole('alert')).toHaveTextContent('余额不足')
    const stored = JSON.parse(localStorage.getItem('financial-summary:v1:data')!)
    expect(stored.transactions).toHaveLength(9)
    expect(stored.accounts[0].balanceCents).toBe(0)
  } finally { vi.useRealTimers() }
})

it('automatically posts an expense and debits its account once across reloads', async () => {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const timestamp = '2026-09-01T00:00:00.000Z'
  localStorage.setItem('financial-summary:v1:data', JSON.stringify({
    accounts: [{ id: 'boa', name: 'BOA测试', type: 'checking', balanceCents: 250000,
      currency: 'USD', updatedAt: timestamp }],
    transactions: [],
    recurringPayments: [{ id: 'rent', name: '自动房租测试', type: 'expense', autoPost: true,
      category: 'housing', amountCents: 110000, frequency: 'monthly', nextDueDate: date,
      accountId: 'boa', autoPay: false, active: true, createdAt: timestamp, updatedAt: timestamp }],
  }))
  const view = render(<App />)
  await waitFor(() => expect(screen.getByTestId('expense-total')).toHaveTextContent('$1,100.00'))
  fireEvent.click(screen.getByRole('button', { name: '我的账户' }))
  expect(screen.getAllByText('$1,400.00').length).toBeGreaterThan(0)
  view.unmount()
  render(<App />)
  await waitFor(() => expect(screen.getByTestId('expense-total')).toHaveTextContent('$1,100.00'))
  fireEvent.click(screen.getByRole('button', { name: '我的账户' }))
  expect(screen.getAllByText('$1,400.00').length).toBeGreaterThan(0)
})

async function addTransaction(type = 'income', amount = '1250.50') {
  fireEvent.click(await screen.findByRole('button', { name: '新增记录' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('名称 / 商户'), {
    target: { value: '测试工资' },
  })
  fireEvent.change(within(dialog).getByLabelText('类型'), {
    target: { value: type },
  })
  fireEvent.change(within(dialog).getByLabelText('金额（USD）'), {
    target: { value: amount },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
}

describe('finance workspace', () => {
  it('stores income in the selected month and restores it after remount', async () => {
    const view = render(<App />)
    expect(
      await screen.findByRole('heading', { name: '财务总览' }),
    ).toBeInTheDocument()
    expect(screen.getByText('本地模式')).toBeInTheDocument()
    const month = screen.getByLabelText('查看月份')
    fireEvent.change(month, { target: { value: '2026-02' } })
    await addTransaction()
    expect(screen.getByTestId('income-total')).toHaveTextContent('$1,250.50')
    view.unmount()
    render(<App />)
    await screen.findByRole('button', { name: '新增记录' })
    fireEvent.change(screen.getByLabelText('查看月份'), {
      target: { value: '2026-02' },
    })
    await waitFor(() =>
      expect(screen.getByTestId('income-total')).toHaveTextContent('$1,250.50'),
    )
    fireEvent.change(screen.getByLabelText('查看月份'), {
      target: { value: '2026-01' },
    })
    expect(screen.getByTestId('income-total')).toHaveTextContent('$0.00')
  })

  it('counts a manually entered refund as income without reducing spending', async () => {
    render(<App />)
    await addTransaction('expense', '100.00')
    await addTransaction('refund', '25.00')
    expect(screen.getByTestId('income-total')).toHaveTextContent('$25.00')
    expect(screen.getByTestId('expense-total')).toHaveTextContent('$100.00')
    expect(screen.getByText('含实际收入与退款')).toBeInTheDocument()
  })

  it('keeps transfers out of cashflow and supports confirmed deletion', async () => {
    render(<App />)
    await addTransaction('transfer', '400.00')
    expect(screen.getByTestId('income-total')).toHaveTextContent('$0.00')
    expect(screen.getByTestId('expense-total')).toHaveTextContent('$0.00')
    fireEvent.click(screen.getByRole('button', { name: '收支明细' }))
    fireEvent.click(screen.getByRole('button', { name: '删除 测试工资' }))
    const confirmation = screen.getByRole('dialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: '确认删除' }),
    )
    await waitFor(() =>
      expect(screen.queryByText('测试工资')).not.toBeInTheDocument(),
    )
  })

  it('automatically posts a fixed monthly salary once and shows it in income', async () => {
    const today = new Date()
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    const first = `${month}-01`
    const view = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '固定收支' }))
    fireEvent.click(screen.getByRole('button', { name: '添加计划' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('类型'), { target: { value: 'income' } })
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: '工资' } })
    fireEvent.change(within(dialog).getByLabelText('金额（USD）'), { target: { value: '5000' } })
    fireEvent.change(within(dialog).getByLabelText('首次收支日'), { target: { value: first } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '财务总览' }))
    await waitFor(() => expect(screen.getByTestId('income-total')).toHaveTextContent('$5,000.00'))
    view.unmount()
    render(<App />)
    expect(await screen.findByTestId('income-total')).toHaveTextContent('$5,000.00')
  })

  it('keeps demonstration data out of the local workspace', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '新增记录' })
    fireEvent.click(screen.getByRole('button', { name: '查看演示' }))
    expect(await screen.findByText('演示模式')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('income-total')).not.toHaveTextContent('$0.00'),
    )
    fireEvent.click(screen.getByRole('button', { name: '返回我的数据' }))
    await waitFor(() =>
      expect(screen.getByTestId('income-total')).toHaveTextContent('$0.00'),
    )
    expect(screen.queryByText('演示模式')).not.toBeInTheDocument()
  })
})
