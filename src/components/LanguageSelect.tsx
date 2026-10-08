import { useSyncExternalStore } from 'react'
import { getLanguage, setLanguage, subscribeLanguage } from '../lib/i18n'

export function LanguageSelect() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage)
  return <label className="language-select">
    <span aria-hidden="true">◎</span>
    <select aria-label="语言 / Language" value={language}
      onChange={event => setLanguage(event.target.value === 'en' ? 'en' : 'zh')}>
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  </label>
}
