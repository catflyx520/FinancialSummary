import { tr } from '../../lib/i18n'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { StatementPage } from './chase'

interface TextItemLike { str: string; width: number; transform: number[] }

export function textItemsToLines(items: TextItemLike[]): string[] {
  const groups: { y: number; items: TextItemLike[] }[] = []
  const seen = new Set<string>()
  for (const item of [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    if (!item.str.trim()) continue
    const [x, y] = item.transform.slice(4, 6)
    const key = `${x.toFixed(1)}|${y.toFixed(1)}|${item.str}`
    if (seen.has(key)) continue
    seen.add(key)
    let group = groups.find(g => Math.abs(g.y - y) < 1.8)
    if (!group) { group = { y, items: [] }; groups.push(group) }
    group.items.push(item)
  }
  return groups.sort((a, b) => b.y - a.y).map(group => {
    let line = ''
    let end = -Infinity
    for (const item of group.items.sort((a, b) => a.transform[4] - b.transform[4])) {
      const x = item.transform[4]
      line += (line && x - end > 1.5 ? ' ' : '') + item.str
      end = Math.max(end, x + item.width)
    }
    return line.replace(/\s+/g, ' ').trim()
  })
}

export async function readStatementPdf(file: File): Promise<StatementPage[]> {
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) throw new Error(tr("请选择 PDF 文件。"))
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(tr("PDF 必须非空且不超过 20 MB。"))
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
    useSystemFonts: false, disableFontFace: true, useWorkerFetch: false,
  })
  try {
    const document = await task.promise
    if (document.numPages > 40) throw new Error(tr("目前最多支持 40 页的账单。"))
    const pages: StatementPage[] = []
    let length = 0
    for (let n = 1; n <= document.numPages; n += 1) {
      const page = await document.getPage(n)
      const content = await page.getTextContent()
      const lines = textItemsToLines(content.items.filter((item): item is TextItemLike & typeof item => 'str' in item))
      length += lines.join('').length
      if (length > 1_000_000) throw new Error(tr("PDF 文字过多，请选择单份月结账单。"))
      pages.push({ pageNumber: n, lines })
      page.cleanup()
    }
    if (length < 50) throw new Error(tr("PDF 没有可读取的文字；扫描图片型账单暂不支持。"))
    return pages
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error(tr("暂不支持加密 PDF，请提供可直接打开的账单。"), { cause: error })
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error(tr("PDF 无法读取，请重新下载完整账单。"), { cause: error })
    throw error
  } finally {
    await task.destroy()
  }
}
