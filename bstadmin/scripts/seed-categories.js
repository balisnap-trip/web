const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const CATEGORY_SEED = [
  {
    code: 'TRANSPORT',
    name: 'Transport',
    sortOrder: 1,
    defaultDirection: 'EXPENSE',
    payeeMode: 'DRIVER_ONLY',
    autoDriverFromBooking: true,
    isCommission: false,
    allowRelatedItem: false,
    requirePartner: false,
  },
  {
    code: 'DESTINATION',
    name: 'Destination',
    sortOrder: 2,
    defaultDirection: 'EXPENSE',
    payeeMode: 'PARTNER_ONLY',
    autoDriverFromBooking: false,
    isCommission: false,
    allowRelatedItem: false,
    requirePartner: true,
  },
  {
    code: 'TICKET',
    name: 'Ticket',
    sortOrder: 3,
    defaultDirection: 'EXPENSE',
    payeeMode: 'PARTNER_ONLY',
    autoDriverFromBooking: false,
    isCommission: false,
    allowRelatedItem: false,
    requirePartner: true,
  },
  {
    code: 'MEAL',
    name: 'Meal',
    sortOrder: 4,
    defaultDirection: 'EXPENSE',
    payeeMode: 'PARTNER_ONLY',
    autoDriverFromBooking: false,
    isCommission: false,
    allowRelatedItem: false,
    requirePartner: true,
  },
  {
    code: 'COMMISSION',
    name: 'Commission',
    sortOrder: 5,
    defaultDirection: 'INCOME',
    payeeMode: 'EITHER',
    autoDriverFromBooking: false,
    isCommission: true,
    allowRelatedItem: true,
    requirePartner: true,
  },
  {
    code: 'OTHER',
    name: 'Other',
    sortOrder: 6,
    defaultDirection: 'EXPENSE',
    payeeMode: 'PARTNER_ONLY',
    autoDriverFromBooking: false,
    isCommission: false,
    allowRelatedItem: false,
    requirePartner: true,
  },
]

const PARTNER_CATEGORY_MAP = {
  TRANSPORT: 'TRANSPORT',
  DESTINATION: 'DESTINATION',
  DESTINASI: 'DESTINATION',
  TICKET: 'TICKET',
  MEAL: 'MEAL',
  RESTAURANT: 'MEAL',
  FOOD: 'MEAL',
  COMMISSION: 'COMMISSION',
  OTHER: 'OTHER',
}

async function upsertCategories() {
  for (const entry of CATEGORY_SEED) {
    await prisma.tourItemCategory.upsert({
      where: { code: entry.code },
      create: {
        code: entry.code,
        name: entry.name,
        sortOrder: entry.sortOrder,
        isActive: true,
        defaultDirection: entry.defaultDirection,
        payeeMode: entry.payeeMode,
        autoDriverFromBooking: entry.autoDriverFromBooking,
        isCommission: entry.isCommission,
        allowRelatedItem: entry.allowRelatedItem,
        requirePartner: entry.requirePartner,
      },
      update: {
        name: entry.name,
        sortOrder: entry.sortOrder,
        isActive: true,
        defaultDirection: entry.defaultDirection,
        payeeMode: entry.payeeMode,
        autoDriverFromBooking: entry.autoDriverFromBooking,
        isCommission: entry.isCommission,
        allowRelatedItem: entry.allowRelatedItem,
        requirePartner: entry.requirePartner,
      },
    })
  }
}

async function loadCategoryMaps() {
  const categories = await prisma.tourItemCategory.findMany()
  const byCode = new Map()
  const byId = new Map()
  for (const category of categories) {
    byCode.set(category.code, category)
    byId.set(category.id, category)
  }
  return { byCode, byId }
}

async function backfillServiceItems(categoryMaps) {
  const items = await prisma.serviceItem.findMany({
    where: { tourItemCategoryId: null },
    include: { defaultPartner: true, partnerLinks: { include: { partner: true } } },
  })
  let updated = 0

  for (const item of items) {
    const fallbackPartner =
      item.defaultPartner || (item.partnerLinks.length === 1 ? item.partnerLinks[0].partner : null)
    const category = fallbackPartner?.tourItemCategoryId
      ? categoryMaps.byId.get(fallbackPartner.tourItemCategoryId)
      : null
    if (!category) continue
    await prisma.serviceItem.update({
      where: { id: item.id },
      data: { tourItemCategoryId: category.id },
    })
    updated += 1
  }

  return updated
}

async function backfillPartners(categoryMaps) {
  const partners = await prisma.partner.findMany({ where: { tourItemCategoryId: null } })
  let updated = 0

  for (const partner of partners) {
    const raw = (partner.category || '').trim().toUpperCase()
    const code = PARTNER_CATEGORY_MAP[raw] || 'OTHER'
    const category = categoryMaps.byCode.get(code)
    if (!category) continue
    await prisma.partner.update({
      where: { id: partner.id },
      data: {
        tourItemCategoryId: category.id,
        category: code,
      },
    })
    updated += 1
  }

  return updated
}

async function main() {
  console.log('\n========== CATEGORY SEED ==========')
  await upsertCategories()
  const categoryMaps = await loadCategoryMaps()

  const serviceUpdated = await backfillServiceItems(categoryMaps)
  const partnerUpdated = await backfillPartners(categoryMaps)

  console.log(`✅ Categories ready: ${categoryMaps.byCode.size}`)
  console.log(`✅ Service items updated: ${serviceUpdated}`)
  console.log(`✅ Partners updated: ${partnerUpdated}`)
}

main()
  .catch((error) => {
    console.error('❌ Category seed failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
