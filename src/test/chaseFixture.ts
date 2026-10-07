import type { StatementPage } from '../features/import/chase'

export const samplePages: StatementPage[] = [
  { pageNumber: 1, lines: [
    'Manage your account online at: www.chase.com/cardhelp',
    'Account Number: XXXX XXXX XXXX 1234',
    'Opening/Closing Date 08/21/26 - 09/20/26',
    'Payment, Credits -$110.00', 'Purchases +$55.00',
    'Cash Advances $0.00', 'Balance Transfers $0.00',
    'Fees Charged $0.00', 'Interest Charged $0.00',
  ] },
  { pageNumber: 2, lines: [
    'AACCCCOOUUNNTT AACCTTIIVVIITTYY',
    'Date of Transaction Merchant Name or Transaction Description $ Amount',
    'PAYMENTS AND OTHER CREDITS',
    '08/26 ONLINE STORE RETURN -10.00',
    '09/17 AUTOMATIC PAYMENT - THANK YOU -100.00',
    'PURCHASE', '08/20 CAFE A 20.00',
    '08/21 YUAN RENMINBI', '150.00 X 0.133333333 (EXCHG RATE)',
    '09/02 RALPHS #1 ANYTOWN CA 5.00', '09/02 RALPHS #1 ANYTOWN CA 5.00',
  ] },
  { pageNumber: 3, lines: [
    'ACCOUNT ACTIVITY (CONTINUED)',
    'Date of Transaction Merchant Name or Transaction Description $ Amount',
    '09/19 OTHER SHOP 25.00',
    '2026 Totals Year-to-Date', 'Total fees charged in 2026 $95.00',
    'INTEREST CHARGES', 'Purchases 26.49%(v)(d) - 0 - - 0 -',
  ] },
]
