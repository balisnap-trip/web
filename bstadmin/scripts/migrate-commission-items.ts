import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function main() {
  console.log('\n========== COMMISSION ITEM MIGRATION ==========' )
  console.log('1. Ensure notes column exists...')
  await prisma.$executeRaw`
    ALTER TABLE booking_finance_items
    ADD COLUMN IF NOT EXISTS notes TEXT
  `
  console.log('   ✅ notes column ready')

  console.log('\n2. Loading legacy commission items...')
  const legacyItems = await prisma.bookingFinanceItem.findMany({
    where: {
      OR: [
        { commissionAmount: { gt: 0 } },
        { commissionDriverAmount: { gt: 0 } },
      ],
    },
  })

  console.log(`   Found ${legacyItems.length} item(s) with legacy commission fields.`)

  let createdCount = 0
  let updatedCount = 0

  const commissionCategory = await prisma.tourItemCategory.findUnique({
    where: { code: 'COMMISSION' },
  })

  for (const item of legacyItems) {
    const totalCommission = Math.max(0, toNumber(item.commissionAmount))
    const driverCommissionRaw = Math.max(0, toNumber(item.commissionDriverAmount))
    const driverPortion = Math.min(driverCommissionRaw, totalCommission)
    const remainder = Math.max(0, totalCommission - driverPortion)

    const toCreate: Prisma.BookingFinanceItemCreateManyInput[] = []

    if (driverPortion > 0) {
      toCreate.push({
        bookingFinanceId: item.bookingFinanceId,
        serviceItemId: null,
        nameSnapshot: 'Commission - Driver',
        tourItemCategoryIdSnapshot: commissionCategory?.id ?? null,
        tourItemCategoryNameSnapshot: commissionCategory?.name ?? 'Commission',
        isCommissionSnapshot: true,
        allowRelatedItemSnapshot: commissionCategory?.allowRelatedItem ?? true,
        direction: 'EXPENSE',
        unitType: 'PER_BOOKING',
        unitQty: 1,
        unitPrice: driverPortion,
        amount: driverPortion,
        driverId: item.driverId ?? null,
        partnerId: null,
        relatedItemId: item.id,
        relationType: 'COMMISSION_FOR',
        notes: item.driverId
          ? 'Migrated from legacy commissionDriverAmount'
          : 'Migrated from legacy commissionDriverAmount (driver missing)',
      })
    }

    if (remainder > 0) {
      toCreate.push({
        bookingFinanceId: item.bookingFinanceId,
        serviceItemId: null,
        nameSnapshot: 'Commission',
        tourItemCategoryIdSnapshot: commissionCategory?.id ?? null,
        tourItemCategoryNameSnapshot: commissionCategory?.name ?? 'Commission',
        isCommissionSnapshot: true,
        allowRelatedItemSnapshot: commissionCategory?.allowRelatedItem ?? true,
        direction: 'EXPENSE',
        unitType: 'PER_BOOKING',
        unitQty: 1,
        unitPrice: remainder,
        amount: remainder,
        driverId: null,
        partnerId: null,
        relatedItemId: item.id,
        relationType: 'COMMISSION_FOR',
        notes: 'Migrated from legacy commissionAmount',
      })
    }

    if (toCreate.length > 0) {
      await prisma.bookingFinanceItem.createMany({ data: toCreate })
      createdCount += toCreate.length
    }

    await prisma.bookingFinanceItem.update({
      where: { id: item.id },
      data: { commissionAmount: 0, commissionDriverAmount: 0 },
    })
    updatedCount += 1
  }

  console.log('\n========== MIGRATION COMPLETE ==========' )
  console.log(`✅ Created commission items: ${createdCount}`)
  console.log(`✅ Cleaned legacy items: ${updatedCount}`)
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
