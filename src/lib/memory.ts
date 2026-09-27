import type { GlossaryTerm, MemoryEntry, MemorySuggestion, Segment } from './types'

export const MEMORY_KEY = 'sologsb-1003-translation-memory-v1'
const MEMORY_LIMIT = 500

/** 匹配时忽略多余空白与大小写。 */
export const normalizeSource = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

export function loadMemory(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MemoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMemory(entries: MemoryEntry[]) {
  try {
    const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MEMORY_LIMIT)
    localStorage.setItem(MEMORY_KEY, JSON.stringify(sorted))
  } catch { /* storage may be unavailable */ }
}

/** 把文档中已确认的片段写入翻译记忆，返回合并后的完整记忆。 */
export function rememberConfirmed(segments: Segment[], documentTitle: string): MemoryEntry[] {
  const byKey = new Map(loadMemory().map((entry) => [entry.normalizedSource, entry]))
  for (const segment of segments) {
    if (segment.status !== 'confirmed' || !segment.sourceText.trim() || !segment.targetText.trim()) continue
    const normalizedSource = normalizeSource(segment.sourceText)
    byKey.set(normalizedSource, {
      id: byKey.get(normalizedSource)?.id ?? `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceText: segment.sourceText,
      normalizedSource,
      targetText: segment.targetText,
      documentTitle,
      updatedAt: Date.now(),
    })
  }
  const next = Array.from(byKey.values())
  saveMemory(next)
  return next
}

/** 导入时为片段查找已确认译文；若当前术语表译法已变化，则标出冲突。 */
export function buildSuggestion(segment: Segment, memory: MemoryEntry[], glossary: GlossaryTerm[]): MemorySuggestion | null {
  if (segment.targetText.trim()) return null
  const key = normalizeSource(segment.sourceText)
  if (!key) return null
  const entry = memory.find((item) => item.normalizedSource === key)
  if (!entry) return null
  const glossaryConflicts = glossary
    .filter((term) => {
      const sourceHit = term.caseSensitive
        ? segment.sourceText.includes(term.source)
        : segment.sourceText.toLowerCase().includes(term.source.toLowerCase())
      return sourceHit && !entry.targetText.includes(term.target)
    })
    .map((term) => `术语“${term.source}”现译为“${term.target}”，旧译文仍使用其他译法`)
  return {
    segmentId: segment.id,
    targetText: entry.targetText,
    sourceDocument: entry.documentTitle,
    matchedSource: entry.sourceText,
    glossaryConflicts,
    decision: 'pending',
  }
}
