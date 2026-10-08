import { tr } from '../../lib/i18n'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { isFirebaseConfigured } from '../../lib/firebase'

export function Settings({
  mode,
  uid,
  email,
  onSignIn,
  onImport,
  canImport,
}: {
  mode: string
  uid?: string
  email?: string | null
  onSignIn: () => void
  onImport: () => void
  canImport: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h2>{tr("数据与连接")}</h2>
        <div className="setting-line">
          <span>{tr("当前工作区")}</span>
          <strong>
            {mode === 'cloud'
              ? tr("Firebase 云端")
              : mode === 'demo'
                ? tr("演示 · 仅内存")
                : tr("本地 · 当前浏览器")}
          </strong>
        </div>
        <div className="setting-line">
          <span>{tr("计价货币")}</span>
          <strong>{tr("USD 美元")}</strong>
        </div>
        <div className="setting-line">
          <span>{tr("Firebase 配置")}</span>
          <strong>{isFirebaseConfigured ? tr("已填写") : tr("尚未填写")}</strong>
        </div>
        {email && (
          <div className="setting-line">
            <span>{tr("登录账户")}</span>
            <strong>{email}</strong>
          </div>
        )}
        {uid && (
          <div className="uid-box">
            <span>{tr("你的 Authentication UID")}</span>
            <code>{uid}</code>
            <button
              className="button button-quiet"
              onClick={() => {
                void navigator.clipboard
                  .writeText(uid)
                  .then(() => {
                    setCopied(true)
                    setCopyError(false)
                  })
                  .catch(() => setCopyError(true))
              }}
            >
              <Icon name="check" size={15} />
              {copied ? tr("已复制 UID") : tr("复制 UID")}
            </button>
            {copyError && (
              <small role="alert">{tr("无法自动复制，请手动选择上方 UID。")}</small>
            )}
          </div>
        )}
        {mode === 'local' && (
          <p className="info-note">{tr("本地数据只保存在当前浏览器。清除浏览器数据会删除这些记录；接入 Firebase 后，云端工作区独立保存，不会自动搬入本地记录。")}</p>
        )}
        {isFirebaseConfigured && !uid && (
          <button className="button button-primary" onClick={onSignIn}>{tr("连接 Google 账户 ")}<Icon name="arrow" size={16} />
          </button>
        )}
      </section>
      <section className="panel settings-panel">
        <p className="eyebrow">GET CONNECTED</p>
        <h2>{tr("接入你的 Firebase")}</h2>
        <ol className="setup-steps">
          <li>
            <span>01</span>
            <div>
              <strong>{tr("注册一个 Web 应用")}</strong>
              <p>{tr("Firebase 控制台 → 项目设置 → 你的应用，复制 firebaseConfig 到项目的 .env.local。")}</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>{tr("启用 Google 登录和 Firestore")}</strong>
              <p>{tr("在 Authentication 添加 Google 提供商；本地调试时把 localhost 加入授权域名。")}</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>{tr("指定你的 UID 并发布规则")}</strong>
              <p>{tr("在 Firestore 创建 config/access，ownerUid 填你的 UID，然后部署项目内的 firestore.rules。")}</p>
            </div>
          </li>
        </ol>
        <p className="field-note">{tr("详细步骤见项目 FIREBASE_SETUP.md。公开 Web 配置足够，前端不需要服务账号私钥。")}</p>
        <a
          className="text-button"
          href="https://console.firebase.google.com/"
          target="_blank"
          rel="noreferrer"
        >{tr("打开 Firebase 控制台 ")}<Icon name="arrow" size={16} />
        </a>
      </section>
      <section className="panel settings-panel settings-wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">STATEMENT IMPORT</p>
            <h2>{tr("银行账单导入")}</h2>
          </div>
          <span className="small-tag">{tr("Chase 信用卡 PDF")}</span>
        </div>
        <p className="subtle">{tr("读取 Chase 文字型月结账单，先预览、修改分类并选择信用卡账户，再确认导入。 退款计入收入，还款记为转账；重复账单会跳过已有记录。")}</p>
        <p className="field-note">{tr("原 PDF 在浏览器本地解析；仅确认后的交易保存到当前账本。扫描图片、加密 PDF 与其他银行暂不支持。")}</p>
        <button className="button button-primary" onClick={onImport} disabled={!canImport}>{tr("导入 Chase PDF")}</button>
      </section>
    </div>
  )
}
