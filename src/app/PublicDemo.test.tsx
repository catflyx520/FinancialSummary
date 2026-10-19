import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('../lib/runtime', () => ({ isPublicDemo: true }))
vi.mock('../lib/firebase', () => ({
  isFirebaseConfigured: false,
  getFirebaseServices: async () => ({ app: null, auth: null, db: null }),
}))
beforeEach(() => localStorage.clear())
afterEach(cleanup)

it('opens fictional data without reading the private local ledger or offering a cloud connection', async () => {
  const privateLedger = '{"accounts":[],"transactions":[],"recurringPayments":[],"privateMarker":"not-for-demo"}'
  localStorage.setItem('financial-summary:v1:data', privateLedger)
  render(<App />)
  expect(await screen.findByText('Demo mode')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId('income-total')).not.toHaveTextContent('$0.00'))
  expect(screen.queryByRole('button', { name: 'Back to my data' })).not.toBeInTheDocument()
  expect(localStorage.getItem('financial-summary:v1:data')).toBe(privateLedger)
  fireEvent.click(screen.getByRole('button', { name: 'Settings & connections' }))
  expect(screen.queryByText('Connect your Firebase')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Restart demo' }))
  expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
  expect(localStorage.getItem('financial-summary:v1:data')).toBe(privateLedger)
})
