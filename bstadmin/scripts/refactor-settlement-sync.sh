#!/usr/bin/env bash
set -euo pipefail

# Refactor: sync Booking status/payment after finance settlement updates.
# Usage:
#   bash scripts/refactor-settlement-sync.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

apply_patch <<'PATCH'
*** Begin Patch
*** Update File: src/app/api/finance/settlements/route.ts
@@
 import { NextResponse } from 'next/server'
 import { getServerSession } from 'next-auth'
 import { authOptions } from '@/lib/auth'
 import { prisma } from '@/lib/db'
+import { syncBookingSettlementStatus } from '@/lib/finance/sync-booking-settlement'
@@
-    const result = await prisma.bookingFinanceItem.updateMany({
-      where: {
-        id: { in: itemIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id)) },
-        paid: false,
-      },
-      data: {
-        paid: true,
-        paidAt: paidAt ? new Date(paidAt) : new Date(),
-        paidBy: paidBy ? String(paidBy).trim() : null,
-        paidNote: paidNote ? String(paidNote).trim() : null,
-      },
-    })
+    const resolvedPaidAt = paidAt ? new Date(paidAt) : new Date()
+    const normalizedItemIds = itemIds
+      .map((id: any) => Number(id))
+      .filter((id: number) => Number.isFinite(id))
+
+    if (normalizedItemIds.length === 0) {
+      return NextResponse.json({ error: 'No valid item IDs provided' }, { status: 400 })
+    }
+
+    const result = await prisma.$transaction(async (tx) => {
+      const updatedItems = await tx.bookingFinanceItem.findMany({
+        where: { id: { in: normalizedItemIds }, paid: false },
+        select: { id: true, bookingFinance: { select: { bookingId: true } } },
+      })
+
+      const updateResult = await tx.bookingFinanceItem.updateMany({
+        where: { id: { in: updatedItems.map((item) => item.id) }, paid: false },
+        data: {
+          paid: true,
+          paidAt: resolvedPaidAt,
+          paidBy: paidBy ? String(paidBy).trim() : null,
+          paidNote: paidNote ? String(paidNote).trim() : null,
+        },
+      })
+
+      await syncBookingSettlementStatus(
+        tx,
+        updatedItems.map((item) => item.bookingFinance.bookingId),
+        resolvedPaidAt
+      )
+
+      return updateResult
+    })
*** End Patch
PATCH

apply_patch <<'PATCH'
*** Begin Patch
*** Update File: src/app/api/finance/items/[id]/route.ts
@@
 import { NextRequest, NextResponse } from 'next/server'
 import { getServerSession } from 'next-auth'
 import { authOptions } from '@/lib/auth'
 import { prisma } from '@/lib/db'
+import { syncBookingSettlementStatus } from '@/lib/finance/sync-booking-settlement'
@@
-    const item = await prisma.bookingFinanceItem.update({
-      where: { id: parseInt(id) },
-      data: {
-        paid: paid !== undefined ? Boolean(paid) : undefined,
-        paidAt: paidAt ? new Date(paidAt) : paid === false ? null : undefined,
-        paidBy: paidBy !== undefined ? (paidBy ? String(paidBy).trim() : null) : undefined,
-        paidNote: paidNote !== undefined ? (paidNote ? String(paidNote).trim() : null) : undefined,
-        driverId: resolvedDriverId,
-        partnerId: resolvedPartnerId,
-        payeeType: payeeType !== undefined ? payeeType : undefined,
-        unitQty: parsedQty !== undefined ? parsedQty : undefined,
-        unitPrice: parsedPrice !== undefined ? parsedPrice : undefined,
-        amount: amount !== undefined ? amount : undefined,
-        commissionAmount: parsedCommission !== undefined ? parsedCommission : undefined,
-        commissionDriverAmount: parsedCommissionDriver !== undefined
-          ? parsedCommissionDriver
-          : undefined,
-        nameSnapshot: nameSnapshot !== undefined ? String(nameSnapshot) : undefined,
-        direction: direction !== undefined ? direction : undefined,
-        unitType: unitType !== undefined ? unitType : undefined,
-        notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
-      },
-    })
+    const itemId = parseInt(id)
+    const resolvedPaidAt = paidAt ? new Date(paidAt) : undefined
+
+    const item = await prisma.$transaction(async (tx) => {
+      const updatedItem = await tx.bookingFinanceItem.update({
+        where: { id: itemId },
+        data: {
+          paid: paid !== undefined ? Boolean(paid) : undefined,
+          paidAt: resolvedPaidAt ? resolvedPaidAt : paid === false ? null : undefined,
+          paidBy: paidBy !== undefined ? (paidBy ? String(paidBy).trim() : null) : undefined,
+          paidNote: paidNote !== undefined ? (paidNote ? String(paidNote).trim() : null) : undefined,
+          driverId: resolvedDriverId,
+          partnerId: resolvedPartnerId,
+          payeeType: payeeType !== undefined ? payeeType : undefined,
+          unitQty: parsedQty !== undefined ? parsedQty : undefined,
+          unitPrice: parsedPrice !== undefined ? parsedPrice : undefined,
+          amount: amount !== undefined ? amount : undefined,
+          commissionAmount: parsedCommission !== undefined ? parsedCommission : undefined,
+          commissionDriverAmount: parsedCommissionDriver !== undefined
+            ? parsedCommissionDriver
+            : undefined,
+          nameSnapshot: nameSnapshot !== undefined ? String(nameSnapshot) : undefined,
+          direction: direction !== undefined ? direction : undefined,
+          unitType: unitType !== undefined ? unitType : undefined,
+          notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
+        },
+        include: {
+          bookingFinance: { select: { bookingId: true } },
+        },
+      })
+
+      await syncBookingSettlementStatus(tx, [updatedItem.bookingFinance.bookingId], resolvedPaidAt)
+
+      return updatedItem
+    })
*** End Patch
PATCH

mkdir -p src/lib/finance
cat > src/lib/finance/sync-booking-settlement.ts <<'TS'
import { BookingStatus, Prisma } from '@prisma/client'

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['NEW', 'READY', 'ATTENTION', 'UPDATED', 'COMPLETED']

/**
 * Keep booking status/payment flags in sync with finance settlement state.
 *
 * Rule: when all finance items in a booking are paid, booking is considered done.
 */
export async function syncBookingSettlementStatus(
  tx: Prisma.TransactionClient,
  bookingIds: number[],
  settledAt?: Date
) {
  const uniqueBookingIds = Array.from(new Set(bookingIds.filter((id) => Number.isFinite(id))))
  if (uniqueBookingIds.length === 0) return

  const finances = await tx.bookingFinance.findMany({
    where: { bookingId: { in: uniqueBookingIds } },
    select: {
      bookingId: true,
      items: { select: { paid: true } },
      booking: { select: { status: true, isPaid: true, paidAt: true } },
    },
  })

  const updates = []

  for (const finance of finances) {
    if (finance.items.length === 0 || !finance.items.every((item) => item.paid)) continue

    const data: Prisma.BookingUpdateInput = {}

    if (ACTIVE_BOOKING_STATUSES.includes(finance.booking.status)) {
      data.status = 'DONE'
    }

    if (!finance.booking.isPaid) {
      data.isPaid = true
    }

    if (!finance.booking.paidAt) {
      data.paidAt = settledAt ?? new Date()
    }

    if (Object.keys(data).length > 0) {
      updates.push(
        tx.booking.update({
          where: { id: finance.bookingId },
          data,
        })
      )
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }
}
TS

echo "Refactor patch applied."
echo "Next steps:"
echo "  1) npm run lint"
echo "  2) npx tsc --noEmit"
