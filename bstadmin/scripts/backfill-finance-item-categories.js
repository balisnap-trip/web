const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const DEFAULT_CATEGORY = {
  id: null,
  name: 'Uncategorized',
  isCommission: false,
  allowRelatedItem: false,
}

async function main() {
  console.log('\n========== BACKFILL FINANCE ITEM CATEGORY SNAPSHOTS ==========')

  const categories = await prisma.tourItemCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  const serviceItems = await prisma.serviceItem.findMany({
    include: { tourItemCategoryRef: true },
  })
  const serviceItemMap = new Map(serviceItems.map((item) => [item.id, item]))

  const items = await prisma.bookingFinanceItem.findMany({
    select: {
      id: true,
      serviceItemId: true,
      tourItemCategoryIdSnapshot: true,
      tourItemCategoryNameSnapshot: true,
      isCommissionSnapshot: true,
      allowRelatedItemSnapshot: true,
    },
  })

  let updated = 0

  for (const item of items) {
    let category = null
    if (item.serviceItemId && serviceItemMap.has(item.serviceItemId)) {
      const serviceItem = serviceItemMap.get(item.serviceItemId)
      category = serviceItem.tourItemCategoryRef || null
    }

    if (!category && item.tourItemCategoryIdSnapshot && categoriesById.has(item.tourItemCategoryIdSnapshot)) {
      category = categoriesById.get(item.tourItemCategoryIdSnapshot)
    }

    const fallback = category || DEFAULT_CATEGORY
    const nextCategoryId = category ? category.id : null
    const nextCategoryName = category ? category.name : fallback.name
    const nextIsCommission = Boolean(fallback.isCommission)
    const nextAllowRelated = Boolean(fallback.allowRelatedItem)

    const needsUpdate =
      item.tourItemCategoryIdSnapshot !== nextCategoryId ||
      item.tourItemCategoryNameSnapshot !== nextCategoryName ||
      item.isCommissionSnapshot !== nextIsCommission ||
      item.allowRelatedItemSnapshot !== nextAllowRelated

    if (needsUpdate) {
      await prisma.bookingFinanceItem.update({
        where: { id: item.id },
        data: {
          tourItemCategoryIdSnapshot: nextCategoryId,
          tourItemCategoryNameSnapshot: nextCategoryName,
          isCommissionSnapshot: nextIsCommission,
          allowRelatedItemSnapshot: nextAllowRelated,
        },
      })
      updated += 1
    }
  }

  console.log(`✅ Items updated: ${updated}`)
}

main()
  .catch((error) => {
    console.error('❌ Backfill failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
