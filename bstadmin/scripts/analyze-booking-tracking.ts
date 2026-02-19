#!/usr/bin/env tsx
/**
 * Booking Tracking Analysis Script
 * 
 * Analyzes booking data by matching Excel records with email-parsed database records.
 * Identifies discrepancies, parser issues, and generates recommendations.
 * 
 * Usage:
 *   npx tsx scripts/analyze-booking-tracking.ts
 *   npx tsx scripts/analyze-booking-tracking.ts --excel="path/to/file.xlsx" --verbose
 */

import * as fs from 'fs'
import * as path from 'path'
import { getExcelProcessor } from '../src/lib/tracking/excel-processor'
import { getTxtProcessor } from '../src/lib/tracking/txt-processor'
import { getEmailAggregator } from '../src/lib/tracking/email-aggregator'
import { getBookingMatcher } from '../src/lib/tracking/matcher'
import { getReportGenerator } from '../src/lib/tracking/report-generator'
import { formatDateRange } from '../src/lib/tracking/utils'
import { ExcelBooking } from '../src/types/tracking'

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options: Record<string, any> = {
    excel: 'Sales Calculation 2025.txt', // Default to TXT
    output: 'tracking-reports',
    verbose: false,
  }
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      if (value) {
        options[key] = value
      } else {
        options[key] = true
      }
    }
  }
  
  return options
}

async function main() {
  console.log('='.repeat(70))
  console.log('📊 Booking Tracking & Parser Quality Analysis')
  console.log('='.repeat(70))
  console.log('')
  
  const options = parseArgs()
  
  // Resolve paths
  const rootDir = path.resolve(__dirname, '..')
  const excelPath = path.resolve(rootDir, options.excel)
  const outputDir = path.resolve(rootDir, options.output)
  
  // Check if data file exists
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Error: Data file not found: ${excelPath}`)
    console.error('   Please ensure the file exists or specify correct path with --excel')
    console.error('   Supported formats: .xlsx, .xls, .txt (tab-separated)')
    process.exit(1)
  }
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
    console.log(`📁 Created output directory: ${outputDir}`)
  }
  
  console.log(`📁 Excel File: ${path.basename(excelPath)}`)
  console.log(`📂 Output Directory: ${outputDir}`)
  console.log('')
  
  try {
    // Step 1: Process data file (Excel or TXT)
    console.log('🔄 Step 1/5: Processing data file...')
    let excelBookings: ExcelBooking[]
    
    const fileExt = path.extname(excelPath).toLowerCase()
    
    if (fileExt === '.txt') {
      const txtProcessor = getTxtProcessor()
      excelBookings = await txtProcessor.processTxt(excelPath)
      console.log(`   ✅ Loaded ${excelBookings.length} bookings from TXT file`)
    } else {
      const excelProcessor = getExcelProcessor()
      excelBookings = await excelProcessor.processExcel({
        filePath: excelPath,
      })
      console.log(`   ✅ Loaded ${excelBookings.length} bookings from Excel file`)
    }
    console.log('')
    
    // Save Excel data to JSON (for reference)
    const excelDataPath = path.join(outputDir, 'excel-data.json')
    fs.writeFileSync(
      excelDataPath,
      JSON.stringify(excelBookings, null, 2),
      'utf8'
    )
    if (options.verbose) {
      console.log(`   📄 Saved Excel data to: ${excelDataPath}`)
    }
    
    // Step 2: Fetch email data from database
    console.log('🔄 Step 2/5: Fetching email data from database...')
    const emailAggregator = getEmailAggregator()
    
    const confirmedBookings = await emailAggregator.fetchConfirmedBookings()
    const cancelledBookings = await emailAggregator.fetchCancelledBookings()
    const allEmailBookings = [...confirmedBookings, ...cancelledBookings]
    
    console.log(`   ✅ Loaded ${allEmailBookings.length} bookings from database`)
    console.log(`      - Confirmed/Completed: ${confirmedBookings.length}`)
    console.log(`      - Cancelled: ${cancelledBookings.length}`)
    console.log('')
    
    // Step 3: Match bookings
    console.log('🔄 Step 3/5: Matching Excel with Email data...')
    const matcher = getBookingMatcher()
    const { matches } = matcher.matchBookings(excelBookings, allEmailBookings)
    
    const perfectMatches = matches.filter(m => m.status === 'perfect').length
    const partialMatches = matches.filter(m => m.status === 'partial').length
    const missingInEmail = matches.filter(m => m.status === 'missing').length
    
    console.log(`   ✅ Matching complete:`)
    console.log(`      - Perfect matches: ${perfectMatches}`)
    console.log(`      - Partial matches: ${partialMatches}`)
    console.log(`      - Missing in email: ${missingInEmail}`)
    console.log('')
    
    // Step 4: Generate report
    console.log('🔄 Step 4/5: Generating comprehensive report...')
    const reportGenerator = getReportGenerator()
    const report = reportGenerator.generateReport(
      excelBookings,
      allEmailBookings,
      matches,
      cancelledBookings,
      {
        excelFile: path.basename(excelPath),
      }
    )
    console.log(`   ✅ Report generated`)
    console.log('')
    
    // Step 5: Save reports
    console.log('🔄 Step 5/5: Saving reports...')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    
    // Main report
    const reportPath = path.join(outputDir, `tracking-report-${timestamp}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`   ✅ Main report saved: ${reportPath}`)
    
    // PR review list (separate file for easy access)
    if (report.prReviewList.length > 0) {
      const prPath = path.join(outputDir, `pr-review-list-${timestamp}.json`)
      fs.writeFileSync(
        prPath,
        JSON.stringify(
          {
            generatedAt: report.metadata.generatedAt,
            totalItems: report.prReviewList.reduce((sum, item) => sum + item.bookings.length, 0),
            items: report.prReviewList,
          },
          null,
          2
        ),
        'utf8'
      )
      console.log(`   ✅ PR review list saved: ${prPath}`)
    }
    
    console.log('')
    console.log('='.repeat(70))
    console.log('📊 Analysis Summary')
    console.log('='.repeat(70))
    console.log('')
    
    // Print summary
    console.log(`📅 Date Range: ${formatDateRange(report.metadata.dateRange.from, report.metadata.dateRange.to)}`)
    console.log('')
    
    console.log('📈 Booking Counts:')
    console.log(`   Excel records:        ${report.summary.totalExcel}`)
    console.log(`   Email processed:      ${report.summary.totalEmailProcessed}`)
    console.log(`   - Confirmed:          ${report.summary.totalEmailConfirmed}`)
    console.log(`   - Cancelled:          ${report.summary.totalEmailCancelled}`)
    console.log('')
    
    console.log('🔍 Matching Results:')
    console.log(`   ✅ Perfect matches:   ${report.summary.perfectMatches} (${((report.summary.perfectMatches / report.summary.totalExcel) * 100).toFixed(1)}%)`)
    console.log(`   ⚠️  Partial matches:  ${report.summary.partialMatches} (${((report.summary.partialMatches / report.summary.totalExcel) * 100).toFixed(1)}%)`)
    console.log(`   ❌ Missing in email:  ${report.summary.missingInEmail} (${((report.summary.missingInEmail / report.summary.totalExcel) * 100).toFixed(1)}%)`)
    console.log(`   🚫 Cancelled (OK):    ${report.summary.cancelledBookings}`)
    console.log(`   ❓ Orphaned (DB):     ${report.summary.orphanedInDatabase}`)
    console.log('')
    console.log(`   Overall Match Rate:   ${report.summary.matchRate.toFixed(1)}%`)
    console.log('')
    
    // PR Review List
    if (report.prReviewList.length > 0) {
      console.log('📋 PR Review List (Manual Review Required):')
      for (const item of report.prReviewList) {
        const count = item.bookings.length
        const emoji = item.category === 'cancelled_rebooking' ? '🔄' : '❓'
        console.log(`   ${emoji} ${item.category}: ${count} items (${item.priority} priority)`)
      }
      console.log('')
    }
    
    // Parser accuracy
    console.log('📈 Parser Accuracy (Active Bookings):')
    for (const sourceData of report.parserAnalysis.bySource) {
      if (sourceData.totalBookings > 0) {
        console.log(
          `   ${sourceData.source.padEnd(12)}: ${sourceData.accuracy.toFixed(1)}% ` +
          `(${sourceData.successfulMatches}/${sourceData.totalBookings})`
        )
      }
    }
    console.log('')
    
    // Top recommendations
    if (report.parserAnalysis.recommendations.length > 0) {
      console.log('📝 Top Parser Recommendations:')
      report.parserAnalysis.recommendations.slice(0, 5).forEach((rec, i) => {
        const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢'
        console.log(`   ${i + 1}. ${priorityEmoji} [${rec.priority.toUpperCase()}] ${rec.parser}`)
        console.log(`      Issue: ${rec.issue}`)
        console.log(`      Affected: ${rec.affectedBookings} bookings`)
      })
      console.log('')
    }
    
    console.log('='.repeat(70))
    console.log('✅ Analysis Complete!')
    console.log('='.repeat(70))
    console.log('')
    console.log('💾 Reports saved to:')
    console.log(`   - Main report: ${path.basename(reportPath)}`)
    if (report.prReviewList.length > 0) {
      console.log(`   - PR review: pr-review-list-${timestamp}.json`)
    }
    console.log(`   - Excel data: excel-data.json`)
    console.log('')
    console.log('📖 Open the JSON files to see detailed analysis and recommendations.')
    console.log('')
    
  } catch (error) {
    console.error('')
    console.error('❌ Error during analysis:')
    console.error(error)
    console.error('')
    process.exit(1)
  }
}

// Run main function
main()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
