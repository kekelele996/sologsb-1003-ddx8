import type { GlossaryTerm, Segment, TranslationMemoryEntry, TranslationSuggestion } from './types'

/**
 * 归一化源文：忽略大小写并折叠多余空白（含换行两侧的空格）。
 * 维护者在多份文档间复制说明时产生的缩进、换行和大小写差异由此抹平。
 */
export const normalizeSource = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().toLowerCase()

/** 旧译文是否与当前术语表冲突：源文命中的术语，译文中未出现现行译法。 */
export const detectGlossaryConflict = (sourceText: string, targetText: string, glossary: GlossaryTerm[]) => {
  const conflictTerms = glossary
    .filter((term) => {
      const sourceHit = term.caseSensitive
        ? sourceText.includes(term.source)
        : sourceText.toLowerCase().includes(term.source.toLowerCase())
      return sourceHit && !targetText.includes(term.target)
    })
    .map((term) => term.source)
  return { glossaryConflict: conflictTerms.length > 0, conflictTerms }
}

interface MatchOptions {
  /** 已确认片段不再提示记忆译文；默认跳过。 */
  skipConfirmed?: boolean
  /** 已有译文的片段不再提示；默认跳过（导入时通常为空）。 */
  skipTranslated?: boolean
}

/**
 * 按归一化后的源文查找翻译记忆，返回每个片段至多一条、取最新确认的记忆条目。
 */
export const matchSuggestions = (
  segments: Segment[],
  memory: TranslationMemoryEntry[],
  glossary: GlossaryTerm[],
  options: MatchOptions = {},
): TranslationSuggestion[] => {
  const { skipConfirmed = true, skipTranslated = true } = options
  const byKey = new Map<string, TranslationMemoryEntry>()
  for (const entry of memory) {
    const key = normalizeSource(entry.sourceText)
    const existing = byKey.get(key)
    if (!existing || entry.confirmedAt > existing.confirmedAt) byKey.set(key, entry)
  }
  return segments.flatMap((segment) => {
    if (segment.kind === 'code') return []
    if (skipConfirmed && segment.status === 'confirmed') return []
    if (skipTranslated && segment.targetText.trim()) return []
    const entry = byKey.get(normalizeSource(segment.sourceText))
    if (!entry) return []
    const { glossaryConflict, conflictTerms } = detectGlossaryConflict(segment.sourceText, entry.targetText, glossary)
    return [{
      id: `suggestion-${segment.id}`,
      segmentId: segment.id,
      entryId: entry.id,
      sourceText: entry.sourceText,
      targetText: entry.targetText,
      sourceDocument: entry.sourceDocument,
      sourceSegmentLabel: entry.sourceSegmentLabel,
      author: entry.author,
      confirmedAt: entry.confirmedAt,
      glossaryConflict,
      conflictTerms,
      decision: 'pending' as const,
    }]
  })
}
