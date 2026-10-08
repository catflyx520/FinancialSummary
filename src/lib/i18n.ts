import english from './translations.en.json'

export type Language = 'zh' | 'en'
const STORAGE_KEY = 'financial-summary:language'
const listeners = new Set<() => void>()
export function getLanguage(): Language {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh' }
  catch { return fallbackLanguage }
}
let fallbackLanguage: Language = 'zh'
export function setLanguage(language: Language) {
  fallbackLanguage = language
  try { localStorage.setItem(STORAGE_KEY, language) } catch { /* Private browsing. */ }
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  listeners.forEach(listener => listener())
}
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function locale() { return getLanguage() === 'en' ? 'en-US' : 'zh-CN' }
export function tr(source: string, values: unknown[] = []): string {
  const key = source.trim().replace(/\s+/g, ' ')
  const translated = getLanguage() === 'en'
    ? ((english as Record<string, string>)[key] === undefined ? source
      : (source.match(/^\s*/)?.[0] ?? '') + (english as Record<string, string>)[key] + (source.match(/\s*$/)?.[0] ?? ''))
    : source
  return translated.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''))
}
