/**
 * Email Worker Script
 * Continuous background worker that processes emails every 5 minutes
 * 
 * Usage:
 * 1. Development: npx tsx scripts/email-worker.ts
 * 2. Production: node scripts/email-worker.js (after build)
 * 3. Docker: Runs automatically in docker-compose
 */

import { prisma } from '../src/lib/db'
import { runEmailCronJob } from '../src/lib/cron/email-cron'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function processEmails() {
  console.log(`[Worker] Starting email processing at ${new Date().toLocaleString()}`)
  
  try {
    const results = await runEmailCronJob()
    
    console.log('[Worker] Processing complete:', {
      skipped: results.skipped,
      reason: results.reason,
      sync: results.sync,
      fetch: results.fetch,
      timestamp: new Date().toLocaleString(),
    })
  } catch (error) {
    console.error('[Worker] Error processing emails:', error)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('📧 Balisnaptrip Email Worker Started')
  console.log('='.repeat(60))
  console.log(`Polling interval: ${POLL_INTERVAL_MS / 1000 / 60} minutes`)
  console.log(`Started at: ${new Date().toLocaleString()}`)
  console.log('='.repeat(60))
  console.log('')

  // Run immediately on startup
  await processEmails()

  // Then run every 5 minutes
  setInterval(async () => {
    await processEmails()
  }, POLL_INTERVAL_MS)

  // Keep the process alive
  process.on('SIGINT', async () => {
    console.log('\n[Worker] Shutting down gracefully...')
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[Worker] Shutting down gracefully...')
    await prisma.$disconnect()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[Worker] Fatal error:', error)
  process.exit(1)
})
