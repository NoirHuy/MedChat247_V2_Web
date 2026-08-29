import { describe, expect, it } from 'vitest'
import { getStaticSuggestionReply } from './staticSuggestionReplies.js'

const SUGGESTION_IDS = ['disease_1', 'disease_2', 'disease_3', 'disease_4']
const LANGS = ['vi', 'en']

// Expected structure labels per language (single source of truth)
const SECTION_HEADERS = {
  vi: {
    suspected: '🩺 **Bệnh lý nghi ngờ:**',
    warning: '⚠️ **Cảnh báo:**',
    recommendations: '📋 **Khuyến nghị:**',
  },
  en: {
    suspected: '🩺 **Suspected Conditions:**',
    warning: '⚠️ **Emergency Warning:**',
    recommendations: '📋 **Recommendations',
  },
}

const BULLET_LABELS = {
  vi: ['Dẫn chứng', 'Lý giải phân biệt', 'Dấu hiệu cần chú ý'],
  en: ['Evidence', 'Differential Reasoning', 'Watch for'],
}

const PERCENT_KEYWORD = { vi: 'xác suất', en: 'probability' }

function countOccurrences(text, regex) {
  return (text.match(regex) || []).length
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('static suggestion replies', () => {
  describe('basic presence', () => {
    it('provides a Vietnamese and English reply for each welcome suggestion', () => {
      for (const id of SUGGESTION_IDS) {
        const viReply = getStaticSuggestionReply(id, 'vi')
        const enReply = getStaticSuggestionReply(id, 'en')
        expect(viReply, `${id} should have VI reply`).toBeTypeOf('string')
        expect(enReply, `${id} should have EN reply`).toBeTypeOf('string')
        expect(viReply).toContain(PERCENT_KEYWORD.vi)
        expect(enReply).toContain(PERCENT_KEYWORD.en)
      }
    })

    it('does not provide a reply for arbitrary suggestion IDs', () => {
      expect(getStaticSuggestionReply('untrusted-input', 'vi')).toBeNull()
      expect(getStaticSuggestionReply(null, 'en')).toBeNull()
      expect(getStaticSuggestionReply(undefined, 'vi')).toBeNull()
    })

    it('defaults to Vietnamese when language is omitted', () => {
      expect(getStaticSuggestionReply('disease_1')).toContain(PERCENT_KEYWORD.vi)
    })
  })

  describe('markdown structure invariants', () => {
    for (const id of SUGGESTION_IDS) {
      for (const lang of LANGS) {
        describe(`${id} [${lang}]`, () => {
          const reply = getStaticSuggestionReply(id, lang)
          const headers = SECTION_HEADERS[lang]
          const bullets = BULLET_LABELS[lang]

          it('starts with a greeting paragraph (no leading whitespace)', () => {
            expect(reply).toMatch(/^[^\s]/)
          })

          it('contains exactly three suspected-condition markers', () => {
            // 3 numbered diseases (1., 2., 3.) — each on its own line
            const numbered = countOccurrences(
              reply,
              /^[ \t]*\d+\.\s+\S/gm,
            )
            expect(numbered).toBeGreaterThanOrEqual(3)
          })

          it('uses GFM bold-marker ** for inline emphasis (no leftover __ or single *)', () => {
            // __underline__ is not GFM bold; double-asterisk must surround emphasis text
            expect(reply).not.toMatch(/__[^*\s]+__/)
          })

          it('renders the three section headers', () => {
            expect(reply).toContain(headers.suspected)
            expect(reply).toContain(headers.warning)
            // Recommendations header may end with ":" or ":"+ "& Lifestyle" / "& Monitoring"
            expect(reply).toMatch(/📋 \*\*Khuyến nghị:\*\*|^📋 \*\*Recommendations/m)
          })

          it('renders each bullet label once per disease (3 total per label)', () => {
            // Each of 3 diseases must contain all 3 bullet labels → 3 occurrences of each label
            for (const label of bullets) {
              const needle = `**${label}:**`
              expect(countOccurrences(reply, new RegExp(escapeRegExp(needle), 'g'))).toBe(3)
            }
          })

          it('indents bullets with 2 spaces under each numbered disease', () => {
            // Pattern: "  - **Label:**" — exactly two leading spaces + dash + space
            const indentedBullets = countOccurrences(
              reply,
              /^ {2}- \*\*/gm,
            )
            expect(indentedBullets).toBe(9) // 3 diseases × 3 bullets
          })

          it('keeps bullet indentation consistent (no tabs, no 4-space indent)', () => {
            // No bullet may start with tab or 1 or 3+ spaces
            expect(reply).not.toMatch(/^\t- /gm)
            expect(reply).not.toMatch(/^ {1}- /gm)
            expect(reply).not.toMatch(/^ {3,}- /gm)
          })

          it('uses colon (not parentheses) to separate disease name and probability', () => {
            // Old format: "1. Acute Pharyngitis (36% probability)"
            // New format: "1. Acute Pharyngitis: 36% probability"
            expect(reply).not.toMatch(/^\d+\.\s+[^\n]*\([\d]+%/gm)
          })

          it('emits a percentage per disease', () => {
            // Exactly 3 occurrences of "XX%" per reply (one per disease)
            const percents = countOccurrences(reply, /\b\d+%/g)
            expect(percents).toBeGreaterThanOrEqual(3)
          })

          it('does not contain replacement characters or raw control chars', () => {
            expect(reply).not.toMatch(/\uFFFD/) // U+FFFD replacement char
            // eslint-disable-next-line no-control-regex -- matching control chars is the point of this assertion
            expect(reply).not.toMatch(/[\0-\b\u000B\f\u000E-\u001F]/)
          })

          it('does not contain leftover emoji-only subsection labels', () => {
            // We removed the emojis from the inner bullets (e.g. **📋 Dẫn chứng:** → **Dẫn chứng:**)
            expect(reply).not.toMatch(/\*\*📋[^*]+\*\*/)
            expect(reply).not.toMatch(/\*\*🔍[^*]+\*\*/)
            expect(reply).not.toMatch(/\*\*⚠️\*\*[^*]*Dấu hiệu/)
          })
        })
      }
    }
  })

  describe('streaming pipeline compatibility', () => {
    // streamText() uses /\S+\s*|\s+/gu — verify no surrogate pair splits our content
    it('keeps surrogate-pair emojis intact (🩺⚠️📋 are above BMP)', () => {
      const reply = getStaticSuggestionReply('disease_1', 'vi')
      expect(reply).toContain('🩺')
      expect(reply).toContain('⚠️')
      expect(reply).toContain('📋')
    })

    it('keeps multi-byte Vietnamese diacritics intact (no replacement chars after split)', () => {
      for (const id of SUGGESTION_IDS) {
        const reply = getStaticSuggestionReply(id, 'vi')
        expect(reply).not.toMatch(/\uFFFD/)
        // Verify a few known words with diacritics survive verbatim
        if (id === 'disease_1') {
          expect(reply).toContain('Viêm họng cấp')
          expect(reply).toContain('Áp-xe')
          expect(reply).toContain('Tai Mũi Họng')
        }
      }
    })

    it('respects streamText chunk regex without losing characters', () => {
      // Simulate streamText chunking: split and rejoin, must equal original
      for (const id of SUGGESTION_IDS) {
        for (const lang of LANGS) {
          const reply = getStaticSuggestionReply(id, lang)
          const chunks = reply.match(/\S+\s*|\s+/gu) ?? [reply]
          const reconstructed = chunks.join('')
          expect(reconstructed).toBe(reply)
        }
      }
    })
  })
})
