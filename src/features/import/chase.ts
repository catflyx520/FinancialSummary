import { tr } from '../../lib/i18n'
import { parseMoney } from '../../lib/finance'
import type { Transaction, TransactionType } from '../../types/finance'

export interface StatementPage { pageNumber: number; lines: string[] }
export interface StatementRow {
  date: string
  merchant: string
  amountCents: number
  signedCents: number
  type: TransactionType
  category: string
  pageNumber: number
  occurrence: number
}
export interface ChaseStatement {
  openingDate: string
  closingDate: string
  last4: string
  rows: StatementRow[]
  totals: { expenseCents: number; refundCents: number; transferCents: number }
  expected: { purchasesCents: number; creditsCents: number }
  issues: string[]
  reconciled: boolean
}
export interface ReviewRow extends StatementRow {
  id: string
  status: 'new' | 'possible' | 'imported'
  existingAccountId?: string
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()
const canonical = (value: string) => clean(value).toUpperCase()
const moneyPattern = '[-+]?(?:\\$)?(?:\\d{1,3}(?:,\\d{3})*|\\d+)\\.\\d{2}'
const rowPattern = new RegExp(`^(\\d{2}/\\d{2})\\s+(.+?)\\s+(${moneyPattern})$`)
const continuationPattern = new RegExp(`^(.+?)\\s+(${moneyPattern})$`)
const cents = (value: string) => parseMoney(value.replace(/[$,+]/g, ''))

function isoDate(month: number, day: number, year: number): string {
  const text = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const date = new Date(`${text}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(tr("账单包含无效日期。"))
  }
  return text
}
function statementDate(text: string): string {
  const [month, day, year] = text.split('/').map(Number)
  return isoDate(month, day, year < 100 ? 2000 + year : year)
}
function activityHeading(line: string): boolean {
  const compact = line.toUpperCase().replace(/[^A-Z]/g, '')
  return compact.includes('ACCOUNTACTIVITY') ||
    compact.replace(/(.)\1/g, '$1').includes('ACCOUNTACTIVITY')
}
function suggestedCategory(merchant: string): string {
  const name = canonical(merchant)
  if (/RALPHS|99 RANCH|SUPERMARKET|GROCERY|WHOLE FOODS|TRADER JOE/.test(name)) return 'groceries'
  if (/ELECTRIFY|EVGO|CHARGEPOINT|PARKING|UBER|LYFT|SHELL|CHEVRON/.test(name)) return 'transportation'
  if (/CHATGPT|NETFLIX|SPOTIFY|SUBSCR/.test(name)) return 'subscription'
  if (/CVS|PHARMACY|MEDICAL|HOSPITAL/.test(name)) return 'health'
  if (/STEAM|CINEMA|MOVIE/.test(name)) return 'entertainment'
  if (/AMAZON|AMZN|TARGET|UNIQLO|ADIDAS|DAISO|KIEHL/.test(name)) return 'shopping'
  if (/CAFE|TEA\b|COFFEE|MCDONALD|CHIPOTLE|DOORDASH|FANTUAN|HUNGRYPANDA|BAKERY|POKE|KITCHEN|CHAO WEI|BOILING POINT|KOPITIAM|TAQUERIA|GINSENG|HANDCRAFTE|YUNNAN|CHICKEN BUN/.test(name)) return 'food'
  return 'other'
}

export function parseChaseStatement(pages: StatementPage[]): ChaseStatement {
  const all = pages.flatMap(p => p.lines.map(clean)).join('\n')
  if (!/chase\.com|CHASE CARD/i.test(all)) throw new Error(tr("目前只支持 Chase 文字型信用卡账单。"))
  const period = all.match(/Opening\s*\/\s*Closing\s+Date\s+(\d{2}\/\d{2}\/\d{2,4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{2,4})/i)
  if (!period) throw new Error(tr("找不到有效的账期与结账日，无法确定交易年份。"))
  const openingDate = statementDate(period[1])
  const closingDate = statementDate(period[2])
  if (openingDate > closingDate) throw new Error(tr("账期开启日晚于结账日。"))
  const last4 = all.match(/Account\s+Number\s*:?\s*X[\sX*-]*(\d{4})\b/i)?.[1]
  if (!last4) throw new Error(tr("找不到卡号末四位，无法安全识别重复账单。"))
  const issues: string[] = []
  const summary = (label: string): number | undefined => {
    const match = all.match(new RegExp(`^${label}[\\x60*†‡]*\\s+(${moneyPattern})\\s*$`, 'im'))
    return match ? cents(match[1]) : undefined
  }
  const purchases = summary('Purchases')
  const credits = summary('Payments?,\\s*Credits')
  for (const [label, chinese] of [['Fees Charged', tr("费用")], ['Interest Charged', tr("利息")],
    ['Cash Advances', tr("现金预借")], ['Balance Transfers', tr("余额转移")]]) {
    const amount = summary(label)
    if (amount === undefined) issues.push(tr("缺少{0}摘要，不能核对完整账单。", [chinese]))
    else if (amount !== 0) issues.push(tr("账单包含非零{0}，首版尚不支持，请手动记录并核对。", [chinese]))
  }
  if (purchases === undefined || credits === undefined) issues.push(tr("缺少消费或付款退款摘要，无法核对交易总额。"))
  const rows: StatementRow[] = []
  const occurrences = new Map<string, number>()
  let active = false
  let section = ''
  let pending: { date: string; description: string; pageNumber: number; amountText?: string } | undefined
  const flushPending = () => {
    if (pending?.amountText) addRow(pending.date, pending.description, pending.amountText, pending.pageNumber)
    else if (pending) issues.push(tr("第 {0} 页 {1} 的交易金额无法识别。", [pending.pageNumber, pending.date]))
    pending = undefined
  }
  function addRow(dateText: string, description: string, amountText: string, pageNumber: number) {
    try {
      const signedCents = cents(amountText)
      if (signedCents === 0 || Math.abs(signedCents) > 100_000_000_000) throw new Error(tr("金额超出范围"))
      const [month, day] = dateText.split('/').map(Number)
      const closingYear = Number(closingDate.slice(0, 4))
      const date = isoDate(month, day, closingYear - (month > Number(closingDate.slice(5, 7)) ? 1 : 0))
      const distance = (Date.parse(closingDate) - Date.parse(date)) / 86400000
      if (distance < 0 || distance > 62) throw new Error(tr("日期超出可核对范围"))
      const merchant = clean(description)
      let type: TransactionType = 'expense'
      if (signedCents < 0) {
        if (/\bADJUSTMENT\b|\bREWARDS?\b|\bCASH\s*BACK\b|^(?:ACCOUNT|BALANCE|STATEMENT|PROMOTIONAL) CREDIT\b/i.test(merchant)) {
          throw new Error(tr("无法确定信用调整性质"))
        }
        const repayment = /^(?:(?:AUTOMATIC|AUTO|ONLINE|MOBILE|WEB|ELECTRONIC|PHONE)\s+)?PAYMENT(?:\s*[-–]\s*|\s+)THANK YOU$/i.test(merchant)
        if (!repayment && /^(?:(?:AUTOMATIC|AUTO|ONLINE|MOBILE|WEB|ELECTRONIC|PHONE)\s+)?PAYMENT\b/i.test(merchant)) {
          throw new Error(tr("无法确定付款调整性质"))
        }
        type = repayment ? 'transfer' : 'refund'
      }
      else if (section === 'credits') throw new Error(tr("无法确定正数信用交易性质"))
      const key = `${date}|${canonical(merchant)}|${signedCents}`
      const occurrence = (occurrences.get(key) ?? 0) + 1
      occurrences.set(key, occurrence)
      rows.push({ date, merchant, signedCents, amountCents: Math.abs(signedCents), type,
        category: type === 'transfer' ? 'other' : suggestedCategory(merchant), pageNumber, occurrence })
    } catch {
      issues.push(tr("第 {0} 页 {1} 的日期、金额或交易类型无法核对。", [pageNumber, dateText]))
    }
  }
  for (const page of pages) {
    for (const raw of page.lines) {
      const line = clean(raw)
      if (activityHeading(line)) { active = true; continue }
      if (!active) continue
      if (/^(?:\d{4}\s+Totals Year.to.Date|INTEREST CHARGES|IINNTTEERREESSTT|TOTAL FEES|TOTAL INTEREST)/i.test(line)) {
        flushPending(); active = false; continue
      }
      if (/^PAYMENTS AND OTHER CREDITS$/i.test(line)) { flushPending(); section = 'credits'; continue }
      if (/^PURCHASES?$/i.test(line)) { flushPending(); section = 'purchases'; continue }
      const match = line.match(rowPattern)
      if (match) {
        flushPending()
        pending = { date: match[1], description: match[2], amountText: match[3], pageNumber: page.pageNumber }
        continue
      }
      if (/Page\s*\d+|Statement Date/i.test(line)) { active = false; continue }
      if (/^Date of|^Transaction\b|^Merchant Name|chase\.com/i.test(line)) continue
      const start = line.match(/^(\d{2}\/\d{2})\s+(.+)$/)
      if (start) {
        flushPending()
        if (/^(?:YUAN RENMINBI|EURO|POUND STERLING|JAPANESE YEN|CANADIAN DOLLAR|MEXICAN PESO)\b/i.test(start[2])) continue
        pending = { date: start[1], description: start[2], pageNumber: page.pageNumber }
      } else if (pending && line) {
        const tail = line.match(continuationPattern)
        if (!pending.amountText && tail) {
          pending.description += ` ${tail[1]}`
          pending.amountText = tail[2]
        } else pending.description += ` ${line}`
      }
    }
    active = false
  }
  flushPending()
  const totals = { expenseCents: 0, refundCents: 0, transferCents: 0 }
  for (const row of rows) {
    if (row.type === 'expense') totals.expenseCents += row.amountCents
    if (row.type === 'refund') totals.refundCents += row.amountCents
    if (row.type === 'transfer') totals.transferCents += row.amountCents
  }
  if (!rows.length) issues.push(tr("没有识别到交易明细；扫描图片型 PDF 暂不支持。"))
  if (purchases !== undefined && totals.expenseCents !== purchases) issues.push(tr("消费总额与账单摘要不一致，可能缺页或有未识别交易。"))
  if (credits !== undefined && totals.refundCents + totals.transferCents !== -credits) issues.push(tr("退款和还款总额与账单摘要不一致，可能缺页或有未识别交易。"))
  return { openingDate, closingDate, last4, rows, totals, issues,
    expected: { purchasesCents: purchases ?? 0, creditsCents: credits ?? 0 }, reconciled: issues.length === 0 }
}

export async function statementTransactionId(statement: ChaseStatement, row: StatementRow): Promise<string> {
  const input = ['chase-v1', statement.last4, statement.closingDate, row.date,
    canonical(row.merchant), row.signedCents, row.occurrence].join('|')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return `pdf_chase_${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')}`
}

export async function reviewRows(
  statement: ChaseStatement, transactions: Transaction[], accountId: string,
): Promise<ReviewRow[]> {
  const usedManualIds = new Set<string>()
  const ids = await Promise.all(statement.rows.map(row => statementTransactionId(statement, row)))
  return statement.rows.map((row, index) => {
    const id = ids[index]
    const existing = transactions.find(t => t.id === id)
    if (existing) return { ...row, id, status: 'imported' as const, existingAccountId: existing.accountId }
    const possible = transactions.find(t => t.source !== 'pdf' && !usedManualIds.has(t.id) &&
      t.accountId === accountId && t.date === row.date && t.type === row.type &&
      t.amountCents === row.amountCents && canonical(t.merchant) === canonical(row.merchant))
    if (possible) usedManualIds.add(possible.id)
    return { ...row, id, status: possible ? 'possible' as const : 'new' as const }
  })
}
