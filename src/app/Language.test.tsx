import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { getLanguage, tr } from '../lib/i18n'

vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: false,
  getFirebaseServices: async () => ({ app: null, auth: null, db: null }),
}))
beforeEach(() => localStorage.clear())
afterEach(cleanup)

it('switches an open form without losing input and persists the language across remounts', async () => {
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: '新增记录' }))
  fireEvent.change(screen.getByRole('textbox', { name: '名称 / 商户' }), { target: { value: '我的商店' } })
  fireEvent.change(screen.getByLabelText('语言 / Language'), { target: { value: 'en' } })
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Add Transaction')
  expect(screen.getByRole('textbox', { name: 'Name / Merchant' })).toHaveValue('我的商店')
  expect(getLanguage()).toBe('en')
  expect(document.documentElement.lang).toBe('en')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  view.unmount()
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('语言 / Language'), { target: { value: 'zh' } })
  expect(screen.getByRole('button', { name: '新增记录' })).toBeInTheDocument()
})

it('keeps persisted ledger content unchanged when translating labels', async () => {
  const value = JSON.stringify({ accounts: [{ id: 'a', name: '收入', type: 'checking', balanceCents: 12345, currency: 'USD', updatedAt: '2026-10-01T00:00:00.000Z' }], transactions: [], recurringPayments: [] })
  localStorage.setItem('financial-summary:v1:data', value)
  render(<App />)
  await screen.findByRole('button', { name: '新增记录' })
  fireEvent.change(screen.getByLabelText('语言 / Language'), { target: { value: 'en' } })
  fireEvent.click(screen.getByRole('button', { name: 'Accounts' }))
  expect(screen.getByText('收入')).toBeInTheDocument()
  expect(localStorage.getItem('financial-summary:v1:data')).toBe(value)
  expect(tr('删除「{0}」', ['我的商店'])).toBe('Delete “我的商店”')
})
