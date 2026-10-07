import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore'

const projectId = 'demo-financial-summary'
const ownerUid = 'owner-uid'
let testEnvironment

const transaction = {
  id: 'transaction-1',
  date: '2026-09-16',
  merchant: 'Salary',
  amountCents: 250_000,
  type: 'income',
  category: 'income',
  accountId: 'account-1',
  note: '',
  source: 'manual',
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
}

const account = {
  id: 'account-1',
  name: 'Checking',
  type: 'checking',
  balanceCents: 250_000,
  currency: 'USD',
  updatedAt: '2026-09-16T12:00:00.000Z',
}

const recurringPayment = {
  id: 'recurring-1',
  name: 'Rent',
  category: 'housing',
  amountCents: 120_000,
  frequency: 'monthly',
  nextDueDate: '2026-10-01',
  accountId: 'account-1',
  autoPay: true,
  active: true,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:00.000Z',
}

function firestoreFor(uid) {
  return uid
    ? testEnvironment.authenticatedContext(uid).firestore()
    : testEnvironment.unauthenticatedContext().firestore()
}

async function writeTransaction(uid, value = transaction, pathUid = uid) {
  return setDoc(
    doc(firestoreFor(uid), `users/${pathUid}/transactions/${value.id}`),
    value,
  )
}

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8085,
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'config/access'), { ownerUid })
  })
})

after(async () => {
  await testEnvironment.cleanup()
})

describe('owner access boundary', () => {
  test('allows PDF records for owner and rejects non-owner writes', async () => {
    await assertSucceeds(writeTransaction(ownerUid, { ...transaction, source: 'pdf' }))
    await assertFails(writeTransaction('intruder-uid', { ...transaction, source: 'pdf' }))
  })
  test('denies unauthenticated access', async () => {
    await assertFails(writeTransaction(undefined, transaction, ownerUid))
  })

  test('denies an authenticated non-owner in their own UID path', async () => {
    await assertFails(writeTransaction('intruder-uid', transaction, 'intruder-uid'))
  })

  test('denies unauthenticated and non-owner reads', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/${ownerUid}/transactions/${transaction.id}`),
        transaction,
      )
    })
    const path = `users/${ownerUid}/transactions/${transaction.id}`

    await assertFails(getDoc(doc(firestoreFor(undefined), path)))
    await assertFails(getDoc(doc(firestoreFor('intruder-uid'), path)))
  })

  test('allows the owner in the matching UID path', async () => {
    await assertSucceeds(writeTransaction(ownerUid))
    await assertSucceeds(
      getDoc(doc(firestoreFor(ownerUid), `users/${ownerUid}/transactions/${transaction.id}`)),
    )
  })

  test('denies the owner in a different UID path', async () => {
    await assertFails(writeTransaction(ownerUid, transaction, 'another-uid'))
  })

  test('denies the owner reading a different UID path', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), `users/another-uid/transactions/${transaction.id}`),
        transaction,
      )
    })

    await assertFails(
      getDoc(
        doc(
          firestoreFor(ownerUid),
          `users/another-uid/transactions/${transaction.id}`,
        ),
      ),
    )
  })

  test('denies client writes to the protected access document', async () => {
    await assertFails(
      setDoc(doc(firestoreFor(ownerUid), 'config/access'), { ownerUid: 'changed' }),
    )
  })

  test('denies client reads from the protected access document', async () => {
    await assertFails(getDoc(doc(firestoreFor(ownerUid), 'config/access')))
  })

  test('denies owner access when the protected owner document is missing', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(
        doc(db, `users/${ownerUid}/transactions/${transaction.id}`),
        transaction,
      )
      await deleteDoc(doc(db, 'config/access'))
    })

    await assertFails(writeTransaction(ownerUid, { ...transaction, merchant: 'Updated' }))
    await assertFails(
      getDoc(
        doc(
          firestoreFor(ownerUid),
          `users/${ownerUid}/transactions/${transaction.id}`,
        ),
      ),
    )
  })

  test('denies unknown collections', async () => {
    await assertFails(
      setDoc(doc(firestoreFor(ownerUid), `users/${ownerUid}/summaries/summary-1`), {
        id: 'summary-1',
      }),
    )
  })
})

describe('record validation', () => {
  test('accepts valid transaction, account, and recurring records', async () => {
    const db = firestoreFor(ownerUid)
    await assertSucceeds(writeTransaction(ownerUid))
    await assertSucceeds(
      setDoc(doc(db, `users/${ownerUid}/accounts/${account.id}`), account),
    )
    await assertSucceeds(
      setDoc(
        doc(db, `users/${ownerUid}/recurring_payments/${recurringPayment.id}`),
        recurringPayment,
      ),
    )
  })

  test('allows the owner to update and delete a valid record', async () => {
    const reference = doc(
      firestoreFor(ownerUid),
      `users/${ownerUid}/transactions/${transaction.id}`,
    )
    await assertSucceeds(setDoc(reference, transaction))
    await assertSucceeds(
      updateDoc(reference, {
        merchant: 'Updated salary',
        updatedAt: '2026-09-16T13:00:00.000Z',
      }),
    )
    await assertSucceeds(deleteDoc(reference))
  })

  test('denies invalid amounts and allowlisted types', async (t) => {
    const cases = [
      { name: 'zero transaction amount', value: { ...transaction, amountCents: 0 } },
      { name: 'fractional transaction amount', value: { ...transaction, amountCents: 1.5 } },
      { name: 'unknown transaction type', value: { ...transaction, type: 'gift' } },
    ]
    for (const { name, value } of cases) {
      await t.test(name, async () => assertFails(writeTransaction(ownerUid, value)))
    }

    const db = firestoreFor(ownerUid)
    await assertFails(
      setDoc(doc(db, `users/${ownerUid}/accounts/${account.id}`), {
        ...account,
        balanceCents: -1,
      }),
    )
    await assertFails(
      setDoc(
        doc(db, `users/${ownerUid}/recurring_payments/${recurringPayment.id}`),
        { ...recurringPayment, frequency: 'daily' },
      ),
    )
  })

  test('denies unknown fields', async () => {
    await assertFails(
      writeTransaction(ownerUid, { ...transaction, serverOnly: true }),
    )
  })

  test('denies impossible or non-canonical dates and timestamps', async (t) => {
    const cases = [
      { name: 'day zero', value: { ...transaction, date: '2026-09-00' } },
      { name: 'impossible calendar date', value: { ...transaction, date: '2026-02-30' } },
      {
        name: 'malformed timestamp',
        value: { ...transaction, updatedAt: '2026-09-16TgarbageZ' },
      },
    ]
    for (const { name, value } of cases) {
      await t.test(name, async () => assertFails(writeTransaction(ownerUid, value)))
    }
  })

  test('denies whitespace-only required text', async () => {
    await assertFails(writeTransaction(ownerUid, { ...transaction, merchant: '   ' }))
  })

  test('denies IDs with leading or trailing whitespace', async () => {
    await assertFails(
      writeTransaction(ownerUid, { ...transaction, id: ' transaction-1 ' }),
    )
    await assertFails(
      writeTransaction(ownerUid, { ...transaction, accountId: ' account-1 ' }),
    )
  })
})


describe('recurring end date validation', () => {
  test('accepts an end date, permits clearing it and retains legacy records', async () => {
    const reference = doc(firestoreFor(ownerUid), `users/${ownerUid}/recurring_payments/${recurringPayment.id}`)
    await assertSucceeds(setDoc(reference, { ...recurringPayment, endDate: '2026-10-01' }))
    await assertSucceeds(updateDoc(reference, { endDate: '' }))
    await assertSucceeds(setDoc(reference, recurringPayment))
  })
  test('rejects invalid end dates and dates before the first payment', async () => {
    const reference = doc(firestoreFor(ownerUid), `users/${ownerUid}/recurring_payments/${recurringPayment.id}`)
    for (const endDate of ['2026-09-30', '2026-02-30', null, 123]) {
      await assertFails(setDoc(reference, { ...recurringPayment, endDate }))
    }
  })
})

describe('scheduled income rules', () => {
  test('commits an automatic expense debit with its record and progress, and rejects a partial invalid debit', async () => {
    const db = firestoreFor(ownerUid)
    const planRef = doc(db, `users/${ownerUid}/recurring_payments/${recurringPayment.id}`)
    const accountRef = doc(db, `users/${ownerUid}/accounts/${account.id}`)
    const expenseRef = doc(db, `users/${ownerUid}/transactions/auto-rent`)
    const plan = { ...recurringPayment, type: 'expense', autoPost: true }
    const expense = { ...transaction, id: 'auto-rent', type: 'expense', source: 'recurring', amountCents: 120000 }
    await assertSucceeds(setDoc(planRef, plan))
    await assertSucceeds(setDoc(accountRef, account))
    await assertSucceeds(runTransaction(db, async tx => {
      const current = (await tx.get(accountRef)).data()
      tx.set(accountRef, { ...current, balanceCents: current.balanceCents - 120000 })
      tx.set(expenseRef, expense)
      tx.set(planRef, { ...plan, lastPostedDate: '2026-10-01' })
    }))
    assert.equal((await getDoc(accountRef)).data().balanceCents, 130000)
    const secondRef = doc(db, `users/${ownerUid}/transactions/second-rent`)
    await assertFails(runTransaction(db, async tx => {
      const current = (await tx.get(accountRef)).data()
      tx.set(accountRef, { ...current, balanceCents: -1 })
      tx.set(secondRef, { ...expense, id: 'second-rent' })
      tx.set(planRef, { ...plan, lastPostedDate: '2026-11-01' })
    }))
    assert.equal((await getDoc(accountRef)).data().balanceCents, 130000)
    assert.equal((await getDoc(secondRef)).exists(), false)
    assert.equal((await getDoc(planRef)).data().lastPostedDate, '2026-10-01')
  })
  test('accepts income plan and generated income, while retaining legacy expenses', async () => {
    const db = firestoreFor(ownerUid)
    await assertSucceeds(setDoc(
      doc(db, `users/${ownerUid}/recurring_payments/${recurringPayment.id}`),
      { ...recurringPayment, type: 'income', autoPost: true, lastPostedDate: '2026-10-01' },
    ))
    await assertSucceeds(writeTransaction(ownerUid, { ...transaction, source: 'recurring' }))
    await assertSucceeds(setDoc(
      doc(db, `users/${ownerUid}/recurring_payments/legacy`),
      { ...recurringPayment, id: 'legacy' },
    ))
  })
  test('rejects invalid schedule types and posting dates', async () => {
    const db = firestoreFor(ownerUid)
    for (const changes of [
      { type: 'transfer' }, { autoPost: 'yes' }, { type: 'expense', autoPost: true, accountId: '' },
      { lastPostedDate: '2026-02-30' },
    ]) {
      await assertFails(setDoc(
        doc(db, `users/${ownerUid}/recurring_payments/${recurringPayment.id}`),
        { ...recurringPayment, ...changes },
      ))
    }
  })
})
