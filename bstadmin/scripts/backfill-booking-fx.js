/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client')

const BALI_UTC_OFFSET_HOURS = 8
const MS_PER_HOUR = 60 * 60 * 1000

const toBaliDateKey = (date) => {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  const baliMs = utcMs + BALI_UTC_OFFSET_HOURS * MS_PER_HOUR
  const bali = new Date(baliMs)
  const year = bali.getUTCFullYear()
  const month = String(bali.getUTCMonth() + 1).padStart(2, '0')
  const day = String(bali.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const fetchUsdToIdrRate = async (tourDate) => {
  const dateKey = toBaliDateKey(tourDate)
  const url = `https://api.frankfurter.dev/v1/${dateKey}?base=USD&symbols=IDR`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch FX rate: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const rate = Number(data?.rates?.IDR)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid FX rate response for USD->IDR')
  }
  return { rate, date: typeof data?.date === 'string' ? data.date : dateKey }
}

const roundUsd = (value) => Number(value).toFixed(2)
const roundIdr = (value) => Math.round(Number(value)).toString()

const prisma = new PrismaClient()

async function main() {
  const batchSize = 200
  let offset = 0
  let updated = 0
  let skipped = 0

  for (;;) {
    const bookings = await prisma.booking.findMany({
      where: {
        totalPrice: { gt: 0 },
        OR: [
          { totalPriceUsd: null },
          { totalPriceIdr: null },
          { totalPriceUsd: 0 },
          { totalPriceIdr: 0 },
        ],
      },
      orderBy: { id: 'asc' },
      skip: offset,
      take: batchSize,
      select: {
        id: true,
        bookingRef: true,
        totalPrice: true,
        currency: true,
        tourDate: true,
        totalPriceUsd: true,
        totalPriceIdr: true,
      },
    })

    if (!bookings.length) break

    for (const booking of bookings) {
      const currency = (booking.currency || 'USD').toUpperCase()
      if (currency !== 'USD' && currency !== 'IDR') {
        skipped += 1
        console.warn(`[skip] booking ${booking.bookingRef || booking.id} currency=${currency}`)
        continue
      }

      const fx = await fetchUsdToIdrRate(booking.tourDate)
      const fxRate = Number(fx.rate)
      const totalPrice = Number(booking.totalPrice)
      const usdAmount = currency === 'USD' ? totalPrice : totalPrice / fxRate
      const idrAmount = currency === 'IDR' ? totalPrice : totalPrice * fxRate

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          totalPriceUsd: roundUsd(usdAmount),
          totalPriceIdr: roundIdr(idrAmount),
          fxRate: fxRate.toFixed(6),
          fxDate: new Date(`${fx.date}T00:00:00.000Z`),
        },
      })

      updated += 1
      if (updated % 50 === 0) {
        console.log(`[progress] updated ${updated}`)
      }
    }

    offset += bookings.length
  }

  console.log(`[done] updated=${updated} skipped=${skipped}`)
}

main()
  .catch((err) => {
    console.error('[error]', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
