import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account, Transaction } from '../../types/finance'
import { AccountForm, RecurringForm, TransactionForm } from './Forms'

const checking: Account = {
  id: 'checking-1',
  name: '日常账户',
  type: 'checking',
  balanceCents: 250_000,
  currency: 'USD',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

afterEach(cleanup)

describe('TransactionForm', () => {
  it('submits a valid decimal amount as integer cents', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <TransactionForm
        accounts={[checking]}
        date="2026-09-16"
        onSave={onSave}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('名称 / 商户'), {
      target: { value: '  街角咖啡  ' },
    })
    fireEvent.change(screen.getByLabelText('金额（USD）'), {
      target: { value: '12.34' },
    })
    fireEvent.change(screen.getByLabelText('账户'), {
      target: { value: checking.id },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: '街角咖啡',
        amountCents: 1234,
        date: '2026-09-16',
        accountId: checking.id,
        source: 'manual',
      }),
    )
  })

  it('rejects amounts with more than two decimal places', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <TransactionForm
        accounts={[checking]}
        date="2026-09-16"
        onSave={onSave}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('名称 / 商户'), {
      target: { value: '咖啡' },
    })
    fireEvent.change(screen.getByLabelText('金额（USD）'), {
      target: { value: '12.345' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('金额')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('explains the maximum supported single-record amount', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <TransactionForm
        accounts={[checking]}
        date="2026-09-16"
        onSave={onSave}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('名称 / 商户'), {
      target: { value: '超大交易' },
    })
    fireEvent.change(screen.getByLabelText('金额（USD）'), {
      target: { value: '1000000000.01' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '单笔金额不能超过 $1,000,000,000.00',
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps values editable when saving is rejected', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('网络暂时不可用'))
    render(
      <TransactionForm
        accounts={[checking]}
        date="2026-09-16"
        onSave={onSave}
        onCancel={() => undefined}
      />,
    )

    const merchant = screen.getByLabelText('名称 / 商户')
    fireEvent.change(merchant, { target: { value: '午餐' } })
    fireEvent.change(screen.getByLabelText('金额（USD）'), {
      target: { value: '18.50' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('网络暂时不可用')
    expect(merchant).toHaveValue('午餐')
    expect(merchant).toBeEnabled()

    fireEvent.change(merchant, { target: { value: '工作午餐' } })
    expect(merchant).toHaveValue('工作午餐')
  })

  it('preserves an unavailable account when editing', () => {
    const initial: Transaction = {
      id: 'txn-1',
      date: '2026-09-14',
      merchant: '旧交易',
      amountCents: 1000,
      type: 'expense',
      category: '其他',
      accountId: 'removed-account',
      note: '',
      source: 'csv',
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    }

    render(
      <TransactionForm
        initial={initial}
        accounts={[checking]}
        date="2026-09-16"
        onSave={async () => undefined}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByLabelText('账户')).toHaveValue('removed-account')
    expect(screen.getByRole('option', { name: '原账户（已不可用）' })).toHaveValue(
      'removed-account',
    )
  })
})

describe('AccountForm', () => {
  it('submits account balances in integer cents', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<AccountForm onSave={onSave} onCancel={() => undefined} />)

    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '储蓄账户' },
    })
    fireEvent.change(screen.getByLabelText('金额（USD）'), {
      target: { value: '1000.05' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '储蓄账户',
        balanceCents: 100005,
        currency: 'USD',
      }),
    )
  })
})

describe('RecurringForm', () => {
  it('requires a debit account for automatic expenses and saves the explicit posting choice', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<RecurringForm accounts={[checking]} onSave={onSave} onCancel={() => undefined} />)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '房租' } })
    fireEvent.change(screen.getByLabelText('金额（USD）'), { target: { value: '1100' } })
    fireEvent.click(screen.getByLabelText('自动扣账并记账'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('扣款账户')
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('扣款账户'), { target: { value: checking.id } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense', autoPost: true, accountId: checking.id, amountCents: 110000,
    })))
  })
  it('creates income plans with automatic posting enabled by default', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<RecurringForm accounts={[]} onSave={onSave} onCancel={() => undefined} />)
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'income' } })
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '工资' } })
    fireEvent.change(screen.getByLabelText('金额（USD）'), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText('首次收支日'), { target: { value: '2026-10-01' } })
    expect(screen.getByLabelText('自动记账')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: '工资', type: 'income', autoPost: true, category: 'income',
      amountCents: 500000, nextDueDate: '2026-10-01',
    })))
  })

  it('locks the schedule after income has posted while allowing amount edits', () => {
    render(<RecurringForm accounts={[]} initial={{
      id: 'salary', name: '工资', type: 'income', autoPost: true, category: 'income',
      amountCents: 500000, frequency: 'monthly', nextDueDate: '2026-09-01',
      lastPostedDate: '2026-09-01', accountId: '', autoPay: false, active: true,
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    }} onSave={vi.fn()} onCancel={() => undefined} />)
    expect(screen.getByLabelText('类型')).toBeDisabled()
    expect(screen.getByLabelText('频率')).toBeDisabled()
    expect(screen.getByLabelText('首次收支日')).toBeDisabled()
    expect(screen.getByLabelText('金额（USD）')).toBeEnabled()
  })

  it('submits plan settings and allows an unspecified account', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <RecurringForm
        accounts={[checking]}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '视频会员' },
    })
    fireEvent.change(screen.getByLabelText('金额（USD）'), {
      target: { value: '9.99' },
    })
    fireEvent.change(screen.getByLabelText('首次收支日'), {
      target: { value: '2026-10-01' },
    })
    fireEvent.change(screen.getByLabelText('结束日期（可选）'), { target: { value: '2027-09-30' } })
    fireEvent.click(screen.getByLabelText('银行自动付款（仅标记）'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '视频会员',
        nextDueDate: '2026-10-01',
        endDate: '2027-09-30',
        amountCents: 999,
        accountId: '',
        autoPay: true,
        active: true,
      }),
    )
  })
})
