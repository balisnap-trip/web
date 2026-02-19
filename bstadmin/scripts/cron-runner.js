const inferredHost =
  process.env.INTERNAL_CRON_HOST ||
  (process.env.NODE_ENV === 'production' ? process.env.HOSTNAME : null) ||
  'localhost'
const baseUrl = process.env.INTERNAL_CRON_BASE_URL || `http://${inferredHost}:${process.env.PORT || 3100}`
const DEFAULT_CRON_SECRET = 'change-me-in-production'
const cronSecret = process.env.CRON_SECRET || DEFAULT_CRON_SECRET

if (process.env.NODE_ENV === 'production' && cronSecret === DEFAULT_CRON_SECRET) {
  console.error('[Cron Runner] CRON_SECRET is not set; refusing to run with default secret in production')
  process.exit(1)
}

const POLL_INTERVAL_MS = 60 * 1000 // check every minute

async function runCron() {
  try {
    const res = await fetch(`${baseUrl}/api/cron/email`, {
      method: 'POST',
      headers: { 'x-cron-secret': cronSecret },
    })

    const text = await res.text()
    const ts = new Date().toISOString()

    if (!res.ok) {
      console.log(`[Cron Runner] ${ts} status=${res.status} body=${text}`)
      return
    }

    console.log(`[Cron Runner] ${ts} success ${text}`)
  } catch (error) {
    console.log(`[Cron Runner] ${new Date().toISOString()} error=${error}`)
  }
}

function start() {
  console.log('='.repeat(60))
  console.log('Balisnaptrip Cron Runner Started')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`)
  console.log('='.repeat(60))

  runCron()
  setInterval(runCron, POLL_INTERVAL_MS)
}

start()
