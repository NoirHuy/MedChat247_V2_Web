import neo4j from 'neo4j-driver'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687'
const user = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j'
const password = process.env.NEO4J_PASSWORD || 'password'
const database = process.env.NEO4J_DATABASE || 'neo4j'

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))

// Bảng ánh xạ từ vựng y khoa linh hoạt giữa GBD IHME và Neo4j (SymCAT/UMLS)
const SYNONYM_MAP = {
  'upper respiratory infections': ['pharyngitis', 'tonsillitis', 'acute-nasopharyngitis', 'rhinitis', 'common-cold', 'laryngitis'],
  'lower respiratory infections': ['pneumonia', 'acute-bronchitis', 'bronchitis'],
  'diarrheal diseases': ['gastroenteritis', 'diarrhea', 'gastrointestinal-infection'],
  'tension-type headache': ['tension-headache', 'headache'],
  'migraine': ['migraine', 'migraine-headache'],
  'gastroesophageal reflux disease': ['gastroesophageal-reflux-disease', 'gerd'],
  'low back pain': ['low-back-pain', 'back-pain'],
  'dengue': ['dengue', 'dengue-fever'],
  'otitis media': ['otitis-media', 'ear-infection'],
  'meningitis': ['meningitis'],
  'encephalitis': ['encephalitis'],
  'asthma': ['asthma', 'bronchial-asthma'],
  'diabetes mellitus type 2': ['type-2-diabetes', 'diabetes'],
  'stomach cancer': ['stomach-cancer', 'gastric-cancer'],
  'liver cancer due to hepatitis b': ['liver-cancer', 'hepatocellular-carcinoma'],
  'liver cancer due to hepatitis c': ['liver-cancer'],
  'tracheal, bronchus, and lung cancer': ['lung-cancer'],
  'breast cancer': ['breast-cancer'],
  'stroke': ['stroke', 'cerebrovascular-accident', 'ischemic-stroke'],
  'ischemic heart disease': ['ischemic-heart-disease', 'coronary-artery-disease', 'angina'],
  'hypertensive heart disease': ['hypertension', 'essential-hypertension'],
  'gout': ['gout', 'gouty-arthritis'],
  'osteoarthritis': ['osteoarthritis'],
  'rheumatoid arthritis': ['rheumatoid-arthritis'],
  'insomnia': ['insomnia', 'sleep-disorder'],
  'anxiety disorders': ['anxiety', 'generalized-anxiety-disorder'],
  'depressive disorders': ['depression', 'major-depressive-disorder']
}

function calculateBoost(val) {
  if (val >= 1000) return 1.5   // Phổ biến rất cao
  if (val >= 100) return 1.0    // Phổ biến trung bình
  return 0.65                    // Bệnh hiếm / chuyên sâu
}

async function runImport() {
  console.log('=== BẮT ĐẦU NẠP DỮ LIỆU DỊCH TỄ IHME GBD VÀO NEO4J ===\n')

  // 1. Đọc file CSV
  const csvPath = 'e:/Med_AI/MedGentKG/IHME-GBD_2023_DATA-6375ae02-1.csv'
  if (!fs.existsSync(csvPath)) {
    console.error(`Không tìm thấy file CSV tại: ${csvPath}`)
    process.exit(1)
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = fileContent.split('\n').filter(Boolean)

  const ihmeRecords = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    if (cols.length >= 16) {
      const causeId = cols[10]?.trim()
      const causeName = cols[11]?.replace(/"/g, '').trim()
      const val = parseFloat(cols[15])
      if (causeName && !isNaN(val)) {
        ihmeRecords.push({ causeId, causeName, val })
      }
    }
  }

  console.log(`[CSV] Đã đọc thành công ${ihmeRecords.length} dòng bệnh từ file IHME GBD.`)

  // 2. Kết nối Neo4j và lấy danh sách Disease
  const session = driver.session({ database })
  try {
    const diseaseRes = await session.run(`
      MATCH (d:Disease)
      RETURN d.id AS id, d.name AS name, d.cui AS cui
    `)

    const neo4jDiseases = diseaseRes.records.map(r => ({
      id: r.get('id'),
      name: r.get('name'),
      cui: r.get('cui')
    }))

    console.log(`[Neo4j] Tổng số bệnh hiện có trên đồ thị Neo4j: ${neo4jDiseases.length} bệnh.`)

    // 3. Tiến hành So khớp (Matching)
    const updates = []
    const matchedIhme = new Set()
    const matchedNeo4j = new Set()
    const matchLog = []

    const neo4jIdMap = new Map()
    const neo4jNameMap = new Map()

    neo4jDiseases.forEach(d => {
      neo4jIdMap.set(d.id.toLowerCase(), d)
      neo4jNameMap.set(d.name.toLowerCase(), d)
    })

    ihmeRecords.forEach(record => {
      const nameL = record.causeName.toLowerCase()
      let matchedNode = null
      let matchType = ''

      // Quy tắc 1: Khớp chính xác tên tiếng Anh
      if (neo4jNameMap.has(nameL)) {
        matchedNode = neo4jNameMap.get(nameL)
        matchType = 'Exact Name'
      }
      // Quy tắc 2: Khớp slug ID
      else if (neo4jIdMap.has(nameL.replace(/[\s,]+/g, '-'))) {
        matchedNode = neo4jIdMap.get(nameL.replace(/[\s,]+/g, '-'))
        matchType = 'Slug Match'
      }
      // Quy tắc 3: Tra bảng đồng nghĩa Y khoa (Synonym Map)
      else if (SYNONYM_MAP[nameL]) {
        const targetSlugs = SYNONYM_MAP[nameL]
        targetSlugs.forEach(slug => {
          const found = neo4jDiseases.find(d => d.id.toLowerCase() === slug || d.name.toLowerCase() === slug.replace(/-/g, ' '))
          if (found) {
            updates.push({
              diseaseId: found.id,
              val: record.val,
              boost: calculateBoost(record.val),
              causeId: record.causeId,
              causeName: record.causeName
            })
            matchedNeo4j.add(found.id)
            matchLog.push({ ihme: record.causeName, neo4j: found.name, val: record.val, type: 'Synonym Map' })
          }
        })
        if (targetSlugs.length > 0) matchedIhme.add(record.causeName)
        return
      }
      // Quy tắc 4: Khớp chứa từ khóa (Partial Match)
      else {
        const partial = neo4jDiseases.find(d => 
          d.name.toLowerCase().includes(nameL) || nameL.includes(d.name.toLowerCase())
        )
        if (partial) {
          matchedNode = partial
          matchType = 'Partial Match'
        }
      }

      if (matchedNode) {
        updates.push({
          diseaseId: matchedNode.id,
          val: record.val,
          boost: calculateBoost(record.val),
          causeId: record.causeId,
          causeName: record.causeName
        })
        matchedIhme.add(record.causeName)
        matchedNeo4j.add(matchedNode.id)
        matchLog.push({ ihme: record.causeName, neo4j: matchedNode.name, val: record.val, type: matchType })
      }
    })

    console.log(`\n[Matching] Đã tìm thấy ${updates.length} liên kết bệnh được khớp thành công.`)

    // 4. Ghi trực tiếp thuộc tính vào Neo4j
    if (updates.length > 0) {
      console.log('[Neo4j] Đang cập nhật dữ liệu Prevalence và Base-Rate Boost vào Neo4j...')
      await session.run(`
        UNWIND $updates AS u
        MATCH (d:Disease {id: u.diseaseId})
        SET d.prevalence_per_100k = u.val,
            d.base_rate_boost = u.boost,
            d.ihme_cause_id = u.causeId,
            d.ihme_cause_name = u.causeName,
            d.prevalence_updated_at = datetime()
      `, { updates })
      console.log('[Neo4j] CẬP NHẬT HOÀN TẤT THÀNH CÔNG VÀO CSDL!\n')
    }

    // 5. Thống kê Khớp và Miss
    const unmatchedIhme = ihmeRecords.filter(r => !matchedIhme.has(r.causeName))
    const totalIhme = ihmeRecords.length
    const matchedIhmeCount = matchedIhme.size
    const missedIhmeCount = unmatchedIhme.length
    const matchRate = ((matchedIhmeCount / totalIhme) * 100).toFixed(1)

    console.log('====================================================')
    console.log('            BÁO CÁO THỐNG KÊ THỨC THI              ')
    console.log('====================================================')
    console.log(`- Tổng số danh mục bệnh trong file IHME CSV : ${totalIhme}`)
    console.log(`- Tổng số bệnh lý trên Đồ thị Neo4j        : ${neo4jDiseases.length}`)
    console.log(`- Số lượng bệnh IHME ĐÃ KHỚP THÀNH CÔNG    : ${matchedIhmeCount} (${matchRate}%)`)
    console.log(`- Số lượng Node Neo4j ĐÃ ĐƯỢC CẬP NHẬT      : ${matchedNeo4j.size} bệnh`)
    console.log(`- Số lượng bệnh IHME BỊ MISS (Unmatched)   : ${missedIhmeCount}`)
    console.log('====================================================\n')

    console.log('--- SAMPLE MATCHED DISEASES (TOP 10) ---')
    matchLog.slice(0, 10).forEach((m, idx) => {
      console.log(`${idx + 1}. IHME: "${m.ihme}" -> Neo4j: "${m.neo4j}" | Prevalence: ${m.val.toFixed(1)}/100k [${m.type}]`)
    })

    console.log('\n--- SAMPLE MISSED/UNMATCHED DISEASES (TOP 15) ---')
    unmatchedIhme.slice(0, 15).forEach((m, idx) => {
      console.log(`${idx + 1}. [ID: ${m.causeId}] "${m.causeName}" | Rate: ${m.val.toFixed(1)}/100k`)
    })

  } catch (err) {
    console.error('Lỗi khi nạp dữ liệu vào Neo4j:', err)
  } finally {
    await session.close()
    await driver.close()
  }
}

runImport()
