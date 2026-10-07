import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatementImport } from './StatementImport'
import { samplePages } from '../../test/chaseFixture'
import { createMemoryRepository, ImportFailure } from '../../lib/repository'
import type { FinanceData } from '../../types/finance'

const pdf = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('./pdf', () => ({ readStatementPdf: pdf.read }))
const account = { id: 'card', name: 'Chase', type: 'credit' as const, balanceCents: 0,
  currency: 'USD' as const, updatedAt: '2026-09-01T00:00:00.000Z' }
afterEach(cleanup)
beforeEach(() => { pdf.read.mockReset(); pdf.read.mockResolvedValue(samplePages) })
const loadFile = () => fireEvent.change(screen.getByLabelText('选择 Chase PDF'), {
  target: { files: [new File(['sample'], 'statement.pdf', { type: 'application/pdf' })] },
})

describe('statement import preview', () => {
  it('does not write before confirmation, saves edited/excluded rows, and skips a repeated import', async () => {
    const repository = createMemoryRepository({ transactions: [], accounts: [account], recurringPayments: [] })
    let data: FinanceData = { transactions: [], accounts: [], recurringPayments: [] }
    repository.subscribe(value => { data = value }, () => undefined)
    const view = render(<StatementImport accounts={[account]} transactions={[]}
      onImport={records => repository.importTransactions(records)} onCancel={() => undefined} />)
    loadFile()
    await screen.findByText('核对通过')
    expect(data.transactions).toEqual([])
    fireEvent.change(screen.getByLabelText('导入到信用卡账户'), { target: { value: 'card' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /确认导入 6 笔/ })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('交易 1 名称'), { target: { value: '退货收入' } })
    fireEvent.click(screen.getByLabelText('选择交易 2'))
    fireEvent.click(screen.getByRole('button', { name: /确认导入 5 笔/ }))
    await screen.findByText(/新增 5 笔，跳过 0 笔/)
    expect(data.transactions).toHaveLength(5)
    expect(data.transactions.find(t => t.type === 'refund')?.merchant).toBe('退货收入')
    expect(data.transactions.some(t => t.type === 'transfer')).toBe(false)
    view.rerender(<StatementImport accounts={[account]} transactions={data.transactions}
      onImport={records => repository.importTransactions(records)} onCancel={() => undefined} />)
    loadFile()
    await waitFor(() => expect(screen.getByLabelText('选择交易 1')).toBeDisabled())
    expect(data.transactions).toHaveLength(5)
  })
  it('blocks unreconciled statements without any write', async () => {
    pdf.read.mockResolvedValue(samplePages.slice(0, 2))
    const repository = createMemoryRepository({ transactions: [], accounts: [account], recurringPayments: [] })
    render(<StatementImport accounts={[account]} transactions={[]}
      onImport={records => repository.importTransactions(records)} onCancel={() => undefined} />)
    loadFile()
    await screen.findByText(/消费总额与账单摘要不一致/)
    expect(screen.getByRole('button', { name: /确认导入/ })).toBeDisabled()
  })
  it('shows parser errors and allows choosing a new file', async () => {
    pdf.read.mockRejectedValueOnce(new Error('无法读取加密 PDF'))
    render(<StatementImport accounts={[account]} transactions={[]}
      onImport={async () => ({ inserted: 0, skipped: 0 })} onCancel={() => undefined} />)
    loadFile()
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取加密 PDF')
    loadFile()
    expect(await screen.findByText('核对通过')).toBeInTheDocument()
  })
  it('leaves matching manual records unchecked and requires a credit account', async () => {
    const manual = { id: 'manual', date: '2026-09-02', merchant: 'RALPHS #1 ANYTOWN CA',
      amountCents: 500, type: 'expense' as const, category: 'groceries', accountId: 'card',
      note: '', source: 'manual' as const, createdAt: account.updatedAt, updatedAt: account.updatedAt }
    render(<StatementImport accounts={[account]} transactions={[manual]}
      onImport={async () => ({ inserted: 0, skipped: 0 })} onCancel={() => undefined} />)
    loadFile()
    await screen.findByText('核对通过')
    expect(screen.getByRole('button', { name: /确认导入/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('导入到信用卡账户'), { target: { value: 'card' } })
    await waitFor(() => expect(screen.getByLabelText('选择交易 4')).not.toBeChecked())
    expect(screen.getByLabelText('选择交易 5')).toBeChecked()
    expect(screen.getByText('疑似重复')).toBeInTheDocument()
  })
  it('shows a useful validation error and never saves malformed edited amounts', async () => {
    const onImport = vi.fn()
    render(<StatementImport accounts={[account]} transactions={[]}
      onImport={onImport} onCancel={() => undefined} />)
    loadFile()
    await screen.findByText('核对通过')
    fireEvent.change(screen.getByLabelText('导入到信用卡账户'), { target: { value: 'card' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /确认导入 6 笔/ })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('交易 1 金额'), { target: { value: '1.234' } })
    fireEvent.click(screen.getByRole('button', { name: /确认导入 6 笔/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('最多两位小数')
    expect(onImport).not.toHaveBeenCalled()
  })
  it('can retry a partial import safely after committed records refresh', async () => {
    const repository = createMemoryRepository({ transactions: [], accounts: [account], recurringPayments: [] })
    let data: FinanceData = { transactions: [], accounts: [], recurringPayments: [] }
    repository.subscribe(value => { data = value }, () => undefined)
    const onImport = vi.fn().mockImplementationOnce(async records => {
      await repository.importTransactions(records.slice(0, 2))
      throw new ImportFailure({ inserted: 2, skipped: 0 }, new Error('temporary disconnect'))
    }).mockImplementation(records => repository.importTransactions(records))
    const view = render(<StatementImport accounts={[account]} transactions={[]}
      onImport={onImport} onCancel={() => undefined} />)
    loadFile()
    await screen.findByText('核对通过')
    fireEvent.change(screen.getByLabelText('导入到信用卡账户'), { target: { value: 'card' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /确认导入 6 笔/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /确认导入 6 笔/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('已新增 2 笔')
    view.rerender(<StatementImport accounts={[account]} transactions={data.transactions}
      onImport={onImport} onCancel={() => undefined} />)
    await waitFor(() => expect(screen.getByLabelText('选择交易 1')).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /确认导入 4 笔/ }))
    await screen.findByText(/新增 4 笔，跳过 0 笔/)
    expect(data.transactions).toHaveLength(6)
  })

})
