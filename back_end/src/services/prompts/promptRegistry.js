import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Handlebars from 'handlebars'

// Register custom helpers
Handlebars.registerHelper('checkbox', (value) => (value ? '[x]' : '[ ]'))
Handlebars.registerHelper('eq', (a, b) => a === b)

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const partialsDir = path.join(currentDir, 'partials')
const templatesDir = path.join(currentDir, 'templates')

// Register partials
const partialFiles = [
  { name: 'phaseHeader_en', file: 'phaseHeader.en.hbs' },
  { name: 'phaseHeader_vi', file: 'phaseHeader.vi.hbs' },
  { name: 'baseGuidelines_en', file: 'baseGuidelines.en.hbs' },
  { name: 'baseGuidelines_vi', file: 'baseGuidelines.vi.hbs' },
  { name: 'phase2Structure_en', file: 'phase2Structure.en.hbs' },
  { name: 'phase2Structure_vi', file: 'phase2Structure.vi.hbs' }
]

for (const p of partialFiles) {
  const pPath = path.join(partialsDir, p.file)
  if (fs.existsSync(pPath)) {
    const content = fs.readFileSync(pPath, 'utf-8')
    Handlebars.registerPartial(p.name, content)
  }
}

// Template compiled cache
const compiledCache = new Map()

function getCompiledTemplate(specialtyId, lang) {
  const langKey = lang === 'en' ? 'en' : 'vi'
  const key = `${specialtyId}.${langKey}`
  if (compiledCache.has(key)) {
    return compiledCache.get(key)
  }

  let tPath = path.join(templatesDir, `${specialtyId}.${langKey}.hbs`)
  if (!fs.existsSync(tPath)) {
    tPath = path.join(templatesDir, `general.${langKey}.hbs`)
  }

  const content = fs.readFileSync(tPath, 'utf-8')
  const compiled = Handlebars.compile(content)
  compiledCache.set(key, compiled)
  return compiled
}

/**
 * Renders system prompt for given specialty, language, and context variables.
 * 
 * @param {string} specialtyId - e.g. 'pediatrics', 'general', 'dermatology', 'nutrition'
 * @param {string} lang - 'vi' | 'en'
 * @param {object} vars - { checklistStatus, phase, ADAPTIVE_CONTEXT }
 */
export function renderSystemPrompt(specialtyId, lang = 'vi', vars = {}) {
  const compiled = getCompiledTemplate(specialtyId, lang)
  const context = {
    checklistStatus: vars.checklistStatus || { hasAgeSex: false, hasDuration: false, hasSeverity: false },
    phase: vars.phase || 1,
    ADAPTIVE_CONTEXT: vars.ADAPTIVE_CONTEXT || ''
  }
  return compiled(context)
}
