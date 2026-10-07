import { describe, expect, it } from 'vitest'
import { parseChaseStatement, statementTransactionId, reviewRows } from './chase'
import { samplePages } from '../../test/chaseFixture'
import type { Transaction } from '../../types/finance'


const changed = (from: string, to: string) => samplePages.map(p => ({
  ...p, lines: p.lines.map(l => l.replace(from, to)),
}))

describe('Chase statement parser', () => {
  it('reads continued tables, ignores FX and yearly totals, and reconciles all rows', () => {
    const s = parseChaseStatement(samplePages)
    expect(s).toMatchObject({ closingDate: '2026-09-20', openingDate: '2026-08-21',
      last4: '1234', reconciled: true, issues: [],
      totals: { expenseCents: 5500, refundCents: 1000, transferCents: 10000 } })
    expect(s.rows).toHaveLength(6)
    expect(s.rows.map(r => r.type)).toEqual(['refund', 'transfer', 'expense', 'expense', 'expense', 'expense'])
    expect(s.rows[2]).toMatchObject({ date: '2026-08-20', amountCents: 2000, pageNumber: 2 })
    expect(s.rows[3]?.category).toBe('groceries')
  })
  it('infers previous-year December from January closing date', () => {
    const pages = samplePages.map(p => ({ ...p, lines: p.lines.map(l => l
      .replace('08/21/26 - 09/20/26', '12/21/26 - 01/20/27')
      .replaceAll('08/', '12/').replaceAll('09/', '01/')) }))
    const s = parseChaseStatement(pages)
    expect(s.rows[0]?.date).toBe('2026-12-26')
    expect(s.rows[1]?.date).toBe('2027-01-17')
    expect(s.reconciled).toBe(true)
  })
  it('blocks missing rows and malformed dated amounts', () => {
    expect(parseChaseStatement(samplePages.slice(0, 2)).reconciled).toBe(false)
    const s = parseChaseStatement(changed('OTHER SHOP 25.00', 'OTHER SHOP 25.xx'))
    expect(s.reconciled).toBe(false)
    expect(s.issues.length).toBeGreaterThan(0)
  })
  it('rejects missing closing dates and unsupported bank files', () => {
    expect(() => parseChaseStatement(changed('Opening/Closing Date', 'Unknown Date'))).toThrow()
    expect(() => parseChaseStatement(changed('www.chase.com/cardhelp', 'www.bank.example/help'))).toThrow()
  })
  it('blocks unsupported nonzero fees rather than silently dropping them', () => {
    const s = parseChaseStatement(changed('Fees Charged $0.00', 'Fees Charged $95.00'))
    expect(s.reconciled).toBe(false)
    expect(s.issues.join(' ')).toMatch(/费用/)
  })
  it('accepts a statement-summary label with a decorative footnote marker', () => {
    expect(parseChaseStatement(changed('Balance Transfers $', 'Balance Transfers` $')).reconciled).toBe(true)
  })
  it('counts merchant refunds containing payment or thank-you words as income', () => {
    for (const merchant of ['INSURANCE PAYMENT REFUND', 'THANK YOU FLOWERS']) {
      const s = parseChaseStatement(changed('ONLINE STORE RETURN', merchant))
      expect(s.rows[0]?.type).toBe('refund')
      expect(s.totals.refundCents).toBe(1000)
      expect(s.reconciled).toBe(true)
    }
  })
  it('blocks account adjustments whose credit nature cannot be determined', () => {
    for (const merchant of ['GOODWILL ADJUSTMENT', 'REWARDS STATEMENT CREDIT', 'PAYMENT REVERSAL']) {
      const s = parseChaseStatement(changed('ONLINE STORE RETURN', merchant))
      expect(s.reconciled).toBe(false)
      expect(s.issues.join(' ')).toMatch(/交易类型/)
    }
  })
  it('preserves wrapped merchant text and keeps the same ID across line layouts', async () => {
    const oneLine = parseChaseStatement(changed('OTHER SHOP 25.00', 'ONLINE STORE ORDER 123 ANYTOWN CA 25.00'))
    for (const lines of [['09/19 ONLINE STORE 25.00', 'ORDER 123 ANYTOWN CA'],
      ['09/19 ONLINE STORE', 'ORDER 123 ANYTOWN CA 25.00']]) {
      const pages = samplePages.map(p => ({ ...p, lines: p.lines.flatMap(l => l === '09/19 OTHER SHOP 25.00' ? lines : [l]) }))
      const wrapped = parseChaseStatement(pages)
      expect(wrapped.reconciled).toBe(true)
      expect(wrapped.rows[5]?.merchant).toBe('ONLINE STORE ORDER 123 ANYTOWN CA')
      expect(await statementTransactionId(wrapped, wrapped.rows[5]!)).toBe(await statementTransactionId(oneLine, oneLine.rows[5]!))
    }
  })
  it('retains descriptions split across continuation pages without changing duplicate IDs', async () => {
    const oneLine = parseChaseStatement(changed('OTHER SHOP 25.00', 'ONLINE STORE ORDER 123 ANYTOWN CA 25.00'))
    for (const [start, tail] of [['09/19 ONLINE STORE 25.00', 'ORDER 123 ANYTOWN CA'],
      ['09/19 ONLINE STORE', 'ORDER 123 ANYTOWN CA 25.00']]) {
      const pages = [samplePages[0]!, samplePages[1]!,
        { pageNumber: 3, lines: ['ACCOUNT ACTIVITY (CONTINUED)', start, 'Example Cardholder Page 3 of 4 Statement Date: 09/20/26'] },
        { pageNumber: 4, lines: ['Manage your account online at: www.chase.com/cardhelp', 'ACCOUNT ACTIVITY (CONTINUED)',
          'Date of', 'Transaction Merchant Name or Transaction Description $ Amount', tail, '2026 Totals Year-to-Date'] }]
      const s = parseChaseStatement(pages)
      expect(s.reconciled).toBe(true)
      expect(s.rows[5]).toMatchObject({ merchant: 'ONLINE STORE ORDER 123 ANYTOWN CA', pageNumber: 3 })
      expect(await statementTransactionId(s, s.rows[5]!)).toBe(await statementTransactionId(oneLine, oneLine.rows[5]!))
    }
  })
  it('distinguishes identical purchases and produces stable IDs independent of page layout', async () => {
    const s = parseChaseStatement(samplePages)
    const first = await statementTransactionId(s, s.rows[3]!)
    const second = await statementTransactionId(s, s.rows[4]!)
    expect(first).not.toBe(second)
    expect(first.length).toBeLessThanOrEqual(128)
    expect(await statementTransactionId(s, { ...s.rows[3]!, pageNumber: 4 })).toBe(first)
  })
  it('marks existing IDs as imported and matches manual duplicates only once', async () => {
    const s = parseChaseStatement(samplePages)
    const id = await statementTransactionId(s, s.rows[2]!)
    const base: Transaction = { id, date: '2026-08-20', merchant: 'Edited name', amountCents: 999,
      type: 'expense', category: 'other', accountId: 'card', note: '', source: 'pdf',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
    const rows = await reviewRows(s, [base, { ...base, id: 'manual', date: '2026-09-02',
      merchant: 'RALPHS #1 ANYTOWN CA', amountCents: 500, source: 'manual' }], 'card')
    expect(rows[2]?.status).toBe('imported')
    expect(rows[3]?.status).toBe('possible')
    expect(rows[4]?.status).toBe('new')
  })
})
