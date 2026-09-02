const MODAL_ENDPOINT = 'https://huyphuhunghuyfb--medchat247-backend-serve-vllm.modal.run/v1/chat/completions'
const API_KEY = 'medchat247-secret-key-2026'
const KEEP_ALIVE = process.argv.includes('--keep')

async function sendWarmupPing() {
  const startTime = Date.now()
  process.stdout.write('[' + new Date().toLocaleTimeString() + '] Dang gui tin hieu danh thuc Modal vLLM... ')

  try {
    const response = await fetch(MODAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen25-med',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5,
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(90000)
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (response.ok) {
      console.log('THANH CONG (' + elapsed + 's)!')
      console.log('-> GPU Container hien da WARM va san sang phan hoi tuc thi (< 2s).')
    } else {
      const errText = await response.text()
      console.log('HTTP ' + response.status + ' (' + elapsed + 's):', errText)
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log('LOI (' + elapsed + 's):', err.message)
  }
}

async function main() {
  console.log('=================================================================')
  console.log('   MEDCHAT247 - MODAL GPU PRE-WARM & KEEP-ALIVE TOOL')
  console.log('=================================================================')

  await sendWarmupPing()

  if (KEEP_ALIVE) {
    console.log('\n[INFO] Che do --keep dang bat. Script se gui tin hieu giu am moi 3 phut.')
    console.log('[INFO] Nhan Ctrl+C de dung script sau khi buoi bao cao ket thuc.\n')
    setInterval(sendWarmupPing, 3 * 60 * 1000)
  } else {
    console.log('\n[MEO] De giu am lien tuc trong suot buoi thuyet trinh, hay chay:')
    console.log('      node warmup.js --keep\n')
  }
}

main()
