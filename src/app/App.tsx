import { tr } from '../lib/i18n'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getLanguage, subscribeLanguage } from '../lib/i18n'
import { LanguageSelect } from '../components/LanguageSelect'
import type { ReactNode } from 'react'
import { isFirebaseConfigured } from '../lib/firebase'
import { useAuth } from '../features/auth/useAuth'
import {
  createFirestoreRepository,
  createLocalRepository,
  createMemoryRepository,
  RecurringPostingFailure,
} from '../lib/repository'
import type { FinanceRepository } from '../lib/repository'
import { emptyFinanceData } from '../types/finance'
import type {
  Account,
  FinanceData,
  RecurringPayment,
  Transaction,
} from '../types/finance'
import { getDemoData } from '../lib/demo'
import { dueRecurringDates, localDate } from '../lib/finance'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Dialog } from '../components/Dialog'
import { Overview } from '../features/workspace/Overview'
import {
  Accounts,
  Recurring,
  Transactions,
} from '../features/workspace/Records'
import { Settings } from '../features/workspace/Settings'
import { StatementImport } from '../features/import/StatementImport'
import {
  AccountForm,
  RecurringForm,
  TransactionForm,
} from '../features/workspace/Forms'

type Mode = 'local' | 'cloud' | 'demo'
type Page = 'overview' | 'transactions' | 'accounts' | 'recurring' | 'settings'
type Modal =
  | { kind: 'transaction'; value?: Transaction }
  | { kind: 'account'; value?: Account }
  | { kind: 'recurring'; value?: RecurringPayment }
  | { kind: 'import'; value?: never }
  | {
      kind: 'delete'
      title: string
      description: string
      remove: () => Promise<void>
      blocked?: boolean
    }
const navigation: {
  id: Page
  label: string
  icon: IconName
  description: string
}[] = [
  {
    id: 'overview',
    get label() { return tr("财务总览") },
    icon: 'overview',
    get description() { return tr("每一笔收支，都让生活更清晰。") },
  },
  {
    id: 'transactions',
    get label() { return tr("收支明细") },
    icon: 'transactions',
    get description() { return tr("记录收入与消费，看清每一笔钱的去向。") },
  },
  {
    id: 'accounts',
    get label() { return tr("我的账户") },
    icon: 'accounts',
    get description() { return tr("把资产与负债，放在一张清晰的账本里。") },
  },
  {
    id: 'recurring',
    get label() { return tr("固定收支") },
    icon: 'recurring',
    get description() { return tr("为每个月的生活，提前做好安排。") },
  },
  {
    id: 'settings',
    get label() { return tr("设置与连接") },
    icon: 'settings',
    get description() { return tr("管理你的个人财务工作区。") },
  },
]

function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage)
  useEffect(() => { document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN' }, [language])
  const auth = useAuth()
  const [choice, setChoice] = useState<'auto' | 'local' | 'demo'>(
    isFirebaseConfigured ? 'auto' : 'local',
  )
  const [returnChoice, setReturnChoice] = useState<'auto' | 'local'>('local')
  const openDemo = () => {
    setReturnChoice(choice === 'auto' ? 'auto' : 'local')
    setChoice('demo')
  }
  const signIn = () => {
    setChoice('auto')
    void auth.signIn()
  }
  const mode: Mode =
    choice === 'demo' ? 'demo' : choice === 'local' ? 'local' : 'cloud'
  if (choice === 'auto' && (auth.loading || !auth.user))
    return (
      <div className="login-page">
        <div className="login-language"><LanguageSelect /></div>
        <div className="login-brand">
          <Icon name="leaf" size={27} /> Financial Summary
        </div>
        <main className="login-card">
          <p className="eyebrow">A CLEARER PICTURE</p>
          <h1>{tr("你的财务，")}<br />{tr("一目了然。")}</h1>
          <p>{tr("收入、消费、资产与每月的固定收支。")}<br />{tr("在一个属于你的空间，慢慢理清。")}</p>
          {auth.error && (
            <div className="error-banner" role="alert">
              {auth.error}
            </div>
          )}
          <button
            className="button button-primary"
            disabled={auth.loading || auth.signingIn}
            onClick={signIn}
          >
            {auth.loading
              ? tr("正在连接…")
              : auth.signingIn
                ? tr("等待 Google 登录完成…")
                : tr("使用 Google 登录")}
            <Icon name="arrow" size={18} />
          </button>
          <div className="login-options">
            <button className="text-button" onClick={() => setChoice('local')}>{tr("先使用本地账本")}</button>
            <button className="text-button" onClick={openDemo}>{tr("查看演示")}</button>
          </div>
          <small>{tr("使用 Firebase 登录，数据由你的个人访问规则保护。")}</small>
        </main>
        <div className="login-decoration" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </div>
    )
  return (
    <Workspace
      key={`${mode}:${mode === 'cloud' ? auth.user?.uid : ''}`}
      mode={mode}
      uid={mode === 'cloud' ? auth.user?.uid : undefined}
      email={mode === 'cloud' ? auth.user?.email : undefined}
      authError={auth.error}
      onDemo={openDemo}
      onReturn={() => setChoice(returnChoice)}
      onSignIn={signIn}
      onSignOut={() => {
        void auth.signOut()
      }}
    />
  )
}

function Workspace({
  mode,
  uid,
  email,
  authError,
  onDemo,
  onReturn,
  onSignIn,
  onSignOut,
}: {
  mode: Mode
  uid?: string
  email?: string | null
  authError: string | null
  onDemo: () => void
  onReturn: () => void
  onSignIn: () => void
  onSignOut: () => void
}) {
  const [state, setState] = useState<{
    data: FinanceData
    repository: FinanceRepository | null
    loading: boolean
    error: string | null
  }>({ data: emptyFinanceData(), repository: null, loading: true, error: null })
  const [page, setPage] = useState<Page>('overview')
  const [month, setMonth] = useState(localDate().slice(0, 7))
  const [modal, setModal] = useState<Modal | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [postingError, setPostingError] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    async function connect() {
      try {
        const repository =
          mode === 'cloud'
            ? await createFirestoreRepository(uid!)
            : mode === 'demo'
              ? createMemoryRepository(getDemoData())
              : createLocalRepository()
        if (disposed) return
        let posting = false
        const postScheduledRecurring = async (data: FinanceData) => {
          const today = localDate()
          if (posting) return
          if (!data.recurringPayments.some((p) => dueRecurringDates(p, today).length)) {
            setPostingError(null)
            return
          }
          posting = true
          const errors = new Set<string>()
          try {
            for (let batch = 0; batch < 100 && !disposed; batch += 1) {
              try {
                if ((await repository.postDueRecurring(today)) === 0) break
              } catch (error) {
                errors.add(error instanceof Error ? error.message : tr("固定收支自动记账失败。"))
                if (!(error instanceof RecurringPostingFailure) || error.processed === 0) break
              }
            }
          } finally {
            posting = false
            if (!disposed) setPostingError(errors.size ? [...errors].join('\n') : null)
          }
        }
        unsubscribe = repository.subscribe(
          (data) => {
            if (!disposed) {
              setState({ data, repository, loading: false, error: null })
              void postScheduledRecurring(data)
            }
          },
          (error) => {
            if (!disposed)
              setState((previous) => ({
                ...previous,
                loading: false,
                error: error.message,
                repository: null,
              }))
          },
        )
      } catch (error) {
        if (!disposed)
          setState((previous) => ({
            ...previous,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : tr("无法读取工作区，请重试。"),
            repository: null,
          }))
      }
    }
    void connect()
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [mode, uid])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])
  const { data, repository } = state
  const currentPage = navigation.find((n) => n.id === page)!
  const openModal = (value: Modal) => {
    setDeleteError(null)
    setModal(value)
  }
  const closeModal = () => {
    if (!busy) setModal(null)
  }
  const saved = async (operation: () => Promise<void>) => {
    setBusy(true)
    try {
      await operation()
      setModal(null)
      setToast(
        mode === 'cloud'
          ? tr("已保存到 Firebase")
          : mode === 'demo'
            ? tr("演示已更新，不会保存到你的账本")
            : tr("已保存到本地账本"),
      )
    } finally {
      setBusy(false)
    }
  }
  const requireRepository = () => {
    if (!repository) throw new Error(tr("工作区尚未连接，暂时无法保存。"))
    return repository
  }
  const deleteTransaction = (t: Transaction) =>
    openModal({
      kind: 'delete',
      title: tr("删除「{0}」", [t.merchant]),
      description: t.source === 'recurring' && t.type === 'expense'
        ? tr("删除后，这笔记录会从统计中移除，但已扣账的账户余额不会恢复；如需撤销扣账，请同时手动调整账户余额。")
        : tr("删除后，这笔记录将从对应月份的统计中移除。"),
      remove: () => requireRepository().deleteTransaction(t.id),
    })
  const deleteAccount = (a: Account) => {
    const linked =
      data.transactions.some((t) => t.accountId === a.id) ||
      data.recurringPayments.some((p) => p.accountId === a.id)
    openModal({
      kind: 'delete',
      title: tr("删除「{0}」", [a.name]),
      description: linked
        ? tr("这个账户仍被收支记录或固定收支引用。请先编辑相关记录，改为其他账户或「未指定账户」。")
        : tr("删除后，这个账户的余额将从资产汇总中移除。"),
      blocked: linked,
      remove: () => requireRepository().deleteAccount(a.id),
    })
  }
  let content: ReactNode
  if (page === 'settings')
    content = (
      <Settings mode={mode} uid={uid} email={email} onSignIn={onSignIn}
        onImport={() => openModal({ kind: 'import' })} canImport={!!repository && !state.loading && !state.error} />
    )
  else if (state.loading)
    content = (
      <div className="panel empty-state" role="status">
        <span className="loading-ring" />
        <p>{tr("正在读取你的账本…")}</p>
      </div>
    )
  else if (state.error)
    content = (
      <div className="panel empty-state">
        <Icon name="settings" size={32} />
        <h2>{tr("账本暂时无法读取")}</h2>
        <p>
          {mode === 'cloud'
            ? tr("请检查网络、Firestore 规则和 ownerUid 设置。")
            : tr("请保留当前浏览器数据，修复后再继续。")}
        </p>
        <button
          className="button button-quiet"
          onClick={() => setPage('settings')}
        >{tr("查看连接设置")}</button>
      </div>
    )
  else if (page === 'overview')
    content = (
      <Overview
        data={data}
        month={month}
        onTransactions={() => setPage('transactions')}
        onRecurring={() => setPage('recurring')}
      />
    )
  else if (page === 'transactions')
    content = (
      <Transactions
        data={data}
        month={month}
        onEdit={(value) => openModal({ kind: 'transaction', value })}
        onDelete={deleteTransaction}
        onImport={() => openModal({ kind: 'import' })}
      />
    )
  else if (page === 'accounts')
    content = (
      <Accounts
        data={data}
        onEdit={(value) => openModal({ kind: 'account', value })}
        onDelete={deleteAccount}
      />
    )
  else
    content = (
      <Recurring
        data={data}
        onEdit={(value) => openModal({ kind: 'recurring', value })}
        onDelete={(p) =>
          openModal({
            kind: 'delete',
            title: tr("删除「{0}」", [p.name]),
            get description() { return tr("删除计划不会删除已经生成的收支记录。") },
            remove: () => requireRepository().deleteRecurringPayment(p.id),
          })
        }
      />
    )
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setPage('overview')
          }}
        >
          <span className="brand-icon">
            <Icon name="leaf" size={26} />
          </span>
          <span>
            Financial<span>Summary</span>
          </span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label={tr("主要导航")}>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={`nav-button ${page === n.id ? 'active' : ''}`}
              aria-current={page === n.id ? 'page' : undefined}
              onClick={() => setPage(n.id)}
            >
              <Icon name={n.icon} size={19} />
              {n.label}
              {page === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-illustration">
              <Icon name="leaf" size={28} />
            </span>
            <strong>{tr("一点记录，多一点从容。")}</strong>
            <p>{tr("从今天的一笔开始，")}<br />{tr("看清生活的每个月。")}</p>
          </div>
          <div className="workspace-profile">
            <span className="profile-avatar">
              {email?.slice(0, 1).toUpperCase() ?? tr("我")}
            </span>
            <span>
              <strong>{email ?? tr("我的财务空间")}</strong>
              <small>
                {mode === 'cloud' ? tr("个人云端账本") : 'Personal finance'}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <header className="topbar">
          <LanguageSelect />
          <span className="breadcrumb">{tr("我的空间 ")}<span>/</span> {currentPage.label}
          </span>
          <div className="topbar-actions">
            <span className={`mode-indicator ${mode}`}>
              <i />
              {mode === 'cloud'
                ? tr("Firebase 云端")
                : mode === 'demo'
                  ? tr("演示模式")
                  : tr("本地模式")}
            </span>
            {mode === 'demo' ? (
              <button className="text-button" onClick={onReturn}>{tr("返回我的数据 ")}<Icon name="arrow" size={15} />
              </button>
            ) : (
              <button className="text-button" onClick={onDemo}>{tr("查看演示")}</button>
            )}
            {mode === 'cloud' && (
              <button className="text-button" onClick={onSignOut}>{tr("退出登录")}</button>
            )}
          </div>
        </header>
        <main className="main-content">
          <div className={`workspace-banner ${mode}`}>
            <Icon name={mode === 'cloud' ? 'check' : 'leaf'} size={17} />
            <span>
              {mode === 'cloud'
                ? tr("你的个人云端账本 · 仅显示当前登录账户的数据")
                : mode === 'demo'
                  ? tr("以下为虚构示例。可以自由试用，修改只保留在本次演示中。")
                  : tr("数据保存在当前浏览器。连接 Firebase 后，即可使用独立的云端账本。")}
            </span>
            {mode === 'local' && (
              <button
                className="text-button"
                onClick={() => setPage('settings')}
              >{tr("连接设置 ")}<Icon name="arrow" size={15} />
              </button>
            )}
          </div>
          {(state.error || postingError || authError) && (
            <div className="error-banner" role="alert">
              {state.error ?? postingError ?? authError}
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === 'overview'
                  ? 'YOUR MONEY, AT A GLANCE'
                  : 'FINANCIAL SUMMARY'}
              </p>
              <h1>{currentPage.label}</h1>
              <p>{currentPage.description}</p>
            </div>
            <div className="page-actions">
              {(page === 'overview' || page === 'transactions') && (
                <label className="month-picker">
                  <Icon name="recurring" size={17} />
                  <input
                    type="month"
                    aria-label={tr("查看月份")}
                    min="1900-01"
                    max="9999-12"
                    value={month}
                    onChange={(e) => {
                      if (
                        /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
                        Number(e.target.value.slice(0, 4)) >= 1900
                      )
                        setMonth(e.target.value)
                    }}
                  />
                </label>
              )}
              {page !== 'settings' && (
                <button
                  className="button button-primary"
                  disabled={!repository || state.loading || !!state.error}
                  onClick={() =>
                    openModal({
                      kind:
                        page === 'accounts'
                          ? 'account'
                          : page === 'recurring'
                            ? 'recurring'
                            : 'transaction',
                    })
                  }
                >
                  <Icon name="plus" size={18} />
                  {page === 'accounts'
                    ? tr("添加账户")
                    : page === 'recurring'
                      ? tr("添加计划")
                      : tr("新增记录")}
                </button>
              )}
            </div>
          </div>
          {content}
          <footer className="page-footer">
            <span>Financial Summary</span>
            <span>{tr("一份清晰的账本，一种从容的生活。")}</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <Dialog
          title={
            modal.kind === 'delete'
              ? modal.title
              : modal.kind === 'import'
                ? tr("导入 Chase 信用卡账单")
              : tr("{0}{1}", [modal.value ? tr("编辑") : tr("新增"), modal.kind === 'transaction' ? tr("收支记录") : modal.kind === 'account' ? tr("账户") : tr("固定收支")])
          }
          busy={busy}
          onClose={closeModal}
          wide={modal.kind === 'import'}
        >
          {modal.kind === 'import' && <StatementImport accounts={data.accounts} transactions={data.transactions}
            onImport={records => requireRepository().importTransactions(records)}
            onCancel={closeModal} onBusyChange={setBusy}
            onCreateAccount={() => { setModal(null); setPage('accounts'); setToast(tr("请添加账户，并把类型选择为「信用卡」。")) }} />}
          {modal.kind === 'transaction' && (
            <TransactionForm
              initial={modal.value}
              accounts={data.accounts}
              date={
                month === localDate().slice(0, 7) ? localDate() : `${month}-01`
              }
              onCancel={closeModal}
              onSave={(value) =>
                saved(() => requireRepository().saveTransaction(value))
              }
            />
          )}
          {modal.kind === 'account' && (
            <AccountForm
              initial={modal.value}
              onCancel={closeModal}
              onSave={(value) =>
                saved(() => requireRepository().saveAccount(value, modal.value?.balanceCents))
              }
            />
          )}
          {modal.kind === 'recurring' && (
            <RecurringForm
              initial={modal.value}
              accounts={data.accounts}
              onCancel={closeModal}
              onSave={(value) =>
                saved(() => requireRepository().saveRecurringPayment(value))
              }
            />
          )}
          {modal.kind === 'delete' && (
            <>
              <p className="delete-description">{modal.description}</p>
              {deleteError && (
                <div className="form-error" role="alert">
                  {deleteError}
                </div>
              )}
              <div className="form-actions">
                <button
                  className="button button-quiet"
                  disabled={busy}
                  onClick={closeModal}
                >
                  {modal.blocked ? tr("知道了") : tr("取消")}
                </button>
                {!modal.blocked && (
                  <button
                    className="button button-danger"
                    disabled={busy}
                    onClick={() => {
                      void saved(modal.remove).catch((error) =>
                        setDeleteError(
                          error instanceof Error
                            ? error.message
                            : tr("删除失败，请重试。"),
                        ),
                      )
                    }}
                  >
                    {busy ? tr("正在删除…") : tr("确认删除")}
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  )
}
export default App
